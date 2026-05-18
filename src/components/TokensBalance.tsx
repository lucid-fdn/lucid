"use client";

import React from "react";
import Image from "next/image";
import { useWalletTotals, Wallet } from "@/hooks/useWalletTotals";
import SkeletonTitle from "./SkeletonTitle";
import { ConnectedWallet } from '@privy-io/react-auth';
import { maskWalletAddress, redactLogMetadata, summarizeError } from "@/lib/logging/safe-log";

const DEBUG_TOKEN_BALANCE = process.env.NEXT_PUBLIC_DEBUG_WALLET_PROVIDER === 'true';

function debugTokenBalance(message: string, metadata?: Record<string, unknown>) {
  if (!DEBUG_TOKEN_BALANCE) return;
  console.debug(`[TokensBalance] ${message}`, redactLogMetadata(metadata));
}

function formatToken(value: number): string {
  return value % 1 === 0 ? value.toFixed(0) : value.toFixed(2);
}

interface TokensBalanceProps {
  evmWallet: ConnectedWallet | null;
  solanaWallet: ConnectedWallet | null;
}

export const TokensBalance = ({ evmWallet, solanaWallet }: TokensBalanceProps) => {
  // Transform wallets into the format expected by useWalletTotals
  const wallets = React.useMemo(() => {
    const validWallets: Wallet[] = [];
    
    debugTokenBalance('Processing wallets', {
      evmWallet: evmWallet ? {
        address: maskWalletAddress(evmWallet.address),
        chainId: evmWallet.chainId
      } : null,
      solanaWallet: solanaWallet ? {
        address: maskWalletAddress(solanaWallet.address),
        chainId: solanaWallet.chainId
      } : null
    });
    
    if (evmWallet) {
      debugTokenBalance('Adding Ethereum wallet', { address: maskWalletAddress(evmWallet.address) });
      validWallets.push({
        address: evmWallet.address,
        type: "ethereum",
        chainId: evmWallet.chainId // Use actual chain ID from wallet
      });
    }
    
    if (solanaWallet) {
      debugTokenBalance('Adding Solana wallet', { address: maskWalletAddress(solanaWallet.address) });
      validWallets.push({
        address: solanaWallet.address,
        type: "solana"
      });
    }
    
    debugTokenBalance('Final wallets array', {
      count: validWallets.length,
      wallets: validWallets.map((wallet) => ({
        ...wallet,
        address: maskWalletAddress(wallet.address),
      })),
    });
    return validWallets;
  }, [evmWallet, solanaWallet]);

  const { data, isLoading, error } = useWalletTotals(wallets);
  
  // Log balance fetching results
  React.useEffect(() => {
    if (data) {
      debugTokenBalance('Balance data received', {
        walletCount: Object.keys(data).length,
      });
    }
    if (error) {
      debugTokenBalance('Balance fetch error', summarizeError(error));
    }
    if (isLoading) {
      debugTokenBalance('Loading balances');
    }
  }, [data, error, isLoading]);

  // If no wallets, return null
  if (!evmWallet && !solanaWallet) {
    return null;
  }

  // Compute totals
  let totalEth = 0;
  let totalSol = 0;
  let totalUsdc = 0;

  if (data) {
    if (evmWallet) {
      const bal = data[evmWallet.address];
      if (bal) {
        totalEth += parseFloat(bal.native);
        totalUsdc += parseFloat(bal.usdc);
      }
    }
    if (solanaWallet) {
      const bal = data[solanaWallet.address];
      if (bal) {
        totalSol += parseFloat(bal.native);
        totalUsdc += parseFloat(bal.usdc);
      }
    }
  }

  return (
    <div className="col-span-full supports-[grid-template-columns:subgrid]:grid supports-[grid-template-columns:subgrid]:grid-cols-[auto_1fr_1.5rem_0.5rem_auto]">
      <div className="group cursor-default rounded-lg px-3.5 py-2.5 focus:outline-hidden sm:px-3 sm:py-1.5 text-left text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white forced-colors:text-[CanvasText] data-focus:bg-blue-500 data-focus:text-white data-disabled:opacity-50 forced-color-adjust-none forced-colors:data-focus:bg-[Highlight] forced-colors:data-focus:text-[HighlightText] forced-colors:data-focus:*:data-[slot=icon]:text-[HighlightText] col-span-full grid grid-cols-[auto_1fr_1.5rem_0.5rem_auto] items-center supports-[grid-template-columns:subgrid]:grid-cols-subgrid *:data-[slot=icon]:col-start-1">
        <Image
          src="/logos/icon/ethereum.svg"
          alt="ETH"
          width={20}
          height={20}
          style={{ marginRight: "8px" }}
        />
        <span>
          {isLoading ? (
            <SkeletonTitle />
          ) : (
            formatToken(totalEth)
          )}
        </span>
      </div>
      <div className="group cursor-default rounded-lg px-3.5 py-2.5 focus:outline-hidden sm:px-3 sm:py-1.5 text-left text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white forced-colors:text-[CanvasText] data-focus:bg-blue-500 data-focus:text-white data-disabled:opacity-50 forced-color-adjust-none forced-colors:data-focus:bg-[Highlight] forced-colors:data-focus:text-[HighlightText] forced-colors:data-focus:*:data-[slot=icon]:text-[HighlightText] col-span-full grid grid-cols-[auto_1fr_1.5rem_0.5rem_auto] items-center supports-[grid-template-columns:subgrid]:grid-cols-subgrid *:data-[slot=icon]:col-start-1">
        <Image
          src="/logos/icon/solana.svg"
          alt="SOL"
          width={20}
          height={20}
          style={{ marginRight: "8px" }}
        />
        <span>
          {isLoading ? (
            <SkeletonTitle />
          ) : (
            formatToken(totalSol)
          )}
        </span>
      </div>
      <div className="group cursor-default rounded-lg px-3.5 py-2.5 focus:outline-hidden sm:px-3 sm:py-1.5 text-left text-base/6 text-zinc-950 sm:text-sm/6 dark:text-white forced-colors:text-[CanvasText] data-focus:bg-blue-500 data-focus:text-white data-disabled:opacity-50 forced-color-adjust-none forced-colors:data-focus:bg-[Highlight] forced-colors:data-focus:text-[HighlightText] forced-colors:data-focus:*:data-[slot=icon]:text-[HighlightText] col-span-full grid grid-cols-[auto_1fr_1.5rem_0.5rem_auto] items-center supports-[grid-template-columns:subgrid]:grid-cols-subgrid *:data-[slot=icon]:col-start-1">
        <Image
          src="/logos/icon/usdc.svg"
          alt="USDC"
          width={20}
          height={20}
          style={{ marginRight: "8px" }}
        />
        <span>
          {isLoading ? (
            <SkeletonTitle />
          ) : (
            formatToken(totalUsdc)
          )}
        </span>
      </div>
    </div>
  );
};

export default TokensBalance;
