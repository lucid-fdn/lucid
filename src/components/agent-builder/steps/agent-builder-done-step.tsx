"use client"

import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"

export function AgentBuilderDoneStep({
  label = "The setup is ready.",
  ctaLabel = "Create agent",
  onPrimaryAction,
}: {
  label?: string
  ctaLabel?: string
  onPrimaryAction?: () => void
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
        <Check className="h-5 w-5" />
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">{label}</p>
      {onPrimaryAction ? <Button onClick={onPrimaryAction}>{ctaLabel}</Button> : null}
    </div>
  )
}
