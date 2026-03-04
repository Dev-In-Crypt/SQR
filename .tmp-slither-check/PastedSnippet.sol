pragma solidity 0.8.24;
contract X {
  function pay(address payable to) external payable {
    (bool ok, ) = to.call{value: msg.value}("");
    require(ok, "send failed");
  }
}
