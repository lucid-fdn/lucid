import type { SecondaryNavSection } from '@/components/navigation/secondary-nav'

export const settingsNavigation: SecondaryNavSection[] = [
  {
    title: 'Personal Settings',
    items: [
      {
        title: 'Profile',
        href: '/settings/profile',
        icon: 'User',
      },
      {
        title: 'Account',
        href: '/settings/account',
        icon: 'Lock',
      },
      {
        title: 'Notifications',
        href: '/settings/notifications',
        icon: 'Bell',
      },
    ],
  },
  {
    title: 'Organization',
    items: [
      {
        title: 'Organizations',
        href: '/settings/organizations',
        icon: 'Building2',
      },
      {
        title: 'Billing',
        href: '/settings/billing',
        icon: 'CreditCard',
        badge: {
          text: 'Pro',
          variant: 'secondary',
        },
      },
    ],
  },
  {
    title: 'Integrations',
    items: [
      {
        title: 'Integrations',
        href: '/settings/integrations',
        icon: 'Plug',
      },
    ],
  },
  {
    title: 'Security',
    items: [
      {
        title: 'Privacy & Security',
        href: '/settings/security',
        icon: 'Shield',
      },
    ],
  },
]
