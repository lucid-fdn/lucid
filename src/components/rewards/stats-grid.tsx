import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Bot, Package, Share2, Users } from 'lucide-react'

interface Stats {
  workflowsCreated: number
  agentsDeployed: number
  marketplacePublishes: number
  communityContributions: number
}

interface StatsGridProps {
  stats: Stats
}

const statItems = [
  {
    key: 'workflowsCreated' as keyof Stats,
    label: 'Workflows Created',
    icon: Package,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-600/10',
  },
  {
    key: 'agentsDeployed' as keyof Stats,
    label: 'Agents Deployed',
    icon: Bot,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-600/10',
  },
  {
    key: 'marketplacePublishes' as keyof Stats,
    label: 'Marketplace Publishes',
    icon: Share2,
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-600/10',
  },
  {
    key: 'communityContributions' as keyof Stats,
    label: 'Community Contributions',
    icon: Users,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-600/10',
  },
]

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {statItems.map((item) => {
        const Icon = item.icon
        const value = stats[item.key]

        return (
          <Card key={item.key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
              <div className={`rounded-full p-2 ${item.bgColor}`}>
                <Icon className={`h-4 w-4 ${item.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
              <p className="text-xs text-muted-foreground mt-1">
                +{Math.floor(value * 0.15)} this week
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
