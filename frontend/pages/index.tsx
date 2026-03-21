import type { NextPage } from 'next'
import Head from 'next/head'
import { FiGlobe } from 'react-icons/fi'
import { SupportedLocale, SUPPORTED_LOCALES, SwapWidget } from '@uniswap/widgets'

// ↓↓↓ Don't forget to import the widgets' fonts! ↓↓↓
import '@uniswap/widgets/fonts.css'
// ↑↑↑

import styles from '../styles/Home.module.css'
import omniGasStyles from '../styles/OmniGas.module.css'
import DocumentationCards from '../components/DocumentationCards'
import Web3Connectors from '../components/Web3Connectors'
import { useActiveProvider } from '../connectors'
import { sendGaslessTransaction } from '../lib/sendGaslessTransaction'
import { useCallback, useRef, useState } from 'react'
import { JSON_RPC_URL } from '../constants'

const TOKEN_LIST = 'https://gateway.ipfs.io/ipns/tokens.uniswap.org'
const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
const GAS_TOKENS = ['ETH', 'USDT', 'BOX'] as const
const DEMO_SEPOLIA_PRIVATE_KEY =
  '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356' as `0x${string}`

const Home: NextPage = () => {
  // When a user clicks "Connect your wallet" in the SwapWidget, this callback focuses the connectors.
  const connectors = useRef<HTMLDivElement>(null)
  const focusConnectors = useCallback(() => connectors.current?.focus(), [])

  // The provider to pass to the SwapWidget.
  // This is a Web3Provider (from @ethersproject) supplied by @web3-react; see ./connectors.ts.
  const provider = useActiveProvider()

  // The locale to pass to the SwapWidget.
  // This is a value from the SUPPORTED_LOCALES exported by @uniswap/widgets.
  const [locale, setLocale] = useState<SupportedLocale>('en-US')
  const [gasToken, setGasToken] = useState('ETH')
  const [txHash, setTxHash] = useState('')
  const [loading, setLoading] = useState(false)
  const onSelectLocale = useCallback((e) => setLocale(e.target.value), [])
  const onTestGaslessTransaction = useCallback(async () => {
    console.log('OmniGas gasless test started with token:', gasToken)
    setLoading(true)
    setTxHash('')

    try {
      const hash = await sendGaslessTransaction(DEMO_SEPOLIA_PRIVATE_KEY)
      console.log('OmniGas gasless transaction hash:', hash)
      setTxHash(hash)
    } catch (error) {
      console.error('OmniGas gasless transaction failed:', error)
    } finally {
      setLoading(false)
    }
  }, [gasToken])

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
                  <button
                    type="button"
                    className={omniGasStyles.actionButton}
                    onClick={onTestGaslessTransaction}
                    disabled={loading}
                  >
                    {loading ? 'Gasless 测试中...' : '测试 Gasless 交易'}
                  </button>
                  {txHash ? (
                    <a
                      className={omniGasStyles.successLink}
                      href={`https://sepolia.etherscan.io/tx/${txHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      交易成功：https://sepolia.etherscan.io/tx/{txHash}
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
