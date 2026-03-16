// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract SafeNonceWallet {
    address public signer;
    mapping(bytes32 => bool) public usedDigests;

    constructor(address signer_) {
        signer = signer_;
    }

    function execute(
        address payable to,
        uint256 amount,
        uint256 deadline,
        uint256 nonce,
        bytes calldata signature
    ) external {
        require(block.timestamp <= deadline, "expired");

        bytes32 digest = keccak256(abi.encodePacked(block.chainid, address(this), to, amount, deadline, nonce));
        require(!usedDigests[digest], "replay");

        address recovered = _recoverSignedMessage(digest, signature);
        require(recovered == signer, "bad sig");

        usedDigests[digest] = true;

        (bool ok, ) = to.call{value: amount}("");
        require(ok, "transfer failed");
    }

    function _recoverSignedMessage(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        require(signature.length == 65, "bad len");

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 0x20))
            v := byte(0, calldataload(add(signature.offset, 0x40)))
        }

        bytes32 ethSignedDigest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        return ecrecover(ethSignedDigest, v, r, s);
    }

    receive() external payable {}
}
