import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus } from 'lucide-react'
import Link from 'next/link'

export const metadata = {
  title: 'Organizations',
  description: 'Manage your organizations',
}

export default function OrganizationsPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Organizations</h2>
          <p className="text-muted-foreground mt-1">
            Manage organizations you own or are a member of
          </p>
        </div>
        <Button asChild>
          <Link href="/onboarding/workspace/new?create=1">
            <Plus className="mr-2 h-4 w-4" />
            Create Organization
          </Link>
        </Button>
      </div>

      {/* Organizations List */}
      <Card>
        <CardHeader>
          <CardTitle>Your Organizations</CardTitle>
          <CardDescription>
            Organizations you own or are a member of
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No organizations yet. Create one to get started.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
