// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract VulnReentrancyBank {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "insufficient");

        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "send failed");

        balances[msg.sender] -= amount;
    }
}
