// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../ReceiptRegistry.sol";

contract ReceiptRegistryFuzzTest is Test {
    ReceiptRegistry internal registry;

    uint256 internal ownerKey;
    address internal ownerWallet;

    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );
    bytes32 internal constant MINT_AUTHORIZATION_TYPEHASH =
        keccak256(
            "MintAuthorization(bytes32 reportHash,address contractAddress,bytes32 analyzerVersionHash,address owner,uint256 nonce,uint256 deadline)"
        );

    function setUp() public {
        registry = new ReceiptRegistry();
        ownerKey = uint256(keccak256("receipt-registry-owner"));
        ownerWallet = vm.addr(ownerKey);
    }

    function testFuzzFirstMintNeverCorruptsState(
        bytes32 reportHash,
        address contractAddress,
        bytes32 analyzerVersionHash
    ) public {
        uint256 nonce = registry.nonces(ownerWallet);
        uint256 deadline = block.timestamp + 600;
        bytes memory signature = _signAuthorization(
            reportHash,
            contractAddress,
            analyzerVersionHash,
            nonce,
            deadline
        );

        (uint256 receiptId, bool newlyMinted) = registry.mintWithSig(
            reportHash,
            contractAddress,
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline,
            signature
        );

        (uint256 storedId, address owner, address storedContractAddress, bytes32 storedVersion, ) =
            registry.getByHash(reportHash);

        assertEq(receiptId, 1);
        assertTrue(newlyMinted);
        assertEq(storedId, receiptId);
        assertEq(owner, ownerWallet);
        assertEq(storedContractAddress, contractAddress);
        assertEq(storedVersion, analyzerVersionHash);
    }

    function testFuzzDuplicateMintPreservesFirstWrite(
        bytes32 reportHash,
        address firstContractAddress,
        bytes32 firstAnalyzerVersionHash,
        bytes32 secondAnalyzerVersionHash
    ) public {
        uint256 firstNonce = registry.nonces(ownerWallet);
        uint256 deadline = block.timestamp + 600;

        bytes memory firstSig = _signAuthorization(
            reportHash,
            firstContractAddress,
            firstAnalyzerVersionHash,
            firstNonce,
            deadline
        );

        registry.mintWithSig(
            reportHash,
            firstContractAddress,
            firstAnalyzerVersionHash,
            ownerWallet,
            firstNonce,
            deadline,
            firstSig
        );

        uint256 secondNonce = registry.nonces(ownerWallet);
        bytes memory secondSig = _signAuthorization(
            reportHash,
            address(0xBEEF),
            secondAnalyzerVersionHash,
            secondNonce,
            deadline
        );

        if (firstAnalyzerVersionHash == secondAnalyzerVersionHash) {
            (uint256 receiptId, bool newlyMinted) = registry.mintWithSig(
                reportHash,
                address(0xBEEF),
                secondAnalyzerVersionHash,
                ownerWallet,
                secondNonce,
                deadline,
                secondSig
            );
            assertEq(receiptId, 1);
            assertFalse(newlyMinted);
        } else {
            vm.expectRevert(
                abi.encodeWithSelector(
                    ReceiptRegistry.AnalyzerVersionMismatch.selector,
                    reportHash,
                    firstAnalyzerVersionHash,
                    secondAnalyzerVersionHash
                )
            );
            registry.mintWithSig(
                reportHash,
                address(0xBEEF),
                secondAnalyzerVersionHash,
                ownerWallet,
                secondNonce,
                deadline,
                secondSig
            );
        }

        (uint256 storedId, address owner, address storedContractAddress, bytes32 storedVersion, ) =
            registry.getByHash(reportHash);

        assertEq(storedId, 1);
        assertEq(owner, ownerWallet);
        assertEq(storedContractAddress, firstContractAddress);
        assertEq(storedVersion, firstAnalyzerVersionHash);
    }

    function testFuzzMutatedSignatureAlwaysReverts(
        bytes32 reportHash,
        address contractAddress,
        bytes32 analyzerVersionHash,
        uint8 mutateIndex,
        uint8 mutateMask
    ) public {
        vm.assume(mutateMask != 0);

        uint256 nonce = registry.nonces(ownerWallet);
        uint256 deadline = block.timestamp + 600;

        bytes memory signature = _signAuthorization(
            reportHash,
            contractAddress,
            analyzerVersionHash,
            nonce,
            deadline
        );

        uint256 index = uint256(mutateIndex) % 64;
        signature[index] = bytes1(uint8(signature[index]) ^ mutateMask);

        vm.expectRevert(ReceiptRegistry.InvalidSignature.selector);
        registry.mintWithSig(
            reportHash,
            contractAddress,
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline,
            signature
        );
    }

    function _signAuthorization(
        bytes32 reportHash,
        address contractAddress,
        bytes32 analyzerVersionHash,
        uint256 nonce,
        uint256 deadline
    ) internal returns (bytes memory signature) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256("ReceiptRegistry"),
                keccak256("0.2.0"),
                block.chainid,
                address(registry)
            )
        );

        bytes32 structHash = keccak256(
            abi.encode(
                MINT_AUTHORIZATION_TYPEHASH,
                reportHash,
                contractAddress,
                analyzerVersionHash,
                ownerWallet,
                nonce,
                deadline
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
