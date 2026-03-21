# OmniGas Demo 总开发计划

## 产品背景

OmniGas 是一个 Web3 Gas 预付池产品，核心功能是让用户用 USDC / BOX 等 token
代替各链原生 gas（ETH 等）完成链上交易，用户无需持有原生 gas token。

用户预先将 USDC 或 BOX 充值到 Gas Pool，平台 Relayer 替用户垫付 gas，再从
用户的预付余额中扣除服务费（含 2× markup 利润）。

**目标网络**：Sepolia（Chain ID: 11155111）

---

## 整体架构

```
User (no ETH)
  │
  ├─ deposit USDC or BOX → GasVault
  │
  └─ 选择 Gas Token，点击 Gasless Swap / Mint
        │
        ▼
    OmniGas Relayer  ──pays gas (ETH)──▶  DemoExecutor
                                               │
                                         ┌─────┴──────┐
                                         ▼            ▼
                                    GasVault       DemoNFT
                                   deduct fee      mint NFT
```

**费率**：0.2 USDC 或 0.2 BOX / 次（~2× 实际 gas 成本，差价为平台收入）

---

## 技术选型

| 层 | 技术 |
|----|------|
| 合约 | Foundry + OpenZeppelin |
| 前端 | Next.js (pages router) + wagmi + viem |
| 后端 Relay | Next.js API routes |
| 钱包 | MetaMask（injected） |
| Gas 方案 | 自有 Relayer（无 ERC-4337 / Pimlico） |

---

## 阶段一：前端框架搭建 ✅

**状态**：已完成

**基础**：Uniswap widgets-demo（nextjs 分支），swap 功能完整，UI 精良

**路径**：`frontend/`

**运行方式**：
```bash
cd frontend
yarn install
yarn dev
# 访问 http://localhost:3000
```

**注意**：IPFS token list 在国内会超时，在 SwapWidget 传 prop 修复：
```tsx
const TOKEN_LIST = 'https://tokens.coingecko.com/uniswap/all.json'
<SwapWidget tokenList={TOKEN_LIST} ... />
```

---

## 阶段二：OmniGas Gas 选择器 UI ✅

**状态**：已完成

**修改文件**：
- `frontend/pages/index.tsx`：新增 gasToken state，在 swap widget 正上方插入 OmniGas 卡片
- `frontend/styles/OmniGas.module.css`：卡片和按钮样式

**UI 表现**：
- swap 卡片正上方出现一张浅灰背景圆角卡片
- 标题"Gas 支付方式"，下方横排三个胶囊按钮：**ETH（默认）/ USDC / BOX**
- 选中态：粉色边框 + 高亮阴影（Uniswap 风格）
- 切换到 USDC 或 BOX 时显示说明文字：
  "您无需持有 ETH，Gas 费将由 OmniGas 预付池代扣"
- 切换到 USDC 或 BOX 时出现"Gasless Mint"按钮

**待优化**：
- [ ] 配色对齐 OmniGas 品牌色
- [ ] 移动端响应式

---

## 阶段三：接入 OmniGas Relayer 合约 🔄

**状态**：合约已完成，待前后端接入

**方案说明**：
不使用 ERC-4337 / Pimlico，改用自有 Relayer 方案，更简单更可控：
1. 用户在前端 approve + deposit USDC/BOX 到 GasVault（用户自己发这两笔 tx，需要少量 ETH）
2. 用户点击"Gasless Mint" → 前端调 `/api/relay`
3. 后端 Relayer 用自己的私钥发 `executor.gaslessMint(user, feeToken)`
4. DemoExecutor 原子性地：扣用户 GasVault 余额 + mint DemoNFT
5. 前端展示成功 tx hash 和剩余余额

**合约地址**（部署后填入）：
```
MockUSDC:     0x...
MockBOX:      0x...
GasVault:     0x...
DemoNFT:      0x...
DemoExecutor: 0x...
```

**接入步骤**：

### 3.1 前端 deposit 流程（`frontend/pages/index.tsx`）

用户选择 USDC 或 BOX 后，显示充值入口：
1. 调用 `usdc.approve(vault, amount)`
2. 调用 `vault.deposit(token, amount)`
3. 更新页面余额显示

### 3.2 Gasless Mint 按钮

点击后调 `POST /api/relay`，body: `{ userAddress, feeToken }`，
等待返回 `txHash` 后展示在页面上。

### 3.3 余额显示

调 `GET /api/balance?address=0x...` 获取：
- `vaultBalance.usdc`：用户 USDC 预付余额
- `vaultBalance.box`：用户 BOX 预付余额
- `nftCount`：已 mint NFT 数量

---

## 阶段四：Faucet + 演示流程打磨 ⬜

**状态**：待做

- [ ] 页面增加"领取测试 USDC"按钮，调 `POST /api/faucet`
- [ ] 页面显示 Native ETH = 0（体现 gasless 效果）
- [ ] 添加文案：`No ETH required · Gas sponsored by OmniGas`
- [ ] 成功后展示 tx hash 链接（basescan.org）
- [ ] 录制 demo 视频

---

## 文件结构

```
OmniGas/
├── contracts/                     # Foundry 合约（已完成）
│   ├── src/
│   │   ├── MockUSDC.sol           # 测试 USDC，6 decimals
│   │   ├── MockBOX.sol            # 测试 BOX，18 decimals
│   │   ├── GasVault.sol           # 多 token 预付余额池
│   │   ├── DemoNFT.sol            # ERC721，仅 executor 可 mint
│   │   └── DemoExecutor.sol       # Relayer 入口，扣费 + mint 原子执行
│   ├── script/Deploy.s.sol
│   └── test/OmniGas.t.sol         # 9 个测试，全部通过
│
├── frontend/                      # Next.js 前端（pages router）
│   ├── pages/index.tsx            # 主页：swap widget + OmniGas 选择器
│   ├── lib/
│   │   ├── paymasterClient.ts     # 暂保留，后续可替换为 Relayer 调用
│   │   └── sendGaslessTransaction.ts
│   └── styles/OmniGas.module.css
│
├── src/app/api/                   # Next.js API routes（Relay 后端）
│   ├── relay/route.ts             # POST /api/relay
│   ├── balance/route.ts           # GET  /api/balance
│   └── faucet/route.ts            # POST /api/faucet
│
└── docs/
    ├── plan.md                    # 本文件（总计划）
    ├── contracts.md               # 合约详细实现
    ├── relay.md                   # API routes 实现
    └── frontend.md                # 前端接入指引
```

---

## 环境变量

```bash
# frontend/.env.local
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_USDC_ADDRESS=0x...
NEXT_PUBLIC_BOX_ADDRESS=0x...
NEXT_PUBLIC_VAULT_ADDRESS=0x...
NEXT_PUBLIC_NFT_ADDRESS=0x...
NEXT_PUBLIC_EXECUTOR_ADDRESS=0x...
RELAYER_PRIVATE_KEY=0x...        # 仅服务端，绝不 NEXT_PUBLIC_
RPC_URL=https://rpc.sepolia.org

# contracts/.env
PRIVATE_KEY=0x...
RELAYER_ADDRESS=0x...
RPC_URL=https://rpc.sepolia.org
```

---

## Demo 最小成功标准

满足以下 6 条即可演示：

1. 用户充值 USDC 或 BOX 到预付池
2. 页面显示预付余额
3. 用户钱包 ETH 余额为 0
4. 用户点击"Gasless Mint"，无需自己发交易
5. Relayer 成功帮用户 mint NFT
6. 预付余额被扣减，tx hash 展示在页面

---

## 后续规划（hackathon 提交前）

- [ ] 阶段三：前端接入 Relayer API，deposit + gasless mint 全链路跑通
- [ ] 阶段四：Faucet 入口 + 演示文案
- [ ] 样式对齐 OmniGas 品牌色
- [ ] 录制 demo 视频 + 截图
- [ ] README 整理（已完成初版）
