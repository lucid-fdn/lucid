/**
 * Nango SDK Client — Singleton
 *
 * Single Nango client instance shared across the worker.
 * Lazy-initialized on first use.
 */

import { Nango } from '@nangohq/node'
import { getConfig } from '../../config.js'

let _client: Nango | null = null

/**
 * Get the shared Nango client. Returns null if NANGO_SECRET_KEY is not set.
 */
export function getNangoClient(): Nango | null {
  if (_client) return _client

  const config = getConfig()
  const secretKey = config.NANGO_SECRET_KEY?.trim()
  if (!secretKey) return null

  _client = new Nango({
    secretKey,
    host: config.NANGO_HOST,
  })

  return _client
}

/**
 * Check if Nango is configured and available.
 */
export function isNangoConfigured(): boolean {
  return getNangoClient() !== null
}
