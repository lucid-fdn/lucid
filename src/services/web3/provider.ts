import { ethers } from 'ethers';
import { Web3Config, TransactionConfig } from './types';
import { monitoring } from '../../lib/monitoring';

export class Web3Service {
  private static instance: Web3Service;
  private providers: Map<number, ethers.BrowserProvider> = new Map();
  private configs: Map<number, Web3Config> = new Map();

  private constructor() {}

  static getInstance(): Web3Service {
    if (!Web3Service.instance) {
      Web3Service.instance = new Web3Service();
    }
    return Web3Service.instance;
  }

  addNetwork(config: Web3Config): void {
    const provider = new ethers.BrowserProvider(window.ethereum);
    this.providers.set(config.chainId, provider);
    this.configs.set(config.chainId, config);
  }

  async getProvider(chainId: number): Promise<ethers.BrowserProvider> {
    const provider = this.providers.get(chainId);
    if (!provider) {
      throw new Error(`No provider configured for chain ID ${chainId}`);
    }
    return provider;
  }

  async sendTransaction(
    chainId: number,
    config: TransactionConfig
  ): Promise<ethers.TransactionResponse> {
    try {
      const provider = await this.getProvider(chainId);
      const signer = await provider.getSigner();
      return await signer.sendTransaction(config);
    } catch (error) {
      monitoring.captureError(error as Error, {
        chainId,
        config,
        service: 'Web3Service',
      });
      throw error;
    }
  }
} 