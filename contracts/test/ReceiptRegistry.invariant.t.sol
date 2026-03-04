// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../ReceiptRegistry.sol";

contract ReceiptRegistryHandler {
    struct Snapshot {
        uint256 receiptId;
        address owner;
        address contractAddress;
        bytes32 analyzerVersionHash;
        uint256 timestamp;
    }

    ReceiptRegistry public immutable registry;

    bytes32[] private knownHashes;
    mapping(bytes32 => bool) private isKnown;
    mapping(bytes32 => Snapshot) private snapshots;

    uint256 public uniqueMints;

    constructor(ReceiptRegistry _registry) {
        registry = _registry;
    }

    function mint(
        bytes32 reportHash,
        address contractAddress,
        bytes32 analyzerVersionHash
    ) external {
        (bool success, bytes memory data) = address(registry).call(
            abi.encodeWithSelector(
                registry.mint.selector,
                reportHash,
                contractAddress,
                analyzerVersionHash
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

            (
                uint256 storedId,
                address owner,
                address storedContractAddress,
                bytes32 storedVersion,
                uint256 storedTimestamp
            ) = registry.getByHash(reportHash);

            snapshots[reportHash] = Snapshot({
                receiptId: storedId,
                owner: owner,
                contractAddress: storedContractAddress,
                analyzerVersionHash: storedVersion,
                timestamp: storedTimestamp
            });

            require(newlyMinted, "FIRST_MINT_NOT_NEW");
            require(storedId == receiptId, "FIRST_MINT_ID_MISMATCH");
            return;
        }

        Snapshot memory snapshot = snapshots[reportHash];
        if (analyzerVersionHash == snapshot.analyzerVersionHash) {
            require(!newlyMinted, "DUPLICATE_MARKED_NEW");
            require(receiptId == snapshot.receiptId, "DUPLICATE_ID_CHANGED");
        }
    }

    function knownHashesLength() external view returns (uint256) {
        return knownHashes.length;
    }

    function knownHashAt(uint256 index) external view returns (bytes32) {
        return knownHashes[index];
    }

    function snapshotFor(
        bytes32 reportHash
    )
        external
        view
        returns (
            uint256 receiptId,
            address owner,
            address contractAddress,
            bytes32 analyzerVersionHash,
            uint256 timestamp
        )
    {
        Snapshot memory snapshot = snapshots[reportHash];
        return (
            snapshot.receiptId,
            snapshot.owner,
            snapshot.contractAddress,
            snapshot.analyzerVersionHash,
            snapshot.timestamp
        );
    }
}

contract ReceiptRegistryInvariantTest is Test {
    ReceiptRegistry internal registry;
    ReceiptRegistryHandler internal handler;

    function setUp() public {
        registry = new ReceiptRegistry();
        handler = new ReceiptRegistryHandler(registry);
    }

    function targetContracts() public view returns (address[] memory targets) {
        targets = new address[](1);
        targets[0] = address(handler);
    }

    function invariantNextReceiptIdTracksUniqueHashes() public view {
        assertEq(registry.nextReceiptId(), handler.uniqueMints() + 1);
    }

    function invariantStoredReceiptsAreImmutableAndUnique() public view {
        uint256 length = handler.knownHashesLength();

        for (uint256 i = 0; i < length; i++) {
            bytes32 reportHash = handler.knownHashAt(i);

            (
                uint256 storedId,
                address storedOwner,
                address storedContractAddress,
                bytes32 storedVersion,
                uint256 storedTimestamp
            ) = registry.getByHash(reportHash);

            (
                uint256 expectedId,
                address expectedOwner,
                address expectedContractAddress,
                bytes32 expectedVersion,
                uint256 expectedTimestamp
            ) = handler.snapshotFor(reportHash);

            assertEq(storedId, expectedId);
            assertEq(storedOwner, expectedOwner);
            assertEq(storedContractAddress, expectedContractAddress);
            assertEq(storedVersion, expectedVersion);
            assertEq(storedTimestamp, expectedTimestamp);
        }
    }
}
