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

  console.log('[relay] 收到请求:', { userAddress, feeToken, targetChain })

  if (!userAddress || !/^0x[0-9a-fA-F]{40}$/.test(userAddress)) {
    console.error('[relay] Invalid user address:', userAddress)
    return res.status(400).json({ error: 'Invalid user address' })
  }

  if (!feeToken || !/^0x[0-9a-fA-F]{40}$/.test(feeToken)) {
    console.error('[relay] Invalid feeToken address:', feeToken)
    return res.status(400).json({ error: 'Invalid feeToken address' })
  }

  if (!relayerKey || !sepoliaWallet) {
    console.error('[relay] Missing relay env config')
    return res.status(500).json({ error: 'Missing relay env config' })
  }

  const isBaseSepolia = targetChain === 'base-sepolia'

  try {
    console.log('[relay] 处理请求 - isBaseSepolia:', isBaseSepolia)
    if (isBaseSepolia) {
      // ── Cross-chain: deduct on Sepolia, mint on Base Sepolia ──────────
      const executorAddress = process.env.NEXT_PUBLIC_EXECUTOR_ADDRESS as `0x${string}` | undefined
      const crossExecutorAddress = process.env.NEXT_PUBLIC_BASE_EXECUTOR_ADDRESS as `0x${string}` | undefined
      const vaultAddress = process.env.NEXT_PUBLIC_VAULT_ADDRESS as `0x${string}` | undefined

      console.log('[relay] Base Sepolia 路径:', { executorAddress, crossExecutorAddress, vaultAddress })

      if (!executorAddress || !crossExecutorAddress || !vaultAddress) {
        console.error('[relay] Missing cross-chain env config')
        return res.status(500).json({ error: 'Missing cross-chain env config' })
      }

      if (!baseSepoliaWallet) {
        console.error('[relay] Base Sepolia wallet not configured')
        return res.status(500).json({ error: 'Base Sepolia wallet not configured' })
      }

      // 1. Simulate mint on Base Sepolia first (validate before deducting)
      console.log('[relay] 1. 模拟 Base Sepolia mint...')
      await baseSepoliaPublic.simulateContract({
        address: crossExecutorAddress,
        abi: CROSS_EXECUTOR_ABI,
        functionName: 'gaslessMint',
        args: [userAddress as `0x${string}`],
        account: baseSepoliaWallet.account,
      })
      console.log('[relay] 1. Base Sepolia mint 模拟成功')

      // 2. Simulate deduct on Sepolia (validate balance)
      console.log('[relay] 2. 模拟 Sepolia deduct...')
      await sepoliaPublic.simulateContract({
        address: executorAddress,
        abi: EXECUTOR_ABI,
        functionName: 'gaslessMint',
        args: [userAddress as `0x${string}`, feeToken as `0x${string}`],
        account: sepoliaWallet.account,
      })
      console.log('[relay] 2. Sepolia deduct 模拟成功')

      // 3. Deduct on Sepolia hub
      console.log('[relay] 3. 执行 Sepolia deduct...')
      const deductHash = await sepoliaWallet.writeContract({
        address: executorAddress,
        abi: EXECUTOR_ABI,
        functionName: 'gaslessMint',
        args: [userAddress as `0x${string}`, feeToken as `0x${string}`],
        account: sepoliaWallet.account,
      })
      console.log('[relay] 3. Sepolia deduct 完成，txHash:', deductHash)

      // 4. Mint on Base Sepolia (fire and forget receipt)
      console.log('[relay] 4. 执行 Base Sepolia mint...')
      const mintHash = await baseSepoliaWallet.writeContract({
        address: crossExecutorAddress,
        abi: CROSS_EXECUTOR_ABI,
        functionName: 'gaslessMint',
        args: [userAddress as `0x${string}`],
        account: baseSepoliaWallet.account,
      })
      console.log('[relay] 4. Base Sepolia mint 完成，txHash:', mintHash)

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

      console.log('[relay] Sepolia 路径:', { executorAddress })

      if (!executorAddress) {
        console.error('[relay] Missing executor address')
        return res.status(500).json({ error: 'Missing executor address' })
      }

      console.log('[relay] 模拟 Sepolia mint...')
      await sepoliaPublic.simulateContract({
        address: executorAddress,
        abi: EXECUTOR_ABI,
        functionName: 'gaslessMint',
        args: [userAddress as `0x${string}`, feeToken as `0x${string}`],
        account: sepoliaWallet.account,
      })
      console.log('[relay] Sepolia mint 模拟成功')

      console.log('[relay] 执行 Sepolia mint...')
      const txHash = await sepoliaWallet.writeContract({
        address: executorAddress,
        abi: EXECUTOR_ABI,
        functionName: 'gaslessMint',
        args: [userAddress as `0x${string}`, feeToken as `0x${string}`],
        account: sepoliaWallet.account,
      })
      console.log('[relay] Sepolia mint 完成，txHash:', txHash)

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
    console.error('[relay] 错误:', {
      message: error?.message,
      shortMessage: error?.shortMessage,
      cause: error?.cause,
      code: error?.code,
      data: error?.data,
      fullError: error.toString(),
    })
    return res.status(500).json({
      error: error?.shortMessage || error?.message || 'Unknown error',
      details: error?.cause?.message || undefined,
    })
  }
}
