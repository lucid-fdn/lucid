"use client";

import { UseQueryResult } from "@tanstack/react-query";
import { useQueryWithCache } from './useQueryWithCache';
import { ethers } from "ethers";
import { Connection, PublicKey } from "@solana/web3.js";
import { CacheKey } from '../lib/cache/config';

/**
 * Wallet type
 */
export interface Wallet {
  address: string;
  type: "ethereum" | "solana";
  chainId?: string;
}

/**
 * Each wallet's balances.
 */
export interface WalletBalances {
  usdc: string;   // USDC balance (6 decimals)
  native: string; // Native token balance (AVAX for Ethereum, SOL for Solana)
}

/**
 * Fetch wallet totals and return an object mapping wallet addresses to balances.
 */
async function fetchWalletTotals(wallets: Wallet[]): Promise<Record<string, WalletBalances>> {
  const newBalances: Record<string, WalletBalances> = {};

  // Separate Ethereum vs. Solana wallets
  // Ethereum wallets have addresses starting with 0x
  // Solana wallets have Base58-encoded addresses
  const ethereumWallets = wallets.filter(
    (w) => w.type === "ethereum" || w.address.startsWith("0x")
  );
  const solanaWallets = wallets.filter(
    (w) => w.type === "solana" && !w.address.startsWith("0x")
  );

  // Ethereum (ETH) fetch
  if (ethereumWallets.length > 0) {
    const provider = new ethers.JsonRpcProvider("https://eth.llamarpc.com");
    const USDC_ABI = ["function balanceOf(address) view returns (uint256)"];
    // Ethereum USDC contract address
    const usdcContract = new ethers.Contract(
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      USDC_ABI,
      provider
    );

    const results = await Promise.all(
      ethereumWallets.map(async (wallet) => {
        try {
          const usdcBigInt = await usdcContract.balanceOf(wallet.address);
          const usdcFormatted = ethers.formatUnits(usdcBigInt, 6);

          const nativeBigInt = await provider.getBalance(wallet.address);
          const nativeFormatted = ethers.formatEther(nativeBigInt);

          return {
            address: wallet.address,
            balances: { usdc: usdcFormatted, native: nativeFormatted },
          };
        } catch (_error) {
          return {
            address: wallet.address,
            balances: { usdc: "0.000000", native: "0.000000" },
          };
        }
      })
    );

    results.forEach(({ address, balances: bal }) => {
      newBalances[address] = bal;
    });
  }

  // Solana fetch
  if (solanaWallets.length > 0) {
    const connection = new Connection(
      "https://delicate-blissful-wind.solana-mainnet.quiknode.pro/2747d382096f3c862c1f7afd0c1558123cc70ea9/",
      "confirmed"
    );
    const solUsdcMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

    const results = await Promise.all(
      solanaWallets.map(async (wallet) => {
        try {
          const owner = new PublicKey(wallet.address.trim());

          let usdcBalance = 0;

          const response = await connection.getParsedTokenAccountsByOwner(owner, { mint: solUsdcMint });

          if (response.value.length > 0) {
            response.value.forEach((tokenAccount) => {
              const parsedInfo = tokenAccount.account.data.parsed.info;
              const tokenAmount = parsedInfo.tokenAmount;
              const uiAmount =
                tokenAmount.uiAmount ??
                parseFloat(tokenAmount.amount) / Math.pow(10, tokenAmount.decimals);
              usdcBalance += uiAmount;
            });
          }

          const lamports = await connection.getBalance(owner);
          const solBalance = lamports / 1e9;

          const result = {
            address: wallet.address,
            balances: {
              usdc: usdcBalance.toFixed(6),
              native: solBalance.toFixed(6),
            },
          };

          return result;
        } catch (error) {
          throw error;
        }
      })
    );

    results.forEach(({ address, balances: bal }) => {
      newBalances[address] = bal;
    });
  }

  // Fallback for wallets with no data
  wallets.forEach((wallet) => {
    if (!newBalances[wallet.address]) {
      newBalances[wallet.address] = { usdc: "0.000000", native: "0.000000" };
    }
  });

  return newBalances;
}

/**
 * React Query hook that returns wallet totals.
 */
export function useWalletTotals(wallets: Wallet[]): UseQueryResult<Record<string, WalletBalances>, Error> {
  return useQueryWithCache({
    cacheKey: 'wallet_totals' as CacheKey,
    queryKey: ['walletTotals', wallets],
    queryFn: async () => {
      if (!wallets.length) {
        return {};
      }
      return fetchWalletTotals(wallets);
    },
    enabled: wallets.length > 0,
  });
}
