import type { NextApiRequest, NextApiResponse } from 'next'
import { createPublicClient, createWalletClient, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia, baseSepolia } from 'viem/chains'
import { createFallbackTransport, SEPOLIA_RPC_URLS, BASE_SEPOLIA_RPC_URLS } from '../../lib/rpc'

const EXECUTOR_ABI = parseAbi(['function gaslessMint(address user, address feeToken) external'])
const CROSS_EXECUTOR_ABI = parseAbi(['function gaslessMint(address user) external'])
const VAULT_ABI = parseAbi(['function deduct(address token, address user, uint256 amount) external'])

const relayerKey = process.env.RELAYER_PRIVATE_KEY as `0x${string}` | undefined

// Sepolia — hub chain (balance deduction always happens here)
const sepoliaPublic = createPublicClient({
  chain: sepolia,
  transport: createFallbackTransport(SEPOLIA_RPC_URLS),
})
const sepoliaWallet = relayerKey
  ? createWalletClient({
      account: privateKeyToAccount(relayerKey),
      chain: sepolia,
      transport: createFallbackTransport(SEPOLIA_RPC_URLS),
    })
  : null

// Base Sepolia — secondary chain (mint only)
const baseSepoliaPublic = createPublicClient({
  chain: baseSepolia,
  transport: createFallbackTransport(BASE_SEPOLIA_RPC_URLS),
})
const baseSepoliaWallet = relayerKey
  ? createWalletClient({
      account: privateKeyToAccount(relayerKey),
      chain: baseSepolia,
      transport: createFallbackTransport(BASE_SEPOLIA_RPC_URLS),
    })
  : null

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const { userAddress, feeToken, targetChain = 'sepolia' } = req.body ?? {}

  if (!userAddress || !/^0x[0-9a-fA-F]{40}$/.test(userAddress)) {
    return res.status(400).json({ error: 'Invalid user address' })
  }

  if (!feeToken || !/^0x[0-9a-fA-F]{40}$/.test(feeToken)) {
    return res.status(400).json({ error: 'Invalid feeToken address' })
  }

  if (!relayerKey || !sepoliaWallet) {
    return res.status(500).json({ error: 'Missing relay env config' })
  }

  const isBaseSepolia = targetChain === 'base-sepolia'

  try {
    if (isBaseSepolia) {
      // ── Cross-chain: deduct on Sepolia, mint on Base Sepolia ──────────
      const executorAddress = process.env.NEXT_PUBLIC_EXECUTOR_ADDRESS as `0x${string}` | undefined
      const crossExecutorAddress = process.env.NEXT_PUBLIC_BASE_EXECUTOR_ADDRESS as `0x${string}` | undefined
      const vaultAddress = process.env.NEXT_PUBLIC_VAULT_ADDRESS as `0x${string}` | undefined

      if (!executorAddress || !crossExecutorAddress || !vaultAddress) {
        return res.status(500).json({ error: 'Missing cross-chain env config' })
      }

      if (!baseSepoliaWallet) {
        return res.status(500).json({ error: 'Base Sepolia wallet not configured' })
      }

      // 1. Simulate mint on Base Sepolia first (validate before deducting)
      await baseSepoliaPublic.simulateContract({
        address: crossExecutorAddress,
        abi: CROSS_EXECUTOR_ABI,
        functionName: 'gaslessMint',
        args: [userAddress as `0x${string}`],
        account: baseSepoliaWallet.account,
      })

      // 2. Simulate deduct on Sepolia (validate balance)
      await sepoliaPublic.simulateContract({
        address: executorAddress,
        abi: EXECUTOR_ABI,
        functionName: 'gaslessMint',
        args: [userAddress as `0x${string}`, feeToken as `0x${string}`],
        account: sepoliaWallet.account,
      })

      // 3. Deduct on Sepolia hub
      const deductHash = await sepoliaWallet.writeContract({
        address: executorAddress,
        abi: EXECUTOR_ABI,
        functionName: 'gaslessMint',
        args: [userAddress as `0x${string}`, feeToken as `0x${string}`],
        account: sepoliaWallet.account,
      })

      // 4. Mint on Base Sepolia (fire and forget receipt)
      const mintHash = await baseSepoliaWallet.writeContract({
        address: crossExecutorAddress,
        abi: CROSS_EXECUTOR_ABI,
        functionName: 'gaslessMint',
        args: [userAddress as `0x${string}`],
        account: baseSepoliaWallet.account,
      })

      // Wait for Base Sepolia receipt (best-effort)
      let blockNumber: string | undefined
      try {
        const receipt = await baseSepoliaPublic.waitForTransactionReceipt({
          hash: mintHash,
          timeout: 60_000,
        })
        blockNumber = receipt.blockNumber.toString()
      } catch {
        // timeout — tx was submitted
      }

      return res.json({
        success: true,
        txHash: mintHash,
        deductTxHash: deductHash,
        chain: 'base-sepolia',
        ...(blockNumber ? { blockNumber } : {}),
      })
    } else {
      // ── Same-chain: Sepolia only ──────────────────────────────────────
      const executorAddress = process.env.NEXT_PUBLIC_EXECUTOR_ADDRESS as `0x${string}` | undefined

      if (!executorAddress) {
        return res.status(500).json({ error: 'Missing executor address' })
      }

      await sepoliaPublic.simulateContract({
        address: executorAddress,
        abi: EXECUTOR_ABI,
        functionName: 'gaslessMint',
        args: [userAddress as `0x${string}`, feeToken as `0x${string}`],
        account: sepoliaWallet.account,
      })

      const txHash = await sepoliaWallet.writeContract({
        address: executorAddress,
        abi: EXECUTOR_ABI,
        functionName: 'gaslessMint',
        args: [userAddress as `0x${string}`, feeToken as `0x${string}`],
        account: sepoliaWallet.account,
      })

      let blockNumber: string | undefined
      try {
        const receipt = await sepoliaPublic.waitForTransactionReceipt({
          hash: txHash,
          timeout: 60_000,
        })
        blockNumber = receipt.blockNumber.toString()
      } catch {
        // timeout — tx was submitted
      }

      return res.json({
        success: true,
        txHash,
        chain: 'sepolia',
        ...(blockNumber ? { blockNumber } : {}),
      })
    }
  } catch (error: any) {
    console.error('[relay] error:', error)
    return res.status(500).json({
      error: error?.shortMessage || error?.message || 'Unknown error',
    })
  }
}
