import type { NextPage } from 'next'
import Head from 'next/head'
import { createPublicClient, createWalletClient, custom, parseAbi } from 'viem'
import { sepolia, mainnet } from 'viem/chains'
import { useCallback, useEffect, useState } from 'react'
import { useActiveProvider } from '../connectors'
import { createFallbackTransport, SEPOLIA_RPC_URLS } from '../lib/rpc'
import styles from '../styles/Wallet.module.css'

// ── 常量 ────────────────────────────────────────────
const AVATAR_COLORS = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6']

const GAS_TOKENS = ['ETH', 'USDC', 'BOX'] as const
type GasToken = (typeof GAS_TOKENS)[number]

const NETWORK_MODES = ['sepolia', 'mainnet'] as const
type NetworkMode = (typeof NETWORK_MODES)[number]

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 11155111)
const APP_CHAIN = sepolia
const EXPLORER_TX = 'https://sepolia.etherscan.io/tx/'
const API_TIMEOUT = 15_000

const ERC20_ABI = parseAbi(['function approve(address spender, uint256 amount) external returns (bool)'])
const VAULT_ABI = parseAbi(['function deposit(address token, uint256 amount) external'])
const VAULT_DELEGATE_ABI = parseAbi([
  'function authorize(address wallet) external',
  'function revoke(address wallet) external',
  'function detach() external',
  'function payerOf(address wallet) view returns (address)',
])

const tokenConfig = {
  USDC: {
    address: process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` | undefined,
    amount: 10_000_000n,
    label: '10 USDC',
  },
  BOX: {
    address: process.env.NEXT_PUBLIC_BOX_ADDRESS as `0x${string}` | undefined,
    amount: 10_000_000_000_000_000_000n,
    label: '10 BOX',
  },
} as const

const vaultAddress = process.env.NEXT_PUBLIC_VAULT_ADDRESS as `0x${string}` | undefined
const hasRelayConfig = Boolean(
  process.env.NEXT_PUBLIC_USDC_ADDRESS &&
    process.env.NEXT_PUBLIC_BOX_ADDRESS &&
    process.env.NEXT_PUBLIC_VAULT_ADDRESS &&
    process.env.NEXT_PUBLIC_NFT_ADDRESS &&
    process.env.NEXT_PUBLIC_EXECUTOR_ADDRESS
)

const publicClient = createPublicClient({
  chain: APP_CHAIN,
  transport: createFallbackTransport(SEPOLIA_RPC_URLS),
})

// ── 工具函数 ─────────────────────────────────────────
function getAvatarColor(address: string) {
  return AVATAR_COLORS[parseInt(address.slice(2, 4), 16) % AVATAR_COLORS.length]
}

function shortAddr(address: string) {
  return address.slice(0, 10)
}

async function fetchWithTimeout(input: RequestInfo, init?: RequestInit) {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), API_TIMEOUT)
  try {
    const res = await fetch(input, { ...init, signal: ctrl.signal })
    let data: any = null
    try { data = await res.json() } catch {}
    return { response: res, data }
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('请求超时')
    throw e
  } finally {
    window.clearTimeout(timer)
  }
}

declare global {
  interface Window { ethereum?: any }
}

type PendingAction = 'omnigas' | 'transfer' | 'swap' | ''

// ── 组件 ─────────────────────────────────────────────
const WalletHome: NextPage = () => {
  const provider = useActiveProvider()

  // 钱包账户
  const [accounts, setAccounts] = useState<string[]>([])
  const [current, setCurrent] = useState<string>('')
  const [showLogin, setShowLogin] = useState(false)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction>('')

  // 测试面板
  const [showTest, setShowTest] = useState(false)
  const [networkMode, setNetworkMode] = useState<NetworkMode>('sepolia')
  const [gasToken, setGasToken] = useState<GasToken>('USDC')
  const [balances, setBalances] = useState({ usdcBalance: '--', boxBalance: '--', nftCount: '--', effectivePayer: '' })
  const [claiming, setClaiming] = useState(false)
  const [depositing, setDepositing] = useState(false)
  const [minting, setMinting] = useState(false)
  const [msg, setMsg] = useState('')
  const [txHash, setTxHash] = useState('')

  // 委托管理
  const [myPayer, setMyPayer] = useState('')           // payerOf[me]，我绑定的 payer
  const [delegateInput, setDelegateInput] = useState('') // 授权/撤销输入框
  const [delegating, setDelegating] = useState(false)

  const isSepoliaMode = networkMode === 'sepolia'
  const selectedToken = gasToken === 'ETH' ? null : tokenConfig[gasToken]

  // ── 账户初始化 ───────────────────────────────────────
  useEffect(() => {
    if (!window.ethereum) return
    window.ethereum.request({ method: 'eth_accounts' }).then((accs: string[]) => {
      if (accs.length > 0) { setAccounts(accs); setCurrent(accs[0]) }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!window.ethereum) return
    const handler = (accs: string[]) => { setAccounts(accs); setCurrent(accs[0] || '') }
    window.ethereum.on('accountsChanged', handler)
    return () => window.ethereum.removeListener?.('accountsChanged', handler)
  }, [])

  const executeAction = useCallback((action: PendingAction) => {
    if (action === 'swap') window.location.href = '/swap'
    if (action === 'omnigas') {
      setShowTest(true)
      setMsg('')
      setTxHash('')
    }
    if (action === 'transfer') {
      setShowTest(true)
      setMsg('转账功能还在接入中，当前可先使用下方测试面板体验 OmniGas 流程。')
      setTxHash('')
    }
  }, [])

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) { alert('请先安装 MetaMask'); return }
    try {
      const accs: string[] = await window.ethereum.request({ method: 'eth_requestAccounts' })
      setAccounts(accs); setCurrent(accs[0])
      setShowLogin(false); setShowSwitcher(false)
      // 连接成功后继续执行之前的动作
      if (pendingAction) {
        setPendingAction('')
        executeAction(pendingAction)
      }
    } catch {}
  }, [pendingAction, executeAction])

  const handleAction = useCallback((action: PendingAction) => {
    if (!current) { setPendingAction(action); setShowLogin(true); return }
    executeAction(action)
  }, [current, executeAction])

  // ── 测试面板逻辑 ─────────────────────────────────────
  const refreshBalances = useCallback(async (address?: string) => {
    const addr = address || current
    if (!addr || !isSepoliaMode) return
    try {
      const res = await fetch(`/api/balance?address=${addr}`)
      const data = await res.json()
      if (res.ok) setBalances(data)
    } catch {}
  }, [current, isSepoliaMode])

  const refreshPayer = useCallback(async (address?: string) => {
    const addr = (address || current) as `0x${string}`
    if (!addr || !vaultAddress) return
    try {
      const payer = await publicClient.readContract({
        address: vaultAddress,
        abi: VAULT_DELEGATE_ABI,
        functionName: 'payerOf',
        args: [addr],
      })
      setMyPayer(payer === '0x0000000000000000000000000000000000000000' ? '' : payer as string)
    } catch {}
  }, [current])

  useEffect(() => {
    if (!current || !isSepoliaMode || !showTest) return
    refreshBalances(current)
    refreshPayer(current)
    const timer = window.setInterval(() => { refreshBalances(current); refreshPayer(current) }, 5000)
    return () => window.clearInterval(timer)
  }, [current, isSepoliaMode, showTest, refreshBalances, refreshPayer])

  const getWalletClient = useCallback(async () => {
    if (!provider) throw new Error('请先连接 MetaMask')
    const network = await provider.getNetwork()
    if (network.chainId !== CHAIN_ID) throw new Error(`请切换到 Sepolia (${CHAIN_ID})`)
    const externalProvider = (provider as any).provider
    if (!externalProvider) throw new Error('Wallet provider unavailable')
    return createWalletClient({ chain: APP_CHAIN, transport: custom(externalProvider) })
  }, [provider])

  const onAuthorize = useCallback(async () => {
    if (!current || !delegateInput || !vaultAddress) { setMsg('请输入 wallet 地址'); return }
    setDelegating(true); setMsg(''); setTxHash('')
    try {
      const wc = await getWalletClient()
      const hash = await wc.writeContract({
        account: current as `0x${string}`,
        address: vaultAddress,
        abi: VAULT_DELEGATE_ABI,
        functionName: 'authorize',
        args: [delegateInput as `0x${string}`],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setMsg(`已授权 ${delegateInput.slice(0, 10)}...`)
      setTxHash(hash)
      setDelegateInput('')
    } catch (e: any) {
      setMsg(e.shortMessage || e.message || '授权失败')
    } finally {
      setDelegating(false)
    }
  }, [current, delegateInput, getWalletClient])

  const onRevoke = useCallback(async () => {
    if (!current || !delegateInput || !vaultAddress) { setMsg('请输入 wallet 地址'); return }
    setDelegating(true); setMsg(''); setTxHash('')
    try {
      const wc = await getWalletClient()
      const hash = await wc.writeContract({
        account: current as `0x${string}`,
        address: vaultAddress,
        abi: VAULT_DELEGATE_ABI,
        functionName: 'revoke',
        args: [delegateInput as `0x${string}`],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setMsg(`已撤销 ${delegateInput.slice(0, 10)}...`)
      setTxHash(hash)
      setDelegateInput('')
    } catch (e: any) {
      setMsg(e.shortMessage || e.message || '撤销失败')
    } finally {
      setDelegating(false)
    }
  }, [current, delegateInput, getWalletClient])

  const onDetach = useCallback(async () => {
    if (!current || !vaultAddress) return
    setDelegating(true); setMsg(''); setTxHash('')
    try {
      const wc = await getWalletClient()
      const hash = await wc.writeContract({
        account: current as `0x${string}`,
        address: vaultAddress,
        abi: VAULT_DELEGATE_ABI,
        functionName: 'detach',
        args: [],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setMyPayer('')
      setMsg('已解除绑定')
      setTxHash(hash)
    } catch (e: any) {
      setMsg(e.shortMessage || e.message || '解除失败')
    } finally {
      setDelegating(false)
    }
  }, [current, getWalletClient])

  const onClaim = useCallback(async () => {
    if (!current) { setMsg('请先连接钱包'); return }
    setClaiming(true); setMsg(''); setTxHash('')
    try {
      const { response, data } = await fetchWithTimeout('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: current }),
      })
      if (!response.ok) throw new Error(data?.error || 'Faucet 失败')
      setMsg(`已领取 USDC`)
      setTxHash(data.txHash)
      refreshBalances(current)
    } catch (e: any) {
      setMsg(e.message || 'Faucet 失败')
    } finally {
      setClaiming(false)
    }
  }, [current, refreshBalances])

  const onDeposit = useCallback(async () => {
    if (!current || !selectedToken?.address || !vaultAddress) {
      setMsg('缺少钱包或合约配置'); return
    }
    setDepositing(true); setMsg(''); setTxHash('')
    try {
      const wc = await getWalletClient()
      const approveHash = await wc.writeContract({
        account: current as `0x${string}`,
        address: selectedToken.address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [vaultAddress, selectedToken.amount],
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
      const depositHash = await wc.writeContract({
        account: current as `0x${string}`,
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'deposit',
        args: [selectedToken.address, selectedToken.amount],
      })
      await publicClient.waitForTransactionReceipt({ hash: depositHash })
      setMsg('充值成功')
      setTxHash(depositHash)
      await refreshBalances(current)
    } catch (e: any) {
      setMsg(e.shortMessage || e.message || '充值失败')
    } finally {
      setDepositing(false)
    }
  }, [current, getWalletClient, refreshBalances, selectedToken])

  const onMint = useCallback(async () => {
    if (!current || !selectedToken?.address) { setMsg('请选择 USDC 或 BOX'); return }
    setMinting(true); setMsg(''); setTxHash('')
    try {
      const { response, data } = await fetchWithTimeout('/api/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: current, feeToken: selectedToken.address }),
      })
      if (!response.ok) throw new Error(data?.error || 'Relay 失败')
      setMsg('Gasless Mint 成功')
      setTxHash(data.txHash)
      await refreshBalances(current)
    } catch (e: any) {
      setMsg(e.message || 'Mint 失败')
    } finally {
      setMinting(false)
    }
  }, [current, refreshBalances, selectedToken])

  // ── JSX ──────────────────────────────────────────────
  return (
    <div className={styles.phone}>
      <Head>
        <title>OmniGas Wallet</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className={styles.inner}>
        {/* 顶部状态栏 */}
        <div className={styles.statusBar}>
          {current ? (
            <button className={styles.accountBtn} onClick={() => setShowSwitcher(true)}>
              <div className={styles.avatar} style={{ background: getAvatarColor(current) }}>
                {current.slice(2, 4).toUpperCase()}
              </div>
              <span className={styles.addrText}>{shortAddr(current)}</span>
              <span className={styles.chevron}>▾</span>
            </button>
          ) : (
            <span className={styles.notConnected}>未连接</span>
          )}
        </div>

        {/* 余额卡片 */}
        <div className={styles.balanceCard}>
          <div className={styles.balanceLabel}>总资产</div>
          <div className={styles.balanceAmount}>$0.00</div>
          <div className={styles.networkBadge}>
            <span className={styles.networkDot} />
            Sepolia Testnet
          </div>
        </div>

        {/* 三个功能按钮 */}
        <div className={styles.actions}>
          <button className={styles.actionCard} onClick={() => handleAction('omnigas')}>
            <div className={styles.actionIcon} style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>⛽</div>
            <span className={styles.actionLabel}>万能Gas</span>
          </button>
          <button className={styles.actionCard} onClick={() => handleAction('transfer')}>
            <div className={styles.actionIcon} style={{ background: 'linear-gradient(135deg, #10B981, #3B82F6)' }}>↗</div>
            <span className={styles.actionLabel}>转账</span>
          </button>
          <button className={styles.actionCard} onClick={() => handleAction('swap')}>
            <div className={styles.actionIcon} style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>⇄</div>
            <span className={styles.actionLabel}>Swap</span>
          </button>
        </div>
      </div>

      {/* 右下角测试入口 */}
      <button className={styles.testFab} onClick={() => { setShowTest(true); setMsg(''); setTxHash('') }}>
        🧪
      </button>

      {/* 登录弹窗 */}
      {showLogin && (
        <div className={styles.overlay} onClick={() => setShowLogin(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalEmoji}>🔐</div>
            <h2 className={styles.modalTitle}>连接钱包</h2>
            <p className={styles.modalDesc}>
              使用{{ omnigas: '万能Gas', transfer: '转账', swap: 'Swap' }[pendingAction] || ''}功能前，请先连接你的钱包
            </p>
            <button className={styles.connectBtn} onClick={connectWallet}>MetaMask 连接</button>
            <button className={styles.cancelBtn} onClick={() => setShowLogin(false)}>取消</button>
          </div>
        </div>
      )}

      {/* 账户切换底部弹出 */}
      {showSwitcher && (
        <div className={styles.overlay} onClick={() => setShowSwitcher(false)}>
          <div className={styles.bottomSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheetHandle} />
            <h3 className={styles.sheetTitle}>切换账户</h3>
            {accounts.map((acc) => (
              <button
                key={acc}
                className={[styles.accountItem, acc === current ? styles.accountItemActive : ''].join(' ')}
                onClick={() => { setCurrent(acc); setShowSwitcher(false) }}
              >
                <div className={styles.accountAvatar} style={{ background: getAvatarColor(acc) }}>
                  {acc.slice(2, 4).toUpperCase()}
                </div>
                <div className={styles.accountInfo}>
                  <span className={styles.accountAddr}>{shortAddr(acc)}</span>
                  {acc === current && <span className={styles.accountBadge}>当前</span>}
                </div>
              </button>
            ))}
            <button className={styles.addAccountBtn} onClick={connectWallet}>+ 添加 / 切换账户</button>
          </div>
        </div>
      )}

      {/* 测试面板底部弹出 */}
      {showTest && (
        <div className={styles.overlay} onClick={() => setShowTest(false)}>
          <div className={styles.testSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.sheetHandle} />
            <div className={styles.testHeader}>
              <h3 className={styles.sheetTitle}>🧪 测试面板</h3>
              <button className={styles.testClose} onClick={() => setShowTest(false)}>✕</button>
            </div>

            {/* 网络切换 */}
            <div className={styles.testSection}>
              <div className={styles.testLabel}>网络模式</div>
              <div className={styles.testRow}>
                {NETWORK_MODES.map((m) => (
                  <button
                    key={m}
                    className={[styles.testChip, networkMode === m ? styles.testChipActive : ''].join(' ')}
                    onClick={() => { setNetworkMode(m); setMsg('') }}
                  >
                    {m === 'sepolia' ? 'Sepolia' : 'Mainnet'}
                  </button>
                ))}
              </div>
            </div>

            {/* Gas Token 选择 */}
            <div className={styles.testSection}>
              <div className={styles.testLabel}>Gas Token</div>
              <div className={styles.testRow}>
                {GAS_TOKENS.map((t) => (
                  <button
                    key={t}
                    className={[styles.testChip, gasToken === t ? styles.testChipActive : ''].join(' ')}
                    onClick={() => setGasToken(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Vault 余额 */}
            {isSepoliaMode && current && (
              <div className={styles.testSection}>
                <div className={styles.testLabel}>Vault 余额</div>
                {balances.effectivePayer && balances.effectivePayer.toLowerCase() !== current.toLowerCase() && (
                  <div className={styles.testPayerHint}>
                    代付方：{balances.effectivePayer.slice(0, 10)}...
                  </div>
                )}
                <div className={styles.testBalances}>
                  <div className={styles.testBalRow}><span>USDC</span><strong>{balances.usdcBalance}</strong></div>
                  <div className={styles.testBalRow}><span>BOX</span><strong>{balances.boxBalance}</strong></div>
                  <div className={styles.testBalRow}><span>NFT</span><strong>{balances.nftCount}</strong></div>
                </div>
              </div>
            )}

            {/* 委托管理 */}
            {isSepoliaMode && current && (
              <div className={styles.testSection}>
                <div className={styles.testLabel}>委托管理</div>

                {/* 我绑定的 payer */}
                {myPayer ? (
                  <div className={styles.testDelegateInfo}>
                    <span>绑定代付：{myPayer.slice(0, 10)}...</span>
                    <button
                      className={styles.testDelegateDetach}
                      onClick={onDetach}
                      disabled={delegating}
                    >
                      {delegating ? '...' : '解除'}
                    </button>
                  </div>
                ) : (
                  <div className={styles.testDelegateNone}>未绑定代付方</div>
                )}

                {/* 授权 / 撤销 wallet */}
                <div className={styles.testDelegateRow}>
                  <input
                    className={styles.testDelegateInput}
                    placeholder="Wallet 地址 0x..."
                    value={delegateInput}
                    onChange={(e) => setDelegateInput(e.target.value)}
                  />
                  <button
                    className={styles.testChip}
                    onClick={onAuthorize}
                    disabled={delegating || !delegateInput}
                  >
                    授权
                  </button>
                  <button
                    className={styles.testChip}
                    onClick={onRevoke}
                    disabled={delegating || !delegateInput}
                  >
                    撤销
                  </button>
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            {isSepoliaMode && (
              <div className={styles.testSection}>
                <div className={styles.testLabel}>操作</div>
                <div className={styles.testActions}>
                  <button
                    className={styles.testBtn}
                    onClick={onClaim}
                    disabled={claiming}
                  >
                    {claiming ? '领取中...' : '领取测试 USDC'}
                  </button>
                  <button
                    className={styles.testBtn}
                    onClick={onDeposit}
                    disabled={depositing}
                  >
                    {depositing ? '充值中...' : `充值 ${selectedToken?.label || '—'}`}
                  </button>
                  <button
                    className={[styles.testBtn, styles.testBtnPrimary].join(' ')}
                    onClick={onMint}
                    disabled={minting}
                  >
                    {minting ? 'Mint 中...' : 'Gasless Mint ⚡'}
                  </button>
                </div>
              </div>
            )}

            {/* 状态消息 */}
            {msg && <div className={styles.testMsg}>{msg}</div>}
            {txHash && (
              <a
                className={styles.testTxLink}
                href={`${EXPLORER_TX}${txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                查看交易 ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default WalletHome
