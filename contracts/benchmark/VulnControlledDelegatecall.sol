// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract VulnControlledDelegatecall {
    function execute(address target, bytes calldata data) external {
        target.delegatecall(data);
    }
}
