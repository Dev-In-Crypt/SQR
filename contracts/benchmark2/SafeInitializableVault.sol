// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract SafeInitializableVault {
    address public owner;
    bool public initialized;

    function initialize(address initialOwner) external {
        require(!initialized, "already initialized");
        require(initialOwner != address(0), "zero owner");

        initialized = true;
        owner = initialOwner;
    }

    function sweep(address payable recipient) external {
        require(msg.sender == owner, "not owner");
        recipient.transfer(address(this).balance);
    }

    receive() external payable {}
}
