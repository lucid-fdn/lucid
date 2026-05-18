'use client'

import { cn } from '@/lib/utils'

interface KeyboardShortcut {
  keys: string
  label: string
}

interface CommandBarProps {
  /** Keyboard shortcuts to display */
  shortcuts?: KeyboardShortcut[]
  /** Handler for opening command palette */
  onCommandPalette?: () => void
  /** Extra right-side content */
  rightContent?: React.ReactNode
  className?: string
}

const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  { keys: '⌘K', label: 'Commands' },
  { keys: '⌘S', label: 'Save' },
  { keys: '⌘Enter', label: 'Send' },
]

export function CommandBar({
  shortcuts = DEFAULT_SHORTCUTS,
  onCommandPalette,
  rightContent,
  className,
}: CommandBarProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between h-7 px-3',
        'backdrop-blur-xl bg-background/80 border-t border-border',
        'shrink-0',
        className,
      )}
    >
      {/* Left: Command palette trigger + shortcuts */}
      <div className="flex items-center gap-3">
        {onCommandPalette && (
          <button
            type="button"
            onClick={onCommandPalette}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground active:scale-[0.97] transition-all"
          >
            <kbd className="px-1 py-0.5 rounded bg-muted border border-border font-mono text-[11px]">
              ⌘K
            </kbd>
            <span>Commands</span>
          </button>
        )}

        {/* Shortcuts legend */}
        <div className="hidden md:flex items-center gap-2">
          {shortcuts.filter(s => s.keys !== '⌘K').map((s) => (
            <span key={s.keys} className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
              <kbd className="px-1 py-0.5 rounded bg-muted/50 border border-border font-mono text-[11px]">
                {s.keys}
              </kbd>
              <span>{s.label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Right: custom content */}
      {rightContent && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {rightContent}
        </div>
      )}
    </div>
  )
}
