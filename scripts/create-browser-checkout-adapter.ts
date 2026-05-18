#!/usr/bin/env tsx

import fs from 'node:fs'
import path from 'node:path'

const adapterId = process.argv[2]?.trim().toLowerCase()

if (!adapterId || !/^[a-z][a-z0-9_-]{1,80}$/.test(adapterId)) {
  console.error('Usage: npm run browser-checkout:adapter:create <adapter-id>')
  console.error('Adapter id must be lowercase kebab/snake case and start with a letter.')
  process.exit(1)
}

const root = process.cwd()
const dir = path.join(root, 'adapters', 'browser-checkout', adapterId)

if (fs.existsSync(dir)) {
  console.error(`Adapter directory already exists: ${path.relative(root, dir)}`)
  process.exit(1)
}

fs.mkdirSync(path.join(dir, 'fixtures'), { recursive: true })
fs.writeFileSync(path.join(dir, 'manifest.ts'), manifestTemplate(adapterId))
fs.writeFileSync(path.join(dir, 'adapter.ts'), adapterTemplate(adapterId))
fs.writeFileSync(path.join(dir, 'fixtures', 'cart.json'), `${JSON.stringify({
  manifestId: adapterId,
  account: {
    id: 'acct-fixture',
    merchantKey: adapterId,
    merchantName: title(adapterId),
    provider: 'lucid_managed',
    authState: 'connected',
    capabilities: ['connected_browser_account'],
  },
  run: {
    id: 'run-fixture',
    orgId: 'org-fixture',
    merchant: {
      name: title(adapterId),
      domain: `${adapterId}.example.com`,
    },
    approvalState: 'approved',
    idempotencyKey: `${adapterId}-fixture-1`,
  },
  cartItems: [{
    name: 'Fixture item',
    quantity: 1,
    totalPrice: 10,
    currency: 'usd',
    category: 'fixture',
  }],
}, null, 2)}\n`)
fs.writeFileSync(path.join(dir, 'README.md'), readmeTemplate(adapterId))

console.log(`Created Browser Checkout adapter scaffold at ${path.relative(root, dir)}`)

function manifestTemplate(id: string): string {
  return `import { createBrowserCheckoutAdapterManifest } from '@lucid/browser-checkout-adapter'

export const manifest = createBrowserCheckoutAdapterManifest({
  id: '${id}',
  label: '${title(id)}',
  lifecycle: 'planned',
  mode: 'merchant_specific',
  merchantKeys: ['${id}'],
  merchantDomains: ['${id}.example.com'],
  supportedProviders: ['lucid_managed', 'playwright', 'browserbase', 'steel', 'browserless', 'remote_cdp'],
  countries: ['US'],
  requiredEnv: [
    'BROWSER_QA_CONTROL_URL',
    'BROWSER_QA_CONTROL_TOKEN',
    'BROWSER_OPERATOR_LIVE_CHECKOUT_ENABLED',
  ],
  requiredAccountCapabilities: [
    'connected_browser_account',
    'active_provider_profile',
    'approval_boundary_verified',
    'idempotency_guard_verified',
    'merchant_flow_verified',
    'receipt_parser_verified',
  ],
  receiptStrategy: 'merchant_receipt_page',
  reliability: {
    tier: 'research_only',
    capabilities: ['research_supported'],
    knownFailureReasons: ['merchant_validation_missing'],
    requiresTakeover: true,
    apiAvailable: false,
    preferredProviders: ['lucid_managed', 'playwright'],
  },
  fixtureVersion: '2026-05-10',
  timeoutBudgetMs: 120_000,
  retryPolicy: {
    readOnlyRetries: 1,
    finalPurchaseRetries: 0,
  },
  failClosedReason: 'merchant_specific_adapter_not_implemented',
  notes: [
    'Replace example domain and fixture data before requesting staging/live readiness.',
  ],
})
`
}

function adapterTemplate(id: string): string {
  return `import {
  merchantMatchesManifest,
  type BrowserCheckoutAdapter,
} from '@lucid/browser-checkout-adapter'
import { manifest } from './manifest'

export const adapter: BrowserCheckoutAdapter = {
  manifest,
  canHandle(input) {
    return merchantMatchesManifest({
      manifest,
      merchantKey: input.account.merchantKey,
      merchant: input.run.merchant,
    })
  },
  async execute() {
    throw new Error('${title(id)} checkout is planned but not live-ready.')
  },
}
`
}

function readmeTemplate(id: string): string {
  return `# ${title(id)} Browser Checkout Adapter

Status: planned.

Before this adapter can execute real checkout:

- verify the merchant login/session flow
- add final-cart extraction
- add submit/purchase approval boundary
- add idempotency guard
- add receipt parser fixtures
- pass Browser Checkout conformance
- complete security review
`
}

function title(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}
