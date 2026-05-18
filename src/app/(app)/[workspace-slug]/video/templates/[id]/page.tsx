'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Play, Loader2 } from 'lucide-react'

interface TemplateDetail {
  id: string
  name: string
  category: string
  description: string
  schema_json: Record<string, unknown> | null
  thumbnail_url: string | null
}

export default function TemplateDetailPage() {
  const router = useRouter()
  const params = useParams() as Record<string, string>
  const workspaceSlug = params['workspace-slug'] || ''
  const templateId = params.id || ''
  const [template, setTemplate] = useState<TemplateDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchTemplate() {
      try {
        const res = await fetch(`/api/video/templates/${templateId}`)
        if (res.ok) {
          setTemplate(await res.json())
        }
      } finally {
        setLoading(false)
      }
    }
    fetchTemplate()
  }, [templateId])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!template) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Template not found</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Templates
      </Button>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{template.name}</h1>
          <p className="text-muted-foreground mt-1">{template.description}</p>
          <Badge variant="secondary" className="mt-2">{template.category}</Badge>
        </div>
        <Button onClick={() => router.push(`/${workspaceSlug}/video/new?template=${template.id}`)}>
          <Play className="mr-2 h-4 w-4" />
          Use Template
        </Button>
      </div>

      {/* Remotion Player preview placeholder */}
      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
            <p className="text-muted-foreground">
              Remotion Player preview will be rendered here
            </p>
          </div>
        </CardContent>
      </Card>

      {template.schema_json && (
        <Card>
          <CardHeader>
            <CardTitle>Template Schema</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
              {JSON.stringify(template.schema_json, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
