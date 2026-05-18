import '@/styles/tailwind.css'
import type { Metadata, Viewport } from 'next'
import { Providers } from './providers'
import { Toaster } from '@/components/ui/sonner'
import { getServerAuth } from '@/lib/auth/server-utils'
import { prefetchSession } from '@/lib/auth/cache'
// TODO: re-enable when OAuth tool integration is wired (Chunk 3)
// import { getOAuthData } from '@/lib/oauth/server'
import { resolveFeatureFlags } from '@/lib/features'
import { cookies } from 'next/headers'

// Force dynamic rendering to bypass static generation issues with PrivyProvider
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: {
    template: '%s - Lucid',
    default: 'Lucid - Internet of AI',
  },
  icons: {
    icon: '/lucid.ico',
    shortcut: '/lucid.ico',
    apple: '/lucid_w.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Lucid Studio',
  },
}

export const viewport: Viewport = {
  themeColor: '#2563eb',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Read sidebar cookie for SSR/CSR match
  const cookieStore = await cookies()
  const sidebarCookie = cookieStore.get('sidebar_state')
  const sidebarDefaultOpen = sidebarCookie ? sidebarCookie.value === 'true' : true

  // Fetch auth once at root level for entire app
  const auth = await getServerAuth()

  // Fetch org, workspace, and OAuth data server-side for instant display
  // Profile is already in auth.user from getCachedSession
  let initialProfile = auth.user || null
  let initialOrg = null
  let initialWorkspace = null
  let initialOAuth = { providers: [] as never[], connections: [] as never[] }

  if (auth.isAuthenticated && auth.userId) {
    // Fetch user's first org and warm session cache in parallel
    const [orgs] = await Promise.all([
      import('@/lib/db').then(({ getUserOrganizations }) => getUserOrganizations(auth.userId!)),
      prefetchSession(),
    ])
    const rawOrg = orgs?.[0]?.organization
    initialOrg = (Array.isArray(rawOrg) ? rawOrg[0] : rawOrg) || null

    // Prefetch full workspace to skip client-side /api/workspace fetch
    if (initialOrg?.id) {
      const { getWorkspace } = await import('@/lib/db')
      initialWorkspace = await getWorkspace(auth.userId!, initialOrg.id).catch(() => null)
    }
  }
  
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // IMMEDIATE theme application - prevents FOUC
              (function() {
                try {
                  const theme = localStorage.getItem('lucid-theme') || 'dark';
                  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  const finalTheme = theme === 'system' ? systemTheme : theme;
                  document.documentElement.classList.add(finalTheme);
                  document.documentElement.style.colorScheme = finalTheme;
                } catch (e) {
                  document.documentElement.classList.add('dark');
                  document.documentElement.style.colorScheme = 'dark';
                }
              })();
              
              // IMMEDIATE Solana wallet cleanup - runs before any wallet providers load
              (function() {
                // Clear wallet-related storage immediately
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                  const key = localStorage.key(i);
                  if (key && (
                    key.toLowerCase().includes('phantom') || 
                    key.toLowerCase().includes('solana') || 
                    key.toLowerCase().includes('wallet')
                    // NOTE: Removed 'privy' to preserve authentication across page refreshes
                  )) {
                    keysToRemove.push(key);
                  }
                }
                
                keysToRemove.forEach(key => {
                  localStorage.removeItem(key);
                });
                
                // Clear sessionStorage
                const sessionKeysToRemove = [];
                for (let i = 0; i < sessionStorage.length; i++) {
                  const key = sessionStorage.key(i);
                  if (key && (
                    key.toLowerCase().includes('phantom') || 
                    key.toLowerCase().includes('solana') || 
                    key.toLowerCase().includes('wallet')
                    // NOTE: Removed 'privy' to preserve authentication across page refreshes
                  )) {
                    sessionKeysToRemove.push(key);
                  }
                }
                
                sessionKeysToRemove.forEach(key => {
                  sessionStorage.removeItem(key);
                });
              })();
            `,
          }}
        />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/css?f%5B%5D=switzer@400,500,600,700&amp;display=swap"
        />
        </head>
        <body className="bg-background text-foreground antialiased" suppressHydrationWarning>
          <Providers
            serverAuth={auth}
            initialProfile={initialProfile ?? undefined}
            initialOrg={initialOrg ?? undefined}
            initialWorkspace={initialWorkspace ?? undefined}
            initialOAuth={initialOAuth ?? undefined}
            sidebarDefaultOpen={sidebarDefaultOpen}
            featureFlags={resolveFeatureFlags()}
          >
            {children}
            <Toaster position="bottom-right" expand={true} richColors />
          </Providers>
        </body>
    </html>
  )
}
