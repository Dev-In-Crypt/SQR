// SPDX-License-Identifier: MIT
pragma solidity >=0.6.2 <0.9.0;

import {Vm} from "./Vm.sol";

abstract contract Test {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function fail() internal pure {
        require(false, "FAIL");
    }

    function assertTrue(bool condition) internal pure {
        require(condition, "ASSERT_TRUE");
    }

    function assertFalse(bool condition) internal pure {
        require(!condition, "ASSERT_FALSE");
    }

    function assertEq(uint256 left, uint256 right) internal pure {
        require(left == right, "ASSERT_EQ_UINT");
    }

    function assertEq(address left, address right) internal pure {
        require(left == right, "ASSERT_EQ_ADDRESS");
    }

    function assertEq(bytes32 left, bytes32 right) internal pure {
        require(left == right, "ASSERT_EQ_BYTES32");
    }

    function assertEq(bytes4 left, bytes4 right) internal pure {
        require(left == right, "ASSERT_EQ_BYTES4");
    }

    function assertEq(bool left, bool right) internal pure {
        require(left == right, "ASSERT_EQ_BOOL");
    }

    function assertEq(string memory left, string memory right) internal pure {
        require(keccak256(bytes(left)) == keccak256(bytes(right)), "ASSERT_EQ_STRING");
    }
}
