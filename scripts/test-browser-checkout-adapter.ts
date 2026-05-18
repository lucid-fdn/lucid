#!/usr/bin/env tsx

import {
  isBrowserCheckoutAdapterExecutable,
  validateBrowserCheckoutAdapterManifest,
} from '@lucid/browser-checkout-adapter'
import { listBrowserOperatorCheckoutAdapterManifests } from '@/lib/browser-operator/checkout-adapters'

const requestedId = process.argv[2]?.trim()
const manifests = listBrowserOperatorCheckoutAdapterManifests()
  .filter((manifest) => !requestedId || manifest.id === requestedId)

if (manifests.length === 0) {
  console.error(requestedId
    ? `No Browser Checkout adapter manifest found for ${requestedId}.`
    : 'No Browser Checkout adapter manifests found.')
  process.exit(1)
}

let failed = false
for (const manifest of manifests) {
  const validation = validateBrowserCheckoutAdapterManifest(manifest)
  const executable = isBrowserCheckoutAdapterExecutable(manifest)
  const label = `${manifest.id} (${manifest.lifecycle})`
  if (!validation.ok) {
    failed = true
    console.error(`FAIL ${label}: ${validation.errors.join('; ')}`)
    continue
  }
  console.log(`OK   ${label}: ${executable ? 'executable' : 'fail-closed'} · ${manifest.reliability.tier} · ${manifest.receiptStrategy}`)
}

if (failed) process.exit(1)
