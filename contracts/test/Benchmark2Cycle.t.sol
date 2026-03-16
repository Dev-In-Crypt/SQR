// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import "../benchmark2/VulnReplayWallet.sol";
import "../benchmark2/SafeNonceWallet.sol";
import "../benchmark2/VulnInitHijackVault.sol";
import "../benchmark2/SafeInitializableVault.sol";
import "../benchmark2/VulnStaleOracleConsumer.sol";
import "../benchmark2/SafeOracleConsumer.sol";
import "../benchmark2/VulnProxyStorageCollision.sol";
import "../benchmark2/VulnLogicCollision.sol";

contract MockOracle {
    int256 internal answer;
    uint256 internal updatedAt;

    function setRoundData(int256 answer_, uint256 updatedAt_) external {
        answer = answer_;
        updatedAt = updatedAt_;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, 0, updatedAt, 1);
    }
}

contract DrainImplementation {
    function drain(address payable to) external {
        to.transfer(address(this).balance);
    }
}

contract Benchmark2CycleTest is Test {
    uint256 internal constant SIGNER_KEY = 0xA11CE;
    address internal signer;
    address payable internal beneficiary;
    address internal attacker;

    function setUp() public {
        signer = vm.addr(SIGNER_KEY);
        beneficiary = payable(vm.addr(uint256(keccak256("beneficiary"))));
        attacker = vm.addr(uint256(keccak256("attacker")));
    }

    function testReplayVulnerabilityConfirmed() public {
        VulnReplayWallet wallet = new VulnReplayWallet(signer);
        _fund(address(wallet), 5 ether);

        uint256 amount = 1 ether;
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory signature = _signReplayAuthorization(address(wallet), beneficiary, amount, deadline);

        wallet.execute(beneficiary, amount, deadline, signature);
        wallet.execute(beneficiary, amount, deadline, signature);

        assertEq(beneficiary.balance, 2 ether);
    }

    function testReplayBlockedInSafeWallet() public {
        SafeNonceWallet wallet = new SafeNonceWallet(signer);
        _fund(address(wallet), 5 ether);

        uint256 amount = 1 ether;
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = 7;
        bytes memory signature = _signSafeAuthorization(address(wallet), beneficiary, amount, deadline, nonce);

        wallet.execute(beneficiary, amount, deadline, nonce, signature);

        vm.expectRevert(bytes("replay"));
        wallet.execute(beneficiary, amount, deadline, nonce, signature);
    }

    function testInitHijackVulnerabilityConfirmed() public {
        VulnInitHijackVault vault = new VulnInitHijackVault();
        _fund(address(vault), 3 ether);

        vm.prank(attacker);
        vault.initialize(attacker);

        uint256 beforeBalance = attacker.balance;
        vm.prank(attacker);
        vault.sweep(payable(attacker));

        assertEq(attacker.balance, beforeBalance + 3 ether);
    }

    function testInitHijackBlockedInSafeVault() public {
        SafeInitializableVault vault = new SafeInitializableVault();
        address admin = vm.addr(uint256(keccak256("admin")));
        vm.prank(admin);
        vault.initialize(admin);

        vm.prank(attacker);
        vm.expectRevert(bytes("already initialized"));
        vault.initialize(attacker);
    }

    function testStalePriceAcceptedInVulnerableConsumer() public {
        vm.warp(30 days);
        MockOracle oracle = new MockOracle();
        oracle.setRoundData(2500e8, block.timestamp - 10 days);

        VulnStaleOracleConsumer consumer = new VulnStaleOracleConsumer(address(oracle));
        uint256 quote = consumer.quoteUsdValue(1 ether);

        assertTrue(quote > 0);
    }

    function testStalePriceRejectedInSafeConsumer() public {
        vm.warp(30 days);
        MockOracle oracle = new MockOracle();
        oracle.setRoundData(2500e8, block.timestamp - 10 days);

        SafeOracleConsumer consumer = new SafeOracleConsumer(address(oracle), 1 hours);

        vm.expectRevert(bytes("stale price"));
        consumer.quoteUsdValue(1 ether);
    }

    function testProxyStorageCollisionDrainsFunds() public {
        VulnLogicCollision logic = new VulnLogicCollision();
        VulnProxyStorageCollision proxy = new VulnProxyStorageCollision(address(logic));
        DrainImplementation drainImpl = new DrainImplementation();

        _fund(address(proxy), 4 ether);

        (bool okInit, ) = address(proxy).call(abi.encodeWithSignature("initialize(address)", address(drainImpl)));
        require(okInit, "init via proxy failed");

        uint256 before = attacker.balance;
        (bool okDrain, ) = address(proxy).call(abi.encodeWithSignature("drain(address)", payable(attacker)));
        require(okDrain, "drain via proxy failed");

        assertEq(attacker.balance, before + 4 ether);
    }

    function _signReplayAuthorization(
        address wallet,
        address to,
        uint256 amount,
        uint256 deadline
    ) internal returns (bytes memory signature) {
        bytes32 digest = keccak256(abi.encodePacked(wallet, to, amount, deadline));
        return _signEthMessageDigest(digest);
    }

    function _signSafeAuthorization(
        address wallet,
        address to,
        uint256 amount,
        uint256 deadline,
        uint256 nonce
    ) internal returns (bytes memory signature) {
        bytes32 digest = keccak256(abi.encodePacked(block.chainid, wallet, to, amount, deadline, nonce));
        return _signEthMessageDigest(digest);
    }

    function _signEthMessageDigest(bytes32 digest) internal returns (bytes memory signature) {
        bytes32 ethDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_KEY, ethDigest);
        return abi.encodePacked(r, s, v);
    }

    function _fund(address target, uint256 amount) internal {
        (bool ok, ) = payable(target).call{value: amount}("");
        require(ok, "fund failed");
    }

    receive() external payable {}
}
