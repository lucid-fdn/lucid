import { FlatCompat } from '@eslint/eslintrc'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'out/**',
      'dist/**',
      'build/**',
      'node_modules/**',
      '.env',
      '.env.*',
      '.cache/**',
      '.turbo/**',
      '*.log',
      '.DS_Store',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Next.js specific
      '@next/next/no-img-element': 'warn',

      // TypeScript - warn on any usage (gradual cleanup)
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-empty-object-type': 'off',

      // React
      'react/no-unescaped-entities': 'off',
      'react-hooks/exhaustive-deps': 'warn',

      // General
      'prefer-const': 'off',

      // Enforce centralized Supabase client usage
      'no-restricted-imports': ['error', {
        paths: [{
          name: '@supabase/supabase-js',
          importNames: ['createClient'],
          message: 'Use @/lib/supabase/server or @/lib/db instead of direct createClient. See CLAUDE.md for details.'
        }]
      }],
    },
  },
  // Exempt infrastructure files that legitimately need direct Supabase access
  {
    files: [
      'src/lib/supabase/**',
      'src/lib/db/**',
      'src/lib/auth/**',
      'src/lib/access-control/**',
      'src/lib/invites/**',
      'src/lib/mail/**',
      'src/lib/notifications.ts',
      'src/lib/notifications/**',
      'src/lib/workspace/**',
      'src/lib/uploads/**',
      'src/lib/expressions/**',
      'src/lib/trading/**',
      'src/lib/session-signers/**',
      'src/lib/marketplace/**',
      'src/lib/ai/**',
      'src/app/api/**',
      'src/app/(workflow)/**',
      'src/app/(app)/**',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  // Retail funnel boundary enforcement — keep (retail) isolated from pro app
  // See docs/plans/2026-04-07-consumer-retail-funnel.md
  {
    files: [
      'src/components/retail/**/*.{ts,tsx}',
      'src/app/(retail)/**/*.{ts,tsx}',
      'src/lib/retail/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/components/assistant/*', '@/components/mission-control/*'],
            message: 'Retail surface must not import from the pro app. Lift the primitive into src/components/ui/ or src/components/shared/ first. See docs/plans/2026-04-07-consumer-retail-funnel.md.',
          },
          {
            group: ['@/app/(app)/*'],
            message: 'Retail surface must not import from (app) route group. See docs/plans/2026-04-07-consumer-retail-funnel.md.',
          },
        ],
      }],
    },
  },
]

export default eslintConfig
