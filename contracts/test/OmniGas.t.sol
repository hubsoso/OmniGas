// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/MockUSDC.sol";
import "../src/MockBOX.sol";
import "../src/GasVault.sol";
import "../src/DemoNFT.sol";
import "../src/DemoExecutor.sol";

contract OmniGasTest is Test {
    MockUSDC usdc;
    MockBOX box;
    GasVault vault;
    DemoNFT nft;
    DemoExecutor executor;

    address relayer = makeAddr("relayer");
    address user = makeAddr("user");

    uint256 constant USDC_FEE = 200_000;   // 0.2 USDC (2x markup)
    uint256 constant BOX_FEE  = 0.2 ether; // 0.2 BOX  (2x markup)

    function setUp() public {
        usdc = new MockUSDC();
        box = new MockBOX();
        vault = new GasVault();
        nft = new DemoNFT();
        executor = new DemoExecutor(address(vault), address(nft));

        vault.addToken(address(usdc));
        vault.addToken(address(box));
        vault.setExecutor(address(executor), true);
        nft.setMinter(address(executor), true);
        executor.setRelayer(relayer, true);
        executor.setFee(address(usdc), USDC_FEE); // 0.2 USDC
        executor.setFee(address(box), BOX_FEE);   // 0.2 BOX
    }

    // ── USDC 路径 ──────────────────────────────────────────────

    function test_deposit_usdc() public {
        usdc.mint(user, 10e6);
        vm.startPrank(user);
        usdc.approve(address(vault), 10e6);
        vault.deposit(address(usdc), 10e6);
        vm.stopPrank();

        assertEq(vault.balanceOf(address(usdc), user), 10e6);
    }

    function test_gaslessMint_usdc() public {
        usdc.mint(user, 10e6);
        vm.startPrank(user);
        usdc.approve(address(vault), 10e6);
        vault.deposit(address(usdc), 10e6);
        vm.stopPrank();

        vm.prank(relayer);
        executor.gaslessMint(user, address(usdc));

        assertEq(vault.balanceOf(address(usdc), user), 10e6 - USDC_FEE);
        assertEq(nft.balanceOf(user), 1);
    }

    // ── BOX 路径 ───────────────────────────────────────────────

    function test_deposit_box() public {
        box.mint(user, 10 ether);
        vm.startPrank(user);
        box.approve(address(vault), 10 ether);
        vault.deposit(address(box), 10 ether);
        vm.stopPrank();

        assertEq(vault.balanceOf(address(box), user), 10 ether);
    }

    function test_gaslessMint_box() public {
        box.mint(user, 10 ether);
        vm.startPrank(user);
        box.approve(address(vault), 10 ether);
        vault.deposit(address(box), 10 ether);
        vm.stopPrank();

        vm.prank(relayer);
        executor.gaslessMint(user, address(box));

        assertEq(vault.balanceOf(address(box), user), 10 ether - BOX_FEE);
        assertEq(nft.balanceOf(user), 1);
    }

    // ── 错误路径 ───────────────────────────────────────────────

    function test_revert_insufficientBalance() public {
        vm.prank(relayer);
        vm.expectRevert("GasVault: insufficient balance");
        executor.gaslessMint(user, address(usdc));
    }

    function test_revert_notRelayer() public {
        vm.prank(user);
        vm.expectRevert("DemoExecutor: not relayer");
        executor.gaslessMint(user, address(usdc));
    }

    function test_revert_unsupportedToken() public {
        address fakeToken = makeAddr("fake");
        vm.prank(relayer);
        // executor 先检查 fee，再进 vault，所以这里先触发 executor 的错误
        vm.expectRevert("DemoExecutor: fee not configured for token");
        executor.gaslessMint(user, fakeToken);
    }

    // ── 提现 ───────────────────────────────────────────────────

    function test_withdraw_usdc() public {
        usdc.mint(user, 10e6);
        vm.startPrank(user);
        usdc.approve(address(vault), 10e6);
        vault.deposit(address(usdc), 10e6);
        vault.withdraw(address(usdc), 5e6);
        vm.stopPrank();

        assertEq(vault.balanceOf(address(usdc), user), 5e6);
        assertEq(usdc.balanceOf(user), 5e6);
    }

    // ── 多次 mint ──────────────────────────────────────────────

    function test_multipleMints_mixedTokens() public {
        // 用 USDC 充值
        usdc.mint(user, 10e6);
        vm.startPrank(user);
        usdc.approve(address(vault), 10e6);
        vault.deposit(address(usdc), 10e6);
        vm.stopPrank();

        // 用 BOX 充值
        box.mint(user, 10 ether);
        vm.startPrank(user);
        box.approve(address(vault), 10 ether);
        vault.deposit(address(box), 10 ether);
        vm.stopPrank();

        vm.startPrank(relayer);
        executor.gaslessMint(user, address(usdc)); // NFT #0，扣 USDC
        executor.gaslessMint(user, address(box));  // NFT #1，扣 BOX
        executor.gaslessMint(user, address(usdc)); // NFT #2，扣 USDC
        vm.stopPrank();

        assertEq(nft.balanceOf(user), 3);
        assertEq(vault.balanceOf(address(usdc), user), 10e6 - USDC_FEE * 2);
        assertEq(vault.balanceOf(address(box), user), 10 ether - BOX_FEE);
    }
}
