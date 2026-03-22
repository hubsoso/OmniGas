// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MockUSDC.sol";
import "../src/MockBOX.sol";
import "../src/GasVault.sol";
import "../src/DemoNFT.sol";
import "../src/DemoExecutor.sol";
import "../src/GaslessTransferExecutor.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address relayer = vm.envAddress("RELAYER_ADDRESS");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // 部署 tokens
        MockUSDC usdc = new MockUSDC();
        MockBOX box = new MockBOX();

        // 部署核心合约
        GasVault vault = new GasVault();
        DemoNFT nft = new DemoNFT();
        DemoExecutor executor = new DemoExecutor(address(vault), address(nft));
        GaslessTransferExecutor transferExecutor = new GaslessTransferExecutor(address(vault));

        // 配置 vault：添加支持的 token
        vault.addToken(address(usdc));
        vault.addToken(address(box));

        // 配置权限
        vault.setExecutor(address(executor), true);
        vault.setExecutor(address(transferExecutor), true);
        nft.setMinter(address(executor), true);
        executor.setRelayer(relayer, true);
        transferExecutor.setRelayer(relayer, true);

        // 配置 mint 费率（2x markup：实际 gas 成本约一半，平台赚取差价）
        // USDC: 0.2 USDC (6 decimals)
        executor.setFee(address(usdc), 200_000);
        // BOX: 0.2 BOX (18 decimals)
        executor.setFee(address(box), 0.2 ether);

        // 配置转账费率（0.1 per token）
        // USDC: 0.1 USDC (6 decimals)
        transferExecutor.setTransferFee(address(usdc), 100_000);
        // BOX: 0.1 BOX (18 decimals)
        transferExecutor.setTransferFee(address(box), 1e17);

        // 给 deployer mint 测试代币
        usdc.mint(deployer, 1000 * 1e6);   // 1000 USDC
        box.mint(deployer, 1000 ether);     // 1000 BOX

        vm.stopBroadcast();

        console.log("=== Deployed Contracts ===");
        console.log("MockUSDC:               ", address(usdc));
        console.log("MockBOX:                ", address(box));
        console.log("GasVault:               ", address(vault));
        console.log("DemoNFT:                ", address(nft));
        console.log("DemoExecutor:           ", address(executor));
        console.log("GaslessTransferExecutor:", address(transferExecutor));
    }
}
