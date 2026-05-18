import { ethers } from 'ethers';
import type { TransactionConfig } from '../services/web3/types';
import type { ConnectedWallet } from '@privy-io/react-auth';

export interface WalletState {
  isConnected: boolean;
  evmWallet: ConnectedWallet | null;
  solanaWallet: ConnectedWallet | null;
  chainId: number | null;
}

export interface WalletContextType extends WalletState {
  connect: (chain: 'ethereum' | 'solana') => Promise<void>;
  disconnect: () => Promise<void>;
  copyAddress: (type: 'evm' | 'solana') => Promise<void>;
  removeWallet: (type: 'evm' | 'solana') => Promise<void>;
  switchChain: (chainId: number) => Promise<void>;
  sendTransaction: (config: TransactionConfig) => Promise<ethers.TransactionResponse>;
}
