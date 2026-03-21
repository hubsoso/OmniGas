import type { NextPage } from 'next'
import Head from 'next/head'
import { createPublicClient, createWalletClient, custom, parseAbi, parseUnits } from 'viem'
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
const API_TIMEOUT = 30_000

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

// ── Cookie 缓存 ──────────────────────────────────────
function setCookie(key: string, value: string, maxAge = 300) {
  document.cookie = `${key}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/`
}
function getCookie(key: string): string | null {
  const m = document.cookie.match(new RegExp('(?:^|; )' + key + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}

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
type ThemeMode = 'system' | 'dark' | 'light'
type OmnigasToken = 'USDC' | 'BOX'

const THEME_ICONS: Record<ThemeMode, string> = { system: '⚙️', dark: '🌙', light: '☀️' }
const THEME_ORDER: ThemeMode[] = ['system', 'dark', 'light']

// ── 组件 ─────────────────────────────────────────────
const WalletHome: NextPage = () => {
  const provider = useActiveProvider()

  // 主题
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [systemDark, setSystemDark] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('wallet-theme') as ThemeMode | null
    if (saved && THEME_ORDER.includes(saved)) setThemeMode(saved)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemDark(mq.matches)
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const isLight = themeMode === 'light' || (themeMode === 'system' && !systemDark)

  const cycleTheme = useCallback(() => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(themeMode) + 1) % THEME_ORDER.length]
    setThemeMode(next)
    localStorage.setItem('wallet-theme', next)
  }, [themeMode])

  // 钱包账户
  const [accounts, setAccounts] = useState<string[]>([])
  const [current, setCurrent] = useState<string>('')
  const [primaryAccount, setPrimaryAccount] = useState<string>('') // 当前设备的主账户
  const [showLogin, setShowLogin] = useState(false)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction>('')

  // 测试面板
  const [showTest, setShowTest] = useState(false)
  const [networkMode, setNetworkMode] = useState<NetworkMode>('sepolia')
  const [gasToken, setGasToken] = useState<GasToken>('USDC')
  const [balances, setBalances] = useState({ usdcBalance: '0', boxBalance: '0', nftCount: '0', effectivePayer: '' })
  const [claiming, setClaiming] = useState(false)
  const [claimingBox, setClaimingBox] = useState(false)
  const [depositing, setDepositing] = useState(false)
  const [minting, setMinting] = useState(false)
  const [msg, setMsg] = useState('')
  const [txHash, setTxHash] = useState('')

  // 全能服务费面板
  const [showOmnigas, setShowOmnigas] = useState(false)
  const [omnigasStep, setOmnigasStep] = useState<'list' | 'detail'>('list')
  const [omnigasToken, setOmnigasToken] = useState<OmnigasToken>('USDC')
  const [omnigasAmount, setOmnigasAmount] = useState<bigint>(10n)
  const [omnigasLoading, setOmnigasLoading] = useState(false)
  const [omnigasMsg, setOmnigasMsg] = useState('')
  const [omnigazTxHash, setOmnigazTxHash] = useState('')

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

  // 主账户初始化（从 localStorage 加载）
  useEffect(() => {
    const stored = localStorage.getItem('omngas_primary_account')
    if (stored && accounts.includes(stored.toLowerCase())) {
      setPrimaryAccount(stored.toLowerCase())
    } else if (accounts.length > 0) {
      // 如果已保存的主账户不在列表中，清空
      setPrimaryAccount('')
      localStorage.removeItem('omngas_primary_account')
    }
  }, [accounts])

  const executeAction = useCallback((action: PendingAction) => {
    if (action === 'swap') window.location.href = '/swap'
    if (action === 'omnigas') {
      setShowOmnigas(true)
      setOmnigasStep('list')
      setOmnigasMsg('')
      setOmnigazTxHash('')
    }
    if (action === 'transfer') {
      setShowTest(true)
      setMsg('转账功能还在接入中，当前可先使用下方测试面板体验 OmniGas 流程。')
      setTxHash('')
    }
  }, [])

  const connectWallet = useCallback(async () => {
    console.log('[connectWallet] 点击了添加账户按钮')
    console.log('[connectWallet] window.ethereum:', window.ethereum)
    if (!window.ethereum) {
      console.log('[connectWallet] MetaMask 未安装')
      alert('请先安装 MetaMask');
      return
    }
    try {
      console.log('[connectWallet] 正在请求账户授权...')
      const accs: string[] = await window.ethereum.request({ method: 'eth_requestAccounts' })
      console.log('[connectWallet] 授权成功，账户:', accs)

      // 检测是否有新账户（不在已连接列表中）
      const newAccounts = accs.filter(acc => !accounts.map(a => a.toLowerCase()).includes(acc.toLowerCase()))
      console.log('[connectWallet] 新账户:', newAccounts, '已有账户:', accounts)

      if (newAccounts.length === 0) {
        // 没有新账户，说明用户没有在MetaMask中切换账户
        alert('👉 请在 MetaMask 中切换到新账户，然后再试一次')
        return
      }

      setAccounts(accs); setCurrent(accs[0])
      setShowLogin(false); setShowSwitcher(false)
      setMsg('✅ 账户已添加')

      // 连接成功后继续执行之前的动作
      if (pendingAction) {
        setPendingAction('')
        executeAction(pendingAction)
      }
    } catch (err: any) {
      console.error('[connectWallet]', err)
      // 用户拒绝或其他错误，保持弹出框打开
      if (err?.code === 4001) {
        setMsg('你已拒绝连接请求')
      } else {
        setMsg(`连接失败: ${err?.message || '未知错误'}`)
      }
    }
  }, [pendingAction, executeAction, accounts])

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
      if (res.ok) {
        setBalances(data)
        setCookie(`ogbal_${addr.toLowerCase()}`, JSON.stringify(data))
      }
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

  // 从 cookie 缓存立即恢复余额，避免白屏等待
  useEffect(() => {
    if (!current) return
    const cached = getCookie(`ogbal_${current.toLowerCase()}`)
    if (cached) { try { setBalances(JSON.parse(cached)) } catch {} }
  }, [current])

  // 钱包连接后拉取最新余额（页面刷新也会触发）
  useEffect(() => {
    if (!current || !isSepoliaMode) return
    refreshBalances(current)
    refreshPayer(current)
  }, [current, isSepoliaMode, refreshBalances, refreshPayer])

  // 面板打开时持续轮询
  useEffect(() => {
    if (!current || !isSepoliaMode || (!showTest && !showOmnigas)) return
    const timer = window.setInterval(() => { refreshBalances(current); refreshPayer(current) }, 5000)
    return () => window.clearInterval(timer)
  }, [current, isSepoliaMode, showTest, showOmnigas, refreshBalances, refreshPayer])

  const getWalletClient = useCallback(async () => {
    if (!window.ethereum) throw new Error('请先安装 MetaMask')
    const chainId = await window.ethereum.request({ method: 'eth_chainId' })
    if (Number(chainId) !== CHAIN_ID) throw new Error(`请切换到 Sepolia (${CHAIN_ID})`)
    return createWalletClient({ chain: APP_CHAIN, transport: custom(window.ethereum) })
  }, [])

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

  const onOmniClaim = useCallback(async () => {
    if (!current) { setOmnigasMsg('请先连接钱包'); return }
    setOmnigasLoading(true); setOmnigasMsg(''); setOmnigazTxHash('')
    try {
      const { response, data } = await fetchWithTimeout('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: current, token: omnigasToken.toLowerCase() }),
      })
      if (!response.ok) throw new Error(data?.error || 'Faucet 失败')
      setOmnigasLoading(false)
      setOmnigasMsg(`已领取 10 ${omnigasToken} 测试币`)
      setOmnigazTxHash(data.txHash)
      refreshBalances(current)
    } catch (e: any) {
      setOmnigasLoading(false)
      setOmnigasMsg(e.message || 'Faucet 失败')
    }
  }, [current, omnigasToken, refreshBalances])

  const setPrimaryAccountTo = useCallback((account: string) => {
    if (!accounts.includes(account)) return
    localStorage.setItem('omngas_primary_account', account.toLowerCase())
    setPrimaryAccount(account.toLowerCase())
  }, [accounts])

  const onOmnigasDeposit = useCallback(async () => {
    if (!current || !vaultAddress) { setOmnigasMsg('请先连接钱包'); return }
    const cfg = tokenConfig[omnigasToken]
    if (!cfg?.address) { setOmnigasMsg('代币未配置'); return }
    const decimals = omnigasToken === 'USDC' ? 6 : 18
    const amountWei = parseUnits(String(omnigasAmount), decimals)
    setOmnigasLoading(true); setOmnigasMsg(''); setOmnigazTxHash('')
    try {
      const wc = await getWalletClient()
      const approveHash = await wc.writeContract({
        account: current as `0x${string}`,
        address: cfg.address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [vaultAddress, amountWei],
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
      const depositHash = await wc.writeContract({
        account: current as `0x${string}`,
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'deposit',
        args: [cfg.address, amountWei],
      })
      await publicClient.waitForTransactionReceipt({ hash: depositHash })
      setOmnigasLoading(false)
      setOmnigasMsg('充值成功！')
      setOmnigazTxHash(depositHash)
      refreshBalances(current)
    } catch (e: any) {
      setOmnigasLoading(false)
      setOmnigasMsg(e.shortMessage || e.message || '充值失败')
    }
  }, [current, omnigasToken, omnigasAmount, getWalletClient, refreshBalances])

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

  const onClaimBox = useCallback(async () => {
    if (!current) { setMsg('请先连接钱包'); return }
    setClaimingBox(true); setMsg(''); setTxHash('')
    try {
      const { response, data } = await fetchWithTimeout('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: current, token: 'box' }),
      })
      if (!response.ok) throw new Error(data?.error || 'Faucet 失败')
      setMsg(`已领取 BOX`)
      setTxHash(data.txHash)
      refreshBalances(current)
    } catch (e: any) {
      setMsg(e.message || 'Faucet 失败')
    } finally {
      setClaimingBox(false)
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
    // 📌 任务#5：若当前 !== primaryAccount，在这里显示确认框
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
    <div className={[styles.phone, isLight ? styles.phoneLight : ''].join(' ')}>
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
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                <span className={styles.addrText}>{shortAddr(current)}</span>
                {primaryAccount && (
                  <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)' }}>
                    {current === primaryAccount ? '⭐ 主账户' : '💫 子账户'}
                  </span>
                )}
              </div>
              <span className={styles.chevron}>▾</span>
            </button>
          ) : (
            <span className={styles.notConnected}>未连接</span>
          )}

          {/* 右上角主题切换 */}
          <button
            className={styles.themeBtn}
            onClick={cycleTheme}
            title={`当前：${themeMode === 'system' ? '跟随系统' : themeMode === 'dark' ? '深色' : '浅色'}`}
          >
            {THEME_ICONS[themeMode]}
          </button>
        </div>

        {/* 余额卡片 */}
        <div className={styles.balanceCard}>
          <div className={styles.balanceLabel}>Vault 总资产</div>
          <div className={styles.balanceAmount}>
            ${current && isSepoliaMode
              ? (parseFloat(balances.usdcBalance || '0') + parseFloat(balances.boxBalance || '0')).toFixed(2)
              : '0.00'}
          </div>
          <div className={styles.networkBadge}>
            <span className={styles.networkDot} />
            Sepolia Testnet
          </div>
        </div>

        {/* 三个功能按钮 */}
        <div className={styles.actions}>
          <button className={styles.actionCard} onClick={() => handleAction('omnigas')}>
            <div className={styles.actionIcon} style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>⛽</div>
            <span className={styles.actionLabel}>全能服务费</span>
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
              使用{{ omnigas: '全能服务费', transfer: '转账', swap: 'Swap' }[pendingAction] || ''}功能前，请先连接你的钱包
            </p>
            <button className={styles.connectBtn} onClick={connectWallet}>MetaMask 连接</button>
            <button className={styles.cancelBtn} onClick={() => setShowLogin(false)}>取消</button>
          </div>
        </div>
      )}

      {/* 账户切换居中弹出 */}
      {showSwitcher && (
        <div className={styles.overlayCenter} onClick={() => setShowSwitcher(false)}>
          <div className={styles.omnigasSheetCenter} onClick={(e) => e.stopPropagation()}>
            <div className={styles.omnigasHeader}>
              <h3 className={styles.omnigasTitle}>切换账户</h3>
              <button className={styles.testClose} onClick={() => setShowSwitcher(false)}>✕</button>
            </div>
            {accounts.map((acc) => {
              const isPrimary = acc === primaryAccount
              const isCurrent = acc === current
              return (
                <div
                  key={acc}
                  className={[styles.accountItem, isCurrent ? styles.accountItemActive : ''].join(' ')}
                >
                  <button
                    style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    onClick={() => { setCurrent(acc); setShowSwitcher(false) }}
                  >
                    <div className={styles.accountAvatar} style={{ background: getAvatarColor(acc) }}>
                      {acc.slice(2, 4).toUpperCase()}
                    </div>
                    <div className={styles.accountInfo}>
                      <span className={styles.accountAddr}>{shortAddr(acc)}</span>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {isPrimary && <span className={styles.accountBadge}>⭐ 主账户</span>}
                        {isCurrent && <span className={styles.accountBadge}>当前</span>}
                      </div>
                    </div>
                  </button>
                  {!isPrimary && (
                    <button
                      className={styles.setAsPrimaryBtn}
                      onClick={() => { setPrimaryAccountTo(acc); setShowSwitcher(false) }}
                    >
                      设为主账户
                    </button>
                  )}
                </div>
              )
            })}
            <button className={styles.addAccountBtn} onClick={connectWallet}>+ 添加 / 切换账户</button>
          </div>
        </div>
      )}

      {/* 全能服务费 — 代币列表 */}
      {showOmnigas && omnigasStep === 'list' && (
        <div className={styles.overlayCenter} onClick={() => setShowOmnigas(false)}>
          <div className={styles.omnigasSheetCenter} onClick={(e) => e.stopPropagation()}>
            <div className={styles.omnigasHeader}>
              <h3 className={styles.omnigasTitle}>充值代币</h3>
              <button className={styles.testClose} onClick={() => setShowOmnigas(false)}>✕</button>
            </div>
            {[
              { id: 'USDC' as OmnigasToken, label: 'USDC', chain: 'Sepolia', color: '#2775CA', vaultBal: balances.usdcBalance, badge: '测试币' },
              { id: 'BOX' as OmnigasToken, label: 'BOX', chain: 'Sepolia', color: '#6366F1', vaultBal: balances.boxBalance, badge: '' },
            ].map((t) => (
              <button
                key={t.id}
                className={styles.omnigasTokenRow}
                onClick={() => { setOmnigasToken(t.id); setOmnigasStep('detail'); setOmnigasAmount(10n); setOmnigasMsg(''); setOmnigazTxHash('') }}
              >
                <div className={styles.omnigasTokenIcon} style={{ background: t.color }}>{t.label[0]}</div>
                <div className={styles.omnigasTokenInfo}>
                  <div className={styles.omnigasTokenNameRow}>
                    <span className={styles.omnigasTokenName}>{t.label}</span>
                    {t.badge && <span className={styles.omnigasBadge}>{t.badge}</span>}
                  </div>
                  <span className={styles.omnigasTokenChain}>{t.chain}</span>
                </div>
                <div className={styles.omnigasTokenBalCol}>
                  <span className={styles.omnigasTokenBal}>Vault: {t.vaultBal}</span>
                  <span className={styles.omnigasTokenSub}>Testnet</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 全能服务费 — 充值详情 */}
      {showOmnigas && omnigasStep === 'detail' && (
        <div className={styles.overlayCenter} onClick={() => setOmnigasStep('list')}>
          <div className={styles.omnigasSheetCenter} onClick={(e) => e.stopPropagation()}>
            <div className={styles.omnigasHeader}>
              <button className={styles.omnigasBackBtn} onClick={() => setOmnigasStep('list')}>‹</button>
              <h3 className={styles.omnigasTitle}>充值详情</h3>
              <button className={styles.testClose} onClick={() => setShowOmnigas(false)}>✕</button>
            </div>

            {/* 📌 任务#2：检测子账户提示 - 若当前 !== primaryAccount 则显示蓝色提示卡片 */}

            {/* 充值代币 selector */}
            <div className={styles.omnigasSection}>
              <div className={styles.omnigasLabel}>充值代币</div>
              <button className={styles.omnigasCoinSelector} onClick={() => setOmnigasStep('list')}>
                <div className={styles.omnigasTokenIcon} style={{ background: omnigasToken === 'USDC' ? '#2775CA' : '#6366F1' }}>
                  {omnigasToken[0]}
                </div>
                <div className={styles.omnigasTokenInfo}>
                  <span className={styles.omnigasTokenName}>{omnigasToken}</span>
                  <span className={styles.omnigasTokenChain}>Sepolia</span>
                </div>
                <span className={styles.omnigasArrow}>›</span>
              </button>
            </div>

            {/* 数量选择 */}
            <div className={styles.omnigasSection}>
              <div className={styles.omnigasLabelRow}>
                <div className={styles.omnigasLabel}>数量</div>
                <div className={styles.omnigasVaultBal}>
                  Vault: {omnigasToken === 'USDC' ? balances.usdcBalance : balances.boxBalance} {omnigasToken}
                </div>
              </div>
              <div className={styles.omnigasAmounts}>
                {[5n, 10n, 200n].map((amt) => (
                  <button
                    key={amt.toString()}
                    className={[styles.omnigasAmountChip, omnigasAmount === amt ? styles.omnigasAmountChipActive : ''].join(' ')}
                    onClick={() => setOmnigasAmount(amt)}
                  >
                    <span className={styles.omnigasAmountMain}>{String(amt)} {omnigasToken}</span>
                    <span className={styles.omnigasAmountSub}>${String(amt)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 费用信息 */}
            <div className={styles.omnigasInfoRows}>
              <div className={styles.omnigasInfoRow}>
                <span>充值金额</span>
                <strong>{String(omnigasAmount)} {omnigasToken}</strong>
              </div>
              <div className={styles.omnigasInfoRow}>
                <span>预计 Gas 费</span>
                <strong>&lt; 0.0001 ETH ~&lt;$0.01</strong>
              </div>
            </div>

            {/* 提示 */}
            <div className={styles.omnigasNotice}>
              ℹ 充值的资产将用于支付交易服务费，不可提取
            </div>

            {/* 状态 */}
            {omnigasMsg && <div className={styles.testMsg}>{omnigasMsg}</div>}
            {omnigazTxHash && (
              <a className={styles.testTxLink} href={`${EXPLORER_TX}${omnigazTxHash}`} target="_blank" rel="noreferrer">
                查看交易 ↗
              </a>
            )}

            {/* 充值按钮 */}
            <button className={styles.omnigasDepositBtn} onClick={onOmnigasDeposit} disabled={omnigasLoading}>
              {omnigasLoading ? '充值中...' : '充值'}
            </button>
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
                {/* 📌 任务#4：优化显示 - 分别显示「自有」「代付可用」「合计」 */}
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
            {/* 📌 任务#6：简化 UI - 隐藏手动授权输入框，只显示只读信息 */}
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
                    disabled={claiming || claimingBox}
                  >
                    {claiming ? '领取中...' : '领取测试 USDC'}
                  </button>
                  <button
                    className={styles.testBtn}
                    onClick={onClaimBox}
                    disabled={claiming || claimingBox}
                  >
                    {claimingBox ? '领取中...' : '领取测试 BOX'}
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
