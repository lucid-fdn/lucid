import { defaultHermesToolAdapter } from './HermesToolAdapter.js'
import { defaultOpenClawToolAdapter } from './OpenClawToolAdapter.js'
import type { HermesToolAdapter, OpenClawToolAdapter } from './types.js'

export function getOpenClawToolAdapter(): OpenClawToolAdapter {
  return defaultOpenClawToolAdapter
}

export function getHermesToolAdapter(): HermesToolAdapter {
  return defaultHermesToolAdapter
}

export type { OpenClawToolAdapter, HermesToolAdapter, OpenClawToolMount, HermesToolMount } from './types.js'
