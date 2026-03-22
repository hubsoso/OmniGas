import type { NextApiRequest, NextApiResponse } from 'next'
import { createWalletClient, parseAbi, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia, baseSepolia } from 'viem/chains'
import { createFallbackTransport, SEPOLIA_RPC_URLS } from '../../lib/rpc'

const MINT_ABI = parseAbi(['function mint(address to, uint256 amount) external'])

const rpcUrl = process.env.RPC_URL
const relayerKey = process.env.RELAYER_PRIVATE_KEY as `0x${string}` | undefined
const baseSepRpcUrl = process.env.BASE_SEPOLIA_RPC_URL

// 诊断日志（开发时有用）
if (process.env.NODE_ENV === 'development') {
  console.log('[faucet] Config check:')
  console.log('  SEPOLIA USDC:', process.env.NEXT_PUBLIC_USDC_ADDRESS?.slice(0, 10))
  console.log('  SEPOLIA BOX:', process.env.NEXT_PUBLIC_BOX_ADDRESS?.slice(0, 10))
  console.log('  BASE SEPOLIA USDC:', process.env.NEXT_PUBLIC_BASE_USDC_ADDRESS?.slice(0, 10))
  console.log('  BASE SEPOLIA BOX:', process.env.NEXT_PUBLIC_BASE_BOX_ADDRESS?.slice(0, 10))
  console.log('  BASE SEPOLIA RPC:', baseSepRpcUrl)
}

interface ChainConfig {
  chain: any
  rpcUrl: string
  usdcAddress: string | undefined
  boxAddress: string | undefined
}

const chainConfigs: Record<string, ChainConfig> = {
  'sepolia': {
    chain: sepolia,
    rpcUrl: rpcUrl || '',
    usdcAddress: process.env.NEXT_PUBLIC_USDC_ADDRESS,
    boxAddress: process.env.NEXT_PUBLIC_BOX_ADDRESS,
  },
  'base-sepolia': {
    chain: baseSepolia,
    rpcUrl: baseSepRpcUrl || '',
    usdcAddress: process.env.NEXT_PUBLIC_BASE_USDC_ADDRESS,
    boxAddress: process.env.NEXT_PUBLIC_BASE_BOX_ADDRESS,
  },
}

function getWalletClient(chainKey: string) {
  const config = chainConfigs[chainKey]
  if (!config || !relayerKey || !config.rpcUrl) {
    console.error(`[faucet] getWalletClient failed: config=${!!config}, relayerKey=${!!relayerKey}, rpcUrl=${config?.rpcUrl}`)
    return null
  }

  return createWalletClient({
    account: privateKeyToAccount(relayerKey),
    chain: config.chain,
    transport: chainKey === 'sepolia'
      ? createFallbackTransport(SEPOLIA_RPC_URLS)
      : http(config.rpcUrl),
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const { userAddress, token = 'usdc', chain = 'sepolia' } = req.body ?? {}

  if (!userAddress || !/^0x[0-9a-fA-F]{40}$/.test(userAddress)) {
    return res.status(400).json({ error: 'Invalid address' })
  }

  const chainConfig = chainConfigs[chain]
  if (!chainConfig || !relayerKey) {
    return res.status(500).json({ error: 'Missing faucet env config' })
  }

  const isBox = token === 'box'
  const tokenAddress = (isBox ? chainConfig.boxAddress : chainConfig.usdcAddress) as `0x${string}` | undefined

  if (!tokenAddress) {
    return res.status(500).json({ error: `Missing ${token.toUpperCase()} address for ${chain}` })
  }

  const walletClient = getWalletClient(chain)
  if (!walletClient) {
    return res.status(500).json({ error: `Cannot create wallet client for ${chain}` })
  }

  try {
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
