/**
 * OAuth Node Detection
 * 
 * Automatically detect which n8n nodes support OAuth by analyzing their metadata.
 * This prevents manual maintenance of OAuth node lists.
 * 
 * Integration: Uses existing n8n node service (src/lib/lucid-l2/node-service.ts)
 */

import { getNodes } from '@/lib/lucid-l2/node-service'
import { cache } from 'react'

/**
 * OAuth-enabled node information
 */
export interface OAuthEnabledNode {
  nodeType: string
  nodeName: string
  credentialType: string
  credentialName: string
  provider: string // Mapped OAuth provider (google, slack, etc.)
  providerName: string
  category: string
  required: boolean
}

/**
 * Node to OAuth Provider Mapping
 * 
 * This maps n8n credential types to OAuth provider IDs.
 * Some nodes use the same OAuth provider (e.g., all Google services use 'google')
 */
const CREDENTIAL_TO_PROVIDER_MAP: Record<string, {
  provider: string
  providerName: string
  scopes?: string[]
}> = {
  // Google ecosystem
  'googleOAuth2Api': {
    provider: 'google',
    providerName: 'Google',
    scopes: ['email', 'profile']
  },
  'gmailOAuth2': {
    provider: 'google',
    providerName: 'Google',
    scopes: ['https://www.googleapis.com/auth/gmail.send']
  },
  'googleSheetsOAuth2Api': {
    provider: 'google',
    providerName: 'Google',
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  },
  'googleDriveOAuth2Api': {
    provider: 'google',
    providerName: 'Google',
    scopes: ['https://www.googleapis.com/auth/drive']
  },
  'googleCalendarOAuth2Api': {
    provider: 'google',
    providerName: 'Google',
    scopes: ['https://www.googleapis.com/auth/calendar']
  },

  // Communication platforms
  'slackOAuth2Api': {
    provider: 'slack',
    providerName: 'Slack'
  },
  'discordOAuth2': {
    provider: 'discord',
    providerName: 'Discord'
  },
  'telegramOAuth2': {
    provider: 'telegram',
    providerName: 'Telegram'
  },

  // Productivity
  'notionOAuth2Api': {
    provider: 'notion',
    providerName: 'Notion'
  },
  'airtableOAuth2Api': {
    provider: 'airtable',
    providerName: 'Airtable'
  },
  'asanaOAuth2Api': {
    provider: 'asana',
    providerName: 'Asana'
  },
  'trelloOAuth2Api': {
    provider: 'trello',
    providerName: 'Trello'
  },

  // Microsoft
  'microsoftOAuth2Api': {
    provider: 'microsoft',
    providerName: 'Microsoft'
  },
  'outlookOAuth2Api': {
    provider: 'microsoft',
    providerName: 'Microsoft'
  },

  // Social & Content
  'twitterOAuth2': {
    provider: 'twitter',
    providerName: 'Twitter/X'
  },
  'linkedInOAuth2Api': {
    provider: 'linkedin',
    providerName: 'LinkedIn'
  },
  'githubOAuth2Api': {
    provider: 'github',
    providerName: 'GitHub'
  },
  'gitlabOAuth2Api': {
    provider: 'gitlab',
    providerName: 'GitLab'
  },

  // Finance
  'stripeOAuth2Api': {
    provider: 'stripe',
    providerName: 'Stripe'
  },
  
  // CRM & Sales
  'salesforceOAuth2Api': {
    provider: 'salesforce',
    providerName: 'Salesforce'
  },
  'hubspotOAuth2Api': {
    provider: 'hubspot',
    providerName: 'HubSpot'
  },

  // Add more as needed...
}

/**
 * Detect if a credential type is OAuth-based
 */
function isOAuthCredential(credentialType: string): boolean {
  return (
    credentialType.toLowerCase().includes('oauth') ||
    credentialType.toLowerCase().includes('oauth2')
  )
}

/**
 * Map credential type to OAuth provider
 */
function mapCredentialToProvider(credentialType: string): {
  provider: string
  providerName: string
  scopes?: string[]
} | null {
  // Check exact match first
  if (CREDENTIAL_TO_PROVIDER_MAP[credentialType]) {
    return CREDENTIAL_TO_PROVIDER_MAP[credentialType]
  }

  // Try case-insensitive match
  const lowerCredType = credentialType.toLowerCase()
  for (const [key, value] of Object.entries(CREDENTIAL_TO_PROVIDER_MAP)) {
    if (key.toLowerCase() === lowerCredType) {
      return value
    }
  }

  // Heuristic: Try to extract provider name from credential type
  // e.g., "slackOAuth2Api" -> "slack"
  const match = credentialType.match(/^([a-z]+)OAuth2?/i)
  if (match) {
    const providerGuess = match[1].toLowerCase()
    return {
      provider: providerGuess,
      providerName: match[1], // Capitalize first letter
      scopes: []
    }
  }

  return null
}

/**
 * Get all OAuth-enabled nodes from n8n
 * 
 * This function analyzes n8n node metadata to detect OAuth support.
 * Uses React cache() for request-level deduplication.
 */
export const getOAuthEnabledNodes = cache(async (): Promise<OAuthEnabledNode[]> => {
  try {
    console.log('[OAuth] Detecting OAuth-enabled nodes from n8n...')
    
    // Get all nodes from n8n (uses existing service layer)
    const { nodes } = await getNodes()

    if (!nodes || nodes.length === 0) {
      console.warn('[OAuth] No nodes found from n8n')
      return []
    }

    const oauthNodes: OAuthEnabledNode[] = []

    for (const node of nodes) {
      // Skip nodes without credentials
      if (!node.credentials || node.credentials.length === 0) {
        continue
      }

      // Check each credential type
      for (const credential of node.credentials) {
        const credentialType = credential.name
        const credentialDisplayName = credential.displayName || credentialType

        // Check if this is an OAuth credential
        if (!isOAuthCredential(credentialType)) {
          continue
        }

        // Map to OAuth provider
        const providerMapping = mapCredentialToProvider(credentialType)
        
        if (!providerMapping) {
          console.warn(
            `[OAuth] Unknown OAuth credential type: ${credentialType} (node: ${node.name})`
          )
          continue
        }

        oauthNodes.push({
          nodeType: node.name,
          nodeName: node.displayName,
          credentialType,
          credentialName: credentialDisplayName,
          provider: providerMapping.provider,
          providerName: providerMapping.providerName,
          category: (node as unknown as Record<string, Record<string, string[]>>).codex?.categories?.[0] || (node as unknown as Record<string, string[]>).group?.[0] || node.category || 'Other',
          required: credential.required !== false,
        })
      }
    }

    console.log(`[OAuth] Found ${oauthNodes.length} OAuth-enabled nodes`)

    return oauthNodes
  } catch (error) {
    console.error('[OAuth] Error detecting OAuth nodes:', error)
    return []
  }
})

/**
 * Check if a node type requires OAuth
 */
export async function nodeRequiresOAuth(nodeType: string): Promise<boolean> {
  const oauthNodes = await getOAuthEnabledNodes()
  return oauthNodes.some((node) => node.nodeType === nodeType)
}

/**
 * Get OAuth provider for a specific node type
 */
export async function getNodeOAuthProvider(
  nodeType: string
): Promise<OAuthEnabledNode | null> {
  const oauthNodes = await getOAuthEnabledNodes()
  return oauthNodes.find((node) => node.nodeType === nodeType) || null
}

/**
 * Get all OAuth providers used across nodes
 * Returns unique list of providers
 */
export async function getAllOAuthProviders(): Promise<Array<{
  provider: string
  providerName: string
  nodeCount: number
  nodes: string[]
}>> {
  const oauthNodes = await getOAuthEnabledNodes()

  // Group by provider
  const providerMap = new Map<string, {
    providerName: string
    nodes: string[]
  }>()

  for (const node of oauthNodes) {
    if (!providerMap.has(node.provider)) {
      providerMap.set(node.provider, {
        providerName: node.providerName,
        nodes: [],
      })
    }

    const entry = providerMap.get(node.provider)!
    if (!entry.nodes.includes(node.nodeType)) {
      entry.nodes.push(node.nodeType)
    }
  }

  // Convert to array
  return Array.from(providerMap.entries()).map(([provider, data]) => ({
    provider,
    providerName: data.providerName,
    nodeCount: data.nodes.length,
    nodes: data.nodes,
  }))
}

/**
 * Get OAuth nodes grouped by provider
 * Useful for displaying nodes per OAuth service
 */
export async function getOAuthNodesByProvider(): Promise<Record<string, OAuthEnabledNode[]>> {
  const oauthNodes = await getOAuthEnabledNodes()

  const grouped: Record<string, OAuthEnabledNode[]> = {}

  for (const node of oauthNodes) {
    if (!grouped[node.provider]) {
      grouped[node.provider] = []
    }
    grouped[node.provider].push(node)
  }

  return grouped
}

/**
 * Search OAuth-enabled nodes
 */
export async function searchOAuthNodes(query: string): Promise<OAuthEnabledNode[]> {
  const oauthNodes = await getOAuthEnabledNodes()
  const lowerQuery = query.toLowerCase()

  return oauthNodes.filter(
    (node) =>
      node.nodeType.toLowerCase().includes(lowerQuery) ||
      node.nodeName.toLowerCase().includes(lowerQuery) ||
      node.providerName.toLowerCase().includes(lowerQuery)
  )
}

/**
 * Get OAuth statistics
 * Useful for debugging and monitoring
 */
export async function getOAuthStats(): Promise<{
  totalOAuthNodes: number
  totalProviders: number
  providerBreakdown: Record<string, number>
  topProviders: Array<{ provider: string; count: number }>
}> {
  const oauthNodes = await getOAuthEnabledNodes()
  const providers = await getAllOAuthProviders()

  const providerBreakdown: Record<string, number> = {}
  for (const node of oauthNodes) {
    providerBreakdown[node.provider] = (providerBreakdown[node.provider] || 0) + 1
  }

  const topProviders = Object.entries(providerBreakdown)
    .map(([provider, count]) => ({ provider, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return {
    totalOAuthNodes: oauthNodes.length,
    totalProviders: providers.length,
    providerBreakdown,
    topProviders,
  }
}
