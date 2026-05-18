/**
 * Credential Mapping - Maps n8n node types to OAuth providers
 * 
 * This mapping connects n8n workflow nodes to their corresponding
 * Nango OAuth provider IDs. When a user configures a node that
 * requires authentication, we use this mapping to:
 * 1. Find which OAuth provider is needed
 * 2. Show the user's connected accounts for that provider
 * 3. Allow them to connect a new account if needed
 * 
 * @example
 * const provider = getProviderForNode('n8n-nodes-base.twitter')
 * // Returns: 'twitter'
 */

/**
 * Mapping of n8n node types to Nango provider IDs
 * 
 * Format: 'n8n-node-name': 'nango-provider-id'
 * 
 * Note: Some nodes have multiple versions (e.g., twitter vs twitterV2)
 * We map all versions to the same provider
 */
export const NODE_TO_PROVIDER: Record<string, string> = {
  // Social Media
  'n8n-nodes-base.twitter': 'twitter',
  'n8n-nodes-base.twitterV2': 'twitter',
  'n8n-nodes-base.twitterTrigger': 'twitter',
  'n8n-nodes-base.discord': 'discord',
  'n8n-nodes-base.discordTrigger': 'discord',
  'n8n-nodes-base.slack': 'slack',
  'n8n-nodes-base.slackTrigger': 'slack',
  'n8n-nodes-base.telegram': 'telegram',
  'n8n-nodes-base.telegramTrigger': 'telegram',
  'n8n-nodes-base.linkedIn': 'linkedin',
  'n8n-nodes-base.facebookGraphApi': 'facebook',
  'n8n-nodes-base.instagram': 'instagram',
  'n8n-nodes-base.reddit': 'reddit',
  
  // Google Suite
  'n8n-nodes-base.googleSheets': 'google-sheets',
  'n8n-nodes-base.googleSheetsTrigger': 'google-sheets',
  'n8n-nodes-base.googleDrive': 'google-drive',
  'n8n-nodes-base.googleDriveTrigger': 'google-drive',
  'n8n-nodes-base.googleCalendar': 'google-calendar',
  'n8n-nodes-base.googleCalendarTrigger': 'google-calendar',
  'n8n-nodes-base.gmail': 'google-mail',
  'n8n-nodes-base.gmailTrigger': 'google-mail',
  'n8n-nodes-base.googleDocs': 'google-docs',
  'n8n-nodes-base.googleSlides': 'google-slides',
  'n8n-nodes-base.googleForms': 'google-forms',
  'n8n-nodes-base.googleFormsTrigger': 'google-forms',
  'n8n-nodes-base.googleAnalytics': 'google-analytics',
  'n8n-nodes-base.googleAds': 'google-ads',
  'n8n-nodes-base.googleBigQuery': 'google-bigquery',
  'n8n-nodes-base.googleCloudStorage': 'google-cloud-storage',
  
  // Microsoft
  'n8n-nodes-base.microsoftOutlook': 'microsoft-outlook',
  'n8n-nodes-base.microsoftOutlookTrigger': 'microsoft-outlook',
  'n8n-nodes-base.microsoftOneDrive': 'onedrive',
  'n8n-nodes-base.microsoftTeams': 'microsoft-teams',
  'n8n-nodes-base.microsoftTeamsTrigger': 'microsoft-teams',
  'n8n-nodes-base.microsoftExcel': 'microsoft-excel',
  'n8n-nodes-base.microsoftSharePoint': 'sharepoint',
  'n8n-nodes-base.microsoftDynamicsCrm': 'microsoft-dynamics',
  
  // Productivity
  'n8n-nodes-base.notion': 'notion',
  'n8n-nodes-base.notionTrigger': 'notion',
  'n8n-nodes-base.airtable': 'airtable',
  'n8n-nodes-base.airtableTrigger': 'airtable',
  'n8n-nodes-base.asana': 'asana',
  'n8n-nodes-base.asanaTrigger': 'asana',
  'n8n-nodes-base.trello': 'trello',
  'n8n-nodes-base.trelloTrigger': 'trello',
  'n8n-nodes-base.monday': 'monday',
  'n8n-nodes-base.clickUp': 'clickup',
  'n8n-nodes-base.clickUpTrigger': 'clickup',
  'n8n-nodes-base.todoist': 'todoist',
  'n8n-nodes-base.baserow': 'baserow',
  
  // Developer Tools
  'n8n-nodes-base.github': 'github',
  'n8n-nodes-base.githubTrigger': 'github',
  'n8n-nodes-base.gitlab': 'gitlab',
  'n8n-nodes-base.gitlabTrigger': 'gitlab',
  'n8n-nodes-base.bitbucket': 'bitbucket',
  'n8n-nodes-base.bitbucketTrigger': 'bitbucket',
  'n8n-nodes-base.jira': 'jira',
  'n8n-nodes-base.jiraTrigger': 'jira',
  'n8n-nodes-base.linearApp': 'linear',
  'n8n-nodes-base.linearAppTrigger': 'linear',
  
  // CRM / Sales
  'n8n-nodes-base.salesforce': 'salesforce',
  'n8n-nodes-base.salesforceTrigger': 'salesforce',
  'n8n-nodes-base.hubspot': 'hubspot',
  'n8n-nodes-base.hubspotTrigger': 'hubspot',
  'n8n-nodes-base.pipedrive': 'pipedrive',
  'n8n-nodes-base.pipedriveTrigger': 'pipedrive',
  'n8n-nodes-base.zoho': 'zoho-crm',
  'n8n-nodes-base.freshdesk': 'freshdesk',
  'n8n-nodes-base.zendesk': 'zendesk',
  'n8n-nodes-base.zendeskTrigger': 'zendesk',
  'n8n-nodes-base.intercom': 'intercom',
  
  // Marketing / Email
  'n8n-nodes-base.mailchimp': 'mailchimp',
  'n8n-nodes-base.mailchimpTrigger': 'mailchimp',
  'n8n-nodes-base.sendGrid': 'sendgrid',
  'n8n-nodes-base.mailerlite': 'mailerlite',
  'n8n-nodes-base.activeCampaign': 'activecampaign',
  'n8n-nodes-base.convertKit': 'convertkit',
  'n8n-nodes-base.klaviyo': 'klaviyo',
  
  // Finance / Accounting
  'n8n-nodes-base.stripe': 'stripe',
  'n8n-nodes-base.stripeTrigger': 'stripe',
  'n8n-nodes-base.quickBooks': 'quickbooks',
  'n8n-nodes-base.xero': 'xero',
  'n8n-nodes-base.payPal': 'paypal',
  'n8n-nodes-base.payPalTrigger': 'paypal',
  'n8n-nodes-base.square': 'square',
  
  // Crypto / Trading
  'n8n-nodes-base.binance': 'binance',
  'n8n-nodes-base.coinbase': 'coinbase',
  
  // Cloud Storage
  'n8n-nodes-base.dropbox': 'dropbox',
  'n8n-nodes-base.dropboxTrigger': 'dropbox',
  'n8n-nodes-base.box': 'box',
  'n8n-nodes-base.boxTrigger': 'box',
  'n8n-nodes-base.awsS3': 'aws',
  
  // Communication
  'n8n-nodes-base.zoom': 'zoom',
  'n8n-nodes-base.zoomTrigger': 'zoom',
  'n8n-nodes-base.webex': 'webex',
  
  // E-commerce
  'n8n-nodes-base.shopify': 'shopify',
  'n8n-nodes-base.shopifyTrigger': 'shopify',
  'n8n-nodes-base.wooCommerce': 'woocommerce',
  'n8n-nodes-base.wooCommerceTrigger': 'woocommerce',
  
  // Analytics
  'n8n-nodes-base.segment': 'segment',
  'n8n-nodes-base.amplitude': 'amplitude',
  'n8n-nodes-base.mixpanel': 'mixpanel',
  
  // Other popular integrations
  'n8n-nodes-base.twilio': 'twilio',
  'n8n-nodes-base.sendSms': 'twilio',
  'n8n-nodes-base.openAi': 'openai',
  'n8n-nodes-base.spotify': 'spotify',
  'n8n-nodes-base.youtube': 'youtube',
}

/**
 * Get the Nango provider ID for an n8n node type
 * 
 * @param nodeType - The n8n node type (e.g., 'n8n-nodes-base.twitter')
 * @returns The Nango provider ID or null if no mapping exists
 */
export function getProviderForNode(nodeType: string | undefined): string | null {
  if (!nodeType) return null
  return NODE_TO_PROVIDER[nodeType] || null
}

/**
 * Get the Nango provider ID from a node definition
 * Handles both full node type and just the name
 * 
 * @param nodeDefinition - The n8n node definition object
 * @returns The Nango provider ID or null if no mapping exists
 */
export function getProviderFromDefinition(nodeDefinition: { name?: string } | null | undefined): string | null {
  if (!nodeDefinition) return null
  
  const nodeName = nodeDefinition.name
  
  // Try full type first (e.g., 'n8n-nodes-base.twitter')
  if (nodeName && NODE_TO_PROVIDER[nodeName]) {
    return NODE_TO_PROVIDER[nodeName]
  }
  
  // Try with common prefixes (if node name doesn't include prefix)
  if (nodeName && !nodeName.includes('.')) {
    const prefixes = ['n8n-nodes-base.', '@n8n/n8n-nodes-']
    for (const prefix of prefixes) {
      const withPrefix = `${prefix}${nodeName}`
      if (NODE_TO_PROVIDER[withPrefix]) {
        return NODE_TO_PROVIDER[withPrefix]
      }
    }
  }
  
  // Try extracting base name and searching for partial match
  // e.g., 'n8n-nodes-base.twitterV2' -> search for 'twitter'
  if (nodeName) {
    const baseName = nodeName.split('.').pop()?.toLowerCase() || ''
    // Remove version suffix (V2, v2, etc.)
    const cleanBaseName = baseName.replace(/v\d+$/i, '')
    // Remove 'trigger' suffix
    const withoutTrigger = cleanBaseName.replace(/trigger$/i, '')
    
    // Search for partial match in values
    for (const [key, value] of Object.entries(NODE_TO_PROVIDER)) {
      const keyBaseName = key.split('.').pop()?.toLowerCase() || ''
      const keyClean = keyBaseName.replace(/v\d+$/i, '').replace(/trigger$/i, '')
      
      if (keyClean === withoutTrigger || keyClean === cleanBaseName) {
        return value
      }
    }
  }
  
  return null
}

/**
 * Check if a node type requires OAuth authentication
 * 
 * @param nodeType - The n8n node type
 * @returns True if the node requires OAuth
 */
export function nodeRequiresOAuth(nodeType: string | undefined): boolean {
  return getProviderForNode(nodeType) !== null
}

/**
 * Get display name for a provider
 * Used for UI labels when the provider name needs to be human-readable
 */
export function getProviderDisplayName(providerId: string): string {
  const displayNames: Record<string, string> = {
    'twitter': 'X',
    'discord': 'Discord',
    'slack': 'Slack',
    'google-sheets': 'Google Sheets',
    'google-drive': 'Google Drive',
    'google-calendar': 'Google Calendar',
    'google-mail': 'Gmail',
    'notion': 'Notion',
    'airtable': 'Airtable',
    'github': 'GitHub',
    'gitlab': 'GitLab',
    'salesforce': 'Salesforce',
    'hubspot': 'HubSpot',
    'stripe': 'Stripe',
    'binance': 'Binance',
    'coinbase': 'Coinbase',
    'shopify': 'Shopify',
    'zoom': 'Zoom',
    'microsoft-outlook': 'Microsoft Outlook',
    'microsoft-teams': 'Microsoft Teams',
    'onedrive': 'OneDrive',
  }
  
  return displayNames[providerId] || providerId.charAt(0).toUpperCase() + providerId.slice(1).replace(/-/g, ' ')
}
