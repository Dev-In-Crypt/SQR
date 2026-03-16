// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract SafeVault {
    mapping(address => uint256) public balances;
    bool private locked;

    modifier nonReentrant() {
        require(!locked, "reentrant");
        locked = true;
        _;
        locked = false;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external nonReentrant {
        uint256 bal = balances[msg.sender];
        require(bal >= amount, "insufficient");

        balances[msg.sender] = bal - amount;

        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "send failed");
    }
}
