import { useWallet } from './WalletProvider';
import { shortenAddress } from '@/utils/address';

// Wallet information display
export const WalletDetails = () => {
  const { evmWallet, solanaWallet, chainId, isConnected } = useWallet();
  const address = evmWallet?.address || solanaWallet?.address;

  if (!isConnected) return null;

  return (
    <div className="flex flex-col gap-2 p-4 rounded-lg bg-muted">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Address</span>
        <span className="font-mono">{shortenAddress(address)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Network</span>
        <span>{chainId}</span>
      </div>
    </div>
  );
}; 