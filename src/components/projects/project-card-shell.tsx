"use client"

import * as React from "react"
import { MoreHorizontal } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface ProjectCardShellProps {
  title: string
  badge?: React.ReactNode
  description?: React.ReactNode
  menu?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  background?: React.ReactNode
  className?: string
  contentClassName?: string
  compact?: boolean
  hideHeader?: boolean
  onClick?: () => void
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>
  role?: React.AriaRole
  tabIndex?: number
}

export function ProjectCardShell({
  title,
  badge,
  description,
  menu,
  children,
  footer,
  background,
  className,
  contentClassName,
  compact = false,
  hideHeader = false,
  onClick,
  onKeyDown,
  role,
  tabIndex,
}: ProjectCardShellProps) {
  return (
    <Card
      role={role}
      tabIndex={tabIndex}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`group relative h-full overflow-hidden rounded-2xl border-border/70 bg-card/90 py-0 shadow-none transition-all duration-150 hover:border-border hover:bg-card ${className ?? ""}`}
    >
      {background ? <div className="pointer-events-none absolute inset-0">{background}</div> : null}

      {!hideHeader ? (
      <CardHeader className={cn("relative z-10", compact ? "px-2.5 pb-0 pt-2.5 space-y-0.5" : "px-3.5 pb-0 pt-3.5 space-y-1")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CardTitle className={compact ? "truncate text-[12px] font-semibold leading-4.5" : "truncate text-[14px] font-semibold"}>{title}</CardTitle>
                {badge}
              </div>
            </div>
            {menu ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Open ${title} actions`}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border/80 bg-background/90 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {menu}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
          {description ? (
            <p className={compact ? "text-[10px] leading-3.5 text-muted-foreground line-clamp-2" : "text-[13px] leading-5 text-muted-foreground line-clamp-2"}>{description}</p>
          ) : null}
        </CardHeader>
      ) : null}

      <CardContent className={cn("relative z-10", compact ? "px-2.5 pb-1 pt-0" : "px-3.5 pb-3.5", contentClassName)}>
        {children}
      </CardContent>

      {footer ? (
        <div className={cn("relative z-10", compact ? "mt-auto flex items-center justify-between gap-3 px-2.5 pb-1.5 pt-0" : "mt-auto flex items-center justify-between gap-3 px-3.5 pb-3.5 pt-0")}>
          {footer}
        </div>
      ) : null}
    </Card>
  )
}
