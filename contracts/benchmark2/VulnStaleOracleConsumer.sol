// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface ISimpleOracle {
    function latestRoundData()
        external
        view
        returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80);
}

contract VulnStaleOracleConsumer {
    ISimpleOracle public immutable oracle;

    constructor(address oracle_) {
        oracle = ISimpleOracle(oracle_);
    }

    function quoteUsdValue(uint256 amountEth) external view returns (uint256) {
        (, int256 answer, , , ) = oracle.latestRoundData();
        require(answer > 0, "bad price");
        return (amountEth * uint256(answer)) / 1e8;
    }
}
