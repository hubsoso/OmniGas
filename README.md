# OmniGas · 全能服务费

**用稳定币预存服务费，之后所有链上操作由系统代缴 Gas，无需持有 ETH。**

Users deposit USDC or BOX into OmniGas's prepaid Gas Pool. A backend Relayer pays native gas on their behalf and deducts a small service fee — no ETH required.

---

## 核心理念 How It Works

```
① 一次性充值（用户支付少量 Gas）
   用户 ──deposit USDC/BOX──▶ GasVault（全能服务费资金池）

② 之后所有操作（用户完全免 Gas）
   用户点击操作
       │
       ▼
   OmniGas Relayer ──pays ETH gas──▶ Executor 合约
                                          │
                                  ┌───────┴────────┐
                                  ▼                ▼
                             GasVault          执行操作
                            从余额扣手续费    NFT铸造 / 代币转账
```

**手续费：铸造 NFT 收 0.2 USDC/BOX，代币转账收 0.1 USDC/BOX**

---

## 功能特性

- **Gasless Mint** — 无需 ETH 铸造 NFT，手续费从服务费余额扣除
- **Gasless Transfer** — 无需 ETH 转账 USDC/BOX，支持三种模式自动切换
  - 系统自动：有 ETH 则用钱包直转，无 ETH 自动切换全能服务费代付
  - 用户资金：用户自己掏 ETH 完成转账
  - 全能服务费代付：Relayer 代缴 Gas，从资金池扣费
- **多链支持** — Sepolia（Hub，扣费）+ Base Sepolia（执行铸造）
- **企业代付** — 支持授权代理，团队成员共享同一服务费资金池
- **实时余额** — 钱包余额与 Vault 余额独立展示，余额不足自动提示

---

## 智能合约

| 合约 | 说明 | 网络 |
|------|------|------|
| `MockUSDC` | 可铸造 ERC20，6 decimals | Sepolia + Base Sepolia |
| `MockBOX` | 可铸造 ERC20，18 decimals | Sepolia + Base Sepolia |
| `GasVault` | 多 token 预存余额池，仅 Executor 可扣款 | Sepolia |
| `DemoNFT` | ERC721，仅 Executor 可铸造 | Sepolia + Base Sepolia |
| `DemoExecutor` | Gasless Mint 入口，原子执行扣费+铸造 | Sepolia |
| `CrossChainExecutor` | Base Sepolia 上的轻量铸造执行器 | Base Sepolia |
| `GaslessTransferExecutor` | Gasless Transfer 入口，原子执行扣费+转账 | Sepolia |

**权限链：** `Relayer → Executor (onlyRelayer) → GasVault.deduct + NFT.mint / token.transfer`

---

## 项目结构

```
OmniGas/
├── contracts/                  Foundry — 合约 + 测试 + 部署脚本
│   ├── src/
│   │   ├── MockUSDC.sol
│   │   ├── MockBOX.sol
│   │   ├── GasVault.sol
│   │   ├── DemoNFT.sol
│   │   ├── DemoExecutor.sol
│   │   ├── CrossChainExecutor.sol
│   │   └── GaslessTransferExecutor.sol
│   ├── script/Deploy.s.sol
│   └── test/
│
├── frontend/                   Next.js (pages router) — 前端 + API 中继
│   ├── pages/
│   │   ├── index.tsx           主入口（动态加载）
│   │   ├── transfer.tsx        转账页（动态加载）
│   │   └── api/
│   │       ├── relay.ts        POST /api/relay — Gasless Mint 中继
│   │       ├── relay-transfer.ts POST /api/relay-transfer — Gasless Transfer 中继
│   │       ├── balance.ts      GET  /api/balance — 查询 Vault 余额
│   │       └── faucet.ts       POST /api/faucet — 领取测试币
│   ├── components/
│   │   ├── WalletHomePage.tsx  主钱包页（充值 / Gasless Mint）
│   │   └── TransferPage.tsx    转账页（三种模式 / 双链支持）
│   └── styles/
│
└── docs/
    ├── architecture.drawio     技术架构图（draw.io）
    └── architecture-simple.drawio 业务流程图（draw.io，面向大众）
```

---

## 快速开始

### 1. 克隆并安装

```bash
git clone https://github.com/hubsoso/OmniGas
cd OmniGas
```

### 2. 部署合约

```bash
cd contracts
forge install
cp .env.example .env   # 填入 PRIVATE_KEY, RELAYER_ADDRESS, RPC_URL
forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast
```

将输出的合约地址填入 `frontend/.env.local`。

### 3. 配置环境变量

```bash
# frontend/.env.local

# Sepolia (Hub Chain)
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_USDC_ADDRESS=0x...
NEXT_PUBLIC_BOX_ADDRESS=0x...
NEXT_PUBLIC_VAULT_ADDRESS=0x...
NEXT_PUBLIC_NFT_ADDRESS=0x...
NEXT_PUBLIC_EXECUTOR_ADDRESS=0x...
NEXT_PUBLIC_TRANSFER_EXECUTOR_ADDRESS=0x...

# Base Sepolia (Secondary Chain)
NEXT_PUBLIC_BASE_USDC_ADDRESS=0x...
NEXT_PUBLIC_BASE_BOX_ADDRESS=0x...
NEXT_PUBLIC_BASE_NFT_ADDRESS=0x...
NEXT_PUBLIC_BASE_EXECUTOR_ADDRESS=0x...
NEXT_PUBLIC_BASE_TRANSFER_EXECUTOR_ADDRESS=0x...

# RPC
NEXT_PUBLIC_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# 仅服务端，绝不加 NEXT_PUBLIC_ 前缀
RELAYER_PRIVATE_KEY=0x...
```

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

### 5. 部署到 Vercel

Vercel 项目 Root Directory 设为 `frontend`，添加上述所有环境变量后部署。

```bash
cd frontend
vercel --prod
```

> `RELAYER_PRIVATE_KEY` 必须以 Server-side Secret 形式添加，不加 `NEXT_PUBLIC_` 前缀。

---

## Demo 流程

**Gasless Mint**
1. 连接 MetaMask（切换到 Sepolia）
2. 点击 **领取测试币** — Faucet 向钱包发放 MockUSDC
3. 点击 **充值** — approve + deposit（两次 MetaMask 确认，此步骤需要少量 ETH）
4. 钱包 ETH 余额为 0 的情况下，点击 **Gasless Mint**
5. 系统自动完成：Relayer 支付 Gas → NFT 铸造成功 → 扣除 0.2 USDC

**Gasless Transfer**
1. 存入 USDC/BOX 至服务费资金池
2. 打开转账页，输入接收地址和金额
3. 系统自动选择最优模式（有 ETH 则直转，无 ETH 则代付）
4. 无 Gas 情况下完成代币转账

---

## 合约测试

```bash
cd contracts
forge test -vvv
```

覆盖场景：存款、Gasless Mint（USDC / BOX）、跨链铸造、Gasless Transfer、委托代付、余额不足回滚等。

---

## 技术栈

| 层 | 技术 |
|----|------|
| 智能合约 | Solidity 0.8.20 · Foundry · OpenZeppelin |
| 前端 | Next.js 13 · React · viem · Web3-React |
| 后端中继 | Next.js API Routes · viem (server) |
| 网络 | Sepolia · Base Sepolia |

---

## 已知限制

- 首次充值（approve + deposit）仍需少量 ETH；后续计划通过 **EIP-2612 Permit** 实现完全免 Gas 的首次入金
- Gasless Transfer 目前仅支持 Sepolia；Base Sepolia 支持待合约部署后开放
- Relayer 私钥保存在服务端环境变量，生产环境建议接入 HSM 或 KMS
