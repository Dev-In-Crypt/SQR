// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../ReceiptRegistry.sol";

contract ReceiptRegistryTest is Test {
    ReceiptRegistry internal registry;

    uint256 internal ownerKey;
    address internal ownerWallet;
    address internal relayer = address(0xBEEF);

    uint256 internal secondOwnerKey;
    address internal secondOwnerWallet;

    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );
    bytes32 internal constant MINT_AUTHORIZATION_TYPEHASH =
        keccak256(
            "MintAuthorization(bytes32 reportHash,address contractAddress,bytes32 analyzerVersionHash,address owner,uint256 nonce,uint256 deadline)"
        );

    event ReceiptMinted(
        bytes32 indexed reportHash,
        address indexed contractAddress,
        bytes32 analyzerVersionHash,
        address owner,
        address minter,
        uint256 timestamp,
        uint256 receiptId
    );

    function setUp() public {
        registry = new ReceiptRegistry();
        ownerKey = uint256(keccak256("receipt-registry-owner"));
        secondOwnerKey = uint256(keccak256("receipt-registry-second-owner"));
        ownerWallet = vm.addr(ownerKey);
        secondOwnerWallet = vm.addr(secondOwnerKey);
    }

    function testMintWithSigSuccessEmitsEventAndStoresState() public {
        vm.warp(1_700_000_000);

        bytes32 reportHash = keccak256("report-1");
        address contractAddress = address(0x1234);
        bytes32 analyzerVersionHash = keccak256("analyzer-v1");
        uint256 nonce = registry.nonces(ownerWallet);
        uint256 deadline = block.timestamp + 600;
        bytes memory signature = _signAuthorization(
            ownerKey,
            reportHash,
            contractAddress,
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline
        );

        vm.expectEmit(true, true, false, true, address(registry));
        emit ReceiptMinted(
            reportHash,
            contractAddress,
            analyzerVersionHash,
            ownerWallet,
            relayer,
            block.timestamp,
            1
        );

        vm.prank(relayer);
        (uint256 receiptId, bool newlyMinted) = registry.mintWithSig(
            reportHash,
            contractAddress,
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline,
            signature
        );

        assertEq(receiptId, 1);
        assertTrue(newlyMinted);

        (
            uint256 storedId,
            address owner,
            address storedContractAddress,
            bytes32 storedVersion,
            uint256 storedTimestamp
        ) = registry.getByHash(reportHash);

        assertEq(storedId, 1);
        assertEq(owner, ownerWallet);
        assertEq(storedContractAddress, contractAddress);
        assertEq(storedVersion, analyzerVersionHash);
        assertEq(storedTimestamp, block.timestamp);
    }

    function testGetByHashMissingReceiptReverts() public {
        vm.expectRevert(bytes("RECEIPT_NOT_FOUND"));
        registry.getByHash(keccak256("missing"));
    }

    function testFrontRunAttemptWithWrongRecoveredOwnerReverts() public {
        bytes32 reportHash = keccak256("front-run");
        address contractAddress = address(0x1234);
        bytes32 analyzerVersionHash = keccak256("analyzer-v1");

        address attacker = address(0xBAD1);
        uint256 deadline = block.timestamp + 600;
        uint256 nonce = registry.nonces(ownerWallet);

        bytes memory victimSignature = _signAuthorization(
            ownerKey,
            reportHash,
            contractAddress,
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline
        );

        vm.expectRevert(ReceiptRegistry.InvalidSignature.selector);
        vm.prank(attacker);
        registry.mintWithSig(
            reportHash,
            contractAddress,
            analyzerVersionHash,
            attacker,
            nonce,
            deadline,
            victimSignature
        );
    }

    function testReplayProtectionRejectsSecondUseOfSameNonce() public {
        bytes32 reportHash = keccak256("report-replay");
        address contractAddress = address(0x1234);
        bytes32 analyzerVersionHash = keccak256("analyzer-v1");
        uint256 nonce = registry.nonces(ownerWallet);
        uint256 deadline = block.timestamp + 600;

        bytes memory signature = _signAuthorization(
            ownerKey,
            reportHash,
            contractAddress,
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline
        );

        registry.mintWithSig(
            reportHash,
            contractAddress,
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
            contractAddress,
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline,
            signature
        );
    }

    function testExpiredAuthorizationReverts() public {
        bytes32 reportHash = keccak256("expired");
        address contractAddress = address(0x1234);
        bytes32 analyzerVersionHash = keccak256("analyzer-v1");
        uint256 nonce = registry.nonces(ownerWallet);
        uint256 deadline = block.timestamp + 10;

        bytes memory signature = _signAuthorization(
            ownerKey,
            reportHash,
            contractAddress,
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
            contractAddress,
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline,
            signature
        );
    }

    function testDuplicateMintReturnsExistingReceiptAndNoSecondEvent() public {
        bytes32 reportHash = keccak256("report-dup");
        bytes32 analyzerVersionHash = keccak256("analyzer-v1");

        uint256 firstNonce = registry.nonces(ownerWallet);
        uint256 deadline = block.timestamp + 600;

        bytes memory firstSignature = _signAuthorization(
            ownerKey,
            reportHash,
            address(0x1234),
            analyzerVersionHash,
            ownerWallet,
            firstNonce,
            deadline
        );

        vm.recordLogs();

        (uint256 firstId, bool firstMinted) = registry.mintWithSig(
            reportHash,
            address(0x1234),
            analyzerVersionHash,
            ownerWallet,
            firstNonce,
            deadline,
            firstSignature
        );

        uint256 secondNonce = registry.nonces(ownerWallet);
        bytes memory secondSignature = _signAuthorization(
            ownerKey,
            reportHash,
            address(0x9999),
            analyzerVersionHash,
            ownerWallet,
            secondNonce,
            deadline
        );

        (uint256 secondId, bool secondMinted) = registry.mintWithSig(
            reportHash,
            address(0x9999),
            analyzerVersionHash,
            ownerWallet,
            secondNonce,
            deadline,
            secondSignature
        );

        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(firstId, 1);
        assertTrue(firstMinted);
        assertEq(secondId, 1);
        assertFalse(secondMinted);
        assertEq(logs.length, 1);
    }

    function testDuplicateMintWithDifferentOwnerRevertsOwnerMismatch() public {
        bytes32 reportHash = keccak256("report-owner-bound");
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

        registry.mintWithSig(
            reportHash,
            address(0x1234),
            analyzerVersionHash,
            ownerWallet,
            firstNonce,
            deadline,
            firstSig
        );

        uint256 secondNonce = registry.nonces(secondOwnerWallet);
        bytes memory secondSig = _signAuthorization(
            secondOwnerKey,
            reportHash,
            address(0xABCD),
            analyzerVersionHash,
            secondOwnerWallet,
            secondNonce,
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
            address(0xABCD),
            analyzerVersionHash,
            secondOwnerWallet,
            secondNonce,
            deadline,
            secondSig
        );
    }

    function testAnalyzerVersionMismatchStillEnforced() public {
        bytes32 reportHash = keccak256("report-analyzer-bound");
        bytes32 firstAnalyzerVersionHash = keccak256("analyzer-v1");
        bytes32 secondAnalyzerVersionHash = keccak256("analyzer-v2");
        uint256 deadline = block.timestamp + 600;

        uint256 nonce1 = registry.nonces(ownerWallet);
        bytes memory sig1 = _signAuthorization(
            ownerKey,
            reportHash,
            address(0x1234),
            firstAnalyzerVersionHash,
            ownerWallet,
            nonce1,
            deadline
        );

        registry.mintWithSig(
            reportHash,
            address(0x1234),
            firstAnalyzerVersionHash,
            ownerWallet,
            nonce1,
            deadline,
            sig1
        );

        uint256 nonce2 = registry.nonces(ownerWallet);
        bytes memory sig2 = _signAuthorization(
            ownerKey,
            reportHash,
            address(0x1234),
            secondAnalyzerVersionHash,
            ownerWallet,
            nonce2,
            deadline
        );

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
            address(0x1234),
            secondAnalyzerVersionHash,
            ownerWallet,
            nonce2,
            deadline,
            sig2
        );
    }

    function testCodeOnlyReceiptAcceptsZeroAddress() public {
        bytes32 reportHash = keccak256("code-only");
        bytes32 analyzerVersionHash = keccak256("analyzer-v1");
        uint256 nonce = registry.nonces(ownerWallet);
        uint256 deadline = block.timestamp + 600;

        bytes memory signature = _signAuthorization(
            ownerKey,
            reportHash,
            address(0),
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline
        );

        registry.mintWithSig(
            reportHash,
            address(0),
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline,
            signature
        );

        (, , address storedContractAddress, bytes32 storedVersion, ) = registry.getByHash(reportHash);

        assertEq(storedContractAddress, address(0));
        assertEq(storedVersion, analyzerVersionHash);
    }

    function testRejectsInvalidSignatureLength() public {
        bytes32 reportHash = keccak256("sig-length");
        address contractAddress = address(0x1234);
        bytes32 analyzerVersionHash = keccak256("analyzer-v1");
        uint256 nonce = registry.nonces(ownerWallet);
        uint256 deadline = block.timestamp + 600;

        bytes memory shortSignature = new bytes(64);

        vm.expectRevert(ReceiptRegistry.InvalidSignature.selector);
        registry.mintWithSig(
            reportHash,
            contractAddress,
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline,
            shortSignature
        );
    }

    function testAcceptsSignatureWithVZeroAfterNormalization() public {
        bytes32 reportHash = keccak256("v-normalized");
        address contractAddress = address(0x1234);
        bytes32 analyzerVersionHash = keccak256("analyzer-v1");
        uint256 nonce = registry.nonces(ownerWallet);
        uint256 deadline = block.timestamp + 600;

        bytes memory signature = _signAuthorization(
            ownerKey,
            reportHash,
            contractAddress,
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline
        );

        uint8 originalV = uint8(signature[64]);
        require(originalV == 27 || originalV == 28, "UNEXPECTED_ORIGINAL_V");

        bytes memory normalizedVSignature = _withV(signature, originalV - 27);

        (uint256 receiptId, bool newlyMinted) = registry.mintWithSig(
            reportHash,
            contractAddress,
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline,
            normalizedVSignature
        );

        assertEq(receiptId, 1);
        assertTrue(newlyMinted);
    }

    function testRejectsInvalidVValue() public {
        bytes32 reportHash = keccak256("invalid-v");
        address contractAddress = address(0x1234);
        bytes32 analyzerVersionHash = keccak256("analyzer-v1");
        uint256 nonce = registry.nonces(ownerWallet);
        uint256 deadline = block.timestamp + 600;

        bytes memory signature = _signAuthorization(
            ownerKey,
            reportHash,
            contractAddress,
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline
        );

        bytes memory invalidVSignature = _withV(signature, 29);

        vm.expectRevert(ReceiptRegistry.InvalidSignature.selector);
        registry.mintWithSig(
            reportHash,
            contractAddress,
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline,
            invalidVSignature
        );
    }

    function testRejectsHighSValue() public {
        bytes32 reportHash = keccak256("high-s");
        address contractAddress = address(0x1234);
        bytes32 analyzerVersionHash = keccak256("analyzer-v1");
        uint256 nonce = registry.nonces(ownerWallet);
        uint256 deadline = block.timestamp + 600;

        bytes memory signature = _signAuthorization(
            ownerKey,
            reportHash,
            contractAddress,
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline
        );

        bytes memory highSSignature = _withS(signature, bytes32(type(uint256).max));

        vm.expectRevert(ReceiptRegistry.InvalidSignature.selector);
        registry.mintWithSig(
            reportHash,
            contractAddress,
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline,
            highSSignature
        );
    }

    function testRejectsZeroSigner() public {
        bytes32 reportHash = keccak256("zero-signer");
        address contractAddress = address(0x1234);
        bytes32 analyzerVersionHash = keccak256("analyzer-v1");
        uint256 nonce = registry.nonces(ownerWallet);
        uint256 deadline = block.timestamp + 600;

        bytes memory zeroSignerSignature = new bytes(65);
        zeroSignerSignature[64] = bytes1(uint8(27));

        vm.expectRevert(ReceiptRegistry.InvalidSignature.selector);
        registry.mintWithSig(
            reportHash,
            contractAddress,
            analyzerVersionHash,
            ownerWallet,
            nonce,
            deadline,
            zeroSignerSignature
        );
    }

    function testLegacyMintAlwaysReverts() public {
        vm.expectRevert(ReceiptRegistry.MintDeprecatedUseMintWithSig.selector);
        registry.mint(keccak256("legacy"), address(0x1234), keccak256("analyzer-v1"));
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

    function _withV(bytes memory signature, uint8 newV) internal pure returns (bytes memory result) {
        result = abi.encodePacked(signature);
        result[64] = bytes1(newV);
    }

    function _withS(bytes memory signature, bytes32 newS) internal pure returns (bytes memory result) {
        result = abi.encodePacked(signature);
        assembly {
            mstore(add(result, 0x40), newS)
        }
    }
}
