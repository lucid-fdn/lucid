// Core wallet functionality
import { createContext, useContext, useCallback, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast'
import type { WalletContextType } from '@/types/wallet';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { monitoring } from '../../lib/monitoring';
import { useRouter, usePathname } from 'next/navigation';
import { notificationCopy } from '@/lib/notifications/copy'
import { maskIdentifier, maskWalletAddress, redactLogMetadata } from '@/lib/logging/safe-log';


const WalletContext = createContext<WalletContextType | null>(null);
const DEBUG_WALLET_PROVIDER = process.env.NEXT_PUBLIC_DEBUG_WALLET_PROVIDER === 'true';

function debugWallet(message: string, metadata?: Record<string, unknown> | null) {
  if (!DEBUG_WALLET_PROVIDER) return;
  console.debug(`[WalletProvider] ${message}`, redactLogMetadata(metadata ?? undefined));
}

function summarizeWallet(wallet?: {
  address?: string | null
  chainId?: string | number | null
  walletClientType?: string | null
  connectorType?: string | null
} | null) {
  if (!wallet) return null;
  return {
    address: maskWalletAddress(wallet.address),
    chainId: wallet.chainId,
    walletClientType: wallet.walletClientType,
    connectorType: wallet.connectorType,
  };
}

type ChainConfig = {
  ethereum: {
    name: 'Ethereum';
    chainId: 1;
    walletList: string[];
  };
  solana: {
    name: 'Solana';
    walletList: string[];
  };
};

// Static configuration outside component to prevent recreation
const CHAIN_CONFIG: ChainConfig = {
  ethereum: {
    name: 'Ethereum',
    chainId: 1,
    walletList: ['metamask', 'rainbow', 'coinbase_wallet', 'wallet_connect']
  },
  solana: {
    name: 'Solana',
    walletList: ['phantom']
  }
};

// Connection constants

/**
 * Hook to get Privy wallets via static imports.
 * WalletProvider only mounts when isWeb3Enabled() is true (gated in providers.tsx),
 * so these hooks are always called — no conditional branches, no hook order issues.
 */
function usePrivyWalletState() {
  const { connectWallet, getAccessToken } = usePrivy()
  const { wallets: connectedWallets } = useWallets()
  return { connectedWallets, connectWallet, getAccessToken }
}

export const WalletProvider = ({ children }: { children: React.ReactNode }) => {
  const { ready, isAuthenticated: authenticated, logout, user } = useAuth();
  const { connectedWallets, connectWallet, getAccessToken } = usePrivyWalletState();
  const toast = useToast();
  const hasLoggedIn = useRef(false);
  const router = useRouter();
  const pathname = usePathname();

  // Use helpers to select wallets from connected wallets
  // Note: Using connectedWallets for actual operations (they have methods)
  // Using helpers for filtering logic (cleaner, testable)
  const evmWallet = useMemo(() => {
    if (!connectedWallets) return null;

    // Find EVM wallet using helper logic
    const wallet = connectedWallets.find((w) => {
      const isEthereumChain = w.chainId?.toString().startsWith('eip155:')
      const hasEthAddress = w.address?.startsWith('0x') && w.address?.length === 42
      return isEthereumChain && hasEthAddress
    });

    debugWallet('EVM wallet selected', summarizeWallet(wallet));

    return wallet || null;
  }, [connectedWallets]);

  const solanaWallet = useMemo(() => {
    if (!connectedWallets) return null;

    // Find Solana wallet using helper logic
    const wallet = connectedWallets.find((w) => {
      const isSolanaChain = w.chainId?.toString().includes('solana')
      const hasSolanaAddress = w.address && !w.address.startsWith('0x') &&
                              w.address.length >= 32 && w.address.length <= 44
      return isSolanaChain && hasSolanaAddress
    });

    debugWallet('Solana wallet selected', summarizeWallet(wallet));

    return wallet || null;
  }, [connectedWallets]);

  // Debug: Log wallet state
  useEffect(() => {
    debugWallet('Wallet state', {
      hasUser: !!user,
      connectedWalletsCount: connectedWallets?.length || 0,
      hasEVM: !!evmWallet,
      hasSolana: !!solanaWallet,
      evmAddress: maskWalletAddress(evmWallet?.address),
      solanaAddress: maskWalletAddress(solanaWallet?.address),
    });
  }, [user, connectedWallets, evmWallet, solanaWallet]);

  // Primary wallet for backward compatibility (used in auth flow)
  const primaryWallet = useMemo(() => evmWallet || solanaWallet, [evmWallet, solanaWallet]);

  const isConnected = useMemo(() =>
    authenticated && (!!evmWallet || !!solanaWallet),
    [authenticated, evmWallet, solanaWallet]
  );

  // Memoize chainId to prevent unnecessary re-renders
  const chainId = useMemo(() =>
    evmWallet?.chainId ? Number(evmWallet.chainId) : null,
    [evmWallet?.chainId]
  );

  // Handle authentication state changes
  useEffect(() => {
    const handleAuthentication = async () => {
      // Only proceed if auth is ready and we're authenticated
      if (!ready || !authenticated || !user) {
        monitoring.logWallet('Authentication not ready', 'evm', {
          ready,
          authenticated,
          hasUser: !!user
        });
        return;
      }

      // Wait for wallet to be available
      if (!hasLoggedIn.current) {
        try {
          if (!primaryWallet) {
            monitoring.logWallet('No primary wallet available, waiting...', 'evm', {
              walletsCount: connectedWallets?.length || 0,
              wallets: connectedWallets?.map((w) => ({ address: maskWalletAddress(w.address) }))
            });
            return; // Don't set hasLoggedIn to false, just wait for wallet
          }

          monitoring.logWallet('Starting backend authentication', 'evm', {
            walletAddress: maskWalletAddress(primaryWallet.address),
            chainId: primaryWallet.chainId,
            userId: maskIdentifier(user.id)
          });

          hasLoggedIn.current = true;  // Set flag before making the request

          // Pull a fresh Privy access token directly from the SDK so we don't
          // depend on the privy-token cookie being present (it can rotate or
          // be evicted while the SDK still considers the user authenticated).
          const accessToken = await getAccessToken();

          // Call our backend login endpoint
          const response = await fetch('/api/auth/privy-login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: JSON.stringify({
              privyId: user.id,
              walletAddress: primaryWallet.address
            }),
            credentials: 'include'
          });

          if (!response.ok) {
            hasLoggedIn.current = false;  // Reset flag if login fails
            const errorText = await response.text();
            monitoring.captureError(new Error('Failed to login with backend'), {
              context: 'WalletProvider.handleAuthentication',
              status: response.status,
              statusText: response.statusText,
              errorText,
              walletAddress: maskWalletAddress(primaryWallet.address)
            });
            throw new Error('Failed to login with backend');
          }

          const data = await response.json();
          const isNewUser = data.isNewUser;

          monitoring.logWallet('Backend authentication successful', 'evm', {
            walletAddress: maskWalletAddress(primaryWallet.address),
            isNewUser
          });

          // Redirect based on whether user is new or returning
          if (pathname === '/login' || pathname === '/') {
            if (isNewUser) {
              debugWallet('New user detected - redirecting to onboarding');
              router.push('/onboarding/profile');
            } else {
              debugWallet('Returning user - redirecting to dashboard');
              router.push('/dashboard');
            }
          }
        } catch (error) {
          monitoring.captureError(error as Error, {
            context: 'WalletProvider.handleAuthentication',
            walletAddress: maskWalletAddress(primaryWallet?.address)
          });
          toast.error("Login failed", "Failed to complete the login process. Please try again.");
        }
      }
    };

    handleAuthentication();
  }, [ready, authenticated, user, primaryWallet, router, pathname, connectedWallets, toast, getAccessToken]);

  const connect = useCallback(async (desiredChain: keyof ChainConfig) => {
    try {
      const config = CHAIN_CONFIG[desiredChain];
      debugWallet(`Starting ${desiredChain} connection`);
      debugWallet('Connection config', {
        chain: desiredChain,
        walletList: config.walletList,
        currentWallets: connectedWallets?.length || 0
      });

      monitoring.logWallet(`Starting ${desiredChain} wallet connection`, desiredChain === 'solana' ? 'solana' : 'evm', {
        config,
        walletList: config.walletList
      });

      debugWallet('Calling connectWallet');

      // Simply open connect wallet
      await (connectWallet as (opts?: { walletList?: string[] }) => Promise<void>)({
        walletList: config.walletList
      });

      debugWallet('connectWallet completed');
      debugWallet('Wallets after connection', {
        wallets: connectedWallets?.map((w) => ({
          address: maskWalletAddress(w.address),
          chainId: w.chainId,
          walletClientType: w.walletClientType,
        })),
      });

      monitoring.logWallet(`${desiredChain} wallet connection successful`, desiredChain === 'solana' ? 'solana' : 'evm');
    } catch (error) {
      debugWallet(`Error connecting ${desiredChain}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      monitoring.captureError(error as Error, {
        context: 'WalletProvider.connect',
        desiredChain,
        config: CHAIN_CONFIG[desiredChain]
      });
      throw error;
    }
  }, [connectWallet, connectedWallets]);

  const disconnect = useCallback(async () => {
    try {
      hasLoggedIn.current = false;  // Reset flag when logging out

      // Disconnect wallet at browser level BEFORE logout
      if (primaryWallet) {
        try {
          await primaryWallet.disconnect();
          monitoring.addBreadcrumb('wallet', 'Disconnected wallet from browser');
        } catch (e) {
          // Log but don't throw - continue with logout
          monitoring.captureError(e as Error, { context: 'WalletProvider.disconnect.wallet' });
        }
      }

      // Also disconnect Solana wallet directly if available
      const w = window as unknown as Record<string, { disconnect?: () => Promise<void> }>;
      if (w.solana?.disconnect) {
        try {
          await w.solana.disconnect();
          monitoring.addBreadcrumb('wallet', 'Disconnected window.solana');
        } catch (e) {
          // Log but don't throw
          monitoring.captureError(e as Error, { context: 'WalletProvider.disconnect.solana' });
        }
      }

      // Logout (clears all sessions)
      await logout();

      // Clear our custom access token through the API
      await fetch('/api/auth/clear-token', {
        method: 'POST',
        credentials: 'include'
      });

      // Add monitoring
      monitoring.addBreadcrumb('wallet', 'Disconnected from all services');

      // Redirect to home page instead of login
      router.push('/');
    } catch (error) {
      monitoring.captureError(error as Error, { context: 'WalletProvider.disconnect' });
      throw error;
    }
  }, [logout, router, primaryWallet]);

  const copyAddress = useCallback(async (type: 'evm' | 'solana') => {
    const wallet = type === 'evm' ? evmWallet : solanaWallet;
    if (!wallet) throw new Error(`No ${type} wallet connected`);

    try {
      await navigator.clipboard.writeText(wallet.address);
      toast.success(`Copied ${type.toUpperCase()} address`, "Address copied to clipboard.");
    } catch (error) {
      monitoring.captureError(error as Error, { context: 'WalletProvider.copyAddress', type });
      toast.error("Failed to copy address", `Could not copy ${type.toUpperCase()} address due to an error.`);
      throw error;
    }
  }, [evmWallet, solanaWallet, toast]);

  const removeWallet = useCallback(async (type: 'evm' | 'solana') => {
    const wallet = type === 'evm' ? evmWallet : solanaWallet;
    if (!wallet) throw new Error(`No ${type} wallet connected`);

    // Check if this is an embedded wallet
    if (wallet.walletClientType === 'privy') {
      toast.error(notificationCopy.wallet.cannotRemoveWallet, "Embedded wallets cannot be removed. Please disconnect instead.");
      return;
    }

    // Check if this is the last auth method
    const hasOtherWallet = type === 'evm' ? !!solanaWallet : !!evmWallet;
    const hasOtherAuthMethod = !!user?.email;

    if (!hasOtherWallet && !hasOtherAuthMethod) {
      toast.error(notificationCopy.wallet.cannotRemoveWallet, "You must have at least one authentication method. Please connect another wallet or link an email/social account first.");
      return;
    }

    try {
      await wallet.disconnect();
      toast.success("Wallet removed", `${type.toUpperCase()} wallet has been successfully removed.`);
    } catch (error) {
      monitoring.captureError(error as Error, { context: 'WalletProvider.removeWallet', type });
      toast.error("Failed to remove wallet", `Could not remove ${type.toUpperCase()} wallet due to an error.`);
      throw error;
    }
  }, [evmWallet, solanaWallet, user, toast]);

  const sendTransaction = useCallback(async (config: import('@/services/web3/types').TransactionConfig) => {
    if (!primaryWallet) throw new Error('No wallet available');

    try {
      const provider = await primaryWallet.getEthereumProvider();
      const tx = await provider.request({
        method: 'eth_sendTransaction',
        params: [config],
      });
      monitoring.addBreadcrumb('transaction', `Transaction sent: ${tx}`);
      return tx;
    } catch (error) {
      monitoring.captureError(error as Error, {
        context: 'WalletProvider.sendTransaction',
        config
      });
      throw error;
    }
  }, [primaryWallet]);

  const switchChain = useCallback(async (chainId: number) => {
    if (!primaryWallet) throw new Error('No wallet available');

    try {
      await primaryWallet.switchChain(chainId);
      monitoring.addBreadcrumb('wallet', `Switched to chain ${chainId}`);
    } catch (error) {
      monitoring.captureError(error as Error, {
        context: 'WalletProvider.switchChain',
        chainId
      });
      throw error;
    }
  }, [primaryWallet]);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    isConnected,
    evmWallet,
    solanaWallet,
    chainId,
    connect,
    disconnect,
    sendTransaction,
    copyAddress,
    removeWallet,
    switchChain,
  }), [
    isConnected,
    evmWallet,
    solanaWallet,
    chainId,
    connect,
    disconnect,
    sendTransaction,
    copyAddress,
    removeWallet,
    switchChain,
  ]);

  return (
    <WalletContext.Provider value={contextValue}>
      {children}
    </WalletContext.Provider>
  );
};

// Memoized hook to prevent unnecessary context lookups
export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used within a WalletProvider');
  return context;
};
