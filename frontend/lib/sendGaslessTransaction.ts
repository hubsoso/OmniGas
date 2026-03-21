// @ts-nocheck
import { toSimpleSmartAccount } from 'permissionless/accounts'
import { createSmartAccountClient } from 'permissionless'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { http } from 'viem'
import {
  bundlerClient,
  ENTRY_POINT,
  paymasterClient,
  PIMLICO_API_KEY,
  PIMLICO_URL,
  publicClient,
  SIMPLE_ACCOUNT_FACTORY_ADDRESS,
} from './paymasterClient'

export async function sendGaslessTransaction(privateKey: `0x${string}`) {
  if (!PIMLICO_API_KEY || PIMLICO_API_KEY === 'REPLACE_WITH_PIMLICO_API_KEY') {
    throw new Error('Missing NEXT_PUBLIC_PIMLICO_API_KEY')
  }

  const owner = privateKeyToAccount(privateKey)

  const smartAccount = await toSimpleSmartAccount({
    client: publicClient,
    owner,
    factoryAddress: SIMPLE_ACCOUNT_FACTORY_ADDRESS,
    entryPoint: ENTRY_POINT,
  })

  const smartAccountClient = createSmartAccountClient({
    account: smartAccount,
    client: publicClient,
    chain: sepolia,
    bundlerTransport: http(PIMLICO_URL),
    paymaster: paymasterClient,
  })

  console.log('OmniGas bundler client ready:', bundlerClient.type)

  const txHash = await smartAccountClient.sendTransaction({
    to: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
    value: 0n,
    data: '0x',
  })

  return txHash
}
