import type { NextApiRequest, NextApiResponse } from 'next'
import { createWalletClient, createPublicClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

const EXECUTOR_ABI = parseAbi([
  'function gaslessMint(address user, address feeToken) external',
])

const account = privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY as `0x${string}`)

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.RPC_URL),
})

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(process.env.RPC_URL),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { userAddress, feeToken } = req.body

  if (!userAddress || !/^0x[0-9a-fA-F]{40}$/.test(userAddress)) {
    return res.status(400).json({ error: 'Invalid user address' })
  }
  if (!feeToken || !/^0x[0-9a-fA-F]{40}$/.test(feeToken)) {
    return res.status(400).json({ error: 'Invalid feeToken address' })
  }

  try {
    const executorAddress = process.env.NEXT_PUBLIC_EXECUTOR_ADDRESS as `0x${string}`

    // 模拟执行，提前捕获 revert（余额不足 / 权限问题）
    await publicClient.simulateContract({
      address: executorAddress,
      abi: EXECUTOR_ABI,
      functionName: 'gaslessMint',
      args: [userAddress as `0x${string}`, feeToken as `0x${string}`],
      account,
    })

    const hash = await walletClient.writeContract({
      address: executorAddress,
      abi: EXECUTOR_ABI,
      functionName: 'gaslessMint',
      args: [userAddress as `0x${string}`, feeToken as `0x${string}`],
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 })

    return res.json({
      success: true,
      txHash: hash,
      blockNumber: receipt.blockNumber.toString(),
    })
  } catch (err: any) {
    console.error('[relay] error:', err)
    return res.status(500).json({ error: err?.shortMessage || err?.message || 'Unknown error' })
  }
}
