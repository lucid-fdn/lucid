'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  User, 
  KeyRound, 
  Shield, 
  Building2, 
  CreditCard, 
  Bell 
} from 'lucide-react'
import { cn } from "@/lib/utils"

const settingsNavigation = [
  {
    name: 'Profile',
    href: '/settings/profile',
    icon: User,
    description: 'Manage your public profile',
  },
  {
    name: 'Account',
    href: '/settings/account',
    icon: KeyRound,
    description: 'Username, email, password',
  },
  {
    name: 'Authentication',
    href: '/settings/auth',
    icon: Shield,
    description: 'Connected auth methods',
  },
  {
    name: 'Organizations',
    href: '/settings/organizations',
    icon: Building2,
    description: 'Manage your organizations',
  },
  {
    name: 'Billing',
    href: '/settings/billing',
    icon: CreditCard,
    description: 'Plans, usage, and billing',
  },
  {
    name: 'Notifications',
    href: '/settings/notifications',
    icon: Bell,
    description: 'Email and web notifications',
  },
]

export function SettingsSidebar() {
  const pathname = usePathname()

  return (
    <nav className="space-y-1">
      {settingsNavigation.map((item) => {
        const isActive = pathname === item.href
        const Icon = item.icon

        return (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-120',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon className={cn('h-5 w-5 shrink-0')} />
            <div className="flex-1 min-w-0">
              <div className="font-medium">{item.name}</div>
              <div
                className={cn(
                  'text-xs truncate',
                  isActive
                    ? 'text-primary-foreground/70'
                    : 'text-muted-foreground'
                )}
              >
                {item.description}
              </div>
            </div>
          </Link>
        )
      })}
    </nav>
  )
}
