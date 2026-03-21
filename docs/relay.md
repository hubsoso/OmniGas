# 后端 Relay 实现文档（Person A）

## 说明

Relay 直接写在 Next.js API route 里，不需要独立服务。
Person A 在合约部署完后负责写这部分。

---

## 目录结构（Next.js 项目里）

```
src/
└── app/
    └── api/
        ├── relay/
        │   └── route.ts       # 核心：接收前端请求，调用合约
        ├── balance/
        │   └── route.ts       # 查询用户余额
        └── faucet/
            └── route.ts       # 给用户 mint MockUSDC（演示用）
```

---

## 环境变量（.env.local）

```
# 合约地址（部署完从 deployments.json 填入）
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_USDC_ADDRESS=0x...
NEXT_PUBLIC_VAULT_ADDRESS=0x...
NEXT_PUBLIC_NFT_ADDRESS=0x...
NEXT_PUBLIC_EXECUTOR_ADDRESS=0x...

# Relayer 私钥（只在服务端用，绝不暴露给前端）
RELAYER_PRIVATE_KEY=0x...

# RPC
RPC_URL=https://sepolia.base.org
```

---

## ABI（只需要用到的片段，放 src/lib/abi.ts）

```typescript
// src/lib/abi.ts

export const VAULT_ABI = [
  {
    name: "balances",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
] as const;

export const EXECUTOR_ABI = [
  {
    name: "gaslessMint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "user", type: "address" }],
    outputs: [],
  },
  {
    name: "FEE",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const USDC_ABI = [
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
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const NFT_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "nextTokenId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
```

---

## 核心 API 1：/api/relay/route.ts

```typescript
// src/app/api/relay/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const EXECUTOR_ABI = parseAbi([
  "function gaslessMint(address user) external",
]);

const account = privateKeyToAccount(
  process.env.RELAYER_PRIVATE_KEY as `0x${string}`
);

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.RPC_URL),
});

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(process.env.RPC_URL),
});

export async function POST(req: NextRequest) {
  try {
    const { userAddress } = await req.json();

    if (!userAddress || !/^0x[0-9a-fA-F]{40}$/.test(userAddress)) {
      return NextResponse.json({ error: "Invalid user address" }, { status: 400 });
    }

    const executorAddress = process.env.NEXT_PUBLIC_EXECUTOR_ADDRESS as `0x${string}`;

    // 模拟执行（先检查 gas 估算，确保不会 revert）
    await publicClient.simulateContract({
      address: executorAddress,
      abi: EXECUTOR_ABI,
      functionName: "gaslessMint",
      args: [userAddress as `0x${string}`],
      account,
    });

    // 发交易
    const hash = await walletClient.writeContract({
      address: executorAddress,
      abi: EXECUTOR_ABI,
      functionName: "gaslessMint",
      args: [userAddress as `0x${string}`],
    });

    // 等待确认
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 60_000,
    });

    return NextResponse.json({
      success: true,
      txHash: hash,
      blockNumber: receipt.blockNumber.toString(),
    });
  } catch (err: any) {
    console.error("[relay] error:", err);
    // 解析合约 revert 原因
    const message = err?.shortMessage || err?.message || "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

---

## 核心 API 2：/api/balance/route.ts

```typescript
// src/app/api/balance/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";

const VAULT_ABI = parseAbi([
  "function balances(address user) view returns (uint256)",
]);

const NFT_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
]);

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.RPC_URL),
});

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");

  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  const [vaultBalance, nftBalance] = await Promise.all([
    publicClient.readContract({
      address: process.env.NEXT_PUBLIC_VAULT_ADDRESS as `0x${string}`,
      abi: VAULT_ABI,
      functionName: "balances",
      args: [address as `0x${string}`],
    }),
    publicClient.readContract({
      address: process.env.NEXT_PUBLIC_NFT_ADDRESS as `0x${string}`,
      abi: NFT_ABI,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    }),
  ]);

  return NextResponse.json({
    // USDC 6位精度，转成可读字符串
    vaultBalance: (Number(vaultBalance) / 1e6).toFixed(2),
    vaultBalanceRaw: vaultBalance.toString(),
    nftCount: nftBalance.toString(),
  });
}
```

---

## 核心 API 3：/api/faucet/route.ts（演示用，给用户免费领 USDC）

```typescript
// src/app/api/faucet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const USDC_ABI = parseAbi([
  "function mint(address to, uint256 amount) external",
]);

const account = privateKeyToAccount(
  process.env.RELAYER_PRIVATE_KEY as `0x${string}`
);

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(process.env.RPC_URL),
});

// 简单防刷：记录已领取地址（重启清空，demo 够用）
const claimed = new Set<string>();

export async function POST(req: NextRequest) {
  const { userAddress } = await req.json();

  if (claimed.has(userAddress.toLowerCase())) {
    return NextResponse.json({ error: "Already claimed" }, { status: 400 });
  }

  const hash = await walletClient.writeContract({
    address: process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`,
    abi: USDC_ABI,
    functionName: "mint",
    args: [userAddress as `0x${string}`, BigInt(10 * 1e6)], // 10 USDC
  });

  claimed.add(userAddress.toLowerCase());

  return NextResponse.json({ success: true, txHash: hash });
}
```

---

## 依赖安装

```bash
npm install viem wagmi @tanstack/react-query
```

---

## 错误处理注意

relay API 里 `simulateContract` 会在真正发交易前模拟执行，如果余额不足或权限错误会直接抛出，可以避免浪费 gas 和让前端拿到清晰的错误信息。
