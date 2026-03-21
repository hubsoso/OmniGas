# OmniGas Demo 开发计划

## 产品背景

OmniGas 是一个 Web3 Gas 预付池产品，核心功能是让用户用 USDT / USDC / BOX 等 token
代替各链原生 gas（ETH / BNB 等）完成链上交易，用户无需持有原生 gas token。

技术底层基于 ERC-4337 Account Abstraction，由 Paymaster 合约替用户垫付 gas，再从
用户的 ERC-20 余额中扣款。

---

## 今日目标

在开源 Swap 前端上叠加 OmniGas Gas 选择器，并接入 ERC-4337 Paymaster
让一笔测试网交易真实上链，证明"用户不持有 ETH 也能完成交易"。

---

## 阶段一：跑通开源 Swap 前端 ✅

**状态**：已完成

**选用 repo**：`https://github.com/Uniswap/widgets-demo`（nextjs 分支）

**理由**：Uniswap 官方出品，swap 功能完整，UI 好看，代码干净，
embed 一行即可得到完整 swap 卡片，不需要自己写任何 swap 逻辑。

**本地路径**：`/Users/mac/Desktop/Omni_Gas/widgets-demo/frontend`

**运行方式**：
```bash
cd frontend
yarn dev
# 访问 http://localhost:3000
```

**已验证**：localhost:3000 返回 200，swap 卡片渲染正常，钱包连接按钮可点击。

**注意**：页面加载时有一个 IPFS token list 报错（failed to fetch list:
https://gateway.ipfs.io/ipns/tokens.uniswap.org），国内网络访问 IPFS 超时导致，
不影响 swap widget 渲染。修复方式：给 SwapWidget 传本地 tokenList prop：
```tsx
const TOKEN_LIST = 'https://tokens.coingecko.com/uniswap/all.json'

```

---

## 阶段二：叠加 OmniGas Gas 选择器 UI ✅

**状态**：已完成

**修改文件**：
- `pages/index.tsx`：新增 gasToken state，在 swap widget 正上方插入 OmniGas 卡片
- `styles/OmniGas.module.css`：新增卡片和按钮样式

**UI 表现**：
- swap 卡片正上方出现一张浅灰背景圆角卡片
- 标题"Gas 支付方式"，下方横排三个胶囊按钮：ETH（默认）/ USDT / BOX
- 选中态：Uniswap 风格粉色边框 + 高亮阴影
- 切换到 USDT 或 BOX 时显示说明文字：
  "您无需持有 ETH，Gas 费将由 OmniGas 预付池代扣"
- 切换到 USDT 或 BOX 时出现"测试 Gasless 交易"按钮

**下一步样式优化**（待做）：
- 对齐整体配色到 OmniGas 品牌色
- 移动端响应式适配

---

## 阶段三：接入 ERC-4337 Paymaster 🔄

**状态**：代码已完成，等待填入 Pimlico API key

**新增文件**：
- `lib/paymasterClient.ts`：初始化 Pimlico Paymaster / Bundler client，链为 Sepolia
- `lib/sendGaslessTransaction.ts`：构造 SmartAccount，发送 UserOperation，返回 tx hash

**依赖版本**：
- `permissionless@0.3.4`
- `viem@2.47.5`
- `@tanstack/react-query@5.91.3`

**技术方案**：
- 标准 ERC-4337 流程：EOA signer → SimpleSmartAccount → UserOperation → Bundler → EntryPoint
- Paymaster 使用 Pimlico 的 sponsorUserOperation，由 Pimlico 赞助测试网 gas
- 测试链：Sepolia

**待完成**：
1. 前往 https://dashboard.pimlico.io 注册，创建 app 选 Sepolia，拿到 API key
2. 填入 `.env.local`：`NEXT_PUBLIC_PIMLICO_API_KEY=pim_xxxxxxxxxxxxxxxx`
3. 重启 yarn dev，点击"测试 Gasless 交易"按钮
4. 拿到 tx hash，在 https://sepolia.etherscan.io 验证交易

**预期结果**：用户不持有 ETH，通过 OmniGas Paymaster 完成交易，
页面显示 `交易成功：https://sepolia.etherscan.io/tx/{txHash}`

---

## 文件结构
```
widgets-demo/
├── frontend/
│   ├── pages/
│   │   └── index.tsx          # 主页面，含 OmniGas 选择器 + swap widget
│   ├── components/
│   │   └── Web3Connectors.tsx # MetaMask / WalletConnect 连接逻辑
│   ├── connectors/
│   │   └── index.ts           # 连接器列表
│   ├── lib/
│   │   ├── paymasterClient.ts        # Pimlico client 初始化
│   │   └── sendGaslessTransaction.ts # Gasless 交易发送逻辑
│   ├── styles/
│   │   ├── OmniGas.module.css # OmniGas 选择器样式
│   │   └── globals.css
│   ├── constants.ts           # RPC 配置
│   └── .env.local             # API keys（不提交 git）
└── OMNIGAS_PLAN.md            # 本文件
```

---

## 今日最小成功标准

测试网上跑通一笔交易：用户持 USDT，不持有 ETH，
通过 OmniGas Paymaster 完成 swap 并拿到真实 tx hash，
UI 上能看到 Gas token 切换选项。

---

## 后续规划（hackathon 提交前）

- [ ] 阶段三跑通，拿到真实 tx hash
- [ ] 替换测试私钥为 MetaMask 钱包连接
- [ ] 样式对齐 OmniGas 品牌
- [ ] 修复 IPFS token list 报错
- [ ] 录制 demo 视频，截图备用
- [ ] 整理 README，说明产品背景和技术方案
