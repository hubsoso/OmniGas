import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { useEffect } from 'react'
import { Web3ReactProvider } from '@web3-react/core'

import { connectors } from '../connectors'

function EagerConnection() {
  useEffect(() => {
    connectors.forEach(([connector]) => {
      void connector.connectEagerly?.()
    })
  }, [])

  return null
}

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <Web3ReactProvider connectors={connectors}>
      <EagerConnection />
      <Component {...pageProps} />
    </Web3ReactProvider>
  )
}

export default MyApp
