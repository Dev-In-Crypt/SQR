// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract VulnUncheckedCall {
    function forward(address payable target) external payable {
        target.call{value: msg.value}("");
    }
}
