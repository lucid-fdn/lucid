/**
 * Workspace Navigation Configuration
 * 
 * Follows the same pattern as settings-nav.ts
 * Scales from simple workspace (MVP) to full hierarchy (Enterprise)
 */

export interface NavItem {
  title: string
  href: string
  icon: string // Lucide icon name
  description?: string
  badge?: {
    text: string
    variant?: 'default' | 'secondary' | 'destructive' | 'outline'
  }
  plans?: Array<'starter' | 'pro' | 'business'> // Which plans can see this
}

export interface NavSection {
  title?: string
  items: NavItem[]
}

/**
 * Level 1: Workspace Navigation (All Plans)
 * Direct access to workspace-level features
 */
export const workspaceNavigation: NavItem[] = [
  {
    title: 'Overview',
    href: '/workspace',
    icon: 'LayoutDashboard',
    description: 'Workspace dashboard and overview',
    plans: ['starter', 'pro', 'business'],
  },
  {
    title: 'Brain',
    href: '/workspace/knowledge',
    icon: 'Brain',
    description: 'Workspace context, knowledge, review, and recall',
    plans: ['starter', 'pro', 'business'],
  },
  {
    title: 'Functions',
    href: '/workspace/functions',
    icon: 'Zap',
    description: 'Serverless functions and APIs',
    plans: ['starter', 'pro', 'business'],
  },
  {
    title: 'Analytics',
    href: '/workspace/analytics',
    icon: 'BarChart3',
    description: 'Usage statistics and insights',
    plans: ['starter', 'pro', 'business'],
  },
  {
    title: 'Team',
    href: '/workspace/team',
    icon: 'Users',
    description: 'Team members and permissions',
    plans: ['starter', 'pro', 'business'],
  },
  {
    title: 'Agents',
    href: '/workspace/assistants',
    icon: 'Bot',
    description: 'Personal AI agents for Telegram, WhatsApp, and other channels',
    plans: ['starter', 'pro', 'business'],
  },
  {
    title: 'Video Studio',
    href: '/workspace/video',
    icon: 'Film',
    plans: ['starter', 'pro', 'business'],
  },
  {
    title: 'Content Studio',
    href: '/workspace/studio',
    icon: 'PenLine',
    description: 'AI-powered content creation and publishing',
    plans: ['starter', 'pro', 'business'],
  },
  {
    title: 'Explore',
    href: '/workspace/explore',
    icon: 'Compass',
    description: 'Discover AI models, GPU compute, connectors, agents & datasets',
    plans: ['starter', 'pro', 'business'],
  },
  {
    title: 'Settings',
    href: '/workspace/settings',
    icon: 'Settings',
    description: 'Workspace configuration',
    plans: ['starter', 'pro', 'business'],
  },
]

/**
 * Level 2: Projects Section (Pro+)
 * Shows when multiProject feature flag is enabled
 */
export const projectsNavigation: NavItem = {
  title: 'Projects',
  href: '/workspace/projects',
  icon: 'Folder',
  description: 'Manage projects',
  plans: ['pro', 'business'],
}

/**
 * Level 3: Project Detail Navigation (Pro+)
 * Shows when inside a specific project
 */
export const projectDetailNavigation: NavItem[] = [
  {
    title: 'Overview',
    href: '/workspace/projects/[slug]',
    icon: 'Home',
    description: 'Project overview and activity',
    plans: ['pro', 'business'],
  },
  {
    title: 'Agents',
    href: '/workspace/projects/[slug]/agents',
    icon: 'Bot',
    description: 'Agents operating inside this project',
    plans: ['pro', 'business'],
  },
  {
    title: 'Teams',
    href: '/workspace/projects/[slug]/teams',
    icon: 'Users',
    description: 'Coordinated groups of agents',
    plans: ['pro', 'business'],
  },
  {
    title: 'Runs',
    href: '/workspace/projects/[slug]/runs',
    icon: 'PlayCircle',
    description: 'Recent runs, outputs, and attention points',
    plans: ['pro', 'business'],
  },
  {
    title: 'Settings',
    href: '/workspace/projects/[slug]/settings',
    icon: 'Settings',
    description: 'Project settings',
    plans: ['pro', 'business'],
  },
]

/**
 * Level 4: Environments (Enterprise Only)
 * Nested under projects when multiEnv flag is enabled
 */
export const environmentsNavigation = {
  title: 'Environments',
  icon: 'Globe',
  items: [
    {
      id: 'production',
      title: 'Production',
      icon: 'CircleDot',
      color: 'green',
      description: 'Live production environment',
    },
    {
      id: 'staging',
      title: 'Staging',
      icon: 'CircleDot',
      color: 'yellow',
      description: 'Staging environment for testing',
    },
    {
      id: 'development',
      title: 'Development',
      icon: 'CircleDot',
      color: 'blue',
      description: 'Development environment',
    },
  ],
}

/**
 * Bottom Navigation Items (All Plans)
 * Shows below main navigation
 */
export const bottomNavigation: NavItem[] = [
  {
    title: 'Documentation',
    href: 'https://docs.example.com',
    icon: 'BookOpen',
    description: 'Help and documentation',
  },
  {
    title: 'Support',
    href: '/support',
    icon: 'MessageCircle',
    description: 'Get help from our team',
  },
]

/**
 * Upgrade prompt for free plan users
 */
export const upgradeNavItem: NavItem = {
  title: 'Upgrade to Pro',
  href: '/workspace/settings/billing',
  icon: 'ArrowUpCircle',
  description: 'Unlock projects and advanced features',
  badge: {
    text: 'Pro',
    variant: 'default',
  },
}

/**
 * Helper: Filter navigation by plan
 */
export function filterNavigationByPlan(
  items: NavItem[],
  currentPlan: 'starter' | 'pro' | 'business'
): NavItem[] {
  return items.filter(item => {
    if (!item.plans) return true // Show to all if no plans specified
    return item.plans.includes(currentPlan)
  })
}

/**
 * Helper: Replace project slug in hrefs
 */
export function replaceProjectSlug(items: NavItem[], slug: string): NavItem[] {
  return items.map(item => ({
    ...item,
    href: item.href.replace('[slug]', slug),
  }))
}
