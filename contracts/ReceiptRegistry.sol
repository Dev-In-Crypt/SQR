// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract ReceiptRegistry {
    error AnalyzerVersionMismatch(
        bytes32 reportHash,
        bytes32 expectedAnalyzerVersionHash,
        bytes32 providedAnalyzerVersionHash
    );

    struct Receipt {
        uint256 receiptId;
        address owner;
        address contractAddress;
        bytes32 analyzerVersionHash;
        uint256 timestamp;
        bool exists;
    }

    uint256 public nextReceiptId = 1;
    mapping(bytes32 => Receipt) private receiptsByHash;

    event ReceiptMinted(
        bytes32 indexed reportHash,
        address indexed contractAddress,
        bytes32 analyzerVersionHash,
        address owner,
        uint256 timestamp,
        uint256 receiptId
    );

    function mint(
        bytes32 reportHash,
        address contractAddress,
        bytes32 analyzerVersionHash
    ) external returns (uint256 receiptId, bool newlyMinted) {
        Receipt storage existing = receiptsByHash[reportHash];
        if (existing.exists) {
            if (existing.analyzerVersionHash != analyzerVersionHash) {
                revert AnalyzerVersionMismatch(
                    reportHash,
                    existing.analyzerVersionHash,
                    analyzerVersionHash
                );
            }
            return (existing.receiptId, false);
        }

        uint256 id = nextReceiptId;
        nextReceiptId = id + 1;

        Receipt memory created = Receipt({
            receiptId: id,
            owner: msg.sender,
            contractAddress: contractAddress,
            analyzerVersionHash: analyzerVersionHash,
            timestamp: block.timestamp,
            exists: true
        });

        receiptsByHash[reportHash] = created;

        emit ReceiptMinted(
            reportHash,
            contractAddress,
            analyzerVersionHash,
            msg.sender,
            block.timestamp,
            id
        );

        return (id, true);
    }

    function getByHash(
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
        Receipt memory receipt = receiptsByHash[reportHash];
        require(receipt.exists, "RECEIPT_NOT_FOUND");

        return (
            receipt.receiptId,
            receipt.owner,
            receipt.contractAddress,
            receipt.analyzerVersionHash,
            receipt.timestamp
        );
    }
}

