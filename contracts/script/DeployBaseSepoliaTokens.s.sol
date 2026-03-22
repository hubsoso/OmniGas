// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MockUSDC.sol";
import "../src/MockBOX.sol";

/// @notice Deploy MockUSDC + MockBOX on Base Sepolia for faucet testing
contract DeployBaseSepoliaTokens is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        MockUSDC usdc = new MockUSDC();
        MockBOX box = new MockBOX();

        vm.stopBroadcast();

        console.log("=== Deployed Tokens on Base Sepolia ===");
        console.log("MockUSDC:  ", address(usdc));
        console.log("MockBOX:   ", address(box));
    }
}
