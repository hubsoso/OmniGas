import type { NextApiRequest, NextApiResponse } from 'next'
import { createPublicClient, createWalletClient, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { createFallbackTransport, SEPOLIA_RPC_URLS } from '../../lib/rpc'

const EXECUTOR_ABI = parseAbi(['function gaslessMint(address user, address feeToken) external'])

const rpcUrl = process.env.RPC_URL
const relayerKey = process.env.RELAYER_PRIVATE_KEY as `0x${string}` | undefined
const chain = sepolia

const publicClient = createPublicClient({
  chain,
  transport: createFallbackTransport(SEPOLIA_RPC_URLS),
})

const walletClient = relayerKey
  ? createWalletClient({
      account: privateKeyToAccount(relayerKey),
      chain,
      transport: createFallbackTransport(SEPOLIA_RPC_URLS),
    })
  : null

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const { userAddress, feeToken } = req.body ?? {}

  if (!userAddress || !/^0x[0-9a-fA-F]{40}$/.test(userAddress)) {
    return res.status(400).json({ error: 'Invalid user address' })
  }

  if (!feeToken || !/^0x[0-9a-fA-F]{40}$/.test(feeToken)) {
    return res.status(400).json({ error: 'Invalid feeToken address' })
  }

  if (!rpcUrl || !relayerKey || !walletClient) {
    return res.status(500).json({ error: 'Missing relay env config' })
  }

  try {
    const executorAddress = process.env.NEXT_PUBLIC_EXECUTOR_ADDRESS as `0x${string}` | undefined

    if (!executorAddress) {
      return res.status(500).json({ error: 'Missing executor address' })
    }

    await publicClient.simulateContract({
      address: executorAddress,
      abi: EXECUTOR_ABI,
      functionName: 'gaslessMint',
      args: [userAddress as `0x${string}`, feeToken as `0x${string}`],
      account: walletClient.account,
    })

    const txHash = await walletClient.writeContract({
      address: executorAddress,
      abi: EXECUTOR_ABI,
      functionName: 'gaslessMint',
      args: [userAddress as `0x${string}`, feeToken as `0x${string}`],
      account: walletClient.account,
    })

    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60_000,
    })

    return res.json({
      success: true,
      txHash,
      blockNumber: receipt.blockNumber.toString(),
    })
  } catch (error: any) {
    console.error('[relay] error:', error)
    return res.status(500).json({
      error: error?.shortMessage || error?.message || 'Unknown error',
    })
  }
}
