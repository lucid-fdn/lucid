'use client'

import { memo, useState, useRef, useEffect, useCallback, type ComponentType } from 'react'
import { type NodeProps } from 'reactflow'
import { cn } from '@/lib/utils'
import {
  FolderOpen, Boxes, Server, Globe, Shield, Zap, Star, Rocket,
  Database, Cloud, Lock, Cpu, Layers, Target, Briefcase, Flame,
  MoreVertical, Check, X, Pencil, LayoutGrid, Palette, BoxSelect, XCircle, Smile, Link,
  type LucideProps,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Users } from 'lucide-react'

// ─── Icon registry for group nodes ───

const GROUP_ICONS: { name: string; Icon: ComponentType<LucideProps> }[] = [
  { name: 'folder', Icon: FolderOpen },
  { name: 'boxes', Icon: Boxes },
  { name: 'server', Icon: Server },
  { name: 'globe', Icon: Globe },
  { name: 'shield', Icon: Shield },
  { name: 'zap', Icon: Zap },
  { name: 'star', Icon: Star },
  { name: 'rocket', Icon: Rocket },
  { name: 'database', Icon: Database },
  { name: 'cloud', Icon: Cloud },
  { name: 'lock', Icon: Lock },
  { name: 'cpu', Icon: Cpu },
  { name: 'layers', Icon: Layers },
  { name: 'target', Icon: Target },
  { name: 'briefcase', Icon: Briefcase },
  { name: 'flame', Icon: Flame },
]

const ICON_MAP = new Map(GROUP_ICONS.map((i) => [i.name, i.Icon]))

function getGroupIcon(name?: string): ComponentType<LucideProps> | null {
  if (name && (name.startsWith('http://') || name.startsWith('https://'))) return null
  return ICON_MAP.get(name ?? '') ?? FolderOpen
}

function isExternalIcon(icon?: string): boolean {
  return !!icon && (icon.startsWith('http://') || icon.startsWith('https://'))
}

// ─── Color palette (static, no need to pass through data) ───

const GROUP_COLORS: { value: string; label: string }[] = [
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#10b981', label: 'Emerald' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', label: 'Red' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#f97316', label: 'Orange' },
]

// ─── Types ───

export interface GroupNodeData {
  name: string
  color: string
  icon?: string
  onRename?: (groupId: string, newName: string) => void
  onContextMenu?: (groupId: string) => void
  onAutoLayout?: (groupId: string) => void
  onChangeColor?: (groupId: string, color: string) => void
  onChangeIcon?: (groupId: string, icon: string) => void
  onSelectAll?: (groupId: string) => void
  onDissolve?: (groupId: string) => void
  onPromoteToTeam?: (groupId: string) => void
  isRenaming?: boolean
  onRenameComplete?: () => void
  isDropTarget?: boolean
}

/**
 * Railway-style group node — solid dark card with label + kebab menu top bar,
 * child nodes rendered inside by ReactFlow parentNode nesting.
 */
const GroupNodeComponent = ({ id, data, selected }: NodeProps<GroupNodeData>) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(data.name)
  const [iconUrl, setIconUrl] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const iconUrlInputRef = useRef<HTMLInputElement>(null)
  const commitGuardRef = useRef(false)

  useEffect(() => {
    if (data.isRenaming && !isEditing) {
      setIsEditing(true)
    }
  }, [data.isRenaming, isEditing])

  useEffect(() => {
    if (isEditing) {
      setEditValue(data.name)
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
    }
  }, [isEditing, data.name])

  const groupId = id.replace('group-', '')
  const IconComponent = getGroupIcon(data.icon)
  const hasExternalIcon = isExternalIcon(data.icon)

  const commitRename = useCallback(() => {
    if (commitGuardRef.current) return
    commitGuardRef.current = true
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== data.name) {
      data.onRename?.(groupId, trimmed)
    }
    setIsEditing(false)
    data.onRenameComplete?.()
    setTimeout(() => { commitGuardRef.current = false }, 0)
  }, [editValue, data, groupId])

  const cancelRename = useCallback(() => {
    setEditValue(data.name)
    setIsEditing(false)
    data.onRenameComplete?.()
  }, [data])

  return (
    <div
      className={cn(
        'h-full w-full rounded-2xl border border-dashed transition-all duration-200',
        selected ? 'shadow-[0_0_0_1px_rgba(255,255,255,0.05)] border-foreground/15' : 'border-white/6',
        data.isDropTarget ? 'ring-2 ring-emerald-400/70 ring-offset-2 ring-offset-background' : '',
      )}
      style={{
        background: `radial-gradient(ellipse at 50% 0%, ${data.color}06, rgba(255,255,255,0.01) 52%, transparent 80%)`,
        borderRadius: '16px',
      }}
    >
      {/* Top bar — icon + label left, kebab right (Railway style) */}
      <div className="flex items-center justify-between px-2.5 pt-2 pb-0.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {hasExternalIcon ? (
            <img src={data.icon} alt="" className="h-4 w-4 flex-shrink-0 rounded-sm object-cover" />
          ) : IconComponent ? (
            <IconComponent className="h-4 w-4 flex-shrink-0" style={{ color: data.color }} />
          ) : null}
          {isEditing ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') cancelRename()
                  e.stopPropagation()
                }}
                onBlur={commitRename}
                maxLength={60}
                className="text-sm font-semibold bg-transparent border-b border-muted-foreground outline-none flex-1 min-w-0 text-foreground"
              />
              <button onClick={commitRename} className="p-0.5 text-emerald-500 hover:text-emerald-400">
                <Check className="h-3 w-3" />
              </button>
              <button onClick={cancelRename} className="p-0.5 text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <span
              className="block min-w-0 text-sm font-semibold text-foreground truncate cursor-text"
              onDoubleClick={(e) => {
                e.stopPropagation()
                setIsEditing(true)
              }}
              title="Double-click to rename"
            >
              {data.name}
            </span>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Open group options"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex-shrink-0 nopan nodrag"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 nodrag nopan" onPointerDown={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={() => setIsEditing(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Rename Group
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => data.onAutoLayout?.(groupId)}>
              <LayoutGrid className="mr-2 h-4 w-4" />
              Auto Layout Group
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger onPointerDown={(e) => e.stopPropagation()}>
                <Palette className="mr-2 h-4 w-4" />
                Change Color
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-36 nodrag nopan" onPointerDown={(e) => e.stopPropagation()}>
                {GROUP_COLORS.map((c) => (
                  <DropdownMenuItem
                    key={c.value}
                    onSelect={() => data.onChangeColor?.(groupId, c.value)}
                  >
                    <span
                      className="mr-2 h-3 w-3 rounded-full flex-shrink-0 inline-block"
                      style={{ backgroundColor: c.value }}
                    />
                    {c.label}
                    {data.color === c.value && <Check className="ml-auto h-3 w-3 text-muted-foreground" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger onPointerDown={(e) => e.stopPropagation()}>
                <Smile className="mr-2 h-4 w-4" />
                Change Icon
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48 p-2 nodrag nopan" onPointerDown={(e) => e.stopPropagation()}>
                <div className="grid grid-cols-4 gap-1">
                  {GROUP_ICONS.map((item) => {
                    const isActive = !hasExternalIcon && (data.icon ?? 'folder') === item.name
                    return (
                      <button
                        key={item.name}
                        onClick={() => data.onChangeIcon?.(groupId, item.name)}
                        onPointerDown={(e) => e.stopPropagation()}
                        className={cn(
                          'flex items-center justify-center h-8 w-8 rounded-md transition-colors',
                          isActive
                            ? 'bg-accent text-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                        )}
                      >
                        <item.Icon className="h-4 w-4" />
                      </button>
                    )
                  })}
                </div>
                <div className="mt-2 pt-2 border-t border-border">
                  <div className="flex items-center gap-1">
                    <Link className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <input
                      ref={iconUrlInputRef}
                      value={iconUrl}
                      onChange={(e) => setIconUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const url = iconUrl.trim()
                          if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
                            data.onChangeIcon?.(groupId, url)
                            setIconUrl('')
                          }
                          e.stopPropagation()
                        }
                        e.stopPropagation()
                      }}
                      placeholder="Paste icon URL..."
                      className="text-xs bg-transparent border-b border-border outline-none flex-1 min-w-0 text-foreground placeholder:text-muted-foreground py-0.5"
                    />
                    {iconUrl.trim() && (
                      <button
                        onClick={() => {
                          const url = iconUrl.trim()
                          if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
                            data.onChangeIcon?.(groupId, url)
                            setIconUrl('')
                          }
                        }}
                        className="p-0.5 text-emerald-500 hover:text-emerald-400"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {hasExternalIcon && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <img src={data.icon} alt="" className="h-4 w-4 rounded-sm object-cover" />
                      <span className="text-[10px] text-muted-foreground truncate flex-1">Custom URL</span>
                      <Check className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    </div>
                  )}
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onSelect={() => data.onSelectAll?.(groupId)}>
              <BoxSelect className="mr-2 h-4 w-4" />
              Select All in Group
            </DropdownMenuItem>
            {data.onPromoteToTeam && (
              <DropdownMenuItem onSelect={() => data.onPromoteToTeam?.(groupId)}>
                <Users className="mr-2 h-4 w-4" />
                Convert to Team
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
              onSelect={() => data.onDissolve?.(groupId)}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Dissolve Group
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

    </div>
  )
}

export const GroupCanvasNode = memo(GroupNodeComponent)
GroupCanvasNode.displayName = 'GroupCanvasNode'
