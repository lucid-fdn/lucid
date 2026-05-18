'use client'
import { BarChart3 } from 'lucide-react'
import { EmptyState, PageSection } from '@/components/page'

interface MessageVolumeChartProps {
  data: Array<{ date: string; count: number }>
}

export function MessageVolumeChart({ data }: MessageVolumeChartProps) {
  if (data.length === 0) {
    return (
      <EmptyState
        title="No volume data yet"
        description="Conversation message volume appears after channels receive traffic."
        className="min-h-24 rounded-xl border-dashed bg-background/35 px-4 py-6"
      />
    )
  }
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <PageSection
      title="Message Volume (7d)"
      actions={<BarChart3 className="h-4 w-4 text-muted-foreground" />}
    >
      <div className="flex items-end gap-1 h-24">
        {data.map((d) => (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5">
            <div
              className="w-full bg-primary/20 rounded-t"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: 2 }}
            />
            <span className="text-[8px] text-muted-foreground/50">
              {new Date(d.date).toLocaleDateString(undefined, { weekday: 'narrow' })}
            </span>
          </div>
        ))}
      </div>
    </PageSection>
  )
}
