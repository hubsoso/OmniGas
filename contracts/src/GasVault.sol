// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract GasVault is Ownable {
    // 支持的 token 白名单
    mapping(address => bool) public supportedTokens;

    // balances[token][user]
    mapping(address => mapping(address => uint256)) public balances;

    // 只有 executor 可以扣款
    mapping(address => bool) public executors;

    event TokenAdded(address indexed token);
    event Deposited(address indexed token, address indexed user, uint256 amount);
    event Deducted(address indexed token, address indexed user, uint256 amount, string reason);
    event Withdrawn(address indexed token, address indexed user, uint256 amount);

    modifier onlyExecutor() {
        require(executors[msg.sender], "GasVault: not executor");
        _;
    }

    modifier onlySupported(address token) {
        require(supportedTokens[token], "GasVault: token not supported");
        _;
    }

    constructor() Ownable(msg.sender) {}

    function addToken(address token) external onlyOwner {
        supportedTokens[token] = true;
        emit TokenAdded(token);
    }

    function setExecutor(address executor, bool enabled) external onlyOwner {
        executors[executor] = enabled;
    }

    // 用户充值：先 approve token，再 deposit
    function deposit(address token, uint256 amount) external onlySupported(token) {
        require(amount > 0, "GasVault: zero amount");
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        balances[token][msg.sender] += amount;
        emit Deposited(token, msg.sender, amount);
    }

    // 仅 executor 可扣款
    function deduct(address token, address user, uint256 amount) external onlyExecutor onlySupported(token) {
        require(balances[token][user] >= amount, "GasVault: insufficient balance");
        balances[token][user] -= amount;
        emit Deducted(token, user, amount, "gasless_mint");
    }

    // 用户提现
    function withdraw(address token, uint256 amount) external onlySupported(token) {
        require(balances[token][msg.sender] >= amount, "GasVault: insufficient balance");
        balances[token][msg.sender] -= amount;
        IERC20(token).transfer(msg.sender, amount);
        emit Withdrawn(token, msg.sender, amount);
    }

    // 查询余额
    function balanceOf(address token, address user) external view returns (uint256) {
        return balances[token][user];
    }
}
