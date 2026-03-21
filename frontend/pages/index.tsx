import type { NextPage } from 'next'
import Head from 'next/head'
import { FiGlobe } from 'react-icons/fi'
import { SupportedLocale, SUPPORTED_LOCALES, SwapWidget } from '@uniswap/widgets'
import { createPublicClient, createWalletClient, custom, http, parseAbi } from 'viem'
import { baseSepolia } from 'viem/chains'

import '@uniswap/widgets/fonts.css'

import styles from '../styles/Home.module.css'
import omniGasStyles from '../styles/OmniGas.module.css'
import DocumentationCards from '../components/DocumentationCards'
import Web3Connectors from '../components/Web3Connectors'
import { useActiveProvider } from '../connectors'
import { useCallback, useEffect, useRef, useState } from 'react'
import { JSON_RPC_URL } from '../constants'

const TOKEN_LIST = 'https://tokens.coingecko.com/uniswap/all.json'
const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
const GAS_TOKENS = ['ETH', 'USDC', 'BOX'] as const
const ERC20_ABI = parseAbi(['function approve(address spender, uint256 amount) external returns (bool)'])
const VAULT_ABI = parseAbi(['function deposit(address token, uint256 amount) external'])
const BASESCAN_TX_URL = 'https://sepolia.basescan.org/tx/'
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 84532)
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(baseSepolia.rpcUrls.default.http[0]),
})

type GasToken = (typeof GAS_TOKENS)[number]

type BalanceResponse = {
  usdcBalance: string
  boxBalance: string
  nftCount: string
}

const tokenConfig: Record<Exclude<GasToken, 'ETH'>, { address?: `0x${string}`; amount: bigint; label: string }> = {
  USDC: {
    address: process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` | undefined,
    amount: BigInt(10 * 1e6),
    label: '10 USDC',
  },
  BOX: {
    address: process.env.NEXT_PUBLIC_BOX_ADDRESS as `0x${string}` | undefined,
    amount: BigInt(10) * BigInt(10) ** BigInt(18),
    label: '10 BOX',
  },
}

const vaultAddress = process.env.NEXT_PUBLIC_VAULT_ADDRESS as `0x${string}` | undefined

const Home: NextPage = () => {
  const connectors = useRef<HTMLDivElement>(null)
  const focusConnectors = useCallback(() => connectors.current?.focus(), [])
  const provider = useActiveProvider()

  const [locale, setLocale] = useState<SupportedLocale>('en-US')
  const [gasToken, setGasToken] = useState<GasToken>('ETH')
  const [txHash, setTxHash] = useState('')
  const [walletAddress, setWalletAddress] = useState<`0x${string}` | ''>('')
  const [balances, setBalances] = useState<BalanceResponse>({
    usdcBalance: '0.00',
    boxBalance: '0.0000',
    nftCount: '0',
  })
  const [loading, setLoading] = useState(false)
  const [depositing, setDepositing] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [message, setMessage] = useState('')
  const onSelectLocale = useCallback((e) => setLocale(e.target.value), [])

  const selectedToken = gasToken === 'ETH' ? null : tokenConfig[gasToken]

  const refreshBalances = useCallback(
    async (address?: string) => {
      const targetAddress = address || walletAddress

      if (!targetAddress) {
        return
      }

      const response = await fetch(`/api/balance?address=${targetAddress}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load balances')
      }

      setBalances(data)
    },
    [walletAddress]
  )

  const getWalletClient = useCallback(async () => {
    if (!provider) {
      throw new Error('Please connect MetaMask first')
    }

    const network = await provider.getNetwork()

    if (network.chainId !== CHAIN_ID) {
      throw new Error(`Please switch MetaMask to Base Sepolia (${CHAIN_ID})`)
    }

    const externalProvider = (provider as any).provider

    if (!externalProvider) {
      throw new Error('Wallet provider unavailable')
    }

    return createWalletClient({
      chain: baseSepolia,
      transport: custom(externalProvider),
    })
  }, [provider])

  useEffect(() => {
    let cancelled = false

    async function syncWallet() {
      if (!provider) {
        if (!cancelled) {
          setWalletAddress('')
        }
        return
      }

      try {
        const signerAddress = await provider.getSigner().getAddress()

        if (!cancelled) {
          setWalletAddress(signerAddress as `0x${string}`)
        }
      } catch {
        if (!cancelled) {
          setWalletAddress('')
        }
      }
    }

    syncWallet()

    return () => {
      cancelled = true
    }
  }, [provider])

  useEffect(() => {
    if (!walletAddress) {
      return
    }

    refreshBalances(walletAddress).catch((error) => {
      setMessage(error.message)
    })

    const timer = window.setInterval(() => {
      refreshBalances(walletAddress).catch(() => {})
    }, 5_000)

    return () => window.clearInterval(timer)
  }, [refreshBalances, walletAddress])

  const onClaimUsdc = useCallback(async () => {
    if (!walletAddress) {
      setMessage('Please connect MetaMask first')
      return
    }

    setClaiming(true)
    setMessage('')

    try {
      const response = await fetch('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: walletAddress }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to claim faucet')
      }

      setMessage(`USDC faucet sent: ${data.txHash}`)
      refreshBalances(walletAddress).catch(() => {})
    } catch (error: any) {
      setMessage(error.message || 'Failed to claim faucet')
    } finally {
      setClaiming(false)
    }
  }, [refreshBalances, walletAddress])

  const onDeposit = useCallback(async () => {
    if (!walletAddress || !selectedToken?.address || !vaultAddress) {
      setMessage('Missing wallet or vault configuration')
      return
    }

    setDepositing(true)
    setMessage('')

    try {
      const walletClient = await getWalletClient()

      const approveHash = await walletClient.writeContract({
        account: walletAddress,
        address: selectedToken.address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [vaultAddress, selectedToken.amount],
      })

      await publicClient.waitForTransactionReceipt({ hash: approveHash })

      const depositHash = await walletClient.writeContract({
        account: walletAddress,
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'deposit',
        args: [selectedToken.address, selectedToken.amount],
      })

      await publicClient.waitForTransactionReceipt({ hash: depositHash })
      setMessage(`Deposit success: ${depositHash}`)
      await refreshBalances(walletAddress)
    } catch (error: any) {
      setMessage(error.shortMessage || error.message || 'Deposit failed')
    } finally {
      setDepositing(false)
    }
  }, [getWalletClient, refreshBalances, selectedToken, walletAddress])

  const onGaslessMint = useCallback(async () => {
    if (!walletAddress || !selectedToken?.address) {
      setMessage('Please connect wallet and choose USDC or BOX')
      return
    }

    setLoading(true)
    setTxHash('')
    setMessage('')

    try {
      const response = await fetch('/api/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: walletAddress,
          feeToken: selectedToken.address,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Relay failed')
      }

      setTxHash(data.txHash)
      setMessage(`Gasless mint sent: ${data.txHash}`)
      await refreshBalances(walletAddress)
    } catch (error: any) {
      setMessage(error.message || 'Gasless mint failed')
    } finally {
      setLoading(false)
    }
  }, [refreshBalances, selectedToken, walletAddress])

  return (
    <div className={styles.container}>
      <Head>
        <title>Uniswap Widgets</title>
        <meta name="description" content="Uniswap Widgets" />
        <link rel="icon" href="https://app.uniswap.org/favicon.png" />
      </Head>

      <div className={styles.i18n}>
        <label style={{ display: 'flex' }}>
          <FiGlobe />
        </label>
        <select onChange={onSelectLocale}>
          {SUPPORTED_LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {locale}
            </option>
          ))}
        </select>
      </div>

      <main className={styles.main}>
        <h1 className={styles.title}>Uniswap Swap Widget</h1>

        <div className={styles.demo}>
          <div className={styles.connectors} ref={connectors} tabIndex={-1}>
            <Web3Connectors />
          </div>

          <div className={omniGasStyles.widgetColumn}>
            <div className={omniGasStyles.card}>
              <div className={omniGasStyles.cardTitle}>Gas 支付方式</div>
              <div className={omniGasStyles.buttonRow}>
                {GAS_TOKENS.map((token) => (
                  <button
                    key={token}
                    type="button"
                    className={[
                      omniGasStyles.tokenButton,
                      gasToken === token ? omniGasStyles.tokenButtonActive : '',
                    ].join(' ')}
                    onClick={() => setGasToken(token)}
                  >
                    {token}
                  </button>
                ))}
              </div>
              {gasToken !== 'ETH' ? (
                <>
                  <p className={omniGasStyles.helperText}>您无需持有 ETH，Gas 费将由 OmniGas 预付池代扣</p>
                  <div className={omniGasStyles.balancePanel}>
                    <div className={omniGasStyles.balanceRow}>
                      <span>Vault USDC</span>
                      <strong>{balances.usdcBalance}</strong>
                    </div>
                    <div className={omniGasStyles.balanceRow}>
                      <span>Vault BOX</span>
                      <strong>{balances.boxBalance}</strong>
                    </div>
                    <div className={omniGasStyles.balanceRow}>
                      <span>NFT Count</span>
                      <strong>{balances.nftCount}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={omniGasStyles.secondaryButton}
                    onClick={onClaimUsdc}
                    disabled={claiming || !walletAddress}
                  >
                    {claiming ? '领取中...' : '领取测试 USDC'}
                  </button>
                  <button
                    type="button"
                    className={omniGasStyles.secondaryButton}
                    onClick={onDeposit}
                    disabled={depositing || !walletAddress || !selectedToken}
                  >
                    {depositing ? '充值中...' : `充值 ${selectedToken?.label || ''}`}
                  </button>
                  <button
                    type="button"
                    className={omniGasStyles.actionButton}
                    onClick={onGaslessMint}
                    disabled={loading || !walletAddress || !selectedToken}
                  >
                    {loading ? 'Gasless Mint 中...' : 'Gasless Mint'}
                  </button>
                  {message ? <p className={omniGasStyles.statusText}>{message}</p> : null}
                  {txHash ? (
                    <a
                      className={omniGasStyles.successLink}
                      href={`${BASESCAN_TX_URL}${txHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      交易成功：https://sepolia.basescan.org/tx/{txHash}
                    </a>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className={styles.widget}>
              <SwapWidget
                jsonRpcEndpoint={JSON_RPC_URL}
                tokenList={TOKEN_LIST}
                provider={provider}
                locale={locale}
                onConnectWallet={focusConnectors}
                defaultInputTokenAddress="NATIVE"
                defaultInputAmount="1"
                defaultOutputTokenAddress={UNI}
              />
            </div>
          </div>
        </div>

        <hr className={styles.rule} />

        <DocumentationCards />
      </main>
    </div>
  )
}

export default Home
