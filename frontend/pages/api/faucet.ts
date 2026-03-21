import type { NextApiRequest, NextApiResponse } from 'next'
import { createWalletClient, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { createFallbackTransport, SEPOLIA_RPC_URLS } from '../../lib/rpc'

const MINT_ABI = parseAbi(['function mint(address to, uint256 amount) external'])

const rpcUrl = process.env.RPC_URL
const relayerKey = process.env.RELAYER_PRIVATE_KEY as `0x${string}` | undefined
const chain = sepolia

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

  const { userAddress, token = 'usdc' } = req.body ?? {}

  if (!userAddress || !/^0x[0-9a-fA-F]{40}$/.test(userAddress)) {
    return res.status(400).json({ error: 'Invalid address' })
  }

  if (!rpcUrl || !relayerKey || !walletClient) {
    return res.status(500).json({ error: 'Missing faucet env config' })
  }

  const isBox = token === 'box'

  try {
    const tokenAddress = (isBox
      ? process.env.NEXT_PUBLIC_BOX_ADDRESS
      : process.env.NEXT_PUBLIC_USDC_ADDRESS) as `0x${string}` | undefined

    if (!tokenAddress) {
      return res.status(500).json({ error: `Missing ${token.toUpperCase()} address` })
    }

    // USDC: 10 * 1e6 (6 decimals), BOX: 10 * 1e18 (18 decimals)
    const amount = isBox ? BigInt(10) * BigInt(1e18) : BigInt(10 * 1e6)

    const txHash = await walletClient.writeContract({
      address: tokenAddress,
      abi: MINT_ABI,
      functionName: 'mint',
      args: [userAddress as `0x${string}`, amount],
      account: walletClient.account,
    })

    return res.json({ success: true, txHash })
  } catch (error: any) {
    console.error('[faucet] error:', error)
    return res.status(500).json({
      error: error?.shortMessage || error?.message || 'Unknown error',
    })
  }
}
