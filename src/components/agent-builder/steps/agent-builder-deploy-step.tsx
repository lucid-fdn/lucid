"use client"

import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { BuilderDeployState } from "@/components/agent-builder/flow"

export function AgentBuilderDeployStep({ deployState }: { deployState: BuilderDeployState }) {
  const isFailed = deployState.phase === "failed"
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-center">
      <div className={cn(
        "flex h-12 w-12 items-center justify-center rounded-2xl border",
        isFailed ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-primary/30 bg-primary/10 text-primary",
      )}>
        <Loader2 className={cn("h-5 w-5", !isFailed && "animate-spin")} />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">
          {isFailed ? "Creation failed" : deployState.phase === "creating" ? "Creating agent" : "Deploying setup"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {deployState.error ?? deployState.label ?? "Keep this open while Lucid prepares the agent."}
        </p>
      </div>
    </div>
  )
}
