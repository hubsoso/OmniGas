import type { NextPage } from 'next'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useWeb3React } from '@web3-react/core'
import { createPublicClient, createWalletClient, custom, erc20Abi, formatUnits, getAddress, isAddress, parseUnits } from 'viem'
import { sepolia, baseSepolia } from 'viem/chains'
import { useCallback, useEffect, useState } from 'react'
import { connectors } from '../connectors'
import { createFallbackTransport, SEPOLIA_RPC_URLS, BASE_SEPOLIA_RPC_URLS } from '../lib/rpc'
import { pickSelectedAccount } from '../lib/selectedAccount'
import { useThemeMode } from '../lib/theme'
import styles from '../styles/Transfer.module.css'

const TOKENS_BY_NETWORK = {
  Sepolia: [
    { id: 'USDC', label: 'USDC', caption: 'USD Coin', icon: 'U', decimals: 6 },
    { id: 'BOX', label: 'BOX', caption: 'BOX Token', icon: 'B', decimals: 18 },
    { id: 'ETH', label: 'ETH', caption: 'Ether', icon: 'E', decimals: 18 },
  ],
} as const

const CHAINS = {
  'sepolia': { name: 'Sepolia', chainId: 11155111 },
  'base-sepolia': { name: 'Base Sepolia', chainId: 84532 },
} as const

const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` | undefined
const BOX_ADDRESS = process.env.NEXT_PUBLIC_BOX_ADDRESS as `0x${string}` | undefined
const TRANSFER_EXECUTOR_ADDRESS = process.env.NEXT_PUBLIC_TRANSFER_EXECUTOR_ADDRESS as
  | `0x${string}`
  | undefined
const BASE_TRANSFER_EXECUTOR_ADDRESS = process.env.NEXT_PUBLIC_BASE_TRANSFER_EXECUTOR_ADDRESS as
  | `0x${string}`
  | undefined
const GASLESS_TRANSFER_FEES = {
  USDC: BigInt(100_000), // 0.1 USDC (6 decimals)
  BOX: BigInt(1e17), // 0.1 BOX (18 decimals)
}
const ZERO_BALANCE = '--'
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 11155111)
const EXPLORER_TX = {
  'sepolia': 'https://sepolia.etherscan.io/tx/',
  'base-sepolia': 'https://sepolia.basescan.org/tx/',
} as const

const sepoliaPublic = createPublicClient({
  chain: sepolia,
  transport: createFallbackTransport(SEPOLIA_RPC_URLS),
})

const baseSepoliaPublic = createPublicClient({
  chain: baseSepolia,
  transport: createFallbackTransport(BASE_SEPOLIA_RPC_URLS),
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

type TransferMode = 'auto' | 'user' | 'gasless'
type ChainKey = keyof typeof CHAINS

const TransferPage: NextPage = () => {
  const router = useRouter()
  const { account, accounts } = useWeb3React()
  const { isLight } = useThemeMode()
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [chainKey, setChainKey] = useState<ChainKey>('sepolia')
  const [token, setToken] = useState('USDC')
  const [showTokenMenu, setShowTokenMenu] = useState(false)
  const [showChainMenu, setShowChainMenu] = useState(false)
  const [submitMessage, setSubmitMessage] = useState('')
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'error' | 'success' | 'pending'>('idle')
  const [txHash, setTxHash] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [manualMode, setManualMode] = useState<TransferMode>('auto')

  // 钱包余额（用于用户资金模式）
  const [walletBalanceValues, setWalletBalanceValues] = useState<Record<string, bigint>>({
    USDC: 0n,
    BOX: 0n,
    ETH: 0n,
  })
  const [walletBalances, setWalletBalances] = useState<Record<string, string>>({
    USDC: ZERO_BALANCE,
    BOX: ZERO_BALANCE,
    ETH: ZERO_BALANCE,
  })

  // Vault 余额（用于 gasless 模式）
  const [vaultBalanceValues, setVaultBalanceValues] = useState<Record<string, bigint>>({
    USDC: 0n,
    BOX: 0n,
  })
  const [vaultBalances, setVaultBalances] = useState<Record<string, string>>({
    USDC: ZERO_BALANCE,
    BOX: ZERO_BALANCE,
  })
  const [vaultPayer, setVaultPayer] = useState<string>('')

  const activeAccount = pickSelectedAccount(accounts ?? (account ? [account] : []), account || '')
  const chainInfo = CHAINS[chainKey]
  const availableTokens = TOKENS_BY_NETWORK.Sepolia // 所有链都支持相同的 token
  const selectedToken = availableTokens.find((item) => item.label === token) ?? availableTokens[0]

  // 根据模式选择余额显示
  const selectedWalletBalance = walletBalances[token] ?? ZERO_BALANCE
  const selectedWalletBalanceValue = walletBalanceValues[token] ?? 0n
  const selectedVaultBalance = vaultBalances[token] ?? ZERO_BALANCE
  const selectedVaultBalanceValue = vaultBalanceValues[token] ?? 0n

  const parsedAmountValue = (() => {
    try {
      return amount.trim() ? parseUnits(amount.trim(), selectedToken.decimals) : 0n
    } catch {
      return null
    }
  })()

  // 智能决策逻辑
  const gasFeeValue = GASLESS_TRANSFER_FEES[token as keyof typeof GASLESS_TRANSFER_FEES] || 0n
  const canUseUserFunds = selectedWalletBalanceValue > 0n && token !== 'ETH' // ETH 需要检查 gas 费用
  const canUseGasless = selectedVaultBalanceValue >= (parsedAmountValue !== null ? parsedAmountValue + gasFeeValue : 0n)

  // 确定实际使用的模式
  const effectiveMode: TransferMode = manualMode === 'auto'
    ? (canUseUserFunds ? 'user' : canUseGasless ? 'gasless' : 'auto')
    : manualMode

  const insufficientBalance = parsedAmountValue !== null && (
    (effectiveMode === 'user' && parsedAmountValue > selectedWalletBalanceValue) ||
    (effectiveMode === 'gasless' && (parsedAmountValue + gasFeeValue) > selectedVaultBalanceValue) ||
    (effectiveMode === 'auto' && !canUseUserFunds && !canUseGasless)
  )

  const connectWallet = useCallback(async () => {
    const [connector] = connectors[0]
    await connector.activate()
  }, [])

  // 刷新钱包和 vault 余额
  const refreshBalances = useCallback(async (walletAccount?: string) => {
    const nextAccount = walletAccount || activeAccount
    if (!nextAccount) {
      setWalletBalanceValues({ USDC: 0n, BOX: 0n, ETH: 0n })
      setWalletBalances({ USDC: ZERO_BALANCE, BOX: ZERO_BALANCE, ETH: ZERO_BALANCE })
      setVaultBalanceValues({ USDC: 0n, BOX: 0n })
      setVaultBalances({ USDC: ZERO_BALANCE, BOX: ZERO_BALANCE })
      return
    }

    const wallet = getAddress(nextAccount)
    const publicClient = chainKey === 'sepolia' ? sepoliaPublic : baseSepoliaPublic

    try {
      // 1. 获取钱包中的 token 余额
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

      setWalletBalances({
        USDC: formatTokenBalance(usdcBalance, 6),
        BOX: formatTokenBalance(boxBalance, 18),
        ETH: formatTokenBalance(ethBalance, 18),
      })
      setWalletBalanceValues({
        USDC: usdcBalance,
        BOX: boxBalance,
        ETH: ethBalance,
      })

      // 2. 获取 vault 余额（仅 Sepolia）
      if (chainKey === 'sepolia') {
        try {
          const response = await fetch(`/api/balance?address=${wallet}`)
          const data = await response.json()
          if (response.ok) {
            setVaultBalances({
              USDC: data.usdcBalance || ZERO_BALANCE,
              BOX: data.boxBalance || ZERO_BALANCE,
            })
            setVaultBalanceValues({
              USDC: BigInt(Math.floor(parseFloat(data.usdcBalance || '0') * 1e6)),
              BOX: BigInt(Math.floor(parseFloat(data.boxBalance || '0') * 1e18)),
            })
            setVaultPayer(data.effectivePayer || '')
          }
        } catch {
          setVaultBalances({ USDC: ZERO_BALANCE, BOX: ZERO_BALANCE })
          setVaultBalanceValues({ USDC: 0n, BOX: 0n })
        }
      }
    } catch {
      setWalletBalanceValues({ USDC: 0n, BOX: 0n, ETH: 0n })
      setWalletBalances({ USDC: ZERO_BALANCE, BOX: ZERO_BALANCE, ETH: ZERO_BALANCE })
    }
  }, [activeAccount, chainKey])

  const getWalletClient = useCallback(async () => {
    if (!window.ethereum) throw new Error('请先安装 MetaMask')
    const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' })
    const expectedChainId = chainKey === 'sepolia' ? CHAIN_ID : 84532
    if (Number(chainIdHex) !== expectedChainId) throw new Error(`请切换到 ${CHAINS[chainKey].name} (${expectedChainId})`)
    return createWalletClient({
      chain: chainKey === 'sepolia' ? sepolia : baseSepolia,
      transport: custom(window.ethereum),
    })
  }, [chainKey])

  const handleSubmit = useCallback(async () => {
    if (!activeAccount) {
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

    // 检查选中的模式是否可行
    if (effectiveMode === 'user' && transferAmount > selectedWalletBalanceValue) {
      setTxHash('')
      setSubmitMessage('钱包余额不足')
      setSubmitStatus('error')
      return
    }

    if (effectiveMode === 'gasless' && (transferAmount + gasFeeValue) > selectedVaultBalanceValue) {
      setTxHash('')
      setSubmitMessage('OmniGas 额度不足')
      setSubmitStatus('error')
      return
    }

    if (effectiveMode === 'auto') {
      setTxHash('')
      setSubmitMessage('余额不足')
      setSubmitStatus('error')
      return
    }

    if (effectiveMode === 'gasless' && token === 'ETH') {
      setTxHash('')
      setSubmitMessage('OmniGas 仅支持 USDC 和 BOX')
      setSubmitStatus('error')
      return
    }

    try {
      setSubmitting(true)
      setTxHash('')
      const sender = getAddress(activeAccount)

      let hash: `0x${string}`

      if (effectiveMode === 'gasless') {
        // ─── Gasless Transfer (仅支持 Sepolia) ─────────────────────
        if (chainKey !== 'sepolia') {
          throw new Error('Gasless transfer 仅支持 Sepolia')
        }

        const tokenAddress = token === 'USDC' ? USDC_ADDRESS : BOX_ADDRESS
        if (!tokenAddress) throw new Error(`${token} 合约地址未配置`)
        if (!TRANSFER_EXECUTOR_ADDRESS) throw new Error('Transfer executor 地址未配置')

        setSubmitMessage('正在通过 OmniGas 中继执行…')
        setSubmitStatus('pending')

        const response = await fetch('/api/relay-transfer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: sender,
            recipient: getAddress(to),
            token: tokenAddress,
            amount: transferAmount.toString(),
            feeToken: tokenAddress,
          }),
        })

        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error || 'Relay transfer failed')
        }

        hash = data.txHash

        setSubmitMessage('链上确认中…')
        if (data.blockNumber) {
          await sepoliaPublic.waitForTransactionReceipt({ hash })
        }
      } else {
        // ─── User-Funded Transfer (MetaMask) ───────────────────────
        setSubmitMessage('正在发起转账…')
        setSubmitStatus('pending')
        const walletClient = await getWalletClient()

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
        const publicClient = chainKey === 'sepolia' ? sepoliaPublic : baseSepoliaPublic
        await publicClient.waitForTransactionReceipt({ hash })
      }

      // ─── Update State ──────────────────────────────────────────
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
  }, [activeAccount, amount, chainKey, effectiveMode, gasFeeValue, getWalletClient, recipient, refreshBalances, selectedToken.decimals, selectedVaultBalanceValue, selectedWalletBalanceValue, token])

  useEffect(() => {
    let cancelled = false

    async function loadBalances() {
      if (!activeAccount) {
        if (!cancelled) {
          setWalletBalanceValues({ USDC: 0n, BOX: 0n, ETH: 0n })
          setWalletBalances({ USDC: ZERO_BALANCE, BOX: ZERO_BALANCE, ETH: ZERO_BALANCE })
          setVaultBalanceValues({ USDC: 0n, BOX: 0n })
          setVaultBalances({ USDC: ZERO_BALANCE, BOX: ZERO_BALANCE })
        }
        return
      }

      try {
        if (!cancelled) {
          await refreshBalances(activeAccount)
        }
      } catch {
        if (!cancelled) {
          setWalletBalanceValues({ USDC: 0n, BOX: 0n, ETH: 0n })
          setWalletBalances({ USDC: ZERO_BALANCE, BOX: ZERO_BALANCE, ETH: ZERO_BALANCE })
          setVaultBalanceValues({ USDC: 0n, BOX: 0n })
          setVaultBalances({ USDC: ZERO_BALANCE, BOX: ZERO_BALANCE })
        }
      }
    }

    loadBalances()
    const timer = window.setInterval(loadBalances, 15000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeAccount, refreshBalances])

  const modeInfo = {
    auto: {
      label: '系统自动选择',
      description: canUseUserFunds
        ? '✓ 你的钱包有余额'
        : canUseGasless
          ? '✓ 使用 OmniGas 代付'
          : '✗ 余额不足',
    },
    user: {
      label: '用户资金转账',
      description: `你的钱包: ${selectedWalletBalance} ${token}`,
    },
    gasless: {
      label: 'OmniGas 代付',
      description: `OmniGas 额度: ${selectedVaultBalance} ${token}${vaultPayer && vaultPayer !== activeAccount ? ` (由 ${shortAddress(vaultPayer)} 支付)` : ''}`,
    },
  }

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

            {activeAccount ? (
              <button type="button" className={styles.walletBadge}>
                {shortAddress(activeAccount)}
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

              <div className={styles.sectionButton} role="group" aria-label="选择链">
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>测试链</span>
                </div>
                <div className={styles.assetRow}>
                  <div className={styles.assetLeft}>
                    <div className={styles.chainIcon}>⛓️</div>
                    <div>
                      <div className={styles.chainName}>{chainInfo.name}</div>
                    </div>
                  </div>
                  <div className={styles.assetRight}>
                    <button
                      type="button"
                      className={styles.networkChipButton}
                      onClick={() => setShowChainMenu(true)}
                      aria-label="选择测试链"
                    >
                      <span className={styles.networkChip}>切换</span>
                      <span className={styles.chevron}>›</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.divider} />

              <div className={styles.sectionButton} role="group" aria-label="转账代币与网络">
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>转账代币</span>
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
                      aria-label="选择代币"
                    >
                      <span className={styles.networkChip}>{chainInfo.name}</span>
                      <span className={styles.chevron}>›</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.divider} />

              <section className={styles.section}>
                <div className={styles.amountHeader}>
                  <span className={styles.sectionTitle}>转账数量</span>
                  <div className={styles.balanceColumn}>
                    {chainKey === 'sepolia' && selectedVaultBalance !== ZERO_BALANCE && (
                      <span className={styles.vaultBalanceText}>OmniGas额度: {selectedVaultBalance}</span>
                    )}
                    <span className={styles.walletBalanceText}>钱包: {selectedWalletBalance}</span>
                  </div>
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
                      const maxBalance = effectiveMode === 'gasless'
                        ? selectedVaultBalance === ZERO_BALANCE ? '0' : formatTokenBalance(selectedVaultBalanceValue - gasFeeValue, selectedToken.decimals)
                        : selectedWalletBalance === ZERO_BALANCE ? '0' : selectedWalletBalance
                      setAmount(maxBalance)
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

              <div className={styles.divider} />

              <div className={styles.modeSelector}>
                <div className={styles.modeHeader}>
                  <span className={styles.modeTitle}>转账方式</span>
                  <button
                    type="button"
                    className={styles.advancedToggle}
                    onClick={() => setShowAdvanced(!showAdvanced)}
                  >
                    {showAdvanced ? '收起' : '高级'} ▼
                  </button>
                </div>

                <div className={styles.modeInfo}>
                  <div className={styles.modeLabel}>{modeInfo[effectiveMode].label}</div>
                  <div className={styles.modeDescription}>{modeInfo[effectiveMode].description}</div>
                </div>

                {showAdvanced && (
                  <div className={styles.advancedOptions}>
                    {(['auto', 'user', 'gasless'] as const).map((mode) => {
                      const canUse =
                        mode === 'auto' ? canUseUserFunds || canUseGasless :
                        mode === 'user' ? canUseUserFunds :
                        mode === 'gasless' ? canUseGasless :
                        false

                      return (
                        <label key={mode} className={[styles.modeOption, !canUse ? styles.modeOptionDisabled : ''].join(' ')}>
                          <input
                            type="radio"
                            name="transferMode"
                            value={mode}
                            checked={manualMode === mode}
                            onChange={() => setManualMode(mode)}
                            disabled={!canUse}
                          />
                          <span className={styles.modeOptionLabel}>
                            {modeInfo[mode].label}
                            <span className={styles.modeOptionDesc}>{modeInfo[mode].description}</span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
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
                href={`${EXPLORER_TX[chainKey]}${txHash}`}
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

          {showChainMenu ? (
            <div
              className={styles.overlay}
              onClick={() => setShowChainMenu(false)}
              aria-hidden="true"
            >
              <div
                className={styles.sheet}
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="选择测试链"
              >
                <div className={styles.sheetHandle} />
                <div className={styles.sheetHeader}>
                  <div>
                    <h2 className={styles.sheetTitle}>选择测试链</h2>
                    <p className={styles.sheetSubtitle}>切换链查看不同的代币和余额</p>
                  </div>
                  <button
                    type="button"
                    className={styles.sheetClose}
                    onClick={() => setShowChainMenu(false)}
                    aria-label="关闭链选择"
                  >
                    ✕
                  </button>
                </div>

                <div className={styles.chainList}>
                  <div className={styles.chainSection}>
                    {(Object.entries(CHAINS) as Array<[ChainKey, typeof CHAINS[ChainKey]]>).map(([key, chain], index) => {
                      const isActive = chainKey === key
                      return (
                        <div key={key}>
                          <button
                            type="button"
                            className={[styles.chainOption, isActive ? styles.chainOptionActive : ''].join(' ')}
                            onClick={() => {
                              setChainKey(key)
                            }}
                          >
                            <div className={styles.chainOptionLeft}>
                              <div className={styles.chainOptionIcon}>⛓️</div>
                              <div>
                                <div className={styles.chainOptionName}>{chain.name}</div>
                                <div className={styles.chainOptionMeta}>Chain ID: {chain.chainId}</div>
                              </div>
                            </div>
                            <span className={styles.chainOptionCheck}>{isActive ? '✓' : ''}</span>
                          </button>

                          {index === 0 && <div className={styles.chainDivider} />}

                          {isActive && (
                            <div className={styles.tokenListInChain}>
                              <div className={styles.tokenListTitle}>该链上的代币</div>
                              {availableTokens.map((option) => {
                                const isTokenActive = option.label === token
                                return (
                                  <button
                                    key={option.id}
                                    type="button"
                                    className={[styles.tokenItemInChain, isTokenActive ? styles.tokenItemInChainActive : ''].join(' ')}
                                    onClick={() => {
                                      setToken(option.label)
                                    }}
                                  >
                                    <div className={styles.tokenItemLeft}>
                                      <div
                                        className={[
                                          styles.tokenItemIcon,
                                          option.label === 'USDC' ? styles.tokenItemIconUsdc : '',
                                          option.label === 'BOX' ? styles.tokenItemIconBox : '',
                                          option.label === 'ETH' ? styles.tokenItemIconEth : '',
                                        ].join(' ')}
                                      >
                                        {option.icon}
                                      </div>
                                      <div>
                                        <div className={styles.tokenItemName}>{option.label}</div>
                                        <div className={styles.tokenItemCaption}>{option.caption}</div>
                                      </div>
                                    </div>
                                    <div className={styles.tokenItemRight}>
                                      <div className={styles.tokenItemBalance}>
                                        {walletBalances[option.label] ?? ZERO_BALANCE}
                                      </div>
                                      <span className={styles.tokenItemCheck}>{isTokenActive ? '●' : '○'}</span>
                                    </div>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className={styles.pickerFooter}>
                  <button
                    type="button"
                    className={styles.pickerCloseButton}
                    onClick={() => setShowChainMenu(false)}
                  >
                    完成
                  </button>
                </div>
              </div>
            </div>
          ) : null}

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
                    <p className={styles.sheetSubtitle}>{chainInfo.name}</p>
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
                              {walletBalances[option.label] ?? ZERO_BALANCE}
                            </span>
                            <span className={styles.networkOptionAmountSymbol}>{option.label}</span>
                          </div>
                          <span className={styles.networkOptionBadge}>{chainInfo.name}</span>
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

