// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract SafeEscrow {
    mapping(address => uint256) public credits;

    function fund(address payee) external payable {
        credits[payee] += msg.value;
    }

    function claim() external {
        uint256 amount = credits[msg.sender];
        require(amount > 0, "nothing to claim");

        credits[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
    }
}
