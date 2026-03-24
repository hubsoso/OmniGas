# OmniGas — 问答手册

> 更新：2026-03-24

---

## 一、核心原理

**Q：这和普通 Gas 付款有什么本质区别？**

A：普通用户每次链上操作都要自己掏 ETH 付 Gas，就像每次打车都要自备零钱。OmniGas 的模式是：用户提前往"储值卡"里充一次 USDC，之后所有操作由系统（Relayer）代付 ETH Gas，再从储值卡里扣服务费。用户体验从"每次操心"变成"充一次，用到底"。

---

**Q：Relayer 是什么角色？会不会跑路？**

A：Relayer 是一个由项目方控制的钱包地址，专门用来垫付 ETH Gas。它的权限被严格限制：只能调用 Executor 合约，不能动用户的 USDC 余额，也不能提走 GasVault 里的资金。合约层面强制执行，Relayer 私钥即使泄露也无法盗取用户资产，只能帮用户发交易。

---

**Q：GasVault 里的钱安全吗？用户资金会不会丢？**

A：GasVault 是智能合约，资金锁在链上，项目方无法任意提取。唯一能动余额的操作是 `deduct()`，且只有 Executor 合约有权调用，Executor 又只有 Relayer 能触发——三层权限锁。用户随时可以自行 withdraw 提回自己的余额。

---

**Q：手续费怎么定的？0.2 USDC 铸 NFT、0.1 USDC 转账，依据是什么？**

A：Sepolia 上实际 Gas 成本约 0.05–0.1 USDC 等值，定价留了约 2 倍利润空间覆盖 Relayer 的 ETH 运营成本和风险缓冲。这是黑客松 Demo 定价，正式产品可以做动态定价跟随 Gas Price 浮动。

---

## 二、商业模式

**Q：项目靠什么赚钱？**

A：Spread（价差）。用户充值 USDC，系统用 ETH 代付 Gas，手续费高于实际 Gas 成本的部分就是利润。规模越大、链越便宜（如 Base），利润率越高。

---

**Q：为什么用户愿意付更贵的手续费？**

A：三个理由：① 不用持有 ETH，降低用户门槛（尤其对新用户、企业用户）；② 一次充值、多次免操心，体验好；③ 支持团队共享同一个 Gas 池（企业代付），适合 ToB 场景，财务统一管理 Gas 费用。

---

**Q：企业代付是什么意思？**

A：企业可以往 GasVault 充一笔 USDC，然后授权给团队所有成员使用。成员操作时从公司的池子里扣费，不需要每人单独持有加密货币。这对 Web2 背景的企业来说很友好——类似企业统一充值"云服务费"。

---

## 三、技术风险

**Q：Relayer 的 ETH 耗尽了怎么办？**

A：这是目前最核心的运营风险。Relayer ETH 余额需要人工或自动化补充。正式产品需要做 ETH 余额监控、低水位自动报警、甚至自动从收到的手续费 USDC 换成 ETH 补仓。当前 Demo 阶段是手动管理。

---

**Q：Relayer 私钥放在服务器上，安全吗？**

A：Demo 阶段是环境变量存储，有一定风险。README 也明确说了，生产环境建议接入 HSM（硬件安全模块）或 KMS（云密钥管理服务），类似银行的 U 盾/密钥托管体系。这是标准的 Web3 基础设施做法。

---

**Q：用户首次充值还是要 ETH，这不是矛盾吗？**

A：是当前版本的一个限制，但有解法。EIP-2612 Permit 签名允许用户用链下签名授权扣款，不需要发链上 approve 交易，从而实现真正"零 ETH 入金"。这在路线图里，首版 Demo 没做。

---

## 四、赛道与竞争

**Q：这赛道已经有 Biconomy、Gelato 这些大项目了，差异化在哪？**

A：现有方案（Account Abstraction / ERC-4337）改造成本高，需要用户换智能合约钱包。OmniGas 的路径是：**普通 EOA 钱包（MetaMask）+ 预存 USDC 即可使用**，无需改变用户现有钱包习惯，接入门槛极低。适合作为轻量级 Gasless 中间件嵌入现有 DApp。

---

**Q：为什么选 Sepolia + Base Sepolia 双链？**

A：验证跨链扣费架构——资金统一在 Sepolia（Hub）管理，执行可以在其他链（Base）发生。这是为未来多链扩展铺路，费用池只需维护一个，执行层可以随意扩展到任意 EVM 链。

---

## 五、现状与局限

**Q：这是生产级产品吗？**

A：当前是黑客松 Demo，核心流程跑通，但有几处不适合生产：① Relayer ETH 无自动补充；② 私钥管理方式初级；③ 手续费固定不浮动；④ GaslessTransfer 仅 Sepolia，Base Sepolia 暂未开放。骨架是对的，距离生产还需要 2–3 个月工程化。

---

## 六、深层技术局限（进阶）

### Q：不是所有 ERC20 都支持 Permit，怎么办？

**背景**：EIP-2612 Permit 允许用户链下签名授权，省去 approve 交易的 ETH。但大量老旧代币（如早期 USDT）、自定义代币完全不支持这个标准。

**行业解法：Uniswap Permit2**

Uniswap 2022 年推出了 Permit2 合约，现已成为行业标准：

```
传统做法：
用户 → approve(DApp, amount)  ← 每个DApp都要approve一次，每次都要ETH

Permit2做法：
用户 → approve(Permit2合约, MAX)  ← 一生只做一次，只需ETH一次
之后：用户签名(链下) → Permit2 → 任意DApp  ← 永久免Gas
```

**本质**：把"通用授权中间层"做成一个公共合约，用户对 Permit2 做一次性最大授权，之后所有 DApp 通过 Permit2 走链下签名，不再需要 ETH。

**剩余局限**：仍然需要用户首次 approve Permit2 时出一次 ETH。彻底的"零 ETH 入场"目前没有完美解法，只能通过 CEX 出金、法币入金等链外方式绕过。

---

### Q：Relayer 代发交易，msg.sender 是 Relayer 不是用户，DApp 交互不会出问题吗？

**这是整个 Gasless 赛道最根本的架构矛盾。**

**为什么是致命问题：**

```
当前 OmniGas 架构：
用户签名 → Relayer钱包 → Executor合约 → DApp合约
                                          ↑
                              DApp看到的 msg.sender = Executor地址
                              不是用户地址！

后果：
- NFT 铸造给谁？Executor地址，不是用户
- DApp 里的"我的资产"查不到
- 权限类操作（投票、质押、治理）全部失效
- 任何 ownerOf / balanceOf 逻辑全部乱掉
```

OmniGas 当前能工作，是因为合约是自己写的，可以手动把 `userAddress` 当参数传进去再赋给 NFT。换成第三方 DApp 就完全不适用。

---

**三条出路，技术成熟度不同：**

#### 方案 A：ERC-2771 Trusted Forwarder（需 DApp 配合，短期可行）

```
用户签名 → Forwarder合约 → DApp合约
                           ↑
           DApp从calldata末尾读取真实用户地址
           msg.sender = 用户地址 ✓
```

- **条件**：DApp 必须改造，读 `_msgSender()` 而非 `msg.sender`
- **适用**：自己控制的合约，或已支持 ERC-2771 的协议
- **无法解决**：99% 的现有第三方 DApp

#### 方案 B：ERC-4337 账户抽象（行业主流方向）

```
用户的地址不再是 EOA钱包，而是一个智能合约钱包（SmartAccount）

用户签名 → Bundler → EntryPoint → SmartAccount → DApp
                                   ↑
                   msg.sender = SmartAccount地址 = 用户的地址 ✓
Gas 由 Paymaster 垫付，从用户的 USDC 余额扣
```

- **优点**：msg.sender 就是用户的合约钱包地址，DApp 无需改造
- **缺点**：用户必须迁移到新地址（告别 MetaMask 原始地址）；Biconomy、Pimlico、Alchemy 都在做，竞争激烈

#### 方案 C：EIP-7702（最新，2025年5月以太坊 Pectra 升级已上线）⭐

```
用户的 EOA 地址不变，但临时"附上"智能合约代码

用户签名(7702授权) → Relayer广播 → EOA地址执行合约逻辑
                                    ↑
                        msg.sender = 用户原始EOA地址 ✓
                        地址不变，Gas 可由他人代付
```

- **这是最优解**：用户地址不变、DApp 无需改造、Gas 完全代付、Permit 问题一并解决
- **现状**：2025年5月 Pectra 升级后已在以太坊主网上线，钱包和 DApp 生态支持还在追赶中

---

**三方案对比：**

|  | ERC-2771 | ERC-4337 | EIP-7702 |
|---|---|---|---|
| msg.sender 是用户 | ✓（需DApp改） | ✓ | ✓ |
| 用户地址不变 | ✓ | ✗（新地址） | ✓ |
| DApp 无需改造 | ✗ | ✓ | ✓ |
| 生态成熟度 | 中 | 高 | 刚上线 |
| OmniGas 适配难度 | 低 | 高 | 中 |

---

## 七、战略方向

基于以上技术分析，OmniGas 的演进路径：

1. **短期**：接入 EIP-7702，支持用户用原始地址完成 Gasless 任意 DApp 交互
2. **中期**：成为 EIP-7702 时代的 Paymaster 基础设施，帮任意 DApp 提供 Gas 代付服务
3. **竞争壁垒**：不做钱包（4337 路线），而是做"Gas 结算层"——谁来付 Gas、用什么币付、怎么记账，这是 OmniGas 的核心价值
