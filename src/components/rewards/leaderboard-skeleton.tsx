import { Card, CardHeader, CardContent } from '@/components/ui/card'

export function LeaderboardSkeleton() {
  return (
    <div className="space-y-6">
      <Card className="border-2">
        <CardHeader>
          <div className="h-6 w-48 bg-muted animate-pulse rounded" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border-2 border-muted/50 p-6">
                <div className="flex flex-col items-center space-y-3">
                  <div className="h-20 w-20 rounded-full bg-muted animate-pulse" />
                  <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                  <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                  <div className="h-6 w-20 bg-muted animate-pulse rounded-full" />
                  <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
