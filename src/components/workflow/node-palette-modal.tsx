'use client'

import { useState, useMemo, useEffect } from 'react'
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll'
import { getLucidL2IconUrl } from '@/lib/lucid-l2/config'
import { DialogWithSidebar, DialogSidebarItem } from '@/ui/components/dialog-with-sidebar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, X, Loader2, Zap, ArrowRight, ArrowDown, ArrowUp, Clock, Sparkles, Play, Bell, Webhook, FileText, MessageSquare, Settings } from 'lucide-react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

interface LucidNode {
  name: string
  displayName: string
  description?: string
  category: string
  group?: string[]
  iconUrl?: string | { light: string; dark: string }
  icon?: string
  version?: number | number[]
  properties?: unknown[]
  tags?: string[]
  popularityScore?: number
  codex?: {
    categories?: string[]
    subcategories?: Record<string, string[]>
    alias?: string[]
    resources?: {
      primaryDocumentation?: Array<{ url: string }>
      credentialDocumentation?: Array<{ url: string }>
    }
  }
}

interface NodePaletteModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectNode: (node: LucidNode) => void
  filterToTriggersOnly?: boolean // When true, show only trigger nodes
  filterContext?: 'model' | 'memory' | 'tool' | null // Filter to specific resource types
}

// Sidebar categories based on n8n groups
const CATEGORY_ITEMS: DialogSidebarItem[] = [
  { id: 'all', title: 'All Nodes', icon: Zap, section: 'Browse' },
  { id: 'Transform', title: 'Transform', icon: ArrowRight, section: 'Node Types' },
  { id: 'Input', title: 'Input', icon: ArrowDown, section: 'Node Types' },
  { id: 'Output', title: 'Output', icon: ArrowUp, section: 'Node Types' },
  { id: 'Trigger', title: 'Trigger', icon: Clock, section: 'Node Types' },
]

// Apple-inspired trigger categories (Jony Ive style) - No section labels
const TRIGGER_CATEGORY_ITEMS: DialogSidebarItem[] = [
  { id: 'home', title: 'Home', icon: Zap },
  { id: 'intelligence', title: 'Powered by AI', icon: Sparkles },
  { id: 'web3', title: 'Web3 App', icon: Settings },
  { id: 'on-demand', title: 'On Demand', icon: Play },
  { id: 'when-happens', title: 'When It Happens', icon: Bell },
  { id: 'schedule', title: 'On Schedule', icon: Clock },
  { id: 'webhook', title: 'When Called', icon: Webhook },
  { id: 'form', title: 'Form Submitted', icon: FileText },
  { id: 'conversation', title: 'Conversation', icon: MessageSquare },
]

// AI subcategories for Intelligence section (from n8n API)
const _AI_SUBCATEGORIES = [
  'Agents',
  'Chains',
  'Language Models',
  'Memory',
  'Vector Stores',
  'Embeddings',
  'Tools',
  'Document Loaders',
  'Text Splitters',
  'Output Parsers',
  'Retrievers',
  'Rerankers',
  'Root Nodes',
  'Miscellaneous'
]

// Default top apps (famous integrations) - Popular services
const DEFAULT_TOP_APPS = [
  'asana',
  'discord',
  'googleCalendar',
  'inoreader',
  'notion',
  'googleDrive',
  'gmail',
  'googleSheets',
  'slack',
  'hubspot',
  'googleForms',
  'facebookLeadAds',
  'mailchimp',
  'salesforce',
  'trello',
  'airtable',
  'stripe',
  'shopify',
  'twitter',
  'linkedin',
  'github',
  'gitlab',
  'jira',
  'zoom',
  'calendly',
  'typeform',
  'mailgun',
  'sendgrid',
  'twilio',
  'dropbox',
  'onedrive',
  'box',
  'monday',
  'clickup',
  'zendesk',
  'intercom',
  'drift',
  'pipedrive',
  'activeCampaign',
  'convertKit',
  'getResponse'
]

// Helper: Check if node is a trigger
const isTriggerNode = (node: LucidNode): boolean => {
  // Check both group AND category for trigger classification
  // API filters use category, but some nodes also have group metadata
  return (node.group?.includes('trigger') ?? false) || node.category === 'Trigger'
}

// Helper: Check if node has AI capabilities
const hasAICapability = (node: LucidNode): boolean => {
  return node.codex?.categories?.includes('AI') ?? false
}

// Helper: Clean display name (remove " Trigger" suffix)
const getCleanDisplayName = (displayName: string): string => {
  return displayName.replace(/ Trigger$/i, '')
}

// Helper: Filter nodes by trigger category
const filterByTriggerCategory = (nodes: LucidNode[], categoryId: string): LucidNode[] => {
  switch (categoryId) {
    case 'home':
      // Show all triggers for Home view
      return nodes.filter(isTriggerNode)
    
    case 'intelligence':
      // AI-powered triggers
      return nodes.filter(node => 
        isTriggerNode(node) && hasAICapability(node)
      )
    
    case 'web3':
      // Web3/Crypto triggers (Hyperliquid, Polymarket, Solana)
      return nodes.filter(node =>
        isTriggerNode(node) &&
        (node.name.toLowerCase().includes('hyperliquid') ||
         node.name.toLowerCase().includes('polymarket') ||
         node.name.toLowerCase().includes('solana') ||
         node.name.toLowerCase().includes('ethereum') ||
         node.name.toLowerCase().includes('web3'))
      )
    
    case 'on-demand':
      // Manual triggers
      return nodes.filter(node =>
        isTriggerNode(node) && 
        (node.name.toLowerCase().includes('manual') ||
         node.displayName.toLowerCase().includes('manual'))
      )
    
    case 'when-happens':
      // App event triggers (most integration triggers)
      return nodes.filter(node =>
        isTriggerNode(node) &&
        !node.name.toLowerCase().includes('manual') &&
        !node.name.toLowerCase().includes('schedule') &&
        !node.name.toLowerCase().includes('cron') &&
        !node.name.toLowerCase().includes('interval') &&
        !node.name.toLowerCase().includes('webhook') &&
        !node.name.toLowerCase().includes('form') &&
        !hasAICapability(node)
      )
    
    case 'schedule':
      // Time-based triggers
      return nodes.filter(node =>
        isTriggerNode(node) &&
        (node.name.toLowerCase().includes('schedule') ||
         node.name.toLowerCase().includes('cron') ||
         node.name.toLowerCase().includes('interval') ||
         node.group?.includes('schedule'))
      )
    
    case 'webhook':
      // HTTP webhooks and SSE
      return nodes.filter(node =>
        isTriggerNode(node) &&
        (node.name.toLowerCase().includes('webhook') ||
         node.name.toLowerCase().includes('sse'))
      )
    
    case 'form':
      // Form submission triggers
      return nodes.filter(node =>
        isTriggerNode(node) &&
        node.name.toLowerCase().includes('form')
      )
    
    case 'conversation':
      // Chat and messaging triggers
      return nodes.filter(node =>
        isTriggerNode(node) &&
        (node.name.toLowerCase().includes('chat') ||
         node.codex?.categories?.includes('Communication'))
      )
    
    case 'advanced':
      // Technical triggers (MCP, Error, Email, File)
      return nodes.filter(node =>
        isTriggerNode(node) &&
        (node.name.toLowerCase().includes('mcp') ||
         node.name.toLowerCase().includes('error') ||
         node.name.toLowerCase().includes('email') ||
         node.name.toLowerCase().includes('file') ||
         node.name.toLowerCase().includes('n8n'))
      )
    
    default:
      return nodes.filter(isTriggerNode)
  }
}

// NodeIcon component to render branded SVG icons from n8n
function NodeIcon({ node }: { node: LucidNode }) {
  const iconUrl = node?.iconUrl
  const icon = node?.icon
  
  // Priority 1: Use iconUrl (branded SVG via n8n icon API)
  if (iconUrl) {
    // Handle theme-aware icons (object with light/dark)
    if (typeof iconUrl === 'object' && 'light' in iconUrl && iconUrl.light) {
      const iconPath = iconUrl.light
      const fullIconUrl = getLucidL2IconUrl(iconPath)
      return (
        <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
          <Image
            src={fullIconUrl}
            alt={node.displayName || 'Node icon'}
            width={20}
            height={20}
            className="w-full h-full object-contain"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              target.parentElement?.classList.add('hidden')
            }}
          />
        </div>
      )
    }
    
    // Handle simple string path
    if (typeof iconUrl === 'string' && iconUrl.length > 0) {
      const fullIconUrl = getLucidL2IconUrl(iconUrl)
      return (
        <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
          <Image
            src={fullIconUrl}
            alt={node.displayName || 'Node icon'}
            width={20}
            height={20}
            className="w-full h-full object-contain"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
              target.parentElement?.classList.add('hidden')
            }}
          />
        </div>
      )
    }
  }
  
  // Priority 2: Use Font Awesome icon
  if (icon && typeof icon === 'string' && icon.startsWith('fa:')) {
    const iconName = icon.replace('fa:', '')
    return (
      <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center text-muted-foreground">
        <i className={`fa fa-${iconName}`} aria-hidden="true" />
      </div>
    )
  }
  
  // Fallback: Use emoji
  return (
    <span className="text-lg flex-shrink-0" role="img" aria-label="default icon">
      ⚡
    </span>
  )
}

export function NodePaletteModal({ open, onOpenChange, onSelectNode, filterToTriggersOnly = false, filterContext = null }: NodePaletteModalProps) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedAISubcategory, setSelectedAISubcategory] = useState<string | null>(null)
  
  // Update category when filterToTriggersOnly changes
  useEffect(() => {
    // Always start with Home view for both trigger and action modes
    setSelectedCategory('home')
  }, [filterToTriggersOnly])

  // Clear search when modal opens or context changes
  useEffect(() => {
    if (open) {
      setSearch('') // Clear search on open
    }
  }, [open, filterContext])

  // Memoize filters for infinite scroll - GLOBAL SEARCH (ignores category when searching)
  const filters = useMemo(() => {
    const f: Record<string, string> = {}
    
    // When searching, make it global - ignore category filtering
    if (search && search.trim().length > 0) {
      f.q = search.trim()
      // Don't apply category filter during search - search everything
    } else {
      // If filterContext is present (model/memory/tool), use Elasticsearch subcategory
      // This is MUCH faster than client-side filtering!
      if (filterContext) {
        f.codexCategory = 'AI'
        
        // Map context to Elasticsearch subcategory (exact match)
        switch (filterContext) {
          case 'model':
            f.codexSubcategory = 'Language Models'
            break
          case 'memory':
            f.codexSubcategory = 'Memory'
            break
          case 'tool':
            f.codexSubcategory = 'Tools'
            break
        }
      } else if (filterToTriggersOnly) {
        // ONLY filter to Trigger category when in trigger mode AND no filterContext
        f.category = 'Trigger'
        
        // ADDITIONALLY add codexCategory for specific sections
        if (selectedCategory === 'intelligence') {
          f.codexCategory = 'AI' // AI Triggers: category=Trigger&codexCategory=AI
        }
      } else {
        // When NOT in trigger mode, still use the nice category structure
        // but DON'T filter by trigger - show ALL nodes
        if (selectedCategory === 'intelligence') {
          f.codexCategory = 'AI' // AI nodes (any category)
        }
        // Don't filter by category - show all node types
      }
    }
    
    return f
  }, [search, selectedCategory, filterToTriggersOnly, filterContext])

  const {
    items: allNodes,
    isLoading,
    isEmpty,
    error,
    loadMore,
    isLoadingMore,
    isReachingEnd,
    refresh
  } = useInfiniteScroll<LucidNode>({
    endpoint: '/api/lucid-l2/nodes',
    initialFilters: filters,
    limit: 50
  })

  // Apply client-side category filtering
  // NOTE: For Intelligence view, Elasticsearch already filtered to AI nodes via codexCategory=AI
  const nodes = useMemo(() => {
    // FIRST: Sort by popularity (most popular first)
    // Industry standard: Show most commonly used nodes first
    const sorted = [...allNodes].sort((a, b) => {
      const scoreA = a.popularityScore || 0
      const scoreB = b.popularityScore || 0
      return scoreB - scoreA // Descending order (highest first)
    })
    
    // SECOND: Filter out triggers when in action mode (after first node added)
    // Industry standard: One trigger per workflow (n8n, Zapier, Make.com)
    // IMPORTANT: Don't filter during search - user might be searching for anything!
    let filtered = sorted
    const isSearching = search && search.trim().length > 0
    
    if (!filterToTriggersOnly && !isSearching) {
      // In action mode (NOT searching): EXCLUDE all triggers
      filtered = sorted.filter(node => !isTriggerNode(node))
    }
    
    // THEN: Apply contextual filtering if context is provided (model/memory/tool)
    if (filterContext) {
      filtered = allNodes.filter(node => {
        const nameLower = node.name?.toLowerCase() || ''
        const displayNameLower = node.displayName?.toLowerCase() || ''
        
        switch(filterContext) {
          case 'model':
            return nameLower.includes('chat model') || 
                   displayNameLower.includes('chat model') ||
                   nameLower.includes('chatmodel') ||
                   displayNameLower.includes('model') ||
                   nameLower.includes('lmchat') || // Langchain chat models
                   displayNameLower.toLowerCase().includes('model')
          case 'memory':
            return nameLower.includes('memory') ||
                   displayNameLower.includes('memory')
          case 'tool':
            return nameLower.includes('tool') ||
                   displayNameLower.includes('tool')
          default:
            return true
        }
      })
    }
    
    // Intelligence view: Already filtered by ES
    if (selectedCategory === 'intelligence') {
      return filtered // Already filtered by codexCategory=AI
    }
    
    // Home view: Show all (but apply context filter if present)
    if (selectedCategory === 'home') {
      return filtered
    }
    
    // Web3 view: Show web3 nodes filtered by mode
    if (selectedCategory === 'web3') {
      return filtered.filter((node) => {
        // First check if it's a web3 node
        const hasWeb3Tag = node.tags?.some(tag => 
          tag.includes('category:web3') ||
          tag.includes('category:defi') ||
          tag.includes('category:wallet') ||
          tag.includes('category:blockchain') ||
          tag.includes('category:bridge') ||
          tag.includes('category:ai-agent')
        )
        
        const hasWeb3Name = node.name.toLowerCase().includes('hyperliquid') ||
                           node.name.toLowerCase().includes('polymarket') ||
                           node.name.toLowerCase().includes('solana') ||
                           node.name.toLowerCase().includes('ethereum') ||
                           node.name.toLowerCase().includes('web3') ||
                           node.name.toLowerCase().includes('metamask') ||
                           node.name.toLowerCase().includes('phantom') ||
                           node.name.toLowerCase().includes('jupiter') ||
                           node.name.toLowerCase().includes('wormhole') ||
                           node.name.toLowerCase().includes('meteora') ||
                           node.name.toLowerCase().includes('apechain') ||
                           node.name.toLowerCase().includes('bananet') ||
                           node.name.toLowerCase().includes('pumpfun') ||
                           node.name.toLowerCase().includes('x402')
        
        const isWeb3Node = hasWeb3Tag || hasWeb3Name
        
        // Then filter by trigger/action mode
        if (!isWeb3Node) return false
        
        if (filterToTriggersOnly) {
          return isTriggerNode(node)  // Only Web3 triggers
        } else {
          return !isTriggerNode(node) // Only Web3 actions
        }
      })
    }
    
    // If in trigger mode, apply trigger filtering
    if (filterToTriggersOnly) {
      return filterByTriggerCategory(filtered, selectedCategory)
    }
    
    // Otherwise show all nodes (with context filter applied if present)
    return filtered
  // eslint-disable-next-line react-hooks/exhaustive-deps -- search excluded for debounce
  }, [allNodes, filterToTriggersOnly, selectedCategory, filterContext])

  // Group nodes by category for display (when viewing "All")
  const grouped = useMemo(() => {
    const result = nodes.reduce((acc, node) => {
      const category = node.category
      if (!acc[category]) acc[category] = []
      acc[category].push(node)
      return acc
    }, {} as Record<string, LucidNode[]>)
    
    return result
  }, [nodes])

  // Helper: Get Core Nodes (built-in tools) - Industry standard filtering
  const getCoreNodes = () => {
    const coreNodes = nodes.filter(node => {
      // In trigger mode: only triggers
      // In action mode: only actions (non-triggers)
      if (filterToTriggersOnly) {
        if (!isTriggerNode(node)) return false
      } else {
        if (isTriggerNode(node)) return false
      }
      
      // Check if it's in Core Nodes category OR if it's a built-in n8n node
      const hasCategory = node.codex?.categories?.includes('Core Nodes')
      const isBuiltIn = node.name.startsWith('n8n-nodes-base.') && 
                       !node.name.includes('Trigger') // Exclude app triggers
      
      return hasCategory || isBuiltIn
    })
    
    // Sort by most commonly used (manual, webhook, schedule first)
    const priorityOrder = ['manual', 'webhook', 'schedule', 'cron', 'email', 'form']
    return coreNodes.sort((a, b) => {
      const aPriority = priorityOrder.findIndex(p => a.name.toLowerCase().includes(p))
      const bPriority = priorityOrder.findIndex(p => b.name.toLowerCase().includes(p))
      
      if (aPriority === -1 && bPriority === -1) return 0
      if (aPriority === -1) return 1
      if (bPriority === -1) return -1
      return aPriority - bPriority
    })
  }

  // Helper: Get AI nodes
  const getAINodes = () => {
    return nodes.filter(node => {
      // In trigger mode: only AI triggers
      // In action mode: only AI actions
      if (filterToTriggersOnly) {
        return isTriggerNode(node) && hasAICapability(node)
      } else {
        return !isTriggerNode(node) && hasAICapability(node)
      }
    })
  }

  // Pre-calculate AI nodes and subcategories at component level
  // NOTE: Elasticsearch already filtered to AI nodes when codexCategory=AI is used
  const aiNodes = useMemo(() => {
    // If in Intelligence view, nodes are already AI nodes from ES
    if (filterToTriggersOnly && selectedCategory === 'intelligence') {
      return nodes // Already filtered by codexCategory=AI
    }
    // Otherwise filter client-side
    return nodes.filter(node => hasAICapability(node))
  }, [nodes, filterToTriggersOnly, selectedCategory])

  const aiSubcategories = useMemo(() => {
    const subs = new Set<string>()
    aiNodes.forEach(node => {
      const aiSubs = node.codex?.subcategories?.AI
      if (aiSubs && Array.isArray(aiSubs)) {
        aiSubs.forEach(sub => subs.add(sub))
      }
    })
    return Array.from(subs).sort()
  }, [aiNodes])

  // Helper: Get top app nodes (famous integrations) - Industry standard: Map-based ordering
  const getTopAppNodes = () => {
    // Create priority map: app name -> index (lower = higher priority)
    const priorityMap = new Map<string, number>()
    DEFAULT_TOP_APPS.forEach((app, index) => {
      priorityMap.set(app.toLowerCase(), index)
    })
    
    // Filter nodes that match DEFAULT_TOP_APPS
    // In trigger mode: only triggers. In action mode: all nodes
    const matchingNodes = nodes.filter(node => {
      if (filterToTriggersOnly && !isTriggerNode(node)) return false
      const nodeName = node.name.toLowerCase()
      return Array.from(priorityMap.keys()).some(app => nodeName.includes(app))
    })
    
    // Sort by priority (index in DEFAULT_TOP_APPS array)
    return matchingNodes.sort((a, b) => {
      const aName = a.name.toLowerCase()
      const bName = b.name.toLowerCase()
      
      // Find which app from DEFAULT_TOP_APPS each node matches
      let aPriority = Infinity
      let bPriority = Infinity
      
      for (const [app, priority] of priorityMap.entries()) {
        if (aName.includes(app)) {
          aPriority = Math.min(aPriority, priority)
        }
        if (bName.includes(app)) {
          bPriority = Math.min(bPriority, priority)
        }
      }
      
      return aPriority - bPriority
    })
  }

  // Intelligence view renderer (AI with subcategory chips)
  const renderIntelligenceView = () => {
    // Filter nodes by selected subcategory (use component-level state and memoized values)
    const filteredNodes = selectedAISubcategory
      ? aiNodes.filter(node => 
          node.codex?.subcategories?.AI?.includes(selectedAISubcategory)
        )
      : aiNodes
    
    return (
      <div className="space-y-6">
        {/* Subcategory chips */}
        {aiSubcategories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedAISubcategory(null)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-full transition-colors duration-120",
                !selectedAISubcategory
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
            >
              All
            </button>
            {aiSubcategories.map(sub => (
              <button
                key={sub}
                onClick={() => setSelectedAISubcategory(sub)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-full transition-colors duration-120",
                  selectedAISubcategory === sub
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                )}
              >
                {sub}
              </button>
            ))}
          </div>
        )}
        
        {/* AI Nodes List */}
        <div className="space-y-2">
          {filteredNodes.length > 0 ? (
            filteredNodes.map((node) => (
              <button
                key={node.name}
                onClick={() => {
                  console.log('[NodePaletteModal] Node clicked:', node.displayName, node.name)
                  console.log('[NodePaletteModal] Calling onSelectNode...')
                  onSelectNode(node)
                  console.log('[NodePaletteModal] Calling onOpenChange(false)...')
                  onOpenChange(false)
                  console.log('[NodePaletteModal] Modal should close now')
                }}
                className="
                  w-full p-4 rounded-lg border border-border
                  hover:bg-accent hover:border-accent-foreground/20
                  transition-colors duration-120 text-left
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                "
              >
                <div className="flex items-start gap-3">
                  <NodeIcon node={node} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      {getCleanDisplayName(node.displayName)}
                    </div>
                    {node.description && (
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {node.description}
                      </div>
                    )}
                    {/* Show subcategories as badges */}
                    {node.codex?.subcategories?.AI && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {node.codex.subcategories.AI.slice(0, 3).map(sub => (
                          <span
                            key={sub}
                            className="px-2 py-0.5 text-[10px] font-medium rounded bg-primary/10 text-primary"
                          >
                            {sub}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No AI nodes found
              {selectedAISubcategory && ` in "${selectedAISubcategory}"`}
            </p>
          )}
        </div>
      </div>
    )
  }

  // Helper: Get Web3/Crypto nodes (using tags for better filtering)
  const getWeb3Nodes = () => {
    return nodes.filter(node => {
      // In trigger mode: only Web3 triggers
      // In action mode: only Web3 actions
      if (filterToTriggersOnly) {
        if (!isTriggerNode(node)) return false
      } else {
        if (isTriggerNode(node)) return false
      }
      
      // Check if node has web3-related tags
      const hasWeb3Tag = node.tags?.some(tag => 
        tag.includes('category:web3') ||
        tag.includes('category:defi') ||
        tag.includes('category:wallet') ||
        tag.includes('category:blockchain') ||
        tag.includes('category:bridge') ||
        tag.includes('category:ai-agent') ||
        tag.includes('provider:hyperliquid') ||
        tag.includes('provider:polymarket') ||
        tag.includes('provider:solana') ||
        tag.includes('provider:metamask') ||
        tag.includes('provider:phantom')
      )
      
      // Also check name for nodes without tags (backwards compatibility)
      const hasWeb3Name = node.name.toLowerCase().includes('hyperliquid') ||
                         node.name.toLowerCase().includes('polymarket') ||
                         node.name.toLowerCase().includes('solana') ||
                         node.name.toLowerCase().includes('ethereum') ||
                         node.name.toLowerCase().includes('web3') ||
                         node.name.toLowerCase().includes('metamask') ||
                         node.name.toLowerCase().includes('phantom') ||
                         node.name.toLowerCase().includes('jupiter') ||
                         node.name.toLowerCase().includes('wormhole') ||
                         node.name.toLowerCase().includes('meteora') ||
                         node.name.toLowerCase().includes('apechain') ||
                         node.name.toLowerCase().includes('bananet') ||
                         node.name.toLowerCase().includes('pumpfun') ||
                         node.name.toLowerCase().includes('x402')
      
      return hasWeb3Tag || hasWeb3Name
    })
  }

  // Home view renderer (Zapier-style)
  const renderHomeView = () => {
    const topApps = getTopAppNodes()
    const coreNodes = getCoreNodes()
    const aiNodes = getAINodes()
    const web3Nodes = getWeb3Nodes()

    return (
      <div className="space-y-8">
        <div className="grid grid-cols-2 gap-6">
          {/* Left Column: Your top apps */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">Your top apps</h3>
            <div className="space-y-2">
              {topApps.length > 0 ? (
                topApps.map((node) => (
                  <button
                    key={node.name}
                    onClick={() => {
                      onSelectNode(node)
                      onOpenChange(false)
                    }}
                    className="
                      w-full p-3 rounded-lg border border-border
                      hover:bg-accent hover:border-accent-foreground/20
                      transition-colors duration-120 text-left
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                    "
                  >
                    <div className="flex items-center gap-3">
                      <NodeIcon node={node} />
                      <span className="text-sm font-medium text-foreground">
                        {getCleanDisplayName(node.displayName)}
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No top apps found</p>
              )}
            </div>
          </div>

          {/* Right Column: Web3 Apps + Popular built-in tools */}
          <div className="space-y-6">
            {/* Web3 Apps */}
            {web3Nodes.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-4">Web3 Apps</h3>
                <div className="space-y-2">
                  {web3Nodes.map((node) => (
                    <button
                      key={node.name}
                      onClick={() => {
                        onSelectNode(node)
                        onOpenChange(false)
                      }}
                      className="
                        w-full p-3 rounded-lg border border-border
                        hover:bg-accent hover:border-accent-foreground/20
                        transition-colors duration-120 text-left
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                      "
                    >
                      <div className="flex items-center gap-3">
                        <NodeIcon node={node} />
                        <span className="text-sm font-medium text-foreground">
                          {getCleanDisplayName(node.displayName)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Popular built-in tools */}
            {coreNodes.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-4">Popular built-in tools</h3>
                <div className="space-y-2">
                  {coreNodes.slice(0, 10).map((node) => (
                    <button
                      key={node.name}
                      onClick={() => {
                        onSelectNode(node)
                        onOpenChange(false)
                      }}
                      className="
                        w-full p-3 rounded-lg border border-border
                        hover:bg-accent hover:border-accent-foreground/20
                        transition-colors duration-120 text-left
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                      "
                    >
                      <div className="flex items-center gap-3">
                        <NodeIcon node={node} />
                        <span className="text-sm font-medium text-foreground">
                          {getCleanDisplayName(node.displayName)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI Section */}
        {aiNodes.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-4">AI</h3>
            <div className="grid grid-cols-2 gap-2">
              {aiNodes.map((node) => (
                <button
                  key={node.name}
                  onClick={() => {
                    onSelectNode(node)
                    onOpenChange(false)
                  }}
                  className="
                    w-full p-3 rounded-lg border border-border
                    hover:bg-accent hover:border-accent-foreground/20
                    transition-colors duration-120 text-left
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                  "
                >
                  <div className="flex items-center gap-3">
                    <NodeIcon node={node} />
                    <span className="text-sm font-medium text-foreground">
                      {getCleanDisplayName(node.displayName)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Content for each category
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <p className="text-sm text-destructive mb-2">Failed to load nodes</p>
          <p className="text-xs text-muted-foreground mb-4">
            {typeof error === 'string' ? error : error?.message || 'Unknown error'}
          </p>
          <Button variant="outline" size="sm" onClick={refresh}>
            Retry
          </Button>
        </div>
      )
    }

    if (isEmpty) {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            No nodes found
            {search && ` for "${search}"`}
          </p>
          {search && (
            <Button variant="ghost" size="sm" onClick={() => setSearch('')}>
              Clear search
            </Button>
          )}
        </div>
      )
    }

    // Home view (Zapier-style): Show sections for both triggers AND actions
    if (selectedCategory === 'home' && !search) {
      return renderHomeView()
    }

    // Intelligence view: Show AI nodes with subcategory chips
    if (filterToTriggersOnly && selectedCategory === 'intelligence' && !search) {
      return renderIntelligenceView()
    }

    // Filtered view (category OR search): Flat list
    if (selectedCategory !== 'all' || search) {
      return (
        <div className="space-y-2">
          {nodes.map((node) => (
            <button
              key={node.name}
              onClick={() => {
                onSelectNode(node)
                onOpenChange(false)
              }}
              className="
                w-full p-4 rounded-lg border border-border
                hover:bg-accent hover:border-accent-foreground/20
                transition-colors duration-120 text-left
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
              "
            >
              <div className="flex items-start gap-3">
                <NodeIcon node={node} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground">
                    {getCleanDisplayName(node.displayName)}
                  </div>
                  {node.description && (
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {node.description}
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}

          {/* Load more */}
          {!isReachingEnd && !isLoadingMore && (
            <div className="flex justify-center py-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={loadMore}
                className="text-xs"
              >
                Load More Nodes
              </Button>
            </div>
          )}

          {isLoadingMore && (
            <div className="flex justify-center items-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-xs text-muted-foreground">Loading...</span>
            </div>
          )}

          {/* Footer count */}
          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground text-center">
              {nodes.length} node{nodes.length !== 1 ? 's' : ''} loaded
              {!isReachingEnd && ' • More available'}
            </p>
          </div>
        </div>
      )
    }

    // All view: Show categories with headers
    return (
      <div className="space-y-6">
        {Object.entries(grouped).map(([category, categoryNodes]) => {
          if (!categoryNodes || categoryNodes.length === 0) return null

          return (
            <div key={category} className="animate-in fade-in duration-200">
              <h3 className="text-xs font-semibold text-foreground mb-3 uppercase tracking-wide">
                {category}
              </h3>
              <div className="space-y-2">
                {categoryNodes.map((node) => (
                  <button
                    key={node.name}
                    onClick={() => {
                      onSelectNode(node)
                      onOpenChange(false)
                    }}
                    className="
                      w-full p-4 rounded-lg border border-border
                      hover:bg-accent hover:border-accent-foreground/20
                      transition-colors duration-120 text-left
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                    "
                  >
                    <div className="flex items-start gap-3">
                      <NodeIcon node={node} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground">
                          {getCleanDisplayName(node.displayName)}
                        </div>
                        {node.description && (
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {node.description}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )
        })}

        {/* Load more */}
        {!isReachingEnd && !isLoadingMore && (
          <div className="flex justify-center py-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadMore}
              className="text-xs"
            >
              Load More Nodes
            </Button>
          </div>
        )}

        {isLoadingMore && (
          <div className="flex justify-center items-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <span className="ml-2 text-xs text-muted-foreground">Loading...</span>
          </div>
        )}

        {/* Footer count */}
        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground text-center">
            {nodes.length} node{nodes.length !== 1 ? 's' : ''} loaded
            {!isReachingEnd && ' • More available'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <DialogWithSidebar
      open={open}
      onOpenChange={onOpenChange}
      title={
        filterContext === 'model' ? "Select Chat Model" :
        filterContext === 'memory' ? "Select Memory" :
        filterContext === 'tool' ? "Select Tool" :
        filterToTriggersOnly ? "Add a Trigger" : "Add Node"
      }
      description={
        filterContext === 'model' ? "Choose an AI chat model for your agent" :
        filterContext === 'memory' ? "Choose a memory system for your agent" :
        filterContext === 'tool' ? "Choose a tool for your agent" :
        filterToTriggersOnly ? "Choose how this workflow will start" : "Search and browse 800+ workflow nodes"
      }
      items={filterToTriggersOnly ? TRIGGER_CATEGORY_ITEMS : CATEGORY_ITEMS}
      currentItem={selectedCategory}
      onItemChange={setSelectedCategory}
      showBreadcrumb={false}
    >
      {/* Search Bar - GLOBAL (no breadcrumb, no notice) */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search all nodes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 pl-9 pr-9"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Node List */}
      {renderContent()}
    </DialogWithSidebar>
  )
}
