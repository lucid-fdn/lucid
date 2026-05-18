'use client'

import { useEffect } from 'react'
import { useWallets } from '@privy-io/react-auth'

type RuntimeWallet = {
  walletClientType?: string
  type?: string
  address?: string
}

export function PrivyWalletAddressProbe({ onAddress }: { onAddress: (address: string) => void }) {
  const { wallets } = useWallets()

  useEffect(() => {
    const solanaWallet = (wallets as RuntimeWallet[] | undefined)?.find(
      (wallet) => wallet.walletClientType === 'privy' && wallet.type === 'solana',
    )
    onAddress(solanaWallet?.address ?? '')
  }, [onAddress, wallets])

  return null
}
