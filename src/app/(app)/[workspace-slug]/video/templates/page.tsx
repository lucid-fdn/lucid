'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BarChart3, MessageSquare, Users, Package, UsersRound, Loader2 } from 'lucide-react'

interface Template {
  id: string
  name: string
  category: string
  description: string
  thumbnail_url: string | null
}

const categoryIcons: Record<string, React.ReactNode> = {
  'data-report': <BarChart3 className="h-5 w-5" />,
  marketing: <MessageSquare className="h-5 w-5" />,
  outreach: <Users className="h-5 w-5" />,
  product: <Package className="h-5 w-5" />,
  internal: <UsersRound className="h-5 w-5" />,
}

const categoryColors: Record<string, string> = {
  'data-report': 'bg-blue-500/10 text-blue-500',
  marketing: 'bg-purple-500/10 text-purple-500',
  outreach: 'bg-green-500/10 text-green-500',
  product: 'bg-orange-500/10 text-orange-500',
  internal: 'bg-gray-500/10 text-gray-500',
}

export default function TemplatesPage() {
  const router = useRouter()
  const params = useParams() as Record<string, string>
  const workspaceSlug = params['workspace-slug'] || ''
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const query = selectedCategory ? `?category=${selectedCategory}` : ''
        const res = await fetch(`/api/video/templates${query}`)
        if (res.ok) {
          const data = await res.json()
          setTemplates(data)
        }
      } finally {
        setLoading(false)
      }
    }
    fetchTemplates()
  }, [selectedCategory])

  const categories = ['data-report', 'marketing', 'outreach', 'product', 'internal']

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Video Templates</h1>
        <p className="text-muted-foreground">Choose a template to create a new video</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          variant={selectedCategory === null ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectedCategory(null)}
        >
          All
        </Button>
        {categories.map((cat) => (
          <Button
            key={cat}
            variant={selectedCategory === cat ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory(cat)}
          >
            {cat.replace('-', ' ')}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card
              key={template.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => router.push(`/${workspaceSlug}/video/templates/${template.id}`)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className={`p-2 rounded-md ${categoryColors[template.category] || ''}`}>
                    {categoryIcons[template.category]}
                  </div>
                  <Badge variant="secondary">{template.category}</Badge>
                </div>
                <CardTitle className="text-lg mt-3">{template.name}</CardTitle>
                <CardDescription>{template.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" variant="outline">
                  Use Template
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
