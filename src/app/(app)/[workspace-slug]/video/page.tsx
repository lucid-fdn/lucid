'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Play, Film, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react'

interface RenderJob {
  id: string
  template_id: string
  status: string
  progress_pct: number
  video_url: string | null
  created_at: string
}

interface UserOrganization {
  id?: string
  slug?: string
}

const statusIcons: Record<string, React.ReactNode> = {
  queued: <Clock className="h-4 w-4 text-muted-foreground" />,
  bundling: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
  rendering: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
  completed: <CheckCircle className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
  cancelled: <XCircle className="h-4 w-4 text-muted-foreground" />,
}

export default function VideoPage() {
  const router = useRouter()
  const params = useParams() as Record<string, string>
  const workspaceSlug = params['workspace-slug'] || ''
  const [renders, setRenders] = useState<RenderJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchRenders() {
      try {
        const orgsRes = await fetch('/api/organizations/user')
        if (!orgsRes.ok) {
          throw new Error('Unable to load workspace access.')
        }

        const orgs = (await orgsRes.json()) as UserOrganization[]
        const orgId = orgs.find((org) => org.slug === workspaceSlug)?.id
        if (!orgId) {
          throw new Error('Workspace access was not found for Video Studio.')
        }

        const res = await fetch(`/api/video/renders?org_id=${encodeURIComponent(orgId)}`)
        if (res.ok) {
          const data = await res.json()
          setRenders(data)
        } else {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Unable to load video renders.')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load video renders.')
      } finally {
        setLoading(false)
      }
    }
    fetchRenders()
  }, [workspaceSlug])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Video Studio</h1>
          <p className="text-muted-foreground">Generate and manage AI-powered videos</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(`/${workspaceSlug}/video/templates`)}
          >
            <Film className="mr-2 h-4 w-4" />
            Templates
          </Button>
          <Button onClick={() => router.push(`/${workspaceSlug}/video/new`)}>
            <Play className="mr-2 h-4 w-4" />
            New Video
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {loading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <XCircle className="h-12 w-12 text-red-500 mb-4" />
              <h3 className="text-lg font-medium">Video Studio unavailable</h3>
              <p className="text-muted-foreground mt-1">{error}</p>
            </CardContent>
          </Card>
        ) : renders.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Film className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No videos yet</h3>
              <p className="text-muted-foreground mt-1">
                Create your first video from a template or let an AI agent generate one.
              </p>
              <Button
                className="mt-4"
                onClick={() => router.push(`/${workspaceSlug}/video/templates`)}
              >
                Browse Templates
              </Button>
            </CardContent>
          </Card>
        ) : (
          renders.map((render) => (
            <Card
              key={render.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => router.push(`/${workspaceSlug}/video/renders/${render.id}`)}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-3">
                  {statusIcons[render.status] || statusIcons.queued}
                  <div>
                    <CardTitle className="text-base">{render.template_id}</CardTitle>
                    <CardDescription>{render.id}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={render.status === 'completed' ? 'default' : 'secondary'}>
                    {render.status}
                  </Badge>
                  {render.status === 'rendering' && (
                    <span className="text-sm text-muted-foreground">{render.progress_pct}%</span>
                  )}
                </div>
              </CardHeader>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
