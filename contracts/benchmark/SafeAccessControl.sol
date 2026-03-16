// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract SafeAccessControl {
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    function setOwner(address newOwner) external {
        require(msg.sender == owner, "not owner");
        require(newOwner != address(0), "zero owner");
        owner = newOwner;
    }
}
