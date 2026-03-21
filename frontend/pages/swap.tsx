import type { NextPage } from 'next'
import { useWeb3React } from '@web3-react/core'
import Head from 'next/head'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import { darkTheme, lightTheme } from '@uniswap/widgets'
import type { Theme, TokenInfo, SwapWidgetProps } from '@uniswap/widgets'

import '@uniswap/widgets/fonts.css'

import { connectors, useActiveProvider } from '../connectors'
import { JSON_RPC_URL } from '../constants'
import { THEME_ORDER, type ThemeMode, useThemeMode } from '../lib/theme'
import { useCallback, useEffect, useState } from 'react'

const SwapWidget = dynamic<SwapWidgetProps>(
  () => import('@uniswap/widgets').then((mod) => mod.SwapWidget),
  { ssr: false }
)

const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
const WIDGET_SUPPORTED_CHAIN_IDS = new Set([1, 3, 4, 5, 10, 42, 69, 137, 80001, 42161, 421611])
const WIDGET_TOKENS: TokenInfo[] = [
  {
    chainId: 1,
    address: WETH,
    name: 'Wrapped Ether',
    symbol: 'WETH',
    decimals: 18,
  },
  {
    chainId: 1,
    address: USDC,
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
  },
  {
    chainId: 1,
    address: UNI,
    name: 'Uniswap',
    symbol: 'UNI',
    decimals: 18,
  },
]

const SwapPage: NextPage = () => {
  const provider = useActiveProvider()
  const { account } = useWeb3React()
  const router = useRouter()
  const { themeMode, isLight, setThemeMode } = useThemeMode()
  const [providerChainId, setProviderChainId] = useState<number | null>(null)

  const widgetSupportsConnectedChain = providerChainId !== null && WIDGET_SUPPORTED_CHAIN_IDS.has(providerChainId)

  const widgetTheme: Theme = isLight
    ? {
        ...lightTheme,
        accent: '#24c26a',
        active: '#ecf8f1',
        container: '#f6f7fb',
        module: '#eef1f6',
        interactive: '#ffffff',
        outline: '#dde3ec',
        dialog: '#ffffff',
        primary: '#111827',
        secondary: '#6b7280',
        hint: '#9ca3af',
        onAccent: '#ffffff',
        success: '#24c26a',
        borderRadius: 1.4,
        fontFamily: "'Avenir Next', 'Segoe UI', sans-serif",
        fontFamilyCode: "'SF Mono', 'Courier New', monospace",
        tokenColorExtraction: false,
      }
    : {
        ...darkTheme,
        accent: '#24c26a',
        active: '#24382f',
        container: '#161924',
        module: '#1d2230',
        interactive: '#262c3a',
        outline: '#32394a',
        dialog: '#161924',
        primary: '#f9fafb',
        secondary: '#b7bfcc',
        hint: '#7d8596',
        onAccent: '#ffffff',
        success: '#24c26a',
        borderRadius: 1.4,
        fontFamily: "'Avenir Next', 'Segoe UI', sans-serif",
        fontFamilyCode: "'SF Mono', 'Courier New', monospace",
        tokenColorExtraction: false,
      }

  const connectMetaMask = useCallback(async () => {
    const [connector] = connectors[0]
    await connector.activate()
  }, [])

  useEffect(() => {
    let cancelled = false

    async function syncWallet() {
      if (!provider) {
        if (!cancelled) {
          setProviderChainId(null)
        }
        return
      }

      try {
        const [, network] = await Promise.all([provider.getSigner().getAddress(), provider.getNetwork()])

        if (!cancelled) {
          setProviderChainId(network.chainId)
        }
      } catch {
        if (!cancelled) {
          setProviderChainId(null)
        }
      }
    }

    syncWallet()

    return () => {
      cancelled = true
    }
  }, [provider])

  return (
    <>
      <Head>
        <title>Swap · OmniGas</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: isLight
            ? 'linear-gradient(180deg, #eef2ff 0%, #f8fafc 100%)'
            : 'linear-gradient(180deg, #0d1020 0%, #12162a 100%)',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '460px',
            borderRadius: '28px',
            padding: '16px',
            background: isLight ? 'rgba(255,255,255,0.76)' : 'rgba(18,22,39,0.78)',
            border: isLight ? '1px solid rgba(15,23,42,0.08)' : '1px solid rgba(255,255,255,0.08)',
            boxShadow: isLight
              ? '0 22px 60px rgba(99,102,241,0.14)'
              : '0 22px 60px rgba(0,0,0,0.42)',
            backdropFilter: 'blur(18px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              marginBottom: '12px',
            }}
          >
            <button
              onClick={() => router.back()}
              aria-label="Go back"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '999px',
                border: isLight ? '1px solid rgba(15,23,42,0.08)' : '1px solid rgba(255,255,255,0.1)',
                background: isLight ? 'rgba(15,23,42,0.04)' : 'rgba(255,255,255,0.06)',
                color: isLight ? '#111827' : '#f9fafb',
                fontSize: '18px',
                cursor: 'pointer',
              }}
            >
              ←
            </button>
            {account ? (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  borderRadius: '999px',
                  background: isLight ? 'rgba(15,23,42,0.05)' : 'rgba(255,255,255,0.08)',
                  border: isLight ? '1px solid rgba(15,23,42,0.08)' : '1px solid rgba(255,255,255,0.1)',
                  color: isLight ? '#111827' : '#f9fafb',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                {`${account.slice(0, 6)}...${account.slice(-4)}`}
                {!widgetSupportsConnectedChain && providerChainId !== null ? ' · Unsupported for widget' : ''}
              </div>
            ) : null}
          </div>

          <div
            className="swap-widget-shell"
            style={{
              borderRadius: '24px',
              overflow: 'hidden',
            }}
          >
            <SwapWidget
              jsonRpcEndpoint={JSON_RPC_URL}
              tokenList={WIDGET_TOKENS}
              provider={provider}
              locale="en-US"
              theme={widgetTheme}
              width="100%"
              onConnectWallet={connectMetaMask}
              defaultInputTokenAddress="NATIVE"
              defaultInputAmount="1"
              defaultOutputTokenAddress={UNI}
              brandedFooter={false}
            />
          </div>
        </div>
      </div>

      <style jsx global>{`
        .swap-widget-shell a[href='https://uniswap.org/'] {
          display: none !important;
        }
      `}</style>
    </>
  )
}

export default SwapPage
