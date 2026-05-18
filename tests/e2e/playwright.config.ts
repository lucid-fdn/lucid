import { defineConfig, devices } from '@playwright/test'
import fs from 'node:fs'

const authFile = '.playwright/auth/user.json'
const baseURL = process.env.SMOKE_BASE_URL || 'http://localhost:3000'
const reuseSavedAuthState =
  fs.existsSync(authFile) &&
  ['1', 'true', 'yes'].includes((process.env.E2E_REUSE_AUTH_STATE ?? '').trim().toLowerCase()) &&
  authStateMatchesBaseUrl(authFile, baseURL)

export default defineConfig({
  testDir: '.',
  testMatch: ['*.spec.ts', '*.setup.ts'],
  timeout: 120_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  outputDir: '../../.playwright/test-results',
  use: {
    baseURL,
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    ...(!reuseSavedAuthState
      ? [{
          name: 'setup',
          testMatch: ['auth.setup.ts'],
          use: {
            ...devices['Desktop Chrome'],
            storageState: undefined,
          },
        }]
      : []),
    {
      name: 'chromium',
      testIgnore: ['auth.setup.ts'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile,
      },
      ...(reuseSavedAuthState ? {} : { dependencies: ['setup'] }),
    },
  ],
})

function authStateMatchesBaseUrl(path: string, rawBaseUrl: string): boolean {
  try {
    const targetHost = new URL(rawBaseUrl).hostname
    const state = JSON.parse(fs.readFileSync(path, 'utf8')) as {
      cookies?: Array<{ domain?: string; url?: string }>
      origins?: Array<{ origin?: string }>
    }

    const cookieMatches = state.cookies?.some((cookie) => {
      if (cookie.url) return new URL(cookie.url).hostname === targetHost
      const domain = cookie.domain?.replace(/^\./, '')
      return domain === targetHost || targetHost.endsWith(`.${domain}`)
    })
    const originMatches = state.origins?.some((origin) => {
      if (!origin.origin) return false
      return new URL(origin.origin).hostname === targetHost
    })

    return Boolean(cookieMatches || originMatches)
  } catch {
    return false
  }
}
