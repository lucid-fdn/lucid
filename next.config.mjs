import {withSentryConfig} from '@sentry/nextjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.NEXT_TELEMETRY_DISABLED ??= '1';

// React 19 + Radix UI compose-refs fix — see src/lib/patches/compose-refs.ts
// https://github.com/radix-ui/primitives/issues/3799
const composeRefsAlias = path.resolve(__dirname, 'src/lib/patches/compose-refs.ts');

// Payload CMS wrapper — disabled until Content Studio is production-ready.
// Payload packages add ~2GB build memory overhead, causing OOM on Vercel.
// To enable: set PAYLOAD_ENABLED=true on Vercel + provide DATABASE_URL + PAYLOAD_SECRET.
const withPayload = process.env.PAYLOAD_ENABLED === 'true'
  ? (await import('@payloadcms/next/withPayload')).withPayload
  : (config) => config;

const disableWebpackBuildWorker = process.env.NEXT_DISABLE_WEBPACK_BUILD_WORKER === '1';
const enableStandaloneOutput = process.env.NEXT_OUTPUT_STANDALONE === '1';
const outputFileTracingExcludes = [
  '**/.git/**',
  '**/.next-smoke*/**',
  '**/coverage/**',
  '**/docs/**',
  '**/tests/**',
  '**/worker/**',
  '**/supabase/**',
  '**/packages/openclaw-core/**',
  '**/packages/agent-bridge/dist/**',
  '**/packages/hermes-runtime/dist/**',
  '**/packages/openclaw-runtime/dist/**',
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  eslint: {
    // Skip ESLint during Vercel builds to reduce memory — run separately in CI
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Skip typecheck during Vercel builds — OOMs on 8GB build machine.
    // Verified locally via `npx tsc --noEmit` before each push.
    ignoreBuildErrors: true,
    tsconfigPath: 'tsconfig.json',
  },
  trailingSlash: false,
  // Disable static 404 generation to avoid SSR issues with client-only providers
  generateBuildId: async () => {
    return process.env.BUILD_ID || `build-${Date.now()}`
  },
  // Standalone tracing is useful for Docker/self-host artifacts, but very
  // expensive for normal Vercel/`next start` builds. Enable explicitly via
  // `NEXT_OUTPUT_STANDALONE=1 npm run build` or `npm run build:standalone`.
  ...(enableStandaloneOutput ? { output: 'standalone' } : {}),
  outputFileTracingExcludes: {
    '/*': outputFileTracingExcludes,
    'next-server': outputFileTracingExcludes,
    'next-minimal-server': outputFileTracingExcludes,
  },
  serverExternalPackages: [
    '@opentelemetry/api',
    '@opentelemetry/sdk-node',
    '@opentelemetry/instrumentation',
    '@sentry/nextjs',
    'sharp',
    // OpenClaw channel send-leaves shim (src/lib/channels/openclaw-shim/).
    // Note: serverExternalPackages does not actually externalize this
    // workspace package — Next resolves it to a file path first. The real
    // fix lives in shared/runtime.ts (webpack-opaque dynamic import via
    // `new Function('return import(...)')`). Kept here for intent + future
    // compatibility if/when Next supports workspace package externals.
    '@lucid/openclaw-runtime',
  ],
  turbopack: {
    resolveAlias: {
      '@radix-ui/react-compose-refs': './src/lib/patches/compose-refs.ts',
    },
  },
  experimental: {
    // Run webpack in a separate worker to reduce peak memory in the main process
    webpackBuildWorker: !disableWebpackBuildWorker,
    // Enable webpack memory optimizations for large projects
    webpackMemoryOptimizations: true,
    // Trace server outputs while compiling instead of as one long serial phase.
    parallelServerBuildTraces: !disableWebpackBuildWorker,
    optimizePackageImports: [
      '@privy-io/react-auth',
      'three',
      '@react-three/fiber',
      '@react-three/drei',
      'reactflow',
      '@xyflow/react',
      'shiki',
      'lucide-react',
      'date-fns',
      'framer-motion',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      '@radix-ui/react-tooltip',
      'pdfjs-dist',
      'antd',
      '@lobehub/ui',
      '@lobehub/icons',
    ],
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Skip prerendering error pages
  skipTrailingSlashRedirect: true,
  // Transpile wallet-related packages
  transpilePackages: [
    '@lucid/app-client',
    '@lucid/app-core',
    '@walletconnect/ethereum-provider',
    '@reown/appkit',
    '@reown/appkit-controllers',
    'valtio',
    'derive-valtio',
  ],
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
        pathname: `/images/${process.env.NEXT_PUBLIC_SANITY_PROJECT_ID}/**`
      },
      {
        protocol: "https",
        hostname: "*.dicebear.com",
      },
      {
        protocol: "https",
        hostname: "api.dicebear.com",
      },
      {
        protocol: "https",
        hostname: "api.lucid.foundation",
      },
      {
        protocol: "https",
        hostname: "*.slack.com",
      },
      {
        protocol: "https",
        hostname: "*.slack-edge.com",
      },
      {
        protocol: "https",
        hostname: "*.slack-files.com",
      },
      {
        protocol: "https",
        hostname: "*.slack-imgs.com",
      },
      {
        protocol: "https",
        hostname: "ik.imagekit.io",
      },
    ],
    unoptimized: process.env.NODE_ENV === 'development', // Only in dev
  },
  // Skip prerendering for studio routes
  async redirects() {
    return []
  },
  // Security Headers (Privy Production Requirements)
  // Reference: https://docs.privy.io/security/implementation-guide/content-security-policy
  async headers() {
    // Build CSP directives for readability
    const cspDirectives = [
      // Default fallback
      "default-src 'self'",
      
      // Scripts - Privy + Next.js requirements
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com https://telegram.org https://*.telegram.org",
      
      // Styles - Allow inline for styled-components/emotion + approved font stylesheets
      "style-src 'self' 'unsafe-inline' https://api.fontshare.com https://fonts.googleapis.com",

      // Images - Support data URIs, blobs, and external sources
      "img-src 'self' data: blob: https://cdn.sanity.io https://*.dicebear.com https://api.dicebear.com https://*.nango.dev https://api.lucid.foundation https://*.supabase.co https://*.slack.com https://*.slack-edge.com https://*.slack-files.com https://*.slack-imgs.com",

      // Fonts - Fontshare and Solana wallet modal stylesheets serve font files from these CDNs
      "font-src 'self' data: https://cdn.fontshare.com https://fonts.gstatic.com",
      
      // Objects - Disable plugins
      "object-src 'none'",
      
      // Base URI - Prevent base tag injection
      "base-uri 'self'",
      
      // Form submissions
      "form-action 'self'",
      
      // Frame ancestors - Prevent clickjacking (prevents your site from being embedded)
      "frame-ancestors 'none'",
      
      // Child frames - Privy embedded wallet iframe + WalletConnect
      "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org",
      
      // Frame sources - Privy + WalletConnect + Cloudflare Turnstile
      "frame-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com https://telegram.org https://*.telegram.org",
      
      // Connect sources - API endpoints, WebSockets, RPC
      [
        "connect-src 'self'",
        // Self-hosted: allow localhost services
        "http://localhost:*",                        // Local services (PostgREST, GoTrue, Worker)
        "ws://localhost:*",                          // Local WebSockets
        "http://127.0.0.1:*",                       // Loopback
        // Privy & WalletConnect (Authentication)
        "https://auth.privy.io",                    // Privy API
        "wss://relay.walletconnect.com",            // WalletConnect relay
        "wss://relay.walletconnect.org",            // WalletConnect fallback
        "wss://www.walletlink.org",                 // Coinbase Wallet
        "https://*.rpc.privy.systems",              // Privy RPC provider
        "https://explorer-api.walletconnect.com",   // WalletConnect Explorer
        // Database & Realtime
        "https://*.supabase.co",                    // Supabase
        "wss://*.supabase.co",                      // Supabase Realtime
        // Blockchain RPCs
        "https://api.mainnet-beta.solana.com",      // Solana mainnet
        "https://api.devnet.solana.com",            // Solana devnet
        "https://api.testnet.solana.com",           // Solana testnet
        // Payments
        "https://api.stripe.com",                   // Stripe payments
        "https://commerce.coinbase.com",            // Coinbase Commerce
        "https://api.commerce.coinbase.com",        // Coinbase Commerce API
        "https://telegram.org",                     // Telegram Mini App SDK
        "https://*.telegram.org",                   // Telegram Mini App SDK
        // Monitoring & Analytics
        "https://*.sentry.io",                      // Sentry error tracking
        // Lucid & Integrations
        "https://api.lucid.foundation",             // Lucid API
        "https://*.nango.dev",                      // Nango OAuth
      ].join(' '),
      
      // Workers
      "worker-src 'self' blob:",
      
      // Manifest
      "manifest-src 'self'",
    ];
    
    const contentSecurityPolicy = cspDirectives.join('; ');
    
    return [
      {
        source: '/:path*',
        headers: [
          // Content Security Policy - Protects Privy embedded wallet iframe
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy,
          },
          // X-Frame-Options - Prevents clickjacking (backwards compatibility)
          // Note: frame-ancestors in CSP is the modern replacement, but X-Frame-Options
          // provides compatibility with older browsers
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          // X-Content-Type-Options - Prevents MIME type sniffing
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          // Referrer-Policy - Controls referrer information
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          // Permissions-Policy - Restricts browser features
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // Strict-Transport-Security - Force HTTPS
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
  // Webpack configuration to handle build issues
  webpack: (config, { isServer }) => {
    if (process.env.NEXT_DISABLE_WEBPACK_CACHE === '1') {
      config.cache = false;
    }

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    // Fix valtio module resolution + React 19 compose-refs fix
    config.resolve.alias = {
      ...config.resolve.alias,
      '@radix-ui/react-compose-refs': composeRefsAlias,
      'valtio/vanilla': 'valtio/vanilla',
      'valtio': 'valtio',
    };
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };

    // Exclude test files from bundle
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    config.module.rules.push({
      test: /node_modules\/thread-stream\/test\//,
      use: 'null-loader',
    });

    // Reduce memory usage during build
    config.optimization = {
      ...config.optimization,
      moduleIds: 'deterministic',
    };

    // Limit parallel compilation to reduce peak memory (OOM on Vercel 8GB)
    config.parallelism = 5;

    return config;
  },
}

// Skip Sentry wrapping in dev — it pulls in heavy OTel instrumentation and
// adds ~15s to cold page compiles. Sentry still works in production builds.
const sentryEnabled =
  process.env.SENTRY_ENABLED === '1' ||
  (process.env.CI === 'true' && Boolean(process.env.SENTRY_AUTH_TOKEN));

const finalConfig = process.env.NODE_ENV === 'development' || !sentryEnabled
  ? withPayload(nextConfig)
  : withSentryConfig(withPayload(nextConfig), {
      org: "raijin-labs",
      project: "javascript-nextjs",
      silent: !process.env.CI,
      sourcemaps: {
        disable: true,
      },
      widenClientFileUpload: false,
      hideSourceMaps: true,
      tunnelRoute: "/monitoring",
      disableLogger: true,
      automaticVercelMonitors: true,
    });

export default finalConfig;
