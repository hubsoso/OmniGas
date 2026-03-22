// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/DemoNFT.sol";
import "../src/CrossChainExecutor.sol";

/// @notice Deploy DemoNFT + CrossChainExecutor on Base Sepolia.
/// Balance deduction stays on Sepolia (hub chain) — no Vault needed here.
contract DeployBaseSepolia is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address relayer = vm.envAddress("RELAYER_ADDRESS");

        vm.startBroadcast(deployerKey);

        DemoNFT nft = new DemoNFT();
        CrossChainExecutor executor = new CrossChainExecutor(address(nft));

        nft.setMinter(address(executor), true);
        executor.setRelayer(relayer, true);

        vm.stopBroadcast();

        console.log("=== Deployed on Base Sepolia ===");
        console.log("DemoNFT:             ", address(nft));
        console.log("CrossChainExecutor:  ", address(executor));
    }
}
