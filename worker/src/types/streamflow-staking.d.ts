declare module '@streamflow/staking' {
  import type { PublicKey, Keypair } from '@solana/web3.js'

  export class SolanaStakingClient {
    constructor(options: { clusterUrl: string; cluster?: string })
    createRewardPool(params: Record<string, unknown>, options: { invoker: Keypair }): Promise<{
      metadataId: { toBase58(): string }
      txId: string
    }>
    fundPool(params: Record<string, unknown>, options: { invoker: Keypair }): Promise<{
      txId: string
    }>
  }
}
