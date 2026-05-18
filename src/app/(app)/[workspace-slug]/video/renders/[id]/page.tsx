'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ArrowLeft, Download, XCircle, Loader2 } from 'lucide-react'

interface RenderDetail {
  id: string
  template_id: string
  status: string
  progress_pct: number
  video_url: string | null
  thumbnail_url: string | null
  renderer: string
  error: string | null
  created_at: string
  completed_at: string | null
}

export default function RenderDetailPage() {
  const router = useRouter()
  const params = useParams() as Record<string, string>
  const workspaceSlug = params['workspace-slug'] || ''
  const renderId = params.id || ''
  const [render, setRender] = useState<RenderDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchRender() {
      try {
        const res = await fetch(`/api/video/renders/${renderId}`)
        if (res.ok) {
          setRender(await res.json())
        }
      } finally {
        setLoading(false)
      }
    }
    fetchRender()

    // Poll while rendering
    const interval = setInterval(async () => {
      const res = await fetch(`/api/video/renders/${renderId}`)
      if (res.ok) {
        const data = await res.json()
        setRender(data)
        if (['completed', 'failed', 'cancelled'].includes(data.status)) {
          clearInterval(interval)
        }
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [renderId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!render) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Render not found</p>
      </div>
    )
  }

  const isActive = ['queued', 'bundling', 'rendering'].includes(render.status)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => router.push(`/${workspaceSlug}/video`)}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Videos
      </Button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Render {render.id}</h1>
          <p className="text-muted-foreground mt-1">Template: {render.template_id}</p>
        </div>
        <div className="flex gap-2">
          {isActive && (
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                await fetch(`/api/video/renders/${renderId}/cancel`, { method: 'POST' })
                const res = await fetch(`/api/video/renders/${renderId}`)
                if (res.ok) setRender(await res.json())
              }}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          )}
          {render.video_url && (
            <Button asChild>
              <a href={render.video_url} download>
                <Download className="mr-2 h-4 w-4" />
                Download
              </a>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Status</CardTitle>
            <Badge variant={render.status === 'completed' ? 'default' : 'secondary'}>
              {render.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isActive && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>{render.progress_pct}%</span>
              </div>
              <Progress value={render.progress_pct} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Renderer</span>
              <p className="font-medium">{render.renderer}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Created</span>
              <p className="font-medium">{new Date(render.created_at).toLocaleString()}</p>
            </div>
            {render.completed_at && (
              <div>
                <span className="text-muted-foreground">Completed</span>
                <p className="font-medium">{new Date(render.completed_at).toLocaleString()}</p>
              </div>
            )}
          </div>

          {render.error && (
            <div className="bg-red-500/10 text-red-500 p-3 rounded-lg text-sm">
              {render.error}
            </div>
          )}
        </CardContent>
      </Card>

      {render.video_url && (
        <Card>
          <CardHeader>
            <CardTitle>Video</CardTitle>
          </CardHeader>
          <CardContent>
            <video
              src={render.video_url}
              controls
              className="w-full rounded-lg"
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
