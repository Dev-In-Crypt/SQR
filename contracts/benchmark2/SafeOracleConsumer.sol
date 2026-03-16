// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IFreshOracle {
    function latestRoundData()
        external
        view
        returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80);
}

contract SafeOracleConsumer {
    IFreshOracle public immutable oracle;
    uint256 public immutable maxDelay;

    constructor(address oracle_, uint256 maxDelay_) {
        oracle = IFreshOracle(oracle_);
        maxDelay = maxDelay_;
    }

    function quoteUsdValue(uint256 amountEth) external view returns (uint256) {
        (, int256 answer, , uint256 updatedAt, ) = oracle.latestRoundData();
        require(answer > 0, "bad price");
        require(updatedAt + maxDelay >= block.timestamp, "stale price");

        return (amountEth * uint256(answer)) / 1e8;
    }
}
