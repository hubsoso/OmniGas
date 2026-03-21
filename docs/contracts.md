# 合约实现文档（Person A）

## 工具链

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
forge init contracts
cd contracts
forge install OpenZeppelin/openzeppelin-contracts
```

---

## 目录结构

```
contracts/
├── src/
│   ├── MockUSDC.sol
│   ├── GasVault.sol
│   ├── DemoNFT.sol
│   └── DemoExecutor.sol
├── script/
│   └── Deploy.s.sol
└── .env
```

---

## 合约 1：MockUSDC.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    // 任何人都能 mint，仅用于测试
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}
```

---

## 合约 2：GasVault.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract GasVault is Ownable {
    IERC20 public immutable usdc;

    // executor 地址白名单，只有 executor 能扣款
    mapping(address => bool) public executors;

    // 用户余额（单位：USDC，6位精度）
    mapping(address => uint256) public balances;

    event Deposited(address indexed user, uint256 amount);
    event Deducted(address indexed user, uint256 amount, string reason);
    event Withdrawn(address indexed user, uint256 amount);

    modifier onlyExecutor() {
        require(executors[msg.sender], "GasVault: not executor");
        _;
    }

    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    function setExecutor(address executor, bool enabled) external onlyOwner {
        executors[executor] = enabled;
    }

    // 用户自己调用：先 approve，再 deposit
    function deposit(uint256 amount) external {
        require(amount > 0, "GasVault: zero amount");
        usdc.transferFrom(msg.sender, address(this), amount);
        balances[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    // 只有 executor 能扣款
    function deduct(address user, uint256 amount) external onlyExecutor {
        require(balances[user] >= amount, "GasVault: insufficient balance");
        balances[user] -= amount;
        emit Deducted(user, amount, "gasless_mint");
    }

    // 用户可提现剩余余额
    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "GasVault: insufficient balance");
        balances[msg.sender] -= amount;
        usdc.transfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }
}
```

---

## 合约 3：DemoNFT.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract DemoNFT is ERC721, Ownable {
    uint256 public nextTokenId;

    // 只有 executor 能 mint
    mapping(address => bool) public minters;

    event Minted(address indexed to, uint256 tokenId);

    modifier onlyMinter() {
        require(minters[msg.sender], "DemoNFT: not minter");
        _;
    }

    constructor() ERC721("OmniGas Demo NFT", "OGDEMO") Ownable(msg.sender) {}

    function setMinter(address minter, bool enabled) external onlyOwner {
        minters[minter] = enabled;
    }

    function mint(address to) external onlyMinter returns (uint256) {
        uint256 tokenId = nextTokenId++;
        _safeMint(to, tokenId);
        emit Minted(to, tokenId);
        return tokenId;
    }
}
```

---

## 合约 4：DemoExecutor.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./GasVault.sol";
import "./DemoNFT.sol";

contract DemoExecutor is Ownable {
    GasVault public immutable vault;
    DemoNFT public immutable nft;

    // relayer 白名单（后端私钥地址）
    mapping(address => bool) public relayers;

    // 固定扣费：0.1 USDC（6位精度）
    uint256 public constant FEE = 100_000;

    // 防重放 nonce
    mapping(address => uint256) public nonces;

    event GaslessMintExecuted(address indexed user, uint256 tokenId, uint256 fee);

    modifier onlyRelayer() {
        require(relayers[msg.sender], "DemoExecutor: not relayer");
        _;
    }

    constructor(address _vault, address _nft) Ownable(msg.sender) {
        vault = GasVault(_vault);
        nft = DemoNFT(_nft);
    }

    function setRelayer(address relayer, bool enabled) external onlyOwner {
        relayers[relayer] = enabled;
    }

    // Version S：relayer 直接调用，不需要用户签名
    // 适合 demo 最快跑通
    function gaslessMint(address user) external onlyRelayer {
        vault.deduct(user, FEE);
        uint256 tokenId = nft.mint(user);
        emit GaslessMintExecuted(user, tokenId, FEE);
    }

    // Version A（可选升级）：用户签名授权后再执行
    // 如果时间允许，把 gaslessMint 换成这个
    function gaslessMintWithSig(
        address user,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external onlyRelayer {
        require(block.timestamp <= deadline, "DemoExecutor: expired");
        require(nonces[user] == nonce, "DemoExecutor: invalid nonce");

        // 验签
        bytes32 hash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            keccak256(abi.encodePacked(user, nonce, deadline, address(this)))
        ));
        address signer = _recoverSigner(hash, signature);
        require(signer == user, "DemoExecutor: invalid signature");

        nonces[user]++;
        vault.deduct(user, FEE);
        uint256 tokenId = nft.mint(user);
        emit GaslessMintExecuted(user, tokenId, FEE);
    }

    function _recoverSigner(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "invalid sig length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        return ecrecover(hash, v, r, s);
    }
}
```

---

## 部署脚本：Deploy.s.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MockUSDC.sol";
import "../src/GasVault.sol";
import "../src/DemoNFT.sol";
import "../src/DemoExecutor.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address relayer = vm.envAddress("RELAYER_ADDRESS");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        MockUSDC usdc = new MockUSDC();
        GasVault vault = new GasVault(address(usdc));
        DemoNFT nft = new DemoNFT();
        DemoExecutor executor = new DemoExecutor(address(vault), address(nft));

        // 配置权限
        vault.setExecutor(address(executor), true);
        nft.setMinter(address(executor), true);
        executor.setRelayer(relayer, true);

        // 给测试用户 mint 一些 USDC（演示用）
        usdc.mint(deployer, 1000 * 1e6); // 1000 USDC

        vm.stopBroadcast();

        console.log("MockUSDC:", address(usdc));
        console.log("GasVault:", address(vault));
        console.log("DemoNFT:", address(nft));
        console.log("DemoExecutor:", address(executor));
    }
}
```

---

## .env 文件

```
PRIVATE_KEY=0x...          # deployer 私钥
RELAYER_ADDRESS=0x...      # relayer 钱包地址（后端用这个私钥签名发交易）
RPC_URL=https://...        # 测试网 RPC（推荐 Sepolia 或 Base Sepolia）
ETHERSCAN_API_KEY=...      # 可选，用于 verify
```

---

## 部署命令

```bash
# 部署
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast --verify

# 部署后把地址写到 contracts/deployments.json
```

---

## deployments.json（部署完填写，前端和后端共用）

```json
{
  "network": "sepolia",
  "chainId": 11155111,
  "MockUSDC": "0x...",
  "GasVault": "0x...",
  "DemoNFT": "0x...",
  "DemoExecutor": "0x..."
}
```

---

## 测试（可选，时间够了再做）

```bash
forge test -vvv
```

最简单的测试：

```solidity
function test_gaslessMint() public {
    // mint USDC to user
    usdc.mint(user, 10e6);
    // user approve + deposit
    vm.startPrank(user);
    usdc.approve(address(vault), 10e6);
    vault.deposit(10e6);
    vm.stopPrank();
    // relayer execute
    vm.prank(relayer);
    executor.gaslessMint(user);
    // assert
    assertEq(vault.balances(user), 10e6 - executor.FEE());
    assertEq(nft.balanceOf(user), 1);
}
```

---

## 推荐测试网

**Sepolia**（首选）
- Chain ID: 11155111
- RPC: `https://rpc.sepolia.org`
- Faucet: https://www.alchemy.com/faucets/sepolia
