import type { NextApiRequest, NextApiResponse } from 'next'
import { createWalletClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

const USDC_ABI = parseAbi(['function mint(address to, uint256 amount) external'])
const claimed = new Set<string>()

const rpcUrl = process.env.RPC_URL
const relayerKey = process.env.RELAYER_PRIVATE_KEY as `0x${string}` | undefined

const walletClient = relayerKey
  ? createWalletClient({
      account: privateKeyToAccount(relayerKey),
      chain: baseSepolia,
      transport: http(rpcUrl),
    })
  : null

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const { userAddress } = req.body ?? {}

  if (!userAddress || !/^0x[0-9a-fA-F]{40}$/.test(userAddress)) {
    return res.status(400).json({ error: 'Invalid address' })
  }

  if (!rpcUrl || !relayerKey || !walletClient) {
    return res.status(500).json({ error: 'Missing faucet env config' })
  }

  if (claimed.has(userAddress.toLowerCase())) {
    return res.status(400).json({ error: 'Already claimed' })
  }

  try {
    const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` | undefined

    if (!usdcAddress) {
      return res.status(500).json({ error: 'Missing USDC address' })
    }

    const txHash = await walletClient.writeContract({
      address: usdcAddress,
      abi: USDC_ABI,
      functionName: 'mint',
      args: [userAddress as `0x${string}`, BigInt(10 * 1e6)],
      account: walletClient.account,
    })

    claimed.add(userAddress.toLowerCase())

    return res.json({
      success: true,
      txHash,
    })
  } catch (error: any) {
    return res.status(500).json({
      error: error?.shortMessage || error?.message || 'Unknown error',
    })
  }
}
