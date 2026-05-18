import {
  CircleStackIcon,
  UserGroupIcon,
  RocketLaunchIcon,
  DocumentTextIcon,
  NewspaperIcon,
  ChartPieIcon,
  CogIcon,
  ShieldCheckIcon,
  UserIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline'

export interface SearchItem {
  id: string
  title: string
  description: string
  href: string
  category: 'models' | 'datasets' | 'compute' | 'agents' | 'apps' | 'docs' | 'blog' | 'solutions' | 'enterprise' | 'company'
  icon: React.ComponentType<{ className?: string }>
  keywords: string[]
  shortcut?: string
}

export const searchItems: SearchItem[] = [
  // Navigation & Quick Actions (Real Pages Only)
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'Your main workspace dashboard',
    href: '/dashboard',
    category: 'apps',
    icon: RocketLaunchIcon,
    keywords: ['dashboard', 'home', 'workspace', 'overview'],
    shortcut: 'D'
  },
  {
    id: 'explore',
    title: 'Explore Marketplace',
    description: 'Browse AI models, datasets, and resources',
    href: '/explore',
    category: 'apps',
    icon: CircleStackIcon,
    keywords: ['explore', 'marketplace', 'browse', 'discover', 'models', 'datasets'],
    shortcut: 'E'
  },
  {
    id: 'agents',
    title: 'Your Agents',
    description: 'Manage your AI agents',
    href: '/agents',
    category: 'agents',
    icon: UserGroupIcon,
    keywords: ['agents', 'ai', 'manage', 'workspace'],
    shortcut: 'A'
  },
  {
    id: 'settings-profile',
    title: 'Profile Settings',
    description: 'Manage your profile and preferences',
    href: '/settings/profile',
    category: 'apps',
    icon: UserIcon,
    keywords: ['settings', 'profile', 'account', 'preferences'],
    shortcut: 'P'
  },
  {
    id: 'settings-account',
    title: 'Account Settings',
    description: 'Manage account security and authentication',
    href: '/settings/account',
    category: 'apps',
    icon: ShieldCheckIcon,
    keywords: ['settings', 'account', 'security', 'authentication', '2fa'],
    shortcut: 'S'
  },
  {
    id: 'settings-billing',
    title: 'Billing & Subscription',
    description: 'Manage your subscription and payment methods',
    href: '/settings/billing',
    category: 'apps',
    icon: CogIcon,
    keywords: ['settings', 'billing', 'subscription', 'payment', 'plan'],
    shortcut: 'B'
  },
  {
    id: 'pricing',
    title: 'Pricing Plans',
    description: 'View and upgrade your subscription plan',
    href: '/pricing',
    category: 'solutions',
    icon: ChartPieIcon,
    keywords: ['pricing', 'plans', 'subscription', 'upgrade', 'billing'],
    shortcut: 'P'
  },

  // Documentation
  {
    id: 'getting-started',
    title: 'Getting Started',
    description: 'Quick start guide for Lucid AI platform',
    href: '/docs/getting-started',
    category: 'docs',
    icon: DocumentTextIcon,
    keywords: ['getting', 'started', 'guide', 'tutorial', 'docs'],
    shortcut: 'G'
  },
  {
    id: 'api-reference',
    title: 'API Reference',
    description: 'Complete API documentation and examples',
    href: '/docs/api',
    category: 'docs',
    icon: DocumentTextIcon,
    keywords: ['api', 'reference', 'documentation', 'examples'],
    shortcut: 'A'
  },
  {
    id: 'tutorials',
    title: 'Tutorials',
    description: 'Step-by-step tutorials for common use cases',
    href: '/docs/tutorials',
    category: 'docs',
    icon: DocumentTextIcon,
    keywords: ['tutorials', 'guide', 'examples', 'learning'],
    shortcut: 'T'
  },

  // Blog
  {
    id: 'latest-news',
    title: 'Latest News',
    description: 'Recent updates and announcements from Lucid',
    href: '/blog',
    category: 'blog',
    icon: NewspaperIcon,
    keywords: ['news', 'updates', 'announcements', 'blog'],
    shortcut: 'N'
  },
  {
    id: 'ai-insights',
    title: 'AI Insights',
    description: 'Deep dives into AI technology and trends',
    href: '/blog/insights',
    category: 'blog',
    icon: NewspaperIcon,
    keywords: ['insights', 'ai', 'technology', 'trends', 'analysis'],
    shortcut: 'I'
  },

  // Solutions
  {
    id: 'lucid-data',
    title: 'Lucid Data',
    description: 'Identity and Portable Memory solution',
    href: '/lucid-data',
    category: 'solutions',
    icon: ChartPieIcon,
    keywords: ['lucid', 'data', 'identity', 'memory', 'portable'],
    shortcut: 'L'
  },
  {
    id: 'lucid-engine',
    title: 'Lucid Engine',
    description: 'AI Models and Computation Orchestration',
    href: '/lucid-engine',
    category: 'solutions',
    icon: CogIcon,
    keywords: ['lucid', 'engine', 'models', 'computation', 'orchestration'],
    shortcut: 'E'
  },
  {
    id: 'though-epoque',
    title: 'Though Epoque',
    description: 'Batch proofs on the Blockchain',
    href: '/ai-marketplace',
    category: 'solutions',
    icon: ShieldCheckIcon,
    keywords: ['though', 'epoque', 'blockchain', 'proofs', 'batch'],
    shortcut: 'T'
  },
  // Company
  {
    id: 'about-us',
    title: 'About Us',
    description: 'Learn about Lucid and our mission',
    href: '/company',
    category: 'company',
    icon: UserIcon,
    keywords: ['about', 'company', 'mission', 'team'],
    shortcut: 'A'
  },
  {
    id: 'contact',
    title: 'Contact',
    description: 'Get in touch with our team',
    href: '/contact',
    category: 'company',
    icon: GlobeAltIcon,
    keywords: ['contact', 'support', 'team', 'help'],
    shortcut: 'C'
  },
  {
    id: 'careers',
    title: 'Careers',
    description: 'Join our team and build the future of AI',
    href: '/company',
    category: 'company',
    icon: UserGroupIcon,
    keywords: ['careers', 'jobs', 'hiring', 'team'],
    shortcut: 'J'
  }
]

export const categoryLabels: Record<SearchItem['category'], string> = {
  models: 'AI Models',
  datasets: 'Datasets',
  compute: 'Compute',
  agents: 'Agents',
  apps: 'Apps',
  docs: 'Documentation',
  blog: 'Blog',
  solutions: 'Solutions',
  enterprise: 'Enterprise',
  company: 'Company'
}
