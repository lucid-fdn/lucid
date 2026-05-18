'use client'

import React from 'react'
import { Locate, Redo2, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import { useReactFlow } from 'reactflow'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/animate-ui/primitives/radix/tooltip'

const TOOLBAR_BUTTON_CLASS = 'p-2 rounded-md transition-colors disabled:opacity-30 hover:bg-accent text-muted-foreground hover:text-foreground'

export function CanvasToolbar({
  onFitView,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: {
  onFitView: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}) {
  const { zoomIn, zoomOut } = useReactFlow()

  return (
    <div className="absolute bottom-4 left-4 z-10">
      <TooltipProvider delayDuration={300}>
        <div className="flex flex-col items-center gap-0.5 bg-background/80 backdrop-blur-sm border rounded-lg p-1 shadow-sm">
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={() => zoomIn()} className={TOOLBAR_BUTTON_CLASS} aria-label="Zoom in">
                <ZoomIn className="h-[18px] w-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Zoom in</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={() => zoomOut()} className={TOOLBAR_BUTTON_CLASS} aria-label="Zoom out">
                <ZoomOut className="h-[18px] w-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Zoom out</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={onFitView} className={TOOLBAR_BUTTON_CLASS} aria-label="Fit to view">
                <Locate className="h-[18px] w-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Fit to view</TooltipContent>
          </Tooltip>

          <div className="h-px w-5 bg-border my-0.5" />

          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={onUndo} disabled={!canUndo} className={TOOLBAR_BUTTON_CLASS} aria-label="Undo">
                <Undo2 className="h-[18px] w-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Undo <span className="text-muted-foreground ml-1">Cmd+Z</span></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={onRedo} disabled={!canRedo} className={TOOLBAR_BUTTON_CLASS} aria-label="Redo">
                <Redo2 className="h-[18px] w-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Redo <span className="text-muted-foreground ml-1">Cmd+Shift+Z</span></TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  )
}
