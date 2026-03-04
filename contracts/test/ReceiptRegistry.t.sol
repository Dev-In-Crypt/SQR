// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../ReceiptRegistry.sol";

contract ReceiptRegistryTest is Test {
    ReceiptRegistry internal registry;

    event ReceiptMinted(
        bytes32 indexed reportHash,
        address indexed contractAddress,
        bytes32 analyzerVersionHash,
        address owner,
        uint256 timestamp,
        uint256 receiptId
    );

    function setUp() public {
        registry = new ReceiptRegistry();
    }

    function testMintSuccessEmitsEventAndStoresState() public {
        bytes32 reportHash = keccak256("report-1");
        address contractAddress = address(0x1234);
        bytes32 analyzerVersionHash = keccak256("analyzer-v1");

        vm.warp(1_700_000_000);

        vm.expectEmit(true, true, false, true, address(registry));
        emit ReceiptMinted(
            reportHash,
            contractAddress,
            analyzerVersionHash,
            address(this),
            block.timestamp,
            1
        );

        (uint256 receiptId, bool newlyMinted) = registry.mint(
            reportHash,
            contractAddress,
            analyzerVersionHash
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
        assertEq(owner, address(this));
        assertEq(storedContractAddress, contractAddress);
        assertEq(storedVersion, analyzerVersionHash);
        assertEq(storedTimestamp, block.timestamp);
    }

    function testDuplicateMintReturnsExistingReceiptAndNoSecondEvent() public {
        // Duplicate policy: same reportHash + same analyzerVersionHash returns stable receiptId,
        // newlyMinted=false, and does not emit a second event.
        bytes32 reportHash = keccak256("report-dup");
        bytes32 analyzerVersionHash = keccak256("analyzer-v1");

        vm.recordLogs();

        (uint256 firstId, bool firstMinted) = registry.mint(
            reportHash,
            address(0x1234),
            analyzerVersionHash
        );
        (uint256 secondId, bool secondMinted) = registry.mint(
            reportHash,
            address(0x9999),
            analyzerVersionHash
        );

        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(firstId, 1);
        assertTrue(firstMinted);
        assertEq(secondId, 1);
        assertFalse(secondMinted);
        assertEq(logs.length, 1);

        (, , address storedContractAddress, bytes32 storedVersion, ) = registry
            .getByHash(reportHash);
        assertEq(storedContractAddress, address(0x1234));
        assertEq(storedVersion, analyzerVersionHash);
    }

    function testDuplicateMintDifferentAnalyzerVersionRevertsDeterministically() public {
        // Analyzer binding policy: same reportHash cannot be re-used with a different
        // analyzerVersionHash. This must fail deterministically.
        bytes32 reportHash = keccak256("report-analyzer-bound");
        bytes32 firstAnalyzerVersionHash = keccak256("analyzer-v1");
        bytes32 secondAnalyzerVersionHash = keccak256("analyzer-v2");

        registry.mint(reportHash, address(0x1234), firstAnalyzerVersionHash);

        (bool success, bytes memory revertData) = address(registry).call(
            abi.encodeWithSelector(
                registry.mint.selector,
                reportHash,
                address(0x1234),
                secondAnalyzerVersionHash
            )
        );

        assertFalse(success);
        bytes4 revertSelector = revertData.length >= 4 ? bytes4(revertData) : bytes4(0);
        require(
            revertSelector == ReceiptRegistry.AnalyzerVersionMismatch.selector,
            "UNEXPECTED_REVERT_SELECTOR"
        );

        (
            uint256 storedId,
            address owner,
            address storedContractAddress,
            bytes32 storedVersion,
            uint256 storedTimestamp
        ) = registry.getByHash(reportHash);

        assertEq(storedId, 1);
        assertEq(owner, address(this));
        assertEq(storedContractAddress, address(0x1234));
        assertEq(storedVersion, firstAnalyzerVersionHash);
        assertTrue(storedTimestamp > 0);
    }

    function testCodeOnlyReceiptAcceptsZeroAddress() public {
        bytes32 reportHash = keccak256("code-only");
        bytes32 analyzerVersionHash = keccak256("analyzer-v1");

        registry.mint(reportHash, address(0), analyzerVersionHash);

        (, , address storedContractAddress, bytes32 storedVersion, ) = registry
            .getByHash(reportHash);

        assertEq(storedContractAddress, address(0));
        assertEq(storedVersion, analyzerVersionHash);
    }

    function testEventTopicsMatchIndexedFieldsForUiVerification() public {
        bytes32 reportHash = keccak256("report-topics");
        address contractAddress = address(0xCAFE);
        bytes32 analyzerVersionHash = keccak256("analyzer-v3");

        vm.warp(1_700_111_222);

        vm.recordLogs();
        registry.mint(reportHash, contractAddress, analyzerVersionHash);

        Vm.Log[] memory logs = vm.getRecordedLogs();

        assertEq(logs.length, 1);
        assertEq(
            logs[0].topics[0],
            keccak256(
                "ReceiptMinted(bytes32,address,bytes32,address,uint256,uint256)"
            )
        );
        assertEq(logs[0].topics[1], reportHash);
        assertEq(logs[0].topics[2], bytes32(uint256(uint160(contractAddress))));

        (
            bytes32 decodedAnalyzerVersionHash,
            address decodedOwner,
            uint256 decodedTimestamp,
            uint256 decodedReceiptId
        ) = abi.decode(logs[0].data, (bytes32, address, uint256, uint256));

        assertEq(decodedAnalyzerVersionHash, analyzerVersionHash);
        assertEq(decodedOwner, address(this));
        assertEq(decodedTimestamp, block.timestamp);
        assertEq(decodedReceiptId, 1);
    }
}
