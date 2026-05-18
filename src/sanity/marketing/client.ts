import { createClient, type SanityClient } from 'next-sanity'
import { apiVersion, dataset, projectId, isSanityConfigured } from './env'

let _client: SanityClient | null = null

export function getClient(): SanityClient {
  if (!_client) {
    _client = createClient({
      projectId,
      dataset,
      apiVersion,
      useCdn: process.env.NODE_ENV !== 'development',
    })
  }
  return _client
}

/** @deprecated Use getClient() instead */
export const client = isSanityConfigured
  ? createClient({ projectId, dataset, apiVersion, useCdn: process.env.NODE_ENV !== 'development' })
  : (null as unknown as SanityClient)
