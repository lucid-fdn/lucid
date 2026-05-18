export const apiVersion =
  process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2025-07-10'

export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? ''

export const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? ''

export const isSanityConfigured = Boolean(dataset && projectId)
