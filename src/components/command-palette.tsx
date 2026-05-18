"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { searchItems, categoryLabels, type SearchItem } from "@/lib/search-data"
import { MarketplaceCommandGroup } from './command-palette-marketplace'

// ── Command Registry Types ─────────────────────────────────────────

export interface RegisteredCommand {
  id: string
  /** Display label */
  label: string
  /** Icon element (rendered left of label) */
  icon?: React.ReactNode
  /** Group heading for this command */
  group: string
  /** Keyboard shortcut label (display only) */
  shortcut?: string
  /** Action to run when selected */
  onSelect: () => void
  /** Optional keywords for search matching */
  keywords?: string[]
  /** Sort priority within group (lower = higher) */
  priority?: number
}

interface CommandRegistry {
  commands: RegisteredCommand[]
  register: (commands: RegisteredCommand[]) => void
  unregister: (ids: string[]) => void
}

// ── Context ────────────────────────────────────────────────────────

interface CommandPaletteContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  registry: CommandRegistry
}

const CommandPaletteContext = React.createContext<CommandPaletteContextValue | null>(null)

// ── Provider ───────────────────────────────────────────────────────

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)

  // Use a ref for commands to avoid re-render cascades when commands register/unregister.
  // The palette reads from the ref when it opens — no need for state-driven reactivity.
  const commandsRef = React.useRef<RegisteredCommand[]>([])
  const [, forceUpdate] = React.useState(0)

  const register = React.useCallback((newCommands: RegisteredCommand[]) => {
    const ids = new Set(newCommands.map(c => c.id))
    commandsRef.current = [...commandsRef.current.filter(c => !ids.has(c.id)), ...newCommands]
  }, [])

  const unregister = React.useCallback((ids: string[]) => {
    const idSet = new Set(ids)
    commandsRef.current = commandsRef.current.filter(c => !idSet.has(c.id))
  }, [])

  const registry = React.useMemo<CommandRegistry>(
    () => ({ get commands() { return commandsRef.current }, register, unregister }),
    [register, unregister],
  )

  const contextValue = React.useMemo<CommandPaletteContextValue>(
    () => ({ open, setOpen, toggle: () => setOpen(prev => !prev), registry }),
    [open, registry],
  )

  // ⌘K global listener
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }
    document.addEventListener("keydown", down, { passive: false })
    return () => document.removeEventListener("keydown", down)
  }, [])

  return (
    <CommandPaletteContext.Provider value={contextValue}>
      {children}
    </CommandPaletteContext.Provider>
  )
}

// ── Hooks ──────────────────────────────────────────────────────────

export function useCommandPalette() {
  const context = React.useContext(CommandPaletteContext)
  if (!context) {
    throw new Error('useCommandPalette must be used within a CommandPaletteProvider')
  }
  return context
}

/**
 * Register page-scoped commands that appear in the global ⌘K palette.
 * Commands are auto-unregistered when the component unmounts.
 *
 * @example
 * useRegisterCommands([
 *   { id: 'save', label: 'Save now', group: 'Actions', shortcut: '⌘S', onSelect: saveNow },
 *   { id: 'focus-chat', label: 'Focus chat', group: 'Panels', shortcut: '⌘2', onSelect: () => chatRef.current?.focus() },
 * ])
 */
export function useRegisterCommands(commands: RegisteredCommand[]) {
  const context = React.useContext(CommandPaletteContext)

  // Stable reference for the command IDs
  const idsRef = React.useRef<string[]>([])
  const commandsRef = React.useRef(commands)
  commandsRef.current = commands

  React.useEffect(() => {
    if (!context) return

    const ids = commands.map(c => c.id)
    idsRef.current = ids
    context.registry.register(commands.map((command, index) => ({
      ...command,
      onSelect: () => commandsRef.current[index]?.onSelect(),
    })))

    return () => {
      context.registry.unregister(ids)
    }
    // We intentionally depend on the serialized command IDs to avoid re-registering
    // on every render while still updating when the command set changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, commands.map(c => c.id).join(',')])
}

// ── Palette Content ────────────────────────────────────────────────

// Lazy load and memoize grouped items
let memoizedGroupedItems: Record<string, SearchItem[]> | null = null

const getGroupedItems = () => {
  if (!memoizedGroupedItems) {
    const groups: Record<string, SearchItem[]> = {}
    searchItems.forEach(item => {
      if (!groups[item.category]) {
        groups[item.category] = []
      }
      groups[item.category].push(item)
    })
    memoizedGroupedItems = groups
  }
  return memoizedGroupedItems
}

function RegisteredCommandGroups({ commands }: { commands: RegisteredCommand[] }) {
  if (commands.length === 0) return null

  // Group commands by their group heading
  const groups: Record<string, RegisteredCommand[]> = {}
  for (const cmd of commands) {
    if (!groups[cmd.group]) groups[cmd.group] = []
    groups[cmd.group].push(cmd)
  }

  // Sort commands within each group by priority
  for (const group of Object.values(groups)) {
    group.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50))
  }

  return (
    <>
      <CommandSeparator />
      {Object.entries(groups).map(([heading, cmds]) => (
        <CommandGroup key={heading} heading={heading}>
          {cmds.map((cmd) => (
            <CommandItem
              key={cmd.id}
              value={[cmd.label, ...(cmd.keywords ?? [])].join(' ')}
              onSelect={cmd.onSelect}
              className="flex items-center gap-3 px-3 py-2"
            >
              {cmd.icon && <span className="h-4 w-4 shrink-0 text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">{cmd.icon}</span>}
              <span className="flex-1 truncate">{cmd.label}</span>
              {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
    </>
  )
}

const CommandPaletteContent = React.memo(({ registeredCommands }: { registeredCommands: RegisteredCommand[] }) => {
  const router = useRouter()
  const [search, setSearch] = React.useState("")

  const handleSelect = React.useCallback((item: SearchItem) => {
    router.push(item.href)
    setSearch("")
  }, [router])

  const filteredGroups = React.useMemo(() => {
    const groupedItems = getGroupedItems()
    if (!search.trim()) return groupedItems

    const searchLower = search.toLowerCase()
    const filtered: Record<string, SearchItem[]> = {}

    Object.entries(groupedItems).forEach(([category, items]) => {
      const filteredItems = items.filter(item =>
        item.title.toLowerCase().includes(searchLower) ||
        item.description.toLowerCase().includes(searchLower) ||
        item.keywords.some(keyword =>
          keyword.toLowerCase().includes(searchLower)
        )
      )

      if (filteredItems.length > 0) {
        filtered[category] = filteredItems
      }
    })

    return filtered
  }, [search])

  return (
    <>
      <CommandInput
        placeholder="Type a command or search..."
        value={search}
        onValueChange={setSearch}
        className="transition-all duration-200"
      />
      <CommandList>
        <CommandEmpty>
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium text-muted-foreground mb-2">
              No results found
            </p>
            <p className="text-xs text-muted-foreground">
              Try different keywords
            </p>
          </div>
        </CommandEmpty>

        {/* Page-scoped commands (appear first when present) */}
        <RegisteredCommandGroups commands={registeredCommands} />

        {/* Live Marketplace Search */}
        <MarketplaceCommandGroup search={search} />
        {search && <CommandSeparator />}

        {/* Global navigation commands */}
        {Object.entries(filteredGroups).map(([category, items], groupIndex) => (
          <React.Fragment key={category}>
            <CommandGroup heading={categoryLabels[category as keyof typeof categoryLabels]}>
              {items.map((item) => {
                const Icon = item.icon
                return (
                  <CommandItem
                    key={item.id}
                    value={`${item.title} ${item.description} ${item.keywords.join(' ')}`}
                    onSelect={() => handleSelect(item)}
                    className="flex items-center gap-3 px-3 py-2 transition-all duration-120"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="font-medium truncate">{item.title}</span>
                      <span className="text-sm text-muted-foreground truncate">
                        {item.description}
                      </span>
                    </div>
                    {item.shortcut && (
                      <CommandShortcut className="ml-auto">
                        {item.shortcut}
                      </CommandShortcut>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {groupIndex < Object.keys(filteredGroups).length - 1 && (
              <CommandSeparator />
            )}
          </React.Fragment>
        ))}
      </CommandList>
    </>
  )
})

CommandPaletteContent.displayName = 'CommandPaletteContent'

// ── Palette Component ──────────────────────────────────────────────

interface CommandPaletteProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps = {}) {
  const context = React.useContext(CommandPaletteContext)
  const finalOpen = open !== undefined ? open : (context?.open ?? false)
  const finalOnOpenChange = onOpenChange || context?.setOpen || (() => {})
  const registeredCommands = context?.registry.commands ?? []

  if (!finalOpen) return null

  return (
    <CommandDialog open={finalOpen} onOpenChange={finalOnOpenChange} shouldFilter={false}>
      <CommandPaletteContent registeredCommands={registeredCommands} />
    </CommandDialog>
  )
}
