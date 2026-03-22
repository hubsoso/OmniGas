import { fallback, http } from 'viem'

const RPC_TIMEOUT_MS = 8_000

const DEFAULT_SEPOLIA_RPC_URLS = [
  process.env.NEXT_PUBLIC_RPC_URL,
  process.env.RPC_URL,
  'https://ethereum-sepolia-rpc.publicnode.com',
  'https://rpc.sepolia.org',
  'https://1rpc.io/sepolia',
].filter(Boolean) as string[]

const DEFAULT_MAINNET_RPC_URLS = [
  process.env.NEXT_PUBLIC_WIDGET_RPC_URL,
  process.env.NEXT_PUBLIC_MAINNET_RPC_URL,
  'https://ethereum.publicnode.com',
].filter(Boolean) as string[]

const DEFAULT_BASE_SEPOLIA_RPC_URLS = [
  process.env.BASE_SEPOLIA_RPC_URL,
  'https://sepolia.base.org',
  'https://base-sepolia-rpc.publicnode.com',
].filter(Boolean) as string[]

function unique(urls: string[]) {
  return Array.from(new Set(urls.map((url) => url.trim()).filter(Boolean)))
}

export const SEPOLIA_RPC_URLS = unique(DEFAULT_SEPOLIA_RPC_URLS)
export const MAINNET_RPC_URLS = unique(DEFAULT_MAINNET_RPC_URLS)
export const BASE_SEPOLIA_RPC_URLS = unique(DEFAULT_BASE_SEPOLIA_RPC_URLS)

export function createFallbackTransport(urls: string[]) {
  return fallback(
    urls.map((url) =>
      http(url, {
        timeout: RPC_TIMEOUT_MS,
        retryCount: 0,
      })
    )
  )
}
