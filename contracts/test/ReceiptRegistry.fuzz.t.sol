// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../ReceiptRegistry.sol";

contract ReceiptRegistryFuzzTest is Test {
    ReceiptRegistry internal registry;

    function setUp() public {
        registry = new ReceiptRegistry();
    }

    function testFuzzFirstMintNeverCorruptsState(
        bytes32 reportHash,
        address contractAddress,
        bytes32 analyzerVersionHash
    ) public {
        (uint256 receiptId, bool newlyMinted) = registry.mint(
            reportHash,
            contractAddress,
            analyzerVersionHash
        );

        (
            uint256 storedId,
            address owner,
            address storedContractAddress,
            bytes32 storedVersion,
            uint256 storedTimestamp
        ) = registry.getByHash(reportHash);

        assertEq(receiptId, 1);
        assertTrue(newlyMinted);
        assertEq(storedId, receiptId);
        assertEq(owner, address(this));
        assertEq(storedContractAddress, contractAddress);
        assertEq(storedVersion, analyzerVersionHash);
        assertTrue(storedTimestamp > 0 || block.timestamp == 0);
    }

    function testFuzzDuplicateMintPreservesFirstWrite(
        bytes32 reportHash,
        address firstContractAddress,
        address secondContractAddress,
        bytes32 firstAnalyzerVersionHash,
        bytes32 secondAnalyzerVersionHash
    ) public {
        registry.mint(reportHash, firstContractAddress, firstAnalyzerVersionHash);

        if (firstAnalyzerVersionHash == secondAnalyzerVersionHash) {
            (uint256 receiptId, bool newlyMinted) = registry.mint(
                reportHash,
                secondContractAddress,
                secondAnalyzerVersionHash
            );
            assertEq(receiptId, 1);
            assertFalse(newlyMinted);
        } else {
            (bool success, bytes memory revertData) = address(registry).call(
                abi.encodeWithSelector(
                    registry.mint.selector,
                    reportHash,
                    secondContractAddress,
                    secondAnalyzerVersionHash
                )
            );
            assertFalse(success);
            bytes4 revertSelector = revertData.length >= 4 ? bytes4(revertData) : bytes4(0);
            require(
                revertSelector == ReceiptRegistry.AnalyzerVersionMismatch.selector,
                "UNEXPECTED_REVERT_SELECTOR"
            );
        }

        (
            uint256 storedId,
            address owner,
            address storedContractAddress,
            bytes32 storedVersion,
            uint256 storedTimestamp
        ) = registry.getByHash(reportHash);

        assertEq(storedId, 1);
        assertEq(owner, address(this));
        assertEq(storedContractAddress, firstContractAddress);
        assertEq(storedVersion, firstAnalyzerVersionHash);
        assertTrue(storedTimestamp > 0 || block.timestamp == 0);
    }
}
