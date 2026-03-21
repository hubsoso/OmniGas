import type { NextApiRequest, NextApiResponse } from 'next'
import { createWalletClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

const USDC_ABI = parseAbi(['function mint(address to, uint256 amount) external'])
const BOX_ABI = parseAbi(['function mint(address to, uint256 amount) external'])

const account = privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY as `0x${string}`)

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(process.env.RPC_URL),
})

// 简单防刷：记录已领取地址（服务重启清空，demo 够用）
const claimedUsdc = new Set<string>()
const claimedBox = new Set<string>()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  const { userAddress, token = 'usdc' } = req.body
  if (!userAddress || !/^0x[0-9a-fA-F]{40}$/.test(userAddress)) {
    return res.status(400).json({ error: 'Invalid address' })
  }

  const key = userAddress.toLowerCase()

  if (token === 'usdc') {
    if (claimedUsdc.has(key)) return res.status(400).json({ error: 'USDC already claimed' })

    const hash = await walletClient.writeContract({
      address: process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`,
      abi: USDC_ABI,
      functionName: 'mint',
      args: [userAddress as `0x${string}`, BigInt(10 * 1e6)], // 10 USDC
    })
    claimedUsdc.add(key)
    return res.json({ success: true, txHash: hash, amount: '10 USDC' })
  }

  if (token === 'box') {
    if (claimedBox.has(key)) return res.status(400).json({ error: 'BOX already claimed' })

    const hash = await walletClient.writeContract({
      address: process.env.NEXT_PUBLIC_BOX_ADDRESS as `0x${string}`,
      abi: BOX_ABI,
      functionName: 'mint',
      args: [userAddress as `0x${string}`, BigInt(10) * BigInt(1e18)], // 10 BOX
    })
    claimedBox.add(key)
    return res.json({ success: true, txHash: hash, amount: '10 BOX' })
  }

  return res.status(400).json({ error: 'token must be usdc or box' })
}
