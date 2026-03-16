// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract VulnInitHijackVault {
    address public owner;

    function initialize(address initialOwner) external {
        owner = initialOwner;
    }

    function sweep(address payable recipient) external {
        require(msg.sender == owner, "not owner");
        recipient.transfer(address(this).balance);
    }

    receive() external payable {}
}
