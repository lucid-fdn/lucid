"use client"

import * as React from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"

export function AgentBuilderModalShell({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(900px,calc(100dvh-32px))] max-w-[1120px] overflow-hidden p-0">
        {children}
      </DialogContent>
    </Dialog>
  )
}
