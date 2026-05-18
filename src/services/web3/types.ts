export interface Web3Config {
  rpcUrl: string;
  chainId: number;
  networkName: string;
}

export interface TransactionConfig {
  to: string;
  value?: bigint;
  data?: string;
  gasLimit?: bigint;
} 