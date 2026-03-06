// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract ReceiptRegistry {
    error MintDeprecatedUseMintWithSig();
    error AnalyzerVersionMismatch(
        bytes32 reportHash,
        bytes32 expectedAnalyzerVersionHash,
        bytes32 providedAnalyzerVersionHash
    );
    error OwnerMismatch(bytes32 reportHash, address expectedOwner, address providedOwner);
    error AuthorizationExpired(uint256 deadline, uint256 currentTimestamp);
    error InvalidNonce(address owner, uint256 expectedNonce, uint256 providedNonce);
    error InvalidSignature();

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256(
            "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
        );
    bytes32 private constant MINT_AUTHORIZATION_TYPEHASH =
        keccak256(
            "MintAuthorization(bytes32 reportHash,address contractAddress,bytes32 analyzerVersionHash,address owner,uint256 nonce,uint256 deadline)"
        );
    bytes32 private constant NAME_HASH = keccak256("ReceiptRegistry");
    bytes32 private constant VERSION_HASH = keccak256("0.2.0");
    uint256 private constant SECP256K1_N_DIV_2 =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

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
    mapping(address => uint256) public nonces;

    event ReceiptMinted(
        bytes32 indexed reportHash,
        address indexed contractAddress,
        bytes32 analyzerVersionHash,
        address owner,
        address minter,
        uint256 timestamp,
        uint256 receiptId
    );

    function mint(
        bytes32,
        address,
        bytes32
    ) external pure returns (uint256, bool) {
        revert MintDeprecatedUseMintWithSig();
    }

    function mintWithSig(
        bytes32 reportHash,
        address contractAddress,
        bytes32 analyzerVersionHash,
        address owner,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external returns (uint256 receiptId, bool newlyMinted) {
        if (block.timestamp > deadline) {
            revert AuthorizationExpired(deadline, block.timestamp);
        }

        uint256 expectedNonce = nonces[owner];
        if (nonce != expectedNonce) {
            revert InvalidNonce(owner, expectedNonce, nonce);
        }

        _validateSignature(
            reportHash,
            contractAddress,
            analyzerVersionHash,
            owner,
            nonce,
            deadline,
            signature
        );

        nonces[owner] = expectedNonce + 1;
        return
            _mintOrGetExisting(
                reportHash,
                contractAddress,
                analyzerVersionHash,
                owner
            );
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

    function _mintOrGetExisting(
        bytes32 reportHash,
        address contractAddress,
        bytes32 analyzerVersionHash,
        address owner
    ) private returns (uint256 receiptId, bool newlyMinted) {
        Receipt storage existing = receiptsByHash[reportHash];
        if (existing.exists) {
            if (existing.analyzerVersionHash != analyzerVersionHash) {
                revert AnalyzerVersionMismatch(
                    reportHash,
                    existing.analyzerVersionHash,
                    analyzerVersionHash
                );
            }
            if (existing.owner != owner) {
                revert OwnerMismatch(reportHash, existing.owner, owner);
            }
            return (existing.receiptId, false);
        }

        uint256 id = nextReceiptId;
        nextReceiptId = id + 1;

        receiptsByHash[reportHash] = Receipt({
            receiptId: id,
            owner: owner,
            contractAddress: contractAddress,
            analyzerVersionHash: analyzerVersionHash,
            timestamp: block.timestamp,
            exists: true
        });

        emit ReceiptMinted(
            reportHash,
            contractAddress,
            analyzerVersionHash,
            owner,
            msg.sender,
            block.timestamp,
            id
        );

        return (id, true);
    }

    function _validateSignature(
        bytes32 reportHash,
        address contractAddress,
        bytes32 analyzerVersionHash,
        address owner,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) private view {
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

        bytes32 digest = _hashTypedDataV4(structHash);
        address recovered = _recoverSigner(digest, signature);
        if (recovered != owner) {
            revert InvalidSignature();
        }
    }

    function _hashTypedDataV4(bytes32 structHash) private view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", _domainSeparatorV4(), structHash));
    }

    function _domainSeparatorV4() private view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    EIP712_DOMAIN_TYPEHASH,
                    NAME_HASH,
                    VERSION_HASH,
                    block.chainid,
                    address(this)
                )
            );
    }

    function _recoverSigner(
        bytes32 digest,
        bytes calldata signature
    ) private pure returns (address) {
        if (signature.length != 65) {
            revert InvalidSignature();
        }

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 0x20))
            v := byte(0, calldataload(add(signature.offset, 0x40)))
        }

        if (v < 27) {
            v += 27;
        }

        if (v != 27 && v != 28) {
            revert InvalidSignature();
        }

        if (uint256(s) > SECP256K1_N_DIV_2) {
            revert InvalidSignature();
        }

        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) {
            revert InvalidSignature();
        }
        return signer;
    }
}


