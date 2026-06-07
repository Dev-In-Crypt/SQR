// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../ReceiptRegistry.sol";

contract ReceiptRegistryInvariantTest is Test {
    ReceiptRegistry internal registry;

    uint256 internal ownerKey;
    address internal ownerWallet;

    bytes32[] private knownHashes;
    mapping(bytes32 => bool) private isKnown;
    mapping(bytes32 => uint256) private firstReceiptId;
    mapping(bytes32 => address) private firstContractAddress;
    mapping(bytes32 => bytes32) private firstAnalyzerVersion;

    uint256 public uniqueMints;

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

    function targetContracts() public view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = address(this);
    }

    function mintWithAuth(
        bytes32 reportHash,
        address contractAddress,
        bytes32 analyzerVersionHash
    ) external {
        uint256 nonce = registry.nonces(ownerWallet);
        uint256 deadline = block.timestamp + 600;
        bytes memory signature = _signAuthorization(
            reportHash,
            contractAddress,
            analyzerVersionHash,
            nonce,
            deadline
        );

        (bool success, bytes memory data) = address(registry).call(
            abi.encodeWithSelector(
                registry.mintWithSig.selector,
                reportHash,
                contractAddress,
                analyzerVersionHash,
                ownerWallet,
                nonce,
                deadline,
                signature
            )
        );

        if (!success) {
            if (
                data.length >= 4 &&
                bytes4(data) == ReceiptRegistry.AnalyzerVersionMismatch.selector
            ) {
                return;
            }
            revert("UNEXPECTED_REVERT");
        }

        (uint256 receiptId, bool newlyMinted) = abi.decode(data, (uint256, bool));

        if (!isKnown[reportHash]) {
            isKnown[reportHash] = true;
            knownHashes.push(reportHash);
            uniqueMints += 1;
            firstReceiptId[reportHash] = receiptId;
            firstContractAddress[reportHash] = contractAddress;
            firstAnalyzerVersion[reportHash] = analyzerVersionHash;
            require(newlyMinted, "FIRST_MINT_NOT_NEW");
            return;
        }

        if (analyzerVersionHash == firstAnalyzerVersion[reportHash]) {
            require(!newlyMinted, "DUPLICATE_MARKED_NEW");
            require(receiptId == firstReceiptId[reportHash], "DUPLICATE_ID_CHANGED");
        }
    }

    function knownHashesLength() public view returns (uint256) {
        return knownHashes.length;
    }

    function knownHashAt(uint256 index) public view returns (bytes32) {
        return knownHashes[index];
    }

    function invariantNextReceiptIdTracksUniqueHashes() public view {
        assertEq(registry.nextReceiptId(), uniqueMints + 1);
    }

    function invariantStoredReceiptsAreImmutableAndOwnedBySignedWallet() public view {
        uint256 length = knownHashesLength();

        for (uint256 i = 0; i < length; i++) {
            bytes32 reportHash = knownHashAt(i);

            (uint256 storedId, address storedOwner, address storedContract, bytes32 storedAnalyzer, ) =
                registry.getByHash(reportHash);

            assertEq(storedId, firstReceiptId[reportHash]);
            assertEq(storedOwner, ownerWallet);
            assertEq(storedContract, firstContractAddress[reportHash]);
            assertEq(storedAnalyzer, firstAnalyzerVersion[reportHash]);
        }
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

