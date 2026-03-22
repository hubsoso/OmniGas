// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract GasVault is Ownable {
    // 支持的 token 白名单
    mapping(address => bool) public supportedTokens;

    // balances[token][payer]
    mapping(address => mapping(address => uint256)) public balances;

    // 只有 executor 可以扣款
    mapping(address => bool) public executors;

    // 共享余额：wallet → payer（address(0) 表示自己付）
    mapping(address => address) public payerOf;

    event TokenAdded(address indexed token);
    event Deposited(address indexed token, address indexed user, uint256 amount);
    event Deducted(address indexed token, address indexed user, address indexed payer, uint256 amount);
    event Withdrawn(address indexed token, address indexed user, uint256 amount);
    event Authorized(address indexed payer, address indexed wallet);
    event Revoked(address indexed payer, address indexed wallet);

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

    // ─── 共享余额：委托授权 ───────────────────────────────────────

    /// @notice 授权 wallet 使用 msg.sender 的余额支付 gas
    function authorize(address wallet) external {
        require(wallet != address(0) && wallet != msg.sender, "GasVault: invalid wallet");
        require(payerOf[wallet] == address(0), "GasVault: wallet already has a payer");
        payerOf[wallet] = msg.sender;
        emit Authorized(msg.sender, wallet);
    }

    /// @notice 撤销对 wallet 的授权（payer 调用）
    function revoke(address wallet) external {
        require(payerOf[wallet] == msg.sender, "GasVault: not your delegate");
        payerOf[wallet] = address(0);
        emit Revoked(msg.sender, wallet);
    }

    /// @notice wallet 主动解除绑定
    function detach() external {
        address payer = payerOf[msg.sender];
        require(payer != address(0), "GasVault: not delegated");
        payerOf[msg.sender] = address(0);
        emit Revoked(payer, msg.sender);
    }

    // ─── 存款 / 提款 ──────────────────────────────────────────────

    // 用户充值：先 approve token，再 deposit
    function deposit(address token, uint256 amount) external onlySupported(token) {
        require(amount > 0, "GasVault: zero amount");
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        balances[token][msg.sender] += amount;
        emit Deposited(token, msg.sender, amount);
    }

    // 用户提现（只能提自己存入的余额）
    function withdraw(address token, uint256 amount) external onlySupported(token) {
        require(balances[token][msg.sender] >= amount, "GasVault: insufficient balance");
        balances[token][msg.sender] -= amount;
        IERC20(token).transfer(msg.sender, amount);
        emit Withdrawn(token, msg.sender, amount);
    }

    // ─── 扣费 ─────────────────────────────────────────────────────

    // 仅 executor 可扣款；若 user 有 payer，从 payer 余额扣
    function deduct(address token, address user, uint256 amount) external onlyExecutor onlySupported(token) {
        address payer = payerOf[user];
        if (payer == address(0)) payer = user;
        require(balances[token][payer] >= amount, "GasVault: insufficient balance");
        balances[token][payer] -= amount;
        emit Deducted(token, user, payer, amount);
    }

    // ─── 转账 ─────────────────────────────────────────────────────

    // 仅 executor 可转账：从 vault 转账给指定地址
    function executeTransfer(address token, address to, uint256 amount) external onlyExecutor onlySupported(token) {
        require(to != address(0), "GasVault: invalid recipient");
        require(amount > 0, "GasVault: zero amount");
        IERC20(token).transfer(to, amount);
    }

    // ─── 查询 ─────────────────────────────────────────────────────

    // 查询余额（传 payer 地址）
    function balanceOf(address token, address user) external view returns (uint256) {
        return balances[token][user];
    }

    /// @notice 返回 wallet 实际使用的付款方地址
    function effectivePayer(address wallet) external view returns (address) {
        address p = payerOf[wallet];
        return p == address(0) ? wallet : p;
    }
}
