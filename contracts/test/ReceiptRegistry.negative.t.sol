// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../ReceiptRegistry.sol";

contract ReceiptRegistryNegativeTest is Test {
    ReceiptRegistry internal registry;

    uint256 internal ownerKey =
        0x59c6995e998f97a5a0044966f094538e8d6d7f2adf0d8fcb7d500f9f8f9d3d9f;
    uint256 internal secondOwnerKey =
        0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba;
    address internal ownerWallet;
    address internal secondOwnerWallet;

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
        ownerWallet = vm.addr(ownerKey);
        secondOwnerWallet = vm.addr(secondOwnerKey);
    }

    function testNegativeInvalidSignatureReverts() public {
        bytes memory invalid = new bytes(65);
        invalid[64] = bytes1(uint8(27));

        vm.expectRevert(ReceiptRegistry.InvalidSignature.selector);
        registry.mintWithSig(
            keccak256("invalid-signature"),
            address(0x1234),
            keccak256("analyzer-v1"),
            ownerWallet,
            0,
            block.timestamp + 600,
            invalid
        );
    }

    function testNegativeWrongNonceReverts() public {
        bytes32 reportHash = keccak256("wrong-nonce");
        bytes32 analyzerVersionHash = keccak256("analyzer-v1");
        uint256 deadline = block.timestamp + 600;
        uint256 wrongNonce = 1;

        bytes memory signature = _signAuthorization(
            ownerKey,
            reportHash,
            address(0x1234),
            analyzerVersionHash,
            ownerWallet,
            wrongNonce,
            deadline
        );

        vm.expectRevert(
            abi.encodeWithSelector(
                ReceiptRegistry.InvalidNonce.selector,
                ownerWallet,
                0,
                wrongNonce
            )
        );
        registry.mintWithSig(
            reportHash,
            address(0x1234),
            analyzerVersionHash,
            ownerWallet,
            wrongNonce,
            deadline,
            signature
        );
    }

    function testNegativeReplayWithSameNonceReverts() public {
        bytes32 reportHash = keccak256("replay");
        bytes32 analyzerVersionHash = keccak256("analyzer-v1");
        uint256 nonce = registry.nonces(ownerWallet);
        uint256 deadline = block.timestamp + 600;

        bytes memory signature = _signAuthorization(
            ownerKey,
            reportHash,
            address(0x1234),
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline
        );

        registry.mintWithSig(
            reportHash,
            address(0x1234),
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline,
            signature
        );

        vm.expectRevert(
            abi.encodeWithSelector(
                ReceiptRegistry.InvalidNonce.selector,
                ownerWallet,
                nonce + 1,
                nonce
            )
        );
        registry.mintWithSig(
            reportHash,
            address(0x1234),
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline,
            signature
        );
    }

    function testNegativeExpiredDeadlineReverts() public {
        bytes32 reportHash = keccak256("expired");
        bytes32 analyzerVersionHash = keccak256("analyzer-v1");
        uint256 nonce = registry.nonces(ownerWallet);
        uint256 deadline = block.timestamp + 30;

        bytes memory signature = _signAuthorization(
            ownerKey,
            reportHash,
            address(0x1234),
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline
        );

        vm.warp(deadline + 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                ReceiptRegistry.AuthorizationExpired.selector,
                deadline,
                deadline + 1
            )
        );
        registry.mintWithSig(
            reportHash,
            address(0x1234),
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline,
            signature
        );
    }

    function testNegativeDuplicateOwnerMismatchReverts() public {
        bytes32 reportHash = keccak256("owner-mismatch");
        bytes32 analyzerVersionHash = keccak256("analyzer-v1");
        uint256 deadline = block.timestamp + 600;

        bytes memory firstSignature = _signAuthorization(
            ownerKey,
            reportHash,
            address(0x1234),
            analyzerVersionHash,
            ownerWallet,
            registry.nonces(ownerWallet),
            deadline
        );

        registry.mintWithSig(
            reportHash,
            address(0x1234),
            analyzerVersionHash,
            ownerWallet,
            0,
            deadline,
            firstSignature
        );

        bytes memory secondSignature = _signAuthorization(
            secondOwnerKey,
            reportHash,
            address(0x9999),
            analyzerVersionHash,
            secondOwnerWallet,
            registry.nonces(secondOwnerWallet),
            deadline
        );

        vm.expectRevert(
            abi.encodeWithSelector(
                ReceiptRegistry.OwnerMismatch.selector,
                reportHash,
                ownerWallet,
                secondOwnerWallet
            )
        );
        registry.mintWithSig(
            reportHash,
            address(0x9999),
            analyzerVersionHash,
            secondOwnerWallet,
            0,
            deadline,
            secondSignature
        );
    }

    function testNegativeDuplicateAnalyzerMismatchReverts() public {
        bytes32 reportHash = keccak256("analyzer-mismatch");
        bytes32 analyzerVersionA = keccak256("analyzer-v1");
        bytes32 analyzerVersionB = keccak256("analyzer-v2");
        uint256 deadline = block.timestamp + 600;

        bytes memory firstSignature = _signAuthorization(
            ownerKey,
            reportHash,
            address(0x1234),
            analyzerVersionA,
            ownerWallet,
            registry.nonces(ownerWallet),
            deadline
        );

        registry.mintWithSig(
            reportHash,
            address(0x1234),
            analyzerVersionA,
            ownerWallet,
            0,
            deadline,
            firstSignature
        );

        uint256 secondNonce = registry.nonces(ownerWallet);
        bytes memory secondSignature = _signAuthorization(
            ownerKey,
            reportHash,
            address(0x1234),
            analyzerVersionB,
            ownerWallet,
            secondNonce,
            deadline
        );

        vm.expectRevert(
            abi.encodeWithSelector(
                ReceiptRegistry.AnalyzerVersionMismatch.selector,
                reportHash,
                analyzerVersionA,
                analyzerVersionB
            )
        );
        registry.mintWithSig(
            reportHash,
            address(0x1234),
            analyzerVersionB,
            ownerWallet,
            secondNonce,
            deadline,
            secondSignature
        );
    }

    function testNegativeDeprecatedMintReverts() public {
        vm.expectRevert(ReceiptRegistry.MintDeprecatedUseMintWithSig.selector);
        registry.mint(keccak256("legacy"), address(0x1234), keccak256("analyzer-v1"));
    }

    function testNegativeDuplicateSameOwnerIsIdempotent() public {
        bytes32 reportHash = keccak256("duplicate-idempotent");
        bytes32 analyzerVersionHash = keccak256("analyzer-v1");
        uint256 deadline = block.timestamp + 600;

        uint256 firstNonce = registry.nonces(ownerWallet);
        bytes memory firstSig = _signAuthorization(
            ownerKey,
            reportHash,
            address(0x1234),
            analyzerVersionHash,
            ownerWallet,
            firstNonce,
            deadline
        );

        (uint256 firstReceiptId, bool firstNewlyMinted) = registry.mintWithSig(
            reportHash,
            address(0x1234),
            analyzerVersionHash,
            ownerWallet,
            firstNonce,
            deadline,
            firstSig
        );

        uint256 secondNonce = registry.nonces(ownerWallet);
        bytes memory secondSig = _signAuthorization(
            ownerKey,
            reportHash,
            address(0x1234),
            analyzerVersionHash,
            ownerWallet,
            secondNonce,
            deadline
        );

        (uint256 secondReceiptId, bool secondNewlyMinted) = registry.mintWithSig(
            reportHash,
            address(0x1234),
            analyzerVersionHash,
            ownerWallet,
            secondNonce,
            deadline,
            secondSig
        );

        assertEq(firstReceiptId, secondReceiptId);
        assertTrue(firstNewlyMinted);
        assertFalse(secondNewlyMinted);
    }

    function _signAuthorization(
        uint256 signingKey,
        bytes32 reportHash,
        address contractAddress,
        bytes32 analyzerVersionHash,
        address owner,
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
                owner,
                nonce,
                deadline
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signingKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
