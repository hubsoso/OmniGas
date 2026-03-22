import type { NextPage } from 'next'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { createPublicClient, createWalletClient, custom, parseAbi, parseUnits } from 'viem'
import { sepolia, mainnet } from 'viem/chains'
import { useCallback, useEffect, useState } from 'react'
import { createFallbackTransport, SEPOLIA_RPC_URLS } from '../lib/rpc'
import { pickSelectedAccount, setSelectedAccount } from '../lib/selectedAccount'
import { THEME_ORDER, type ThemeMode, useThemeMode } from '../lib/theme'
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

type PendingAction = 'omnigas' | 'transfer' | ''
type OmnigasToken = 'USDC' | 'BOX'
type ComingSoonFeature = 'swap' | 'dapp' | 'staking' | 'cardTopup' | 'more' | ''
type LocaleMode = 'zh' | 'en'

const THEME_ICONS: Record<ThemeMode, string> = { system: '⚙️', dark: '🌙', light: '☀️' }

const FEATURE_PREVIEWS: Record<Exclude<ComingSoonFeature, ''>, Record<LocaleMode, {
  eyebrow: string
  title: string
  description: string
  points: string[]
}>> = {
  swap: {
    zh: {
      eyebrow: '兑换功能',
      title: 'Swap 兑换',
      description: '兑换功能会继续打磨成更轻量的流转体验，把路径、价格与执行反馈整合得更清晰。',
      points: ['更简洁的兑换流程', '更明确的报价与滑点信息', '统一交易状态反馈'],
    },
    en: {
      eyebrow: 'Swap',
      title: 'Swap',
      description: 'The swap flow will be refined into a cleaner experience with clearer routes, pricing, and execution feedback.',
      points: ['Cleaner swap flow', 'Clearer quotes and slippage info', 'Unified transaction feedback'],
    },
  },
  dapp: {
    zh: {
      eyebrow: 'DApp 交易',
      title: 'DApp 交易',
      description: '未来会把常见链上交互整合成一键入口，让授权、支付和提交动作更顺滑。',
      points: ['精选热门 DApp 模板', '统一 gasless 交互体验', '交易前关键风险提示'],
    },
    en: {
      eyebrow: 'DApp transactions',
      title: 'DApp Transactions',
      description: 'Common onchain interactions will be organized into guided entry points for smoother approval, payment, and submission flows.',
      points: ['Curated DApp templates', 'Unified gasless interaction flow', 'Clear risk hints before submission'],
    },
  },
  staking: {
    zh: {
      eyebrow: '质押功能',
      title: '质押赚取收益',
      description: '计划支持更轻量的质押流程，在当前钱包体验里直接完成资产存入与收益查看。',
      points: ['主流资产质押入口', '收益与周期概览', '到期提醒与状态跟踪'],
    },
    en: {
      eyebrow: 'Staking',
      title: 'Staking',
      description: 'Staking will be streamlined so deposits, rewards, and status tracking can happen in the same wallet experience.',
      points: ['Mainstream staking entries', 'Yield and duration overview', 'Maturity reminders and tracking'],
    },
  },
  cardTopup: {
    zh: {
      eyebrow: '卡片充值',
      title: '卡片充值',
      description: '会把链上余额与消费场景串起来，支持更自然的充值与资金划转体验。',
      points: ['常用充值面额', '预计到账与手续费展示', '统一订单状态反馈'],
    },
    en: {
      eyebrow: 'Card top-ups',
      title: 'Card Top-ups',
      description: 'Card funding will connect onchain balances with everyday spending through a simpler top-up and transfer experience.',
      points: ['Common top-up amounts', 'Arrival time and fee preview', 'Unified order status feedback'],
    },
  },
  more: {
    zh: {
      eyebrow: '更多能力',
      title: '更多能力',
      description: '除了基础转账和兑换，我们还会继续扩展更多高频功能与生活化场景。',
      points: ['支付与订阅类场景', '活动任务与权益中心', '更完整的账户资产编排'],
    },
    en: {
      eyebrow: 'More',
      title: 'More Features',
      description: 'Beyond basic transfer and swap, more high-frequency and real-world scenarios will be added over time.',
      points: ['Payments and subscriptions', 'Campaigns and benefits hub', 'Richer account asset orchestration'],
    },
  },
}

// ── 组件 ─────────────────────────────────────────────
const WalletHome: NextPage = () => {
  const router = useRouter()

  // 主题
  const { themeMode, isLight, setThemeMode } = useThemeMode()

  const cycleTheme = useCallback(() => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(themeMode) + 1) % THEME_ORDER.length]
    setThemeMode(next)
  }, [setThemeMode, themeMode])

  // 钱包账户
  const [accounts, setAccounts] = useState<string[]>([])
  const [current, setCurrent] = useState<string>('')
  const [primaryAccount, setPrimaryAccount] = useState<string>('') // 当前设备的主账户
  const [showLogin, setShowLogin] = useState(false)
  const [showSwitcher, setShowSwitcher] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction>('')
  const [comingSoonFeature, setComingSoonFeature] = useState<ComingSoonFeature>('')
  const [locale, setLocale] = useState<LocaleMode>('zh')

  // 测试面板
  const [showTest, setShowTest] = useState(false)
  const [networkMode, setNetworkMode] = useState<NetworkMode>('sepolia')
  const [gasToken, setGasToken] = useState<GasToken>('USDC')
  const [targetChain, setTargetChain] = useState<'sepolia' | 'base-sepolia'>('sepolia')
  const [balances, setBalances] = useState({ usdcBalance: '0', boxBalance: '0', nftCount: '0', effectivePayer: '' })
  const [claiming, setClaiming] = useState(false)
  const [claimingBox, setClaimingBox] = useState(false)
  const [depositing, setDepositing] = useState(false)
  const [minting, setMinting] = useState(false)
  const [msg, setMsg] = useState('')
  const [txHash, setTxHash] = useState('')
  const [txChain, setTxChain] = useState<'sepolia' | 'base-sepolia'>('sepolia')

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
  const [subAccountAuthStatus, setSubAccountAuthStatus] = useState<Record<string, boolean>>({}) // 子账户链上授权状态
  const [subAccountAuthReady, setSubAccountAuthReady] = useState(false) // 子账户授权状态是否已完成首次同步
  const [authorizingSubAccount, setAuthorizingSubAccount] = useState<string>('') // 正在授权的子账户地址

  const isSepoliaMode = networkMode === 'sepolia'
  const selectedToken = gasToken === 'ETH' ? null : tokenConfig[gasToken]

  // ── 账户初始化 ───────────────────────────────────────
  useEffect(() => {
    if (!window.ethereum) return
    window.ethereum.request({ method: 'eth_accounts' }).then((accs: string[]) => {
      if (accs.length > 0) {
        const nextCurrent = pickSelectedAccount(accs, accs[0])
        setAccounts(accs)
        setCurrent(nextCurrent)
        setSelectedAccount(nextCurrent)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!window.ethereum) return
    const handler = (accs: string[]) => {
      const nextCurrent = pickSelectedAccount(accs, accs[0] || '')
      setAccounts(accs)
      setCurrent(nextCurrent)
      if (nextCurrent) setSelectedAccount(nextCurrent)
    }
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
    if (action === 'transfer') {
      void router.push('/transfer')
      return
    }
    if (action === 'omnigas') {
      setShowOmnigas(true)
      setOmnigasStep('list')
      setOmnigasMsg('')
      setOmnigazTxHash('')
    }
  }, [router])

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
        return
      }

      const nextCurrent = pickSelectedAccount(accs, accs[0])
      setAccounts(accs)
      setCurrent(nextCurrent)
      setSelectedAccount(nextCurrent)
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

  const openComingSoon = useCallback((feature: Exclude<ComingSoonFeature, ''>) => {
    setComingSoonFeature(feature)
  }, [])

  const t = locale === 'zh'
    ? {
        pageTitle: 'OmniGas 钱包',
        vaultTotal: 'Vault 总资产',
        network: 'Sepolia 测试网',
        heroMeta: 'DApp 交易、质押、卡片充值等更多功能',
        heroFootnote: '围绕更简洁的 Gasless 钱包体验打造',
        heroStat1: 'Gasless',
        heroStat2: '多场景',
        heroStat3: '持续扩展',
        availableEyebrow: '当前可用',
        availableTitle: '核心功能',
        coreTag: '核心',
        omnigas: '全能服务费',
        omnigasSub: '全能服务费资金池',
        transfer: '转账',
        transferSub: '快速发起资产转账',
        progressEyebrow: '后续开发',
        progressTitle: '即将支持',
        progressDesc: '保持当前语言，逐步扩展更完整的链上与支付场景。',
        comingSoon: '敬请期待',
        swapTitle: 'Swap',
        swapDesc: '兑换页面先纳入后续开发区，等交互和视觉一起收敛后再开放。',
        dappTitle: 'DApp 交易',
        dappDesc: '连接更多链上应用，统一完成授权与发起交易。',
        stakingTitle: '质押',
        stakingDesc: '把质押、收益和状态查看收进同一个入口。',
        cardTopupTitle: '卡片充值',
        cardTopupDesc: '为现实支付场景预留更轻量的资金入口和状态反馈。',
        moreTitle: '更多',
        moreDesc: '预留更多能力入口，方便后续继续扩展产品矩阵。',
        connectWallet: '连接钱包',
        connectBefore: '使用',
        connectAfter: '功能前，请先连接你的钱包',
        connectBtn: 'MetaMask 连接',
        cancel: '取消',
        featureSoon: '敬请期待，我们会在后续版本逐步开放。',
        featureClose: '我知道了',
        pendingActionMap: { omnigas: '全能服务费', transfer: '转账' } as Record<PendingAction, string>,
      }
    : {
        pageTitle: 'OmniGas Wallet',
        vaultTotal: 'Vault Balance',
        network: 'Sepolia Testnet',
        heroMeta: 'DApp transactions, staking, card top-ups, and more',
        heroFootnote: 'Built around a cleaner gasless wallet experience',
        heroStat1: 'Gasless',
        heroStat2: 'Multi-scene',
        heroStat3: 'Expanding',
        availableEyebrow: 'Available',
        availableTitle: 'Core Actions',
        coreTag: 'Core',
        omnigas: 'OmniGas Fee',
        omnigasSub: 'Gasless fee vault',
        transfer: 'Transfer',
        transferSub: 'Send assets fast',
        progressEyebrow: 'In Progress',
        progressTitle: 'Coming Next',
        progressDesc: 'Expanding into richer onchain and payment scenarios while keeping the same visual language.',
        comingSoon: 'Coming soon',
        swapTitle: 'Swap',
        swapDesc: 'The swap page is grouped into the upcoming section until both flow and visual polish are ready.',
        dappTitle: 'DApp Transactions',
        dappDesc: 'Connect more onchain apps with a more unified interaction flow.',
        stakingTitle: 'Staking',
        stakingDesc: 'Bring deposits, rewards, and status into one entry point.',
        cardTopupTitle: 'Card Top-ups',
        cardTopupDesc: 'Reserve a lighter funding entry for real-world payment scenarios.',
        moreTitle: 'More',
        moreDesc: 'Keep space for future capabilities as the product expands.',
        connectWallet: 'Connect Wallet',
        connectBefore: 'Please connect your wallet before using ',
        connectAfter: '',
        connectBtn: 'Connect MetaMask',
        cancel: 'Cancel',
        featureSoon: 'Coming soon. We will roll this out in a later version.',
        featureClose: 'Got it',
        pendingActionMap: { omnigas: 'OmniGas Fee', transfer: 'Transfer' } as Record<PendingAction, string>,
      }

  // ── 测试面板逻辑 ─────────────────────────────────────
  const refreshBalances = useCallback(async (address?: string) => {
    const addr = address || current
    if (!addr || !isSepoliaMode) return
    // 子账户时查询主账户的余额（主账户余额才是实际可用的）
    const queryAddr = (primaryAccount && current !== primaryAccount) ? primaryAccount : addr
    try {
      const res = await fetch(`/api/balance?address=${queryAddr}`)
      const data = await res.json()
      if (res.ok) {
        setBalances(data)
        setCookie(`ogbal_${addr.toLowerCase()}`, JSON.stringify(data))
      }
    } catch {}
  }, [current, isSepoliaMode, primaryAccount])

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

  // 刷新子账户链上授权状态
  const refreshSubAccountAuthStatus = useCallback(async () => {
    if (!primaryAccount || !vaultAddress || accounts.length <= 1) {
      setSubAccountAuthStatus({})
      setSubAccountAuthReady(true)
      return
    }

    setSubAccountAuthReady(false)
    const subs = accounts.filter(acc => acc.toLowerCase() !== primaryAccount.toLowerCase())
    const results: Record<string, boolean> = {}
    await Promise.all(subs.map(async sub => {
      try {
        const payer = await publicClient.readContract({
          address: vaultAddress,
          abi: VAULT_DELEGATE_ABI,
          functionName: 'payerOf',
          args: [sub as `0x${string}`],
        })
        results[sub.toLowerCase()] = (payer as string).toLowerCase() === primaryAccount.toLowerCase()
      } catch {
        results[sub.toLowerCase()] = false
      }
    }))
    setSubAccountAuthStatus(results)
    setSubAccountAuthReady(true)
  }, [accounts, primaryAccount])

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

  // 子账户授权状态变化时刷新
  useEffect(() => {
    if (!isSepoliaMode) return
    refreshSubAccountAuthStatus()
  }, [accounts, primaryAccount, isSepoliaMode, refreshSubAccountAuthStatus])

  // 面板打开时持续轮询
  useEffect(() => {
    if (!current || !isSepoliaMode || (!showTest && !showOmnigas)) return
    const timer = window.setInterval(() => { refreshBalances(current); refreshPayer(current) }, 5000)
    return () => window.clearInterval(timer)
  }, [current, isSepoliaMode, showTest, showOmnigas, refreshBalances, refreshPayer])

  const getWalletClient = useCallback(async () => {
    if (!window.ethereum) throw new Error('请先安装 MetaMask')

    // 显式请求账户权限，避免线上环境中点击授权没有拉起钱包确认。
    const accounts: string[] = await window.ethereum.request({ method: 'eth_requestAccounts' })
    if (!accounts || accounts.length === 0) throw new Error('无法从 MetaMask 获取账户')

    const chainId = await window.ethereum.request({ method: 'eth_chainId' })
    if (Number(chainId) !== CHAIN_ID) throw new Error(`请切换到 Sepolia (${CHAIN_ID})`)

    const normalizedCurrent = current.toLowerCase()
    const matchedAccount = current
      ? accounts.find((account) => account.toLowerCase() === normalizedCurrent)
      : accounts[0]

    if (current && !matchedAccount) {
      throw new Error('请先在 MetaMask 中切换到当前选中的账户')
    }

    return createWalletClient({
      account: (matchedAccount || accounts[0]) as `0x${string}`,
      chain: APP_CHAIN,
      transport: custom(window.ethereum),
    })
  }, [current])

  const onAuthorizeSubAccount = useCallback(async (subAccount: string) => {
    if (!current) {
      alert('请先连接钱包')
      return
    }
    if (!vaultAddress) {
      alert('未配置 Vault 合约地址')
      return
    }
    setAuthorizingSubAccount(subAccount)
    try {
      // 前置检查：子账户是否已绑定其他 payer（失败则跳过，让合约自己校验）
      try {
        const existingPayer = await publicClient.readContract({
          address: vaultAddress,
          abi: VAULT_DELEGATE_ABI,
          functionName: 'payerOf',
          args: [subAccount as `0x${string}`],
        }) as string
        const zero = '0x0000000000000000000000000000000000000000'
        if (existingPayer !== zero && existingPayer.toLowerCase() !== current.toLowerCase()) {
          alert(`该子账户已绑定其他代付方 ${existingPayer.slice(0, 10)}...\n需要子账户先解除绑定（detach）才能重新授权`)
          return
        }
      } catch {
        // RPC 查询失败，忽略前置检查，继续尝试授权
      }
      const wc = await getWalletClient()
      const hash = await wc.writeContract({
        account: current as `0x${string}`,
        address: vaultAddress,
        abi: VAULT_DELEGATE_ABI,
        functionName: 'authorize',
        args: [subAccount as `0x${string}`],
        gas: 80000n,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      await refreshSubAccountAuthStatus()
    } catch (e: any) {
      alert(e.shortMessage || e.message || '授权失败')
    } finally {
      setAuthorizingSubAccount('')
    }
  }, [current, getWalletClient, refreshSubAccountAuthStatus])

  const onAuthorize = useCallback(async () => {
    if (!current) { setMsg('请先连接钱包'); return }
    if (!delegateInput) { setMsg('请输入 wallet 地址'); return }
    if (!vaultAddress) { setMsg('未配置 Vault 合约地址'); return }
    setDelegating(true); setMsg(''); setTxHash('')
    try {
      const wc = await getWalletClient()
      const hash = await wc.writeContract({
        account: current as `0x${string}`,
        address: vaultAddress,
        abi: VAULT_DELEGATE_ABI,
        functionName: 'authorize',
        args: [delegateInput as `0x${string}`],
        gas: 80000n,
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
    if (!current) { setMsg('请先连接钱包'); return }
    if (!delegateInput) { setMsg('请输入 wallet 地址'); return }
    if (!vaultAddress) { setMsg('未配置 Vault 合约地址'); return }
    setDelegating(true); setMsg(''); setTxHash('')
    try {
      const wc = await getWalletClient()
      const hash = await wc.writeContract({
        account: current as `0x${string}`,
        address: vaultAddress,
        abi: VAULT_DELEGATE_ABI,
        functionName: 'revoke',
        args: [delegateInput as `0x${string}`],
        gas: 80000n,
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
    if (!current) { setMsg('请先连接钱包'); return }
    if (!vaultAddress) { setMsg('未配置 Vault 合约地址'); return }
    setDelegating(true); setMsg(''); setTxHash('')
    try {
      const wc = await getWalletClient()
      const hash = await wc.writeContract({
        account: current as `0x${string}`,
        address: vaultAddress,
        abi: VAULT_DELEGATE_ABI,
        functionName: 'detach',
        args: [],
        gas: 80000n,
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

  const selectCurrentAccount = useCallback((account: string) => {
    setCurrent(account)
    setSelectedAccount(account)
  }, [])

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
        gas: 80000n,
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
      const depositHash = await wc.writeContract({
        account: current as `0x${string}`,
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'deposit',
        args: [cfg.address, amountWei],
        gas: 120000n,
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
        body: JSON.stringify({ userAddress: current, chain: targetChain }),
      })
      if (!response.ok) throw new Error(data?.error || 'Faucet 失败')
      setMsg(`已领取 ${targetChain === 'base-sepolia' ? 'Base Sepolia ' : ''}USDC`)
      setTxHash(data.txHash)
      setTxChain(targetChain)
      refreshBalances(current)
    } catch (e: any) {
      setMsg(e.message || 'Faucet 失败')
    } finally {
      setClaiming(false)
    }
  }, [current, targetChain, refreshBalances])

  const onClaimBox = useCallback(async () => {
    if (!current) { setMsg('请先连接钱包'); return }
    setClaimingBox(true); setMsg(''); setTxHash('')
    try {
      const { response, data } = await fetchWithTimeout('/api/faucet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: current, token: 'box', chain: targetChain }),
      })
      if (!response.ok) throw new Error(data?.error || 'Faucet 失败')
      setMsg(`已领取 ${targetChain === 'base-sepolia' ? 'Base Sepolia ' : ''}BOX`)
      setTxHash(data.txHash)
      setTxChain(targetChain)
      refreshBalances(current)
    } catch (e: any) {
      setMsg(e.message || 'Faucet 失败')
    } finally {
      setClaimingBox(false)
    }
  }, [current, targetChain, refreshBalances])

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
        gas: 80000n,
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
      const depositHash = await wc.writeContract({
        account: current as `0x${string}`,
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'deposit',
        args: [selectedToken.address, selectedToken.amount],
        gas: 120000n,
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
    // 子账户 mint 前检测链上授权
    if (primaryAccount && current.toLowerCase() !== primaryAccount.toLowerCase()) {
      const isAuthorized = subAccountAuthStatus[current.toLowerCase()]
      if (!isAuthorized) {
        setMsg('❌ 当前子账户未获链上授权，请先切换到主账户完成授权')
        return
      }
    }
    setMinting(true); setMsg(''); setTxHash('')
    try {
      console.log('[onMint] 开始 Gasless Mint:', {
        userAddress: current,
        feeToken: selectedToken.address,
        targetChain,
      })

      const { response, data } = await fetchWithTimeout('/api/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: current, feeToken: selectedToken.address, targetChain }),
      })

      console.log('[onMint] API 响应:', { status: response.status, data })

      if (!response.ok) throw new Error(data?.error || 'Relay 失败')

      const chainLabel = targetChain === 'base-sepolia' ? 'Base Sepolia' : 'Sepolia'
      setMsg(`Gasless Mint 成功（${chainLabel}）`)
      setTxHash(data.txHash)
      setTxChain(targetChain)
      await refreshBalances(current)

      console.log('[onMint] 完成，txHash:', data.txHash)
    } catch (e: any) {
      console.error('[onMint] 错误:', e)
      setMsg(e.message || 'Mint 失败')
    } finally {
      setMinting(false)
    }
  }, [current, refreshBalances, selectedToken, targetChain, primaryAccount, subAccountAuthStatus])

  // ── JSX ──────────────────────────────────────────────
  return (
    <div className={[styles.phone, isLight ? styles.phoneLight : ''].join(' ')}>
      <Head>
        <title>{t.pageTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className={styles.inner}>
        {/* 顶部状态栏 */}
        <div className={styles.statusBar}>
          {current ? (
            <button className={styles.accountBtn} onClick={() => setShowSwitcher(true)} aria-label={locale === 'zh' ? '打开账户切换' : 'Open account switcher'}>
              <div className={styles.avatar} style={{ background: getAvatarColor(current) }}>
                {current.slice(2, 4).toUpperCase()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                <span className={styles.addrText}>{shortAddr(current)}</span>
                {primaryAccount && (
                  <span className={styles.accountRoleText}>
                    {current === primaryAccount ? '⭐ 主账户' : '💫 子账户'}
                  </span>
                )}
              </div>
              <span className={styles.chevron}>▾</span>
            </button>
          ) : (
            <span className={styles.notConnected}>未连接</span>
          )}

          <div className={styles.topActions}>
            <button
              className={styles.localeBtn}
              onClick={() => setLocale((prev) => (prev === 'zh' ? 'en' : 'zh'))}
              title={locale === 'zh' ? '切换到英文' : 'Switch to Chinese'}
              aria-label={locale === 'zh' ? '切换到英文' : 'Switch to Chinese'}
            >
              {locale === 'zh' ? '中' : 'EN'}
            </button>

            <button
              className={styles.themeBtn}
              onClick={cycleTheme}
              title={locale === 'zh'
                ? `当前：${themeMode === 'system' ? '跟随系统' : themeMode === 'dark' ? '深色' : '浅色'}`
                : `Current: ${themeMode === 'system' ? 'System' : themeMode === 'dark' ? 'Dark' : 'Light'}`}
              aria-label={locale === 'zh' ? '切换主题' : 'Toggle theme'}
            >
              {THEME_ICONS[themeMode]}
            </button>
          </div>
        </div>

        {/* 余额卡片 */}
        <section className={styles.balanceCard}>
          <div className={styles.balanceGlow} aria-hidden="true" />
          <div className={styles.balanceLabel}>{t.vaultTotal}</div>
          <div className={styles.balanceAmount}>
            ${current && isSepoliaMode
              ? (parseFloat(balances.usdcBalance || '0') + parseFloat(balances.boxBalance || '0')).toFixed(2)
              : '0.00'}
          </div>
          <div className={styles.networkBadge}>
            <span className={styles.networkDot} />
            {t.network}
          </div>
          <div className={styles.balanceMeta}>
            {t.heroMeta}
          </div>
          <div className={styles.balanceFootnote}>
            {t.heroFootnote}
          </div>
        </section>

        {/* 主账户：未授权子账户提醒 */}
        {isSepoliaMode && primaryAccount && current === primaryAccount && subAccountAuthReady && (() => {
          const unauthorizedSubs = accounts.filter(acc =>
            acc.toLowerCase() !== primaryAccount.toLowerCase() &&
            !subAccountAuthStatus[acc.toLowerCase()]
          )
          if (!unauthorizedSubs.length) return null
          return (
            <div className={styles.homeAuthNotice} onClick={() => { selectCurrentAccount(primaryAccount); setShowSwitcher(true) }}>
              ⚠️ {unauthorizedSubs.length} 个子账户未授权，点击前往授权 →
            </div>
          )
        })()}

        {/* 已上线功能 */}
        <section className={styles.homeSection}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionEyebrow}>{t.availableEyebrow}</div>
            <h2 className={styles.sectionTitle}>{t.availableTitle}</h2>
          </div>
          <span className={styles.sectionHint}>{t.coreTag}</span>
        </div>
        <div className={styles.actions}>
          <button className={styles.actionCard} onClick={() => handleAction('omnigas')}>
            <div className={styles.actionIcon} style={{ background: 'linear-gradient(135deg, #6366F1, #8B5CF6)' }}>⛽</div>
            <span className={styles.actionLabel}>{t.omnigas}</span>
            <span className={styles.actionSubLabel}>{t.omnigasSub}</span>
          </button>
          <button className={styles.actionCard} onClick={() => handleAction('transfer')}>
            <div className={styles.actionIcon} style={{ background: 'linear-gradient(135deg, #10B981, #3B82F6)' }}>↗</div>
            <span className={styles.actionLabel}>{t.transfer}</span>
            <span className={styles.actionSubLabel}>{t.transferSub}</span>
          </button>
        </div>
        </section>

        {/* 即将支持 */}
        <section className={styles.featureShowcase}>
          <div className={styles.showcaseHeader}>
            <div className={styles.sectionEyebrow}>{t.progressEyebrow}</div>
            <h2 className={styles.sectionTitle}>{t.progressTitle}</h2>
            <p className={styles.showcaseDesc}>{t.progressDesc}</p>
          </div>

          <div className={styles.featureGrid}>
            <button className={styles.featureCard} onClick={() => openComingSoon('swap')}>
              <div className={styles.featureCardTop}>
                <div className={styles.featureIcon} style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)' }}>⇄</div>
                <span className={styles.featureBadge}>{t.comingSoon}</span>
              </div>
              <strong className={styles.featureTitle}>{t.swapTitle}</strong>
              <span className={styles.featureDesc}>{t.swapDesc}</span>
            </button>

            <button className={styles.featureCard} onClick={() => openComingSoon('dapp')}>
              <div className={styles.featureCardTop}>
                <div className={styles.featureIcon} style={{ background: 'linear-gradient(135deg, #1D4ED8, #06B6D4)' }}>◈</div>
                <span className={styles.featureBadge}>{t.comingSoon}</span>
              </div>
              <strong className={styles.featureTitle}>{t.dappTitle}</strong>
              <span className={styles.featureDesc}>{t.dappDesc}</span>
            </button>

            <button className={styles.featureCard} onClick={() => openComingSoon('staking')}>
              <div className={styles.featureCardTop}>
                <div className={styles.featureIcon} style={{ background: 'linear-gradient(135deg, #0F766E, #14B8A6)' }}>◎</div>
                <span className={styles.featureBadge}>{t.comingSoon}</span>
              </div>
              <strong className={styles.featureTitle}>{t.stakingTitle}</strong>
              <span className={styles.featureDesc}>{t.stakingDesc}</span>
            </button>

            <button className={styles.featureCard} onClick={() => openComingSoon('cardTopup')}>
              <div className={styles.featureCardTop}>
                <div className={styles.featureIcon} style={{ background: 'linear-gradient(135deg, #EA580C, #F59E0B)' }}>▣</div>
                <span className={styles.featureBadge}>{t.comingSoon}</span>
              </div>
              <strong className={styles.featureTitle}>{t.cardTopupTitle}</strong>
              <span className={styles.featureDesc}>{t.cardTopupDesc}</span>
            </button>

            <button className={styles.featureCard} onClick={() => openComingSoon('more')}>
              <div className={styles.featureCardTop}>
                <div className={styles.featureIcon} style={{ background: 'linear-gradient(135deg, #7C3AED, #EC4899)' }}>⋯</div>
                <span className={styles.featureBadge}>{t.comingSoon}</span>
              </div>
              <strong className={styles.featureTitle}>{t.moreTitle}</strong>
              <span className={styles.featureDesc}>{t.moreDesc}</span>
            </button>
          </div>
        </section>
      </main>

      {/* 右下角测试入口 */}
      <button className={styles.testFab} onClick={() => { setShowTest(true); setMsg(''); setTxHash('') }} aria-label={locale === 'zh' ? '打开测试面板' : 'Open test panel'}>
        🧪
      </button>

      {/* 登录弹窗 */}
      {showLogin && (
        <div className={styles.overlay} onClick={() => setShowLogin(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalEmoji}>🔐</div>
            <h2 className={styles.modalTitle}>{t.connectWallet}</h2>
            <p className={styles.modalDesc}>
              {locale === 'zh'
                ? `${t.connectBefore}${t.pendingActionMap[pendingAction] || ''}${t.connectAfter}`
                : `${t.connectBefore}${t.pendingActionMap[pendingAction] || ''}`}
            </p>
            <button className={styles.connectBtn} onClick={connectWallet}>{t.connectBtn}</button>
            <button className={styles.cancelBtn} onClick={() => setShowLogin(false)}>{t.cancel}</button>
          </div>
        </div>
      )}

      {comingSoonFeature && (
        <div className={styles.overlayCenter} onClick={() => setComingSoonFeature('')}>
          <div className={styles.comingSoonModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.comingSoonGlow} />
            <div className={styles.comingSoonEyebrow}>{FEATURE_PREVIEWS[comingSoonFeature][locale].eyebrow}</div>
            <h3 className={styles.comingSoonTitle}>{FEATURE_PREVIEWS[comingSoonFeature][locale].title}</h3>
            <p className={styles.comingSoonDesc}>{FEATURE_PREVIEWS[comingSoonFeature][locale].description}</p>
            <div className={styles.comingSoonList}>
              {FEATURE_PREVIEWS[comingSoonFeature][locale].points.map((point) => (
                <div key={point} className={styles.comingSoonItem}>• {point}</div>
              ))}
            </div>
            <div className={styles.comingSoonNotice}>{t.featureSoon}</div>
            <button className={styles.comingSoonBtn} onClick={() => setComingSoonFeature('')}>
              {t.featureClose}
            </button>
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
              const isPrimary = acc.toLowerCase() === primaryAccount.toLowerCase()
              const isCurrent = acc === current
              const isAuthorized = subAccountAuthStatus[acc.toLowerCase()]
              const isAuthorizingThis = authorizingSubAccount === acc
              const canAuthorize = current.toLowerCase() === primaryAccount.toLowerCase()
              return (
                <div
                  key={acc}
                  className={[styles.accountItem, isCurrent ? styles.accountItemActive : ''].join(' ')}
                >
                  <button
                    style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    onClick={() => { selectCurrentAccount(acc); setShowSwitcher(false) }}
                  >
                    <div className={styles.accountAvatar} style={{ background: getAvatarColor(acc) }}>
                      {acc.slice(2, 4).toUpperCase()}
                    </div>
                    <div className={styles.accountInfo}>
                      <span className={styles.accountAddr}>{shortAddr(acc)}</span>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {isPrimary && <span className={styles.accountBadge}>⭐ 主账户</span>}
                        {isCurrent && <span className={styles.accountBadge}>当前</span>}
                        {!isPrimary && primaryAccount && isAuthorized && <span className={styles.authBadgeOk}>✓ 已授权</span>}
                        {!isPrimary && primaryAccount && subAccountAuthReady && !isAuthorized && <span className={styles.authBadgeWarn}>未授权</span>}
                      </div>
                    </div>
                  </button>
                  {isPrimary ? (
                    <button
                      className={styles.unsetPrimaryBtn}
                      onClick={() => { localStorage.removeItem('omngas_primary_account'); setPrimaryAccount('') }}
                    >
                      解除
                    </button>
                  ) : !primaryAccount ? (
                    <button
                      className={styles.setAsPrimaryBtn}
                      onClick={() => { setPrimaryAccountTo(acc); setShowSwitcher(false) }}
                    >
                      设为主账户
                    </button>
                  ) : subAccountAuthReady && !isAuthorized && canAuthorize ? (
                    <button
                      className={styles.authBtn}
                      onClick={() => onAuthorizeSubAccount(acc)}
                      disabled={!!authorizingSubAccount}
                    >
                      {isAuthorizingThis ? '授权中...' : '一键授权'}
                    </button>
                  ) : null}
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
              <button className={styles.testClose} onClick={() => setShowOmnigas(false)} aria-label={locale === 'zh' ? '关闭' : 'Close'}>✕</button>
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
                  <span className={styles.omnigasTokenSub}>
                    {primaryAccount && current !== primaryAccount ? '主账户' : 'Testnet'}
                  </span>
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
              <button className={styles.testClose} onClick={() => setShowOmnigas(false)} aria-label={locale === 'zh' ? '关闭' : 'Close'}>✕</button>
            </div>

            {/* 子账户提示：当前账户不是主账户时显示 */}
            {primaryAccount && current && current !== primaryAccount && (
              <div className={styles.subAccountNotice}>
                <span className={styles.subAccountNoticeText}>
                  💡 当前为子账户，充值请切换到主账户
                </span>
                <button
                  className={styles.subAccountSwitchBtn}
                  onClick={() => { selectCurrentAccount(primaryAccount); setShowOmnigas(false) }}
                >
                  切换
                </button>
              </div>
            )}

            {/* 主账户视图：显示未授权的子账户并提供一键授权 */}
            {primaryAccount && current === primaryAccount && subAccountAuthReady && (() => {
              const unauthorizedSubs = accounts.filter(acc =>
                acc.toLowerCase() !== primaryAccount.toLowerCase() &&
                !subAccountAuthStatus[acc.toLowerCase()]
              )
              if (!unauthorizedSubs.length) return null
              return (
                <div className={styles.unauthorizedNotice}>
                  <div className={styles.unauthorizedTitle}>⚠️ 以下子账户未完成链上授权</div>
                  {unauthorizedSubs.map(sub => (
                    <div key={sub} className={styles.unauthorizedRow}>
                      <span className={styles.unauthorizedAddr}>{sub.slice(0, 6)}...{sub.slice(-4)}</span>
                      <button
                        className={styles.authBtn}
                        onClick={() => onAuthorizeSubAccount(sub)}
                        disabled={!!authorizingSubAccount}
                      >
                        {authorizingSubAccount === sub ? '授权中...' : '授权'}
                      </button>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* 充值链接信息 */}
            <div className={styles.omnigasSection} style={{ marginBottom: '12px', padding: '12px', background: 'rgba(100, 150, 255, 0.1)', borderRadius: '8px', fontSize: '13px', color: '#666' }}>
              💡 充值仅支持 Sepolia 链
            </div>

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
                  {primaryAccount && current !== primaryAccount ? '主账户 ' : ''}Vault: {omnigasToken === 'USDC' ? balances.usdcBalance : balances.boxBalance} {omnigasToken}
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
            {primaryAccount && current !== primaryAccount ? (
              <button
                className={styles.omnigasDepositBtn}
                onClick={() => { selectCurrentAccount(primaryAccount); setShowOmnigas(false) }}
              >
                切换到主账户充值 →
              </button>
            ) : (
              <button className={styles.omnigasDepositBtn} onClick={onOmnigasDeposit} disabled={omnigasLoading}>
                {omnigasLoading ? '充值中...' : '充值'}
              </button>
            )}
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
              <button className={styles.testClose} onClick={() => setShowTest(false)} aria-label={locale === 'zh' ? '关闭' : 'Close'}>✕</button>
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

            {/* 目标链选择 */}
            {isSepoliaMode && gasToken !== 'ETH' && (
              <div className={styles.testSection}>
                <div className={styles.testLabel}>目标链（Mint 到哪条链）</div>
                <div className={styles.testRow}>
                  {([
                    { id: 'sepolia', label: 'Sepolia' },
                    { id: 'base-sepolia', label: 'Base Sepolia' },
                  ] as const).map((c) => (
                    <button
                      key={c.id}
                      className={[styles.testChip, targetChain === c.id ? styles.testChipActive : ''].join(' ')}
                      onClick={() => setTargetChain(c.id)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Vault 余额 */}
            {isSepoliaMode && current && (() => {
              const isSubAccount = primaryAccount && current !== primaryAccount
              const hasOnChainPayer = balances.effectivePayer && balances.effectivePayer.toLowerCase() !== current.toLowerCase()
              return (
                <div className={styles.testSection}>
                  <div className={styles.testLabel}>Vault 余额</div>
                  {isSubAccount && (
                    hasOnChainPayer ? (
                      <div className={styles.balanceSourceHint}>
                        来自主账户 {balances.effectivePayer.slice(0, 6)}...{balances.effectivePayer.slice(-4)}
                      </div>
                    ) : (
                      <div className={styles.balanceSourceWarn}>
                        ⚠️ 主账户未在链上授权，余额为 0
                      </div>
                    )
                  )}
                  <div className={styles.testBalances}>
                    <div className={styles.testBalRow}><span>USDC</span><strong>{balances.usdcBalance}</strong></div>
                    <div className={styles.testBalRow}><span>BOX</span><strong>{balances.boxBalance}</strong></div>
                    <div className={styles.testBalRow}><span>NFT</span><strong>{balances.nftCount}</strong></div>
                  </div>
                </div>
              )
            })()}

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
                    {claiming ? '领取中...' : `领取 ${targetChain === 'base-sepolia' ? 'Base ' : ''}USDC`}
                  </button>
                  <button
                    className={styles.testBtn}
                    onClick={onClaimBox}
                    disabled={claiming || claimingBox}
                  >
                    {claimingBox ? '领取中...' : `领取 ${targetChain === 'base-sepolia' ? 'Base ' : ''}BOX`}
                  </button>
                  <button
                    className={styles.testBtn}
                    onClick={onDeposit}
                    disabled={depositing || targetChain !== 'sepolia'}
                    title={targetChain !== 'sepolia' ? '充值只支持 Sepolia 链' : ''}
                  >
                    {depositing ? '充值中...' : `充值 ${selectedToken?.label || '—'} (Sepolia)`}
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
                href={`${txChain === 'base-sepolia' ? 'https://sepolia.basescan.org/tx/' : EXPLORER_TX}${txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                查看交易 ↗{txChain === 'base-sepolia' ? '（Base Sepolia）' : ''}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default WalletHome
