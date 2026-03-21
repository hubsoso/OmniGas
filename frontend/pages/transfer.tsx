import type { NextPage } from 'next'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useWeb3React } from '@web3-react/core'
import { createPublicClient, createWalletClient, custom, erc20Abi, formatUnits, getAddress, isAddress, parseUnits } from 'viem'
import { sepolia } from 'viem/chains'
import { useCallback, useEffect, useState } from 'react'
import { connectors } from '../connectors'
import { createFallbackTransport, SEPOLIA_RPC_URLS } from '../lib/rpc'
import { useThemeMode } from '../lib/theme'
import styles from '../styles/Transfer.module.css'

const TOKENS_BY_NETWORK = {
  Sepolia: [
    { id: 'USDC', label: 'USDC', caption: 'USD Coin', icon: 'U', decimals: 6 },
    { id: 'BOX', label: 'BOX', caption: 'BOX Token', icon: 'B', decimals: 18 },
    { id: 'ETH', label: 'ETH', caption: 'Ether', icon: 'E', decimals: 18 },
  ],
} as const

const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` | undefined
const BOX_ADDRESS = process.env.NEXT_PUBLIC_BOX_ADDRESS as `0x${string}` | undefined
const ZERO_BALANCE = '--'
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 11155111)
const EXPLORER_TX = 'https://sepolia.etherscan.io/tx/'

const publicClient = createPublicClient({
  chain: sepolia,
  transport: createFallbackTransport(SEPOLIA_RPC_URLS),
})

function formatTokenBalance(value: bigint, decimals: number) {
  const formatted = formatUnits(value, decimals)
  const [integer, fraction = ''] = formatted.split('.')
  const trimmedFraction = fraction.slice(0, 4).replace(/0+$/, '')
  return trimmedFraction ? `${integer}.${trimmedFraction}` : integer
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

declare global {
  interface Window {
    ethereum?: any
  }
}

const TransferPage: NextPage = () => {
  const router = useRouter()
  const { account } = useWeb3React()
  const { isLight } = useThemeMode()
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [network] = useState('Sepolia')
  const [token, setToken] = useState('USDC')
  const [showTokenMenu, setShowTokenMenu] = useState(false)
  const [submitMessage, setSubmitMessage] = useState('')
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'error' | 'success' | 'pending'>('idle')
  const [txHash, setTxHash] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [tokenBalanceValues, setTokenBalanceValues] = useState<Record<string, bigint>>({
    USDC: 0n,
    BOX: 0n,
    ETH: 0n,
  })
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>({
    USDC: ZERO_BALANCE,
    BOX: ZERO_BALANCE,
    ETH: ZERO_BALANCE,
  })

  const connectWallet = useCallback(async () => {
    const [connector] = connectors[0]
    await connector.activate()
  }, [])

  const availableTokens = TOKENS_BY_NETWORK[network as keyof typeof TOKENS_BY_NETWORK] ?? TOKENS_BY_NETWORK.Sepolia
  const selectedToken = availableTokens.find((item) => item.label === token) ?? availableTokens[0]
  const selectedTokenBalance = tokenBalances[token] ?? ZERO_BALANCE
  const selectedTokenBalanceValue = tokenBalanceValues[token] ?? 0n
  const parsedAmountValue = (() => {
    try {
      return amount.trim() ? parseUnits(amount.trim(), selectedToken.decimals) : 0n
    } catch {
      return null
    }
  })()
  const insufficientBalance = parsedAmountValue !== null && parsedAmountValue > selectedTokenBalanceValue

  const refreshBalances = useCallback(async (walletAccount?: string) => {
    const activeAccount = walletAccount || account
    if (!activeAccount) {
      setTokenBalanceValues({ USDC: 0n, BOX: 0n, ETH: 0n })
      setTokenBalances({ USDC: ZERO_BALANCE, BOX: ZERO_BALANCE, ETH: ZERO_BALANCE })
      return
    }

    const wallet = getAddress(activeAccount)
    const [ethBalance, usdcBalance, boxBalance] = await Promise.all([
      publicClient.getBalance({ address: wallet }),
      USDC_ADDRESS
        ? publicClient.readContract({
            address: USDC_ADDRESS,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [wallet],
          })
        : Promise.resolve(0n),
      BOX_ADDRESS
        ? publicClient.readContract({
            address: BOX_ADDRESS,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [wallet],
          })
        : Promise.resolve(0n),
    ])

    setTokenBalances({
      USDC: formatTokenBalance(usdcBalance, 6),
      BOX: formatTokenBalance(boxBalance, 18),
      ETH: formatTokenBalance(ethBalance, 18),
    })
    setTokenBalanceValues({
      USDC: usdcBalance,
      BOX: boxBalance,
      ETH: ethBalance,
    })
  }, [account])

  const getWalletClient = useCallback(async () => {
    if (!window.ethereum) throw new Error('请先安装 MetaMask')
    const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' })
    if (Number(chainIdHex) !== CHAIN_ID) throw new Error(`请切换到 Sepolia (${CHAIN_ID})`)
    return createWalletClient({
      chain: sepolia,
      transport: custom(window.ethereum),
    })
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!account) {
      setTxHash('')
      setSubmitMessage('请先连接钱包')
      setSubmitStatus('error')
      return
    }

    const to = recipient.trim()
    if (!to) {
      setTxHash('')
      setSubmitMessage('请输入接收地址')
      setSubmitStatus('error')
      return
    }

    if (!isAddress(to)) {
      setTxHash('')
      setSubmitMessage('接收地址格式不正确')
      setSubmitStatus('error')
      return
    }

    const rawAmount = amount.trim()
    if (!rawAmount) {
      setTxHash('')
      setSubmitMessage('请输入转账数量')
      setSubmitStatus('error')
      return
    }

    let transferAmount: bigint
    try {
      transferAmount = parseUnits(rawAmount, selectedToken.decimals)
    } catch {
      setTxHash('')
      setSubmitMessage('转账数量格式不正确')
      setSubmitStatus('error')
      return
    }

    if (transferAmount <= 0n) {
      setTxHash('')
      setSubmitMessage('转账数量必须大于 0')
      setSubmitStatus('error')
      return
    }

    if (transferAmount > selectedTokenBalanceValue) {
      setTxHash('')
      setSubmitMessage('余额不足')
      setSubmitStatus('error')
      return
    }

    try {
      setSubmitting(true)
      setTxHash('')
      setSubmitMessage('正在发起转账…')
      setSubmitStatus('pending')
      const walletClient = await getWalletClient()
      const sender = getAddress(account)

      let hash: `0x${string}`
      if (token === 'ETH') {
        hash = await walletClient.sendTransaction({
          account: sender,
          to: getAddress(to),
          value: transferAmount,
        })
      } else {
        const tokenAddress = token === 'USDC' ? USDC_ADDRESS : BOX_ADDRESS
        if (!tokenAddress) throw new Error(`${token} 合约地址未配置`)
        hash = await walletClient.writeContract({
          account: sender,
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [getAddress(to), transferAmount],
        })
      }

      setSubmitMessage('交易已提交，等待链上确认…')
      setSubmitStatus('pending')
      await publicClient.waitForTransactionReceipt({ hash })
      await refreshBalances(sender)
      setAmount('')
      setTxHash(hash)
      setSubmitMessage(`${token} 转账成功`)
      setSubmitStatus('success')
    } catch (error: any) {
      setTxHash('')
      setSubmitMessage(error?.shortMessage || error?.message || '转账失败')
      setSubmitStatus('error')
    } finally {
      setSubmitting(false)
    }
  }, [account, amount, getWalletClient, recipient, refreshBalances, selectedToken.decimals, selectedTokenBalanceValue, token])

  useEffect(() => {
    let cancelled = false

    async function loadBalances() {
      if (!account) {
        if (!cancelled) {
          setTokenBalances({ USDC: ZERO_BALANCE, BOX: ZERO_BALANCE, ETH: ZERO_BALANCE })
        }
        return
      }

      try {
        if (!cancelled) {
          await refreshBalances(account)
        }
      } catch {
        if (!cancelled) {
          setTokenBalanceValues({ USDC: 0n, BOX: 0n, ETH: 0n })
          setTokenBalances({ USDC: ZERO_BALANCE, BOX: ZERO_BALANCE, ETH: ZERO_BALANCE })
        }
      }
    }

    loadBalances()
    const timer = window.setInterval(loadBalances, 15000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [account, refreshBalances])

  return (
    <>
      <Head>
        <title>转账 · OmniGas</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className={[styles.page, isLight ? styles.light : styles.dark].join(' ')}>
        <div className={styles.shell}>
          <header className={styles.topbar}>
            <button
              type="button"
              className={styles.iconButton}
              aria-label="返回"
              onClick={() => {
                if (window.history.length > 1) router.back()
                else router.push('/')
              }}
            >
              <span className={styles.backArrow}>‹</span>
            </button>

            <div className={styles.titleBlock}>
              <span className={styles.title}>转账</span>
            </div>

            {account ? (
              <button type="button" className={styles.walletBadge}>
                {shortAddress(account)}
              </button>
            ) : (
              <button type="button" className={styles.walletBadge} onClick={connectWallet}>
                连接钱包
              </button>
            )}
          </header>

          <section className={styles.content}>
            <div className={styles.card}>
              <label className={styles.section}>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>接收地址</span>
                </div>
                <textarea
                  className={styles.addressInput}
                  rows={3}
                  placeholder="请输入接收地址…"
                  name="recipient"
                  autoComplete="off"
                  value={recipient}
                  onChange={(event) => {
                    setRecipient(event.target.value)
                    if (submitMessage) {
                      setSubmitMessage('')
                      setSubmitStatus('idle')
                    }
                    if (txHash) setTxHash('')
                  }}
                />
              </label>

              <div className={styles.divider} />

              <div className={styles.sectionButton} role="group" aria-label="转账代币与网络">
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>转账代币与网络</span>
                </div>
                <div className={styles.assetRow}>
                  <div className={styles.assetLeft}>
                    <div
                      className={[
                        styles.tokenBadge,
                        token === 'USDC' ? styles.tokenBadgeUsdc : '',
                        token === 'BOX' ? styles.tokenBadgeBox : '',
                        token === 'ETH' ? styles.tokenBadgeEth : '',
                      ].join(' ')}
                    >
                      {selectedToken.icon}
                    </div>
                    <div>
                      <div className={styles.tokenName}>{token}</div>
                    </div>
                  </div>
                  <div className={styles.assetRight}>
                    <button
                      type="button"
                      className={styles.networkChipButton}
                      onClick={() => setShowTokenMenu(true)}
                      aria-label={`选择 ${network} 链上的代币`}
                    >
                      <span className={styles.networkChip}>{network}</span>
                      <span className={styles.chevron}>›</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.divider} />

              <section className={styles.section}>
                <div className={styles.amountHeader}>
                  <span className={styles.sectionTitle}>转账数量</span>
                  <span className={styles.balanceText}>余额: {selectedTokenBalance}</span>
                </div>

                <div className={styles.amountRow}>
                  <input
                    className={styles.amountInput}
                    name="amount"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00…"
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value)
                      if (submitMessage) {
                        setSubmitMessage('')
                        setSubmitStatus('idle')
                      }
                      if (txHash) setTxHash('')
                    }}
                  />
                  <button
                    type="button"
                    className={styles.maxButton}
                    onClick={() => {
                      setAmount(selectedTokenBalance === ZERO_BALANCE ? '0.00' : selectedTokenBalance)
                      if (submitMessage) {
                        setSubmitMessage('')
                        setSubmitStatus('idle')
                      }
                      if (txHash) setTxHash('')
                    }}
                  >
                    全部
                  </button>
                </div>
              </section>
            </div>

          </section>

          <footer className={styles.footer}>
            {submitMessage || insufficientBalance ? (
              <p
                className={[
                  styles.submitMessage,
                  submitStatus === 'error' || insufficientBalance ? styles.submitMessageError : '',
                  submitStatus === 'success' ? styles.submitMessageSuccess : '',
                ].join(' ')}
                aria-live="polite"
              >
                {insufficientBalance ? '余额不足' : submitMessage}
              </p>
            ) : null}
            {txHash ? (
              <a
                className={styles.txLink}
                href={`${EXPLORER_TX}${txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                查看交易 {shortAddress(txHash)}
              </a>
            ) : null}
            <button
              type="button"
              className={styles.submitButton}
              onClick={handleSubmit}
              disabled={submitting || insufficientBalance}
            >
              {submitting ? '处理中…' : '转账'}
            </button>
          </footer>

          {showTokenMenu ? (
            <div
              className={styles.overlay}
              onClick={() => setShowTokenMenu(false)}
              aria-hidden="true"
            >
              <div
                className={styles.sheet}
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="选择代币"
              >
                <div className={styles.sheetHandle} />
                <div className={styles.sheetHeader}>
                  <div>
                    <h2 className={styles.sheetTitle}>选择代币</h2>
                    <p className={styles.sheetSubtitle}>{network} Testnet</p>
                  </div>
                  <button
                    type="button"
                    className={styles.sheetClose}
                    onClick={() => setShowTokenMenu(false)}
                    aria-label="关闭代币选择"
                  >
                    ✕
                  </button>
                </div>

                <div className={styles.networkList}>
                  {availableTokens.map((option) => {
                    const isActive = option.label === token
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={[styles.networkOption, isActive ? styles.networkOptionActive : ''].join(' ')}
                        onClick={() => {
                          setToken(option.label)
                          setShowTokenMenu(false)
                        }}
                      >
                        <div className={styles.networkOptionLeft}>
                          <div
                            className={[
                              styles.networkOptionIcon,
                              option.label === 'USDC' ? styles.networkOptionIconUsdc : '',
                              option.label === 'BOX' ? styles.networkOptionIconBox : '',
                              option.label === 'ETH' ? styles.networkOptionIconEth : '',
                            ].join(' ')}
                          >
                            {option.icon}
                          </div>
                          <div>
                            <div className={styles.networkOptionName}>{option.label}</div>
                            <div className={styles.networkOptionMeta}>{option.caption}</div>
                          </div>
                        </div>
                        <div className={styles.networkOptionRight}>
                          <div className={styles.networkOptionAmount}>
                            <span className={styles.networkOptionAmountValue}>
                              {tokenBalances[option.label] ?? ZERO_BALANCE}
                            </span>
                            <span className={styles.networkOptionAmountSymbol}>{option.label}</span>
                          </div>
                          <span className={styles.networkOptionBadge}>{network}</span>
                          <span className={styles.networkOptionCheck}>{isActive ? '●' : '○'}</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </>
  )
}

export default TransferPage
