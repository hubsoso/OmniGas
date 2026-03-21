// @ts-nocheck
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import { createPublicClient, http } from 'viem'
import { entryPoint06Address } from 'viem/account-abstraction'
import { sepolia } from 'viem/chains'

export const PIMLICO_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY || ''
export const PIMLICO_URL = `https://api.pimlico.io/v2/sepolia/rpc?apikey=${PIMLICO_API_KEY}`
export const SIMPLE_ACCOUNT_FACTORY_ADDRESS = '0x9406Cc6185a346906296840746125a0E44976454'
export const ENTRY_POINT = {
  address: entryPoint06Address,
  version: '0.6' as const,
}

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(),
})

export const paymasterClient = createPimlicoClient({
  chain: sepolia,
  transport: http(PIMLICO_URL),
  entryPoint: ENTRY_POINT,
})

export const bundlerClient = createPimlicoClient({
  chain: sepolia,
  transport: http(PIMLICO_URL),
  entryPoint: ENTRY_POINT,
})
