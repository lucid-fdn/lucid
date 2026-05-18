import {
  CpuChipIcon,
  RocketLaunchIcon,
  ServerIcon,
  ChatBubbleLeftRightIcon,
  ChartBarIcon,
  CommandLineIcon,
} from '@heroicons/react/24/outline'
import type { SVGProps } from 'react'

export interface NavSubitem {
  name: string
  description: string
  href: string
  icon: React.ComponentType<SVGProps<SVGSVGElement>>
}

export interface NavGroup {
  label: string
  items: NavSubitem[]
}

export interface NavItem {
  name: string
  href?: string
  subitems?: NavSubitem[]
  groups?: NavGroup[]
}

export const NAV_LINKS: NavItem[] = [
  {
    name: 'Product',
    groups: [
      {
        label: 'Build',
        items: [
          {
            name: 'Studio',
            description: 'Compose agents like real software',
            href: '/login',
            icon: CpuChipIcon,
          },
          {
            name: 'Skills',
            description: 'Tools, integrations, and playbooks',
            href: '/login',
            icon: CommandLineIcon,
          },
        ],
      },
      {
        label: 'Operate',
        items: [
          {
            name: 'Operations',
            description: 'Observe runs, health, and fleet activity in real time',
            href: '/login',
            icon: ChartBarIcon,
          },
          {
            name: 'Runtimes',
            description: 'One-click dedicated compute or BYO',
            href: '/login',
            icon: ServerIcon,
          },
          {
            name: 'Channels',
            description: 'Slack, Discord, Telegram, web, API',
            href: '/login',
            icon: ChatBubbleLeftRightIcon,
          },
        ],
      },
      {
        label: 'Marketplace',
        items: [
          {
            name: 'Lucid Launch',
            description: 'Tokenize and trade AI agents',
            href: '/discover',
            icon: RocketLaunchIcon,
          },
        ],
      },
    ],
  },
  {
    name: 'Protocol',
    href: '/protocol',
  },
  {
    name: 'Docs',
    href: 'https://raijinlabs.gitbook.io/lucid-ai-layer',
  },
  {
    name: 'Pricing',
    href: '/pricing',
  },
  {
    name: 'Blog',
    href: '/blog',
  },
] as const

export interface FooterLink {
  name: string
  href: string
}

export interface FooterSection {
  title: string
  links: FooterLink[]
}

export const FOOTER_LINKS: FooterSection[] = [
  {
    title: 'Product',
    links: [
      { name: 'Studio', href: '/login' },
      { name: 'Operations', href: '/login' },
      { name: 'Runtimes', href: '/login' },
      { name: 'Channels', href: '/login' },
      { name: 'Pricing', href: '/pricing' },
    ],
  },
  {
    title: 'Protocol',
    links: [
      { name: 'Lucid Protocol', href: '/protocol' },
      { name: 'Lucid Launch', href: '/discover' },
    ],
  },
  {
    title: 'Developers',
    links: [
      { name: 'Documentation', href: 'https://raijinlabs.gitbook.io/lucid-ai-layer' },
      { name: 'Blog', href: '/blog' },
      { name: 'Status', href: '/status' },
    ],
  },
  {
    title: 'Company',
    links: [
      { name: 'Contact', href: '/contact' },
      { name: 'Terms of Service', href: '/legal/terms-of-service' },
      { name: 'Privacy Policy', href: '/legal/privacy-policy' },
    ],
  },
] as const

export const SOCIAL_LINKS: FooterLink[] = [
  { name: 'X', href: 'https://x.com/LucidChain' },
  { name: 'LinkedIn', href: 'https://www.linkedin.com/company/lucid-layer/' },
  { name: 'Discord', href: 'https://discord.gg/sSkAY9UDcn' },
] as const
