'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/providers/theme-provider';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { ProfileProvider } from '@/contexts/profile-context';
import { WorkspaceProvider } from '@/contexts/workspace-context';
import { NotificationProvider } from '@/contexts/notification-context';
import { CommandPaletteProvider, CommandPalette } from '@/components/command-palette';
import { DesktopNativeBridge } from '@/components/native/desktop-native-bridge';
import { SidebarProvider as SidebarDefaultProvider } from '@/contexts/sidebar-context';
import { OAuthProvider } from '@/contexts/oauth-context';
import { FeatureFlagsProvider, type ResolvedFeatureFlags } from '@/contexts/feature-flags-context';
import { isPrivyEnabled, isWeb3Enabled } from '@/lib/auth/client-config';
import type { ServerAuth } from '@/lib/auth/server-utils';
import type { OAuthProviderInfo, OAuthConnection } from '@/lib/oauth';
import { PrivyRuntimeProvider } from '@/components/providers/privy-runtime-provider';
import { WalletRuntimeProvider } from '@/components/providers/wallet-runtime-provider';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim() ?? ''

interface InitialProfile {
  id: string
  name?: string
  email?: string
  avatar_url?: string
  handle?: string
  bio?: string
}

interface InitialOrg {
  id: string
  name: string
  slug: string
  type?: string
}

/** Wraps children in PrivyProvider when Privy is configured, passthrough otherwise. */
function MaybePrivyProvider({ children }: { children: ReactNode }) {
  if (!isPrivyEnabled() || !PRIVY_APP_ID) return <>{children}</>
  return <PrivyRuntimeProvider>{children}</PrivyRuntimeProvider>
}

/** Wraps children in WalletProvider only when web3/wallet features are enabled. */
function MaybeWalletProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (!isWeb3Enabled()) return <>{children}</>
  if (!isAuthenticated) return <>{children}</>
  return <WalletRuntimeProvider>{children}</WalletRuntimeProvider>
}

export function Providers({
  children,
  serverAuth,
  initialProfile,
  initialOrg,
  initialWorkspace,
  initialOAuth,
  sidebarDefaultOpen = true,
  featureFlags,
}: {
  children: ReactNode
  serverAuth: ServerAuth
  initialProfile?: InitialProfile
  initialOrg?: InitialOrg
  initialWorkspace?: any
  initialOAuth?: { providers: OAuthProviderInfo[]; connections: OAuthConnection[] }
  sidebarDefaultOpen?: boolean
  featureFlags: ResolvedFeatureFlags
}) {
  // Mark as hydrated for CSS - prevents sidebar FOUC
  useEffect(() => {
    document.documentElement.classList.add('hydrated');
    requestAnimationFrame(() => {
      document.documentElement.style.setProperty('--hydration-complete', '1');
    });
  }, []);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 60_000 } },
      })
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      storageKey="lucid-theme"
    >
      <QueryClientProvider client={queryClient}>
        <MaybePrivyProvider>
          <FeatureFlagsProvider flags={featureFlags}>
            <AuthProvider serverAuth={serverAuth}>
              <OAuthProvider initialOAuth={initialOAuth}>
                <WorkspaceProvider initialOrg={initialOrg} initialWorkspace={initialWorkspace}>
                  <ProfileProvider initialProfile={initialProfile}>
                    <SidebarDefaultProvider defaultOpen={sidebarDefaultOpen}>
                      <MaybeWalletProvider>
                        <NotificationProvider>
                          <CommandPaletteProvider>
                            <DesktopNativeBridge />
                            {children}
                            <CommandPalette />
                          </CommandPaletteProvider>
                        </NotificationProvider>
                      </MaybeWalletProvider>
                    </SidebarDefaultProvider>
                  </ProfileProvider>
                </WorkspaceProvider>
              </OAuthProvider>
            </AuthProvider>
          </FeatureFlagsProvider>
        </MaybePrivyProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
