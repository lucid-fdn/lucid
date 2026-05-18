import React from "react"
import { Skeleton } from "@/components/ui/skeleton"

interface GeneratingLoaderProps {
  word: string;
  className?: string;
}

export function GeneratingLoader({ word, className = "" }: GeneratingLoaderProps) {
  return (
    <div className={`absolute inset-0 ${className}`}>
      <Skeleton className="w-full h-full rounded-lg flex items-center justify-center bg-background/80 backdrop-blur-sm">
        <div className="flex flex-col items-center justify-center space-y-2">
          <div className="p-2 flex  flex-wrap text-center items-center gap-1 text-muted-foreground">
            <span className="text-sm font-medium text-center whitespace-normal break-words min-w-0">Generating <span className="text-primary">{word}</span> ...</span>
          </div>
        </div>
      </Skeleton>
    </div>
  )
} 