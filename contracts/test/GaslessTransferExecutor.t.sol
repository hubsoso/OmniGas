// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/MockUSDC.sol";
import "../src/MockBOX.sol";
import "../src/GasVault.sol";
import "../src/GaslessTransferExecutor.sol";

contract GaslessTransferExecutorTest is Test {
    MockUSDC usdc;
    MockBOX box;
    GasVault vault;
    GaslessTransferExecutor executor;

    address relayer = address(0x1234);
    address user = address(0x5678);
    address recipient = address(0x9999);
    address other = address(0xAAAA);

    uint256 constant USDC_FEE = 100_000; // 0.1 USDC
    uint256 constant BOX_FEE = 1e17;     // 0.1 BOX

    function setUp() public {
        usdc = new MockUSDC();
        box = new MockBOX();
        vault = new GasVault();
        executor = new GaslessTransferExecutor(address(vault));

        // Set up vault: add tokens and executor
        vault.addToken(address(usdc));
        vault.addToken(address(box));
        vault.setExecutor(address(executor), true);

        // Set up executor: set relayer and fees
        executor.setRelayer(relayer, true);
        executor.setTransferFee(address(usdc), USDC_FEE);
        executor.setTransferFee(address(box), BOX_FEE);

        // Mint tokens to user and deposit to vault
        usdc.mint(user, 100e6); // 100 USDC
        box.mint(user, 100e18); // 100 BOX

        vm.startPrank(user);
        usdc.approve(address(vault), 100e6);
        box.approve(address(vault), 100e18);
        vault.deposit(address(usdc), 100e6);
        vault.deposit(address(box), 100e18);
        vm.stopPrank();
    }

    // ─── Basic Tests ───────────────────────────────────────────

    function test_gaslessTransfer_success_usdc() public {
        uint256 transferAmount = 10e6; // 10 USDC
        uint256 totalDeduction = transferAmount + USDC_FEE;
        uint256 initialBalance = vault.balanceOf(address(usdc), user);

        vm.prank(relayer);
        executor.gaslessTransfer(user, recipient, address(usdc), transferAmount, address(usdc));

        // Verify user balance reduced by amount + fee
        assertEq(vault.balanceOf(address(usdc), user), initialBalance - totalDeduction);

        // Verify recipient received exact amount (not reduced by fee)
        assertEq(usdc.balanceOf(recipient), transferAmount);
    }

    function test_gaslessTransfer_success_box() public {
        uint256 transferAmount = 5e18; // 5 BOX
        uint256 totalDeduction = transferAmount + BOX_FEE;
        uint256 initialBalance = vault.balanceOf(address(box), user);

        vm.prank(relayer);
        executor.gaslessTransfer(user, recipient, address(box), transferAmount, address(box));

        // Verify user balance reduced by amount + fee
        assertEq(vault.balanceOf(address(box), user), initialBalance - totalDeduction);

        // Verify recipient received exact amount
        assertEq(box.balanceOf(recipient), transferAmount);
    }

    // ─── Fee Deduction Tests ──────────────────────────────────

    function test_gaslessTransfer_deductsAmountAndFee() public {
        uint256 transferAmount = 20e6;
        uint256 initialBalance = vault.balanceOf(address(usdc), user);

        vm.prank(relayer);
        executor.gaslessTransfer(user, recipient, address(usdc), transferAmount, address(usdc));

        uint256 expectedDeduction = transferAmount + USDC_FEE;
        assertEq(vault.balanceOf(address(usdc), user), initialBalance - expectedDeduction);
    }

    // ─── Delegation Tests ─────────────────────────────────────

    function test_gaslessTransfer_withDelegatedPayer() public {
        // Set up payer and delegate
        address payer = address(uint160(uint256(keccak256("payer"))));
        address delegate = address(uint160(uint256(keccak256("delegate"))));

        // Mint and deposit for payer
        usdc.mint(payer, 100e6);
        vm.prank(payer);
        usdc.approve(address(vault), 100e6);
        vm.prank(payer);
        vault.deposit(address(usdc), 100e6);

        // Payer authorizes delegate
        vm.prank(payer);
        vault.authorize(delegate);

        // Relayer executes transfer on behalf of delegate
        uint256 payerInitialBalance = vault.balanceOf(address(usdc), payer);
        uint256 transferAmount = 15e6;

        vm.prank(relayer);
        executor.gaslessTransfer(delegate, recipient, address(usdc), transferAmount, address(usdc));

        // Verify fee deducted from payer's balance (not delegate's)
        uint256 expectedDeduction = transferAmount + USDC_FEE;
        assertEq(vault.balanceOf(address(usdc), payer), payerInitialBalance - expectedDeduction);

        // Verify delegate's balance unchanged
        assertEq(vault.balanceOf(address(usdc), delegate), 0);

        // Verify recipient received exact amount
        assertEq(usdc.balanceOf(recipient), transferAmount);
    }

    // ─── Error Tests ──────────────────────────────────────────

    function test_gaslessTransfer_insufficientBalance_reverts() public {
        uint256 transferAmount = 150e6; // More than vault balance

        vm.prank(relayer);
        vm.expectRevert("GasVault: insufficient balance");
        executor.gaslessTransfer(user, recipient, address(usdc), transferAmount, address(usdc));
    }

    function test_gaslessTransfer_nonRelayer_reverts() public {
        uint256 transferAmount = 10e6;

        vm.prank(other);
        vm.expectRevert("GaslessTransferExecutor: not relayer");
        executor.gaslessTransfer(user, recipient, address(usdc), transferAmount, address(usdc));
    }

    function test_gaslessTransfer_invalidUser_reverts() public {
        uint256 transferAmount = 10e6;

        vm.prank(relayer);
        vm.expectRevert("GaslessTransferExecutor: invalid user");
        executor.gaslessTransfer(address(0), recipient, address(usdc), transferAmount, address(usdc));
    }

    function test_gaslessTransfer_invalidRecipient_reverts() public {
        uint256 transferAmount = 10e6;

        vm.prank(relayer);
        vm.expectRevert("GaslessTransferExecutor: invalid recipient");
        executor.gaslessTransfer(user, address(0), address(usdc), transferAmount, address(usdc));
    }

    function test_gaslessTransfer_zeroAmount_reverts() public {
        vm.prank(relayer);
        vm.expectRevert("GaslessTransferExecutor: zero amount");
        executor.gaslessTransfer(user, recipient, address(usdc), 0, address(usdc));
    }

    function test_gaslessTransfer_unconfiguredFee_reverts() public {
        address unknownToken = address(0xDEAD);
        vault.addToken(unknownToken);

        vm.prank(relayer);
        vm.expectRevert("GaslessTransferExecutor: fee not configured for token");
        executor.gaslessTransfer(user, recipient, unknownToken, 10e6, unknownToken);
    }

    // ─── Fee Configuration Tests ──────────────────────────────

    function test_setTransferFee_success() public {
        uint256 newFee = 50_000;
        executor.setTransferFee(address(usdc), newFee);
        assertEq(executor.transferFees(address(usdc)), newFee);
    }

    function test_setTransferFee_onlyOwner() public {
        uint256 newFee = 50_000;

        vm.prank(other);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", other));
        executor.setTransferFee(address(usdc), newFee);
    }

    // ─── Relayer Management Tests ──────────────────────────────

    function test_setRelayer_success() public {
        executor.setRelayer(other, true);
        assertTrue(executor.relayers(other));

        executor.setRelayer(other, false);
        assertFalse(executor.relayers(other));
    }

    function test_setRelayer_onlyOwner() public {
        vm.prank(other);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", other));
        executor.setRelayer(address(0x1111), true);
    }

    // ─── Event Tests ───────────────────────────────────────────

    function test_gaslessTransfer_emitsEvent() public {
        uint256 transferAmount = 10e6;

        vm.prank(relayer);
        vm.expectEmit(true, true, true, true);
        emit GaslessTransferExecutor.GaslessTransferExecuted(
            user,
            recipient,
            address(usdc),
            transferAmount,
            address(usdc),
            USDC_FEE
        );
        executor.gaslessTransfer(user, recipient, address(usdc), transferAmount, address(usdc));
    }

    // ─── Mixed Token Tests ────────────────────────────────────

    function test_gaslessTransfer_transferUsdc_payBoxFee() public {
        // User wants to transfer USDC but pay fee in BOX
        uint256 transferAmount = 10e6;
        uint256 initialUsdcBalance = vault.balanceOf(address(usdc), user);
        uint256 initialBoxBalance = vault.balanceOf(address(box), user);

        vm.prank(relayer);
        executor.gaslessTransfer(user, recipient, address(usdc), transferAmount, address(box));

        // USDC balance reduced by transfer amount only
        assertEq(vault.balanceOf(address(usdc), user), initialUsdcBalance - transferAmount);

        // BOX balance reduced by fee only
        assertEq(vault.balanceOf(address(box), user), initialBoxBalance - BOX_FEE);

        // Recipient receives exact USDC amount
        assertEq(usdc.balanceOf(recipient), transferAmount);
    }
}
