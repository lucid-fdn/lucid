'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Film, Plus, Trash2, Loader2 } from 'lucide-react'

interface Template {
  id: string
  name: string
  category: string
}

interface UserOrganization {
  id?: string
  slug?: string
}

type SceneType = 'title' | 'text-overlay' | 'cta' | 'image-showcase' | 'data-chart'

interface Scene {
  type: SceneType
  duration: number
  props: Record<string, string>
}

const sceneTypes: { value: SceneType; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'text-overlay', label: 'Text Overlay' },
  { value: 'cta', label: 'Call to Action' },
  { value: 'image-showcase', label: 'Image Showcase' },
  { value: 'data-chart', label: 'Data Chart' },
]

const sceneFields: Record<SceneType, string[]> = {
  title: ['text', 'subtitle'],
  'text-overlay': ['text', 'position'],
  cta: ['text', 'buttonText', 'url'],
  'image-showcase': ['imageUrl', 'caption'],
  'data-chart': ['title', 'dataLabel', 'dataValue'],
}

const resolutions = [
  { value: '1080p', label: '1080p (1920x1080)' },
  { value: '720p', label: '720p (1280x720)' },
  { value: 'square', label: 'Square (1080x1080)' },
  { value: 'story', label: 'Story (1080x1920)' },
  { value: 'reel', label: 'Reel (1080x1350)' },
]

export default function NewVideoPage() {
  const router = useRouter()
  const params = useParams() as Record<string, string>
  const searchParams = useSearchParams()
  const workspaceSlug = params['workspace-slug'] || ''

  const [templates, setTemplates] = useState<Template[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [orgError, setOrgError] = useState<string | null>(null)

  const [templateId, setTemplateId] = useState(searchParams?.get('template') || '')
  const [scenes, setScenes] = useState<Scene[]>([
    { type: 'title', duration: 3, props: { text: '', subtitle: '' } },
  ])
  const [format, setFormat] = useState('mp4')
  const [resolution, setResolution] = useState('1080p')
  const [primaryColor, setPrimaryColor] = useState('')
  const [secondaryColor, setSecondaryColor] = useState('')
  const [backgroundColor, setBackgroundColor] = useState('')

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const orgsRes = await fetch('/api/organizations/user')
        if (!orgsRes.ok) {
          throw new Error('Unable to load workspace access.')
        }

        const orgs = (await orgsRes.json()) as UserOrganization[]
        const workspaceOrgId = orgs.find((org) => org.slug === workspaceSlug)?.id
        if (!workspaceOrgId) {
          throw new Error('Workspace access was not found for Video Studio.')
        }
        setOrgId(workspaceOrgId)

        const res = await fetch('/api/video/templates')
        if (res.ok) {
          setTemplates(await res.json())
        }
      } catch (err) {
        setOrgError(err instanceof Error ? err.message : 'Unable to load Video Studio.')
      } finally {
        setLoadingTemplates(false)
      }
    }
    fetchTemplates()
  }, [workspaceSlug])

  function addScene() {
    setScenes((prev) => [
      ...prev,
      { type: 'title', duration: 3, props: { text: '', subtitle: '' } },
    ])
  }

  function removeScene(index: number) {
    setScenes((prev) => prev.filter((_, i) => i !== index))
  }

  function updateSceneType(index: number, type: SceneType) {
    setScenes((prev) =>
      prev.map((scene, i) => {
        if (i !== index) return scene
        const props: Record<string, string> = {}
        for (const field of sceneFields[type]) {
          props[field] = ''
        }
        return { ...scene, type, props }
      })
    )
  }

  function updateSceneDuration(index: number, duration: number) {
    setScenes((prev) =>
      prev.map((scene, i) => (i === index ? { ...scene, duration } : scene))
    )
  }

  function updateSceneProp(index: number, key: string, value: string) {
    setScenes((prev) =>
      prev.map((scene, i) =>
        i === index ? { ...scene, props: { ...scene.props, [key]: value } } : scene
      )
    )
  }

  async function handleSubmit() {
    if (!orgId) {
      setOrgError('Workspace access was not found for Video Studio.')
      return
    }

    setSubmitting(true)
    try {
      const brand =
        primaryColor || secondaryColor || backgroundColor
          ? {
              colors: {
                primary: primaryColor || '#6366f1',
                secondary: secondaryColor || '#a5b4fc',
                background: backgroundColor || '#0f172a',
              },
            }
          : undefined

      const body = {
        org_id: orgId,
        template_id: templateId || 'social-clip-v1',
        scenes,
        output: {
          format,
          resolution,
        },
        brand,
      }

      const res = await fetch('/api/video/renders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const data = await res.json()
        router.push(`/${workspaceSlug}/video/renders/${data.render_id}`)
      } else {
        const data = await res.json().catch(() => ({}))
        setOrgError(data.error || 'Unable to start video render.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

      <div>
        <h1 className="text-2xl font-bold">Create New Video</h1>
        <p className="text-muted-foreground">
          Select a template, add scenes, and configure output settings
        </p>
      </div>

      {/* Template Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Film className="h-5 w-5" />
            Template
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingTemplates ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading templates...
            </div>
          ) : orgError ? (
            <p className="text-sm text-red-500">{orgError}</p>
          ) : (
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a template (optional)" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.category})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {/* Scene Builder */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Scenes</CardTitle>
            <Button variant="outline" size="sm" onClick={addScene}>
              <Plus className="mr-2 h-4 w-4" />
              Add Scene
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {scenes.map((scene, index) => (
            <div
              key={index}
              className="border rounded-lg p-4 space-y-4 bg-muted/30"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Scene {index + 1}
                </span>
                {scenes.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeScene(index)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Scene Type</Label>
                  <Select
                    value={scene.type}
                    onValueChange={(val) => updateSceneType(index, val as SceneType)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sceneTypes.map((st) => (
                        <SelectItem key={st.value} value={st.value}>
                          {st.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Duration: {scene.duration}s</Label>
                  <Slider
                    min={1}
                    max={10}
                    step={1}
                    value={[scene.duration]}
                    onValueChange={([val]) => updateSceneDuration(index, val)}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {sceneFields[scene.type].map((field) => (
                  <div key={field} className="space-y-1">
                    <Label className="text-xs capitalize">{field}</Label>
                    <Input
                      placeholder={field}
                      value={scene.props[field] || ''}
                      onChange={(e) => updateSceneProp(index, field, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Output Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Output Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mp4">MP4</SelectItem>
                  <SelectItem value="webm">WebM</SelectItem>
                  <SelectItem value="gif">GIF</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Resolution</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {resolutions.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Brand Colors */}
      <Card>
        <CardHeader>
          <CardTitle>Brand Colors (optional)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Primary</Label>
              <Input
                type="color"
                value={primaryColor || '#000000'}
                onChange={(e) => setPrimaryColor(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Secondary</Label>
              <Input
                type="color"
                value={secondaryColor || '#000000'}
                onChange={(e) => setSecondaryColor(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Background</Label>
              <Input
                type="color"
                value={backgroundColor || '#000000'}
                onChange={(e) => setBackgroundColor(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end">
        <Button
          size="lg"
          disabled={submitting || Boolean(orgError) || !orgId}
          onClick={handleSubmit}
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Rendering...
            </>
          ) : (
            'Start Render'
          )}
        </Button>
      </div>
    </div>
  )
}
