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

    // ── 共享余额（委托授权）────────────────────────────────────

    // payer 存款，授权 delegate，delegate 发起 gasless mint，费用从 payer 扣
    function test_delegate_gaslessMint_usdc() public {
        address payer    = makeAddr("payer");
        address delegate = makeAddr("delegate");

        usdc.mint(payer, 10e6);
        vm.startPrank(payer);
        usdc.approve(address(vault), 10e6);
        vault.deposit(address(usdc), 10e6);
        vault.authorize(delegate);
        vm.stopPrank();

        assertEq(vault.effectivePayer(delegate), payer);

        vm.prank(relayer);
        executor.gaslessMint(delegate, address(usdc));

        // 费用从 payer 余额扣，delegate 账户余额始终为 0
        assertEq(vault.balanceOf(address(usdc), payer), 10e6 - USDC_FEE);
        assertEq(vault.balanceOf(address(usdc), delegate), 0);
        assertEq(nft.balanceOf(delegate), 1);
    }

    // 一个 payer 授权多个 wallet，共享同一个余额池
    function test_delegate_multipleWallets_sharedBalance() public {
        address payer = makeAddr("payer");
        address walletB = makeAddr("walletB");
        address walletC = makeAddr("walletC");

        usdc.mint(payer, 10e6);
        vm.startPrank(payer);
        usdc.approve(address(vault), 10e6);
        vault.deposit(address(usdc), 10e6);
        vault.authorize(walletB);
        vault.authorize(walletC);
        vm.stopPrank();

        vm.startPrank(relayer);
        executor.gaslessMint(walletB, address(usdc)); // 扣 payer 0.2 USDC
        executor.gaslessMint(walletC, address(usdc)); // 扣 payer 0.2 USDC
        vm.stopPrank();

        assertEq(vault.balanceOf(address(usdc), payer), 10e6 - USDC_FEE * 2);
        assertEq(nft.balanceOf(walletB), 1);
        assertEq(nft.balanceOf(walletC), 1);
    }

    // payer 余额耗尽后，delegate 的 gasless mint 应 revert
    function test_delegate_revert_payerInsufficientBalance() public {
        address payer    = makeAddr("payer");
        address delegate = makeAddr("delegate");

        // payer 只存 0.1 USDC，不够支付一次 fee（0.2 USDC）
        usdc.mint(payer, 100_000);
        vm.startPrank(payer);
        usdc.approve(address(vault), 100_000);
        vault.deposit(address(usdc), 100_000);
        vault.authorize(delegate);
        vm.stopPrank();

        vm.prank(relayer);
        vm.expectRevert("GasVault: insufficient balance");
        executor.gaslessMint(delegate, address(usdc));
    }

    // payer 撤销授权后，delegate 应回退到自己付款（余额为 0 则 revert）
    function test_delegate_revoke_thenFallbackToSelf() public {
        address payer    = makeAddr("payer");
        address delegate = makeAddr("delegate");

        usdc.mint(payer, 10e6);
        vm.startPrank(payer);
        usdc.approve(address(vault), 10e6);
        vault.deposit(address(usdc), 10e6);
        vault.authorize(delegate);
        vault.revoke(delegate);
        vm.stopPrank();

        // 撤销后 effectivePayer 应指向自己
        assertEq(vault.effectivePayer(delegate), delegate);

        // delegate 自己没有余额，mint 应 revert
        vm.prank(relayer);
        vm.expectRevert("GasVault: insufficient balance");
        executor.gaslessMint(delegate, address(usdc));
    }

    // wallet 主动 detach 后，费用回到自己
    function test_delegate_detach() public {
        address payer    = makeAddr("payer");
        address delegate = makeAddr("delegate");

        usdc.mint(payer, 10e6);
        vm.startPrank(payer);
        usdc.approve(address(vault), 10e6);
        vault.deposit(address(usdc), 10e6);
        vault.authorize(delegate);
        vm.stopPrank();

        vm.prank(delegate);
        vault.detach();

        assertEq(vault.effectivePayer(delegate), delegate);
        assertEq(vault.payerOf(delegate), address(0));
    }

    // 不允许重复授权同一个 wallet
    function test_delegate_revert_alreadyHasPayer() public {
        address payer1   = makeAddr("payer1");
        address payer2   = makeAddr("payer2");
        address delegate = makeAddr("delegate");

        vm.prank(payer1);
        vault.authorize(delegate);

        vm.prank(payer2);
        vm.expectRevert("GasVault: wallet already has a payer");
        vault.authorize(delegate);
    }

    // 不允许授权自己
    function test_delegate_revert_authorizeSelf() public {
        address payer = makeAddr("payer");
        vm.prank(payer);
        vm.expectRevert("GasVault: invalid wallet");
        vault.authorize(payer);
    }

    // 非 payer 不能 revoke
    function test_delegate_revert_revokeByStranger() public {
        address payer    = makeAddr("payer");
        address delegate = makeAddr("delegate");
        address stranger = makeAddr("stranger");

        vm.prank(payer);
        vault.authorize(delegate);

        vm.prank(stranger);
        vm.expectRevert("GasVault: not your delegate");
        vault.revoke(delegate);
    }

    // 未委托的 wallet 调用 detach 应 revert
    function test_delegate_revert_detachWithoutPayer() public {
        address delegate = makeAddr("delegate");
        vm.prank(delegate);
        vm.expectRevert("GasVault: not delegated");
        vault.detach();
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
