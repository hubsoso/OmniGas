# 前端实现文档（Person B）

## 说明

前端技术弱没关系，这份文档把所有代码直接给出来，复制粘贴即可跑通。
只有一个页面，不需要路由。

---

## 初始化项目

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --no-eslint
npm install wagmi viem @tanstack/react-query
```

---

## 目录结构（只需要关注这几个文件）

```
src/
├── app/
│   ├── layout.tsx        # 配置 wagmi provider
│   ├── page.tsx          # 唯一页面，复制粘贴即可
│   └── api/              # Person A 负责
├── lib/
│   ├── wagmi.ts          # wagmi 配置
│   ├── abi.ts            # 合约 ABI（Person A 提供）
│   └── contracts.ts      # 合约地址常量
```

---

## 第一步：配置 wagmi（src/lib/wagmi.ts）

```typescript
// src/lib/wagmi.ts
import { http, createConfig } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { injected, metaMask } from "wagmi/connectors";

export const config = createConfig({
  chains: [baseSepolia],
  connectors: [injected(), metaMask()],
  transports: {
    [baseSepolia.id]: http("https://sepolia.base.org"),
  },
});
```

---

## 第二步：合约地址（src/lib/contracts.ts）

**等 Person A 部署完合约后，填入地址。**

```typescript
// src/lib/contracts.ts
// 填入 Person A 部署后提供的地址
export const CONTRACTS = {
  USDC: "0x..." as `0x${string}`,
  VAULT: "0x..." as `0x${string}`,
  NFT: "0x..." as `0x${string}`,
  EXECUTOR: "0x..." as `0x${string}`,
};

// 固定扣费：0.1 USDC
export const FEE = 100_000n; // 6位精度

// 充值金额：10 USDC
export const DEPOSIT_AMOUNT = 10_000_000n;
```

---

## 第三步：Layout（src/app/layout.tsx）

```tsx
// src/app/layout.tsx
"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "@/lib/wagmi";
import "./globals.css";

const queryClient = new QueryClient();

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <WagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </WagmiProvider>
      </body>
    </html>
  );
}
```

---

## 第四步：主页面（src/app/page.tsx）

这是核心文件，完整复制：

```tsx
// src/app/page.tsx
"use client";

import { useState, useEffect } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useWriteContract,
  useWaitForTransactionReceipt,
  useBalance,
} from "wagmi";
import { metaMask } from "wagmi/connectors";
import { CONTRACTS, DEPOSIT_AMOUNT, FEE } from "@/lib/contracts";

// 最小化 ABI（只放用到的方法）
const USDC_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const VAULT_ABI = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
] as const;

// 地址缩写显示
function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  // 链上余额（原生 gas）
  const { data: nativeBalance } = useBalance({ address });

  // Vault 余额和 NFT 数量（从我们的 API 读）
  const [vaultBalance, setVaultBalance] = useState<string>("0.00");
  const [nftCount, setNftCount] = useState<string>("0");

  // 步骤状态：idle | approving | depositing | minting | success | error
  const [step, setStep] = useState<
    "idle" | "approving" | "depositing" | "minting" | "success" | "error"
  >("idle");
  const [txHash, setTxHash] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  // 写合约：approve
  const { writeContractAsync: approve } = useWriteContract();
  // 写合约：deposit
  const { writeContractAsync: deposit } = useWriteContract();

  // 轮询余额
  const fetchBalance = async () => {
    if (!address) return;
    const res = await fetch(`/api/balance?address=${address}`);
    const data = await res.json();
    setVaultBalance(data.vaultBalance ?? "0.00");
    setNftCount(data.nftCount ?? "0");
  };

  useEffect(() => {
    if (!isConnected || !address) return;
    fetchBalance();
    const id = setInterval(fetchBalance, 5000); // 每5秒刷新
    return () => clearInterval(id);
  }, [address, isConnected]);

  // 领取测试 USDC（Faucet）
  const handleFaucet = async () => {
    if (!address) return;
    setStep("idle");
    setErrorMsg("");
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress: address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert(`已领取 10 USDC！Tx: ${data.txHash}`);
      setTimeout(fetchBalance, 3000);
    } catch (e: any) {
      alert(`Faucet 失败: ${e.message}`);
    }
  };

  // Deposit 流程：先 approve，再 deposit
  const handleDeposit = async () => {
    if (!address) return;
    setErrorMsg("");
    try {
      // Step 1: Approve
      setStep("approving");
      const approveTx = await approve({
        address: CONTRACTS.USDC,
        abi: USDC_ABI,
        functionName: "approve",
        args: [CONTRACTS.VAULT, DEPOSIT_AMOUNT],
      });

      // Step 2: Deposit
      setStep("depositing");
      const depositTx = await deposit({
        address: CONTRACTS.VAULT,
        abi: VAULT_ABI,
        functionName: "deposit",
        args: [DEPOSIT_AMOUNT],
      });

      setStep("idle");
      alert("充值成功！");
      setTimeout(fetchBalance, 3000);
    } catch (e: any) {
      setStep("error");
      setErrorMsg(e.shortMessage || e.message);
    }
  };

  // Gasless Mint：调后端 relay API
  const handleGaslessMint = async () => {
    if (!address) return;
    setErrorMsg("");
    setStep("minting");
    try {
      const res = await fetch("/api/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userAddress: address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTxHash(data.txHash);
      setStep("success");
      setTimeout(fetchBalance, 3000);
    } catch (e: any) {
      setStep("error");
      setErrorMsg(e.message);
    }
  };

  // 连接钱包按钮
  if (!isConnected) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center space-y-6">
          <h1 className="text-4xl font-bold text-blue-400">OmniGas</h1>
          <p className="text-gray-400 text-lg">Gasless transactions, powered by prepaid USDC</p>
          <button
            onClick={() => connect({ connector: metaMask() })}
            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl text-lg font-semibold transition-colors"
          >
            Connect Wallet
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-lg mx-auto space-y-6">

        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-400">OmniGas</h1>
          <button
            onClick={() => disconnect()}
            className="text-sm text-gray-400 hover:text-white border border-gray-700 px-3 py-1 rounded-lg"
          >
            {shortAddr(address!)} · Disconnect
          </button>
        </div>

        {/* 余额卡片 */}
        <div className="bg-gray-900 rounded-2xl p-6 space-y-4">
          <h2 className="text-gray-400 text-sm uppercase tracking-wider">Wallet Status</h2>

          <div className="flex justify-between items-center">
            <span className="text-gray-300">Native Gas (ETH)</span>
            <span className={`font-mono font-bold ${Number(nativeBalance?.formatted ?? 0) < 0.001 ? "text-red-400" : "text-green-400"}`}>
              {nativeBalance ? `${parseFloat(nativeBalance.formatted).toFixed(6)} ${nativeBalance.symbol}` : "—"}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-300">Prepaid Gas Balance</span>
            <span className="font-mono font-bold text-blue-400 text-xl">
              {vaultBalance} USDC
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-300">NFTs Minted</span>
            <span className="font-mono text-purple-400">{nftCount}</span>
          </div>
        </div>

        {/* 充值区块 */}
        <div className="bg-gray-900 rounded-2xl p-6 space-y-4">
          <h2 className="text-gray-400 text-sm uppercase tracking-wider">Fund Gas Pool</h2>

          <div className="flex gap-3">
            <button
              onClick={handleFaucet}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-semibold transition-colors text-sm"
            >
              Get 10 Free USDC
            </button>
            <button
              onClick={handleDeposit}
              disabled={step === "approving" || step === "depositing"}
              className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold transition-colors"
            >
              {step === "approving"
                ? "Approving..."
                : step === "depositing"
                ? "Depositing..."
                : "Deposit 10 USDC"}
            </button>
          </div>

          <p className="text-xs text-gray-500 text-center">
            First time: approve USDC → deposit to Gas Pool
          </p>
        </div>

        {/* Gasless Mint 区块 */}
        <div className="bg-gray-900 rounded-2xl p-6 space-y-4">
          <h2 className="text-gray-400 text-sm uppercase tracking-wider">Gasless Action</h2>

          <div className="bg-gray-800 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between text-gray-300">
              <span>Action</span>
              <span className="text-white font-medium">Mint Demo NFT</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Gas paid by</span>
              <span className="text-green-400 font-medium">OmniGas Relayer</span>
            </div>
            <div className="flex justify-between text-gray-300">
              <span>Fee deducted</span>
              <span className="text-yellow-400 font-medium">0.1 USDC</span>
            </div>
          </div>

          <button
            onClick={handleGaslessMint}
            disabled={step === "minting" || Number(vaultBalance) < 0.1}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold text-lg transition-colors"
          >
            {step === "minting" ? "Relayer sending tx..." : "Gasless Mint"}
          </button>

          {Number(vaultBalance) < 0.1 && step !== "minting" && (
            <p className="text-xs text-red-400 text-center">
              Insufficient balance. Please deposit first.
            </p>
          )}

          <p className="text-xs text-gray-500 text-center">
            No native token required · Gas sponsored by OmniGas
          </p>
        </div>

        {/* 结果展示 */}
        {step === "success" && txHash && (
          <div className="bg-green-900/30 border border-green-700 rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">✅</span>
              <h3 className="text-green-400 font-bold text-lg">Mint Successful!</h3>
            </div>
            <p className="text-sm text-gray-300">
              <span className="text-gray-500">Fee deducted:</span>{" "}
              <span className="text-yellow-400">0.1 USDC</span> from your prepaid balance
            </p>
            <p className="text-sm text-gray-300">
              <span className="text-gray-500">Tx Hash:</span>{" "}
              <a
                href={`https://sepolia.basescan.org/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline font-mono text-xs break-all"
              >
                {txHash}
              </a>
            </p>
            <p className="text-xs text-gray-500 italic">
              The user had 0 ETH but successfully completed an on-chain action.
            </p>
          </div>
        )}

        {/* 错误展示 */}
        {step === "error" && errorMsg && (
          <div className="bg-red-900/30 border border-red-700 rounded-2xl p-4">
            <p className="text-red-400 text-sm">
              <span className="font-bold">Error: </span>{errorMsg}
            </p>
            <button
              onClick={() => { setStep("idle"); setErrorMsg(""); }}
              className="mt-2 text-xs text-gray-400 hover:text-white underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 底部说明 */}
        <p className="text-center text-xs text-gray-600">
          OmniGas Demo · Base Sepolia Testnet
        </p>
      </div>
    </main>
  );
}
```

---

## 本地运行

```bash
npm run dev
# 打开 http://localhost:3000
```

---

## 演示操作流程（现场用）

1. 打开页面，连接 MetaMask（切换到 Base Sepolia 网络）
2. 点击 **Get 10 Free USDC**（后端给你 mint 测试 USDC）
3. 点击 **Deposit 10 USDC**（MetaMask 弹出两次确认：approve + deposit）
4. 看到 **Prepaid Gas Balance: 10.00 USDC**
5. 确保 MetaMask 里 ETH 余额接近 0（演示无 gas 状态）
6. 点击 **Gasless Mint**
7. 等待几秒，看到成功结果和 Tx Hash

---

## MetaMask 配置 Base Sepolia

| 字段 | 值 |
|------|----|
| 网络名称 | Base Sepolia |
| RPC URL | https://sepolia.base.org |
| Chain ID | 84532 |
| 货币符号 | ETH |
| 区块浏览器 | https://sepolia.basescan.org |

---

## 常见问题

**Q: 页面连不上钱包？**
A: 确保 MetaMask 切到 Base Sepolia，刷新页面。

**Q: Deposit 报错？**
A: 先点 Get Free USDC 等待成功后再 Deposit。

**Q: Gasless Mint 转圈很久？**
A: 后端在等交易确认，Base Sepolia 一般 5-15 秒，正常等待即可。

**Q: 余额没更新？**
A: 余额每 5 秒自动刷新，也可以刷新页面。
