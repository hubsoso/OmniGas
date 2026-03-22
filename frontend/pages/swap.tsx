import dynamic from 'next/dynamic'

const SwapPage = dynamic(() => import('../components/SwapPage'), {
  ssr: false,
})

export default SwapPage
