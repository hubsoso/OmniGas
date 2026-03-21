import type { NextApiRequest, NextApiResponse } from 'next'
import { createPublicClient, parseAbi } from 'viem'
import { sepolia } from 'viem/chains'
import { createFallbackTransport, SEPOLIA_RPC_URLS } from '../../lib/rpc'

const VAULT_ABI = parseAbi([
  'function balanceOf(address token, address user) view returns (uint256)',
])
const VAULT_PAYER_ABI = parseAbi([
  'function effectivePayer(address wallet) view returns (address)',
])
const NFT_ABI = parseAbi(['function balanceOf(address owner) view returns (uint256)'])

const chain = sepolia

const publicClient = createPublicClient({
  chain,
  transport: createFallbackTransport(SEPOLIA_RPC_URLS),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).end()
  }

  const { address } = req.query

  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'Missing address' })
  }

  const vaultAddress = process.env.NEXT_PUBLIC_VAULT_ADDRESS as `0x${string}` | undefined
  const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` | undefined
  const boxAddress = process.env.NEXT_PUBLIC_BOX_ADDRESS as `0x${string}` | undefined
  const nftAddress = process.env.NEXT_PUBLIC_NFT_ADDRESS as `0x${string}` | undefined

  if (!vaultAddress || !usdcAddress || !boxAddress || !nftAddress || !process.env.RPC_URL) {
    return res.status(500).json({ error: 'Missing balance env config' })
  }

  try {
    const userAddr = address as `0x${string}`

    // 尝试获取实际付款方（合约可能不支持），降级为用户自己
    let payer: `0x${string}` = userAddr
    try {
      const payerRaw = await publicClient.readContract({
        address: vaultAddress,
        abi: VAULT_PAYER_ABI,
        functionName: 'effectivePayer',
        args: [userAddr],
      })
      const zero = '0x0000000000000000000000000000000000000000'
      if (payerRaw && payerRaw.toLowerCase() !== zero) {
        payer = payerRaw as `0x${string}`
      }
    } catch {
      // effectivePayer 不存在或调用失败，使用用户地址
    }

    const [usdcRaw, boxRaw, nftCount] = await Promise.all([
      publicClient.readContract({
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'balanceOf',
        args: [usdcAddress, payer],
      }),
      publicClient.readContract({
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'balanceOf',
        args: [boxAddress, payer],
      }),
      publicClient.readContract({
        address: nftAddress,
        abi: NFT_ABI,
        functionName: 'balanceOf',
        args: [userAddr],
      }),
    ])

    return res.json({
      usdcBalance: (Number(usdcRaw) / 1e6).toFixed(2),
      boxBalance: (Number(boxRaw) / 1e18).toFixed(4),
      nftCount: nftCount.toString(),
      effectivePayer: payer,
    })
  } catch (error: any) {
    console.error('[balance] error:', error)
    return res.status(500).json({
      error: error?.shortMessage || error?.message || 'Unknown error',
    })
  }
}
