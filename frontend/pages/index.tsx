import dynamic from 'next/dynamic'

const WalletHomePage = dynamic(() => import('../components/WalletHomePage'), {
  ssr: false,
})

export default WalletHomePage
