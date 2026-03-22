import type { NextApiRequest, NextApiResponse } from 'next'
import { createPublicClient, createWalletClient, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { createFallbackTransport, SEPOLIA_RPC_URLS } from '../../lib/rpc'

const TRANSFER_EXECUTOR_ABI = parseAbi([
  'function gaslessTransfer(address user, address recipient, address token, uint256 amount, address feeToken) external',
])

const relayerKey = process.env.RELAYER_PRIVATE_KEY as `0x${string}` | undefined

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).end()
  }

  const { userAddress, recipient, token, amount, feeToken } = req.body ?? {}

  // ─── Input Validation ───────────────────────────────────────

  if (!userAddress || !/^0x[0-9a-fA-F]{40}$/.test(userAddress)) {
    return res.status(400).json({ error: 'Invalid user address' })
  }

  if (!recipient || !/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
    return res.status(400).json({ error: 'Invalid recipient address' })
  }

  if (!token || !/^0x[0-9a-fA-F]{40}$/.test(token)) {
    return res.status(400).json({ error: 'Invalid token address' })
  }

  if (!feeToken || !/^0x[0-9a-fA-F]{40}$/.test(feeToken)) {
    return res.status(400).json({ error: 'Invalid feeToken address' })
  }

  if (!amount || typeof amount !== 'string' || !amount.startsWith('0x')) {
    return res.status(400).json({ error: 'Invalid amount (must be hex string)' })
  }

  // Validate feeToken is USDC or BOX (not ETH)
  const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS?.toLowerCase()
  const boxAddress = process.env.NEXT_PUBLIC_BOX_ADDRESS?.toLowerCase()
  const feeTokenLower = feeToken.toLowerCase()

  if (feeTokenLower !== usdcAddress && feeTokenLower !== boxAddress) {
    return res.status(400).json({ error: 'Fee token must be USDC or BOX' })
  }

  if (!relayerKey || !sepoliaWallet) {
    return res.status(500).json({ error: 'Missing relay env config' })
  }

  try {
    const transferExecutorAddress = process.env.NEXT_PUBLIC_TRANSFER_EXECUTOR_ADDRESS as
      | `0x${string}`
      | undefined

    if (!transferExecutorAddress) {
      return res.status(500).json({ error: 'Missing transfer executor address' })
    }

    // ─── Simulate ──────────────────────────────────────────────

    await sepoliaPublic.simulateContract({
      address: transferExecutorAddress,
      abi: TRANSFER_EXECUTOR_ABI,
      functionName: 'gaslessTransfer',
      args: [
        userAddress as `0x${string}`,
        recipient as `0x${string}`,
        token as `0x${string}`,
        BigInt(amount),
        feeToken as `0x${string}`,
      ],
      account: sepoliaWallet.account,
    })

    // ─── Execute ───────────────────────────────────────────────

    const txHash = await sepoliaWallet.writeContract({
      address: transferExecutorAddress,
      abi: TRANSFER_EXECUTOR_ABI,
      functionName: 'gaslessTransfer',
      args: [
        userAddress as `0x${string}`,
        recipient as `0x${string}`,
        token as `0x${string}`,
        BigInt(amount),
        feeToken as `0x${string}`,
      ],
      account: sepoliaWallet.account,
    })

    // ─── Wait for Receipt (best-effort) ────────────────────────

    let blockNumber: string | undefined
    try {
      const receipt = await sepoliaPublic.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60_000,
      })
      blockNumber = receipt.blockNumber.toString()
    } catch {
      // timeout — tx was submitted but not yet confirmed
    }

    return res.json({
      success: true,
      txHash,
      chain: 'sepolia',
      ...(blockNumber ? { blockNumber } : {}),
    })
  } catch (error: any) {
    console.error('[relay-transfer] error:', error)
    return res.status(500).json({
      error: error?.shortMessage || error?.message || 'Unknown error',
    })
  }
}
