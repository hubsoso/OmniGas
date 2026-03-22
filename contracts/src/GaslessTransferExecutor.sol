// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./GasVault.sol";

contract GaslessTransferExecutor is Ownable {
    GasVault public immutable vault;

    mapping(address => bool) public relayers;

    // 每个 token 的固定转账手续费
    // USDC (6 decimals): 100_000 = 0.1 USDC
    // BOX  (18 decimals): 1e17   = 0.1 BOX
    mapping(address => uint256) public transferFees;

    event GaslessTransferExecuted(
        address indexed user,
        address indexed recipient,
        address indexed token,
        uint256 amount,
        address feeToken,
        uint256 fee
    );

    modifier onlyRelayer() {
        require(relayers[msg.sender], "GaslessTransferExecutor: not relayer");
        _;
    }

    constructor(address _vault) Ownable(msg.sender) {
        vault = GasVault(_vault);
    }

    function setRelayer(address relayer, bool enabled) external onlyOwner {
        relayers[relayer] = enabled;
    }

    // 配置某 token 的转账手续费
    function setTransferFee(address token, uint256 amount) external onlyOwner {
        transferFees[token] = amount;
    }

    /// @notice 执行 gasless 转账：扣费 + 转账代币
    /// @param user 进行转账的用户
    /// @param recipient 代币接收地址
    /// @param token 转账的代币地址
    /// @param amount 转账数量
    /// @param feeToken 用于支付 gas 手续费的代币
    function gaslessTransfer(
        address user,
        address recipient,
        address token,
        uint256 amount,
        address feeToken
    ) external onlyRelayer {
        require(user != address(0), "GaslessTransferExecutor: invalid user");
        require(recipient != address(0), "GaslessTransferExecutor: invalid recipient");
        require(token != address(0), "GaslessTransferExecutor: invalid token");
        require(amount > 0, "GaslessTransferExecutor: zero amount");

        uint256 fee = transferFees[feeToken];
        require(fee > 0, "GaslessTransferExecutor: fee not configured for token");

        // 扣除手续费
        vault.deduct(feeToken, user, fee);

        // 扣除转账金额
        vault.deduct(token, user, amount);

        // 执行转账：从 vault 转给 recipient
        vault.executeTransfer(token, recipient, amount);

        emit GaslessTransferExecuted(user, recipient, token, amount, feeToken, fee);
    }
}
