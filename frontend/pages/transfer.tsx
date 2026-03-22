import dynamic from 'next/dynamic'

const TransferPage = dynamic(() => import('../components/TransferPage'), {
  ssr: false,
})

export default TransferPage
