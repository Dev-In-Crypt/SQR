// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract VulnLogicCollision {
    address public owner;
    uint256 public value;

    function initialize(address owner_) external {
        owner = owner_;
    }

    function setValue(uint256 newValue) external {
        require(msg.sender == owner, "not owner");
        value = newValue;
    }
}
