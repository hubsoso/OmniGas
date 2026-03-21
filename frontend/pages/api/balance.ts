import type { NextApiRequest, NextApiResponse } from 'next'
import { createPublicClient, http, parseAbi } from 'viem'
import { baseSepolia } from 'viem/chains'

const VAULT_ABI = parseAbi([
  'function balanceOf(address token, address user) view returns (uint256)',
])
const NFT_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
])

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.RPC_URL),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const { address } = req.query
  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'Missing address' })
  }

  const vaultAddress = process.env.NEXT_PUBLIC_VAULT_ADDRESS as `0x${string}`
  const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`
  const boxAddress = process.env.NEXT_PUBLIC_BOX_ADDRESS as `0x${string}`
  const nftAddress = process.env.NEXT_PUBLIC_NFT_ADDRESS as `0x${string}`

  const [usdcRaw, boxRaw, nftCount] = await Promise.all([
    publicClient.readContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: 'balanceOf',
      args: [usdcAddress, address as `0x${string}`],
    }),
    publicClient.readContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: 'balanceOf',
      args: [boxAddress, address as `0x${string}`],
    }),
    publicClient.readContract({
      address: nftAddress,
      abi: NFT_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    }),
  ])

  return res.json({
    usdcBalance: (Number(usdcRaw) / 1e6).toFixed(2),    // USDC 6 decimals
    boxBalance: (Number(boxRaw) / 1e18).toFixed(4),      // BOX 18 decimals
    nftCount: nftCount.toString(),
  })
}
