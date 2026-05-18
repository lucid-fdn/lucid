import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { NOTIFICATION_CONFIG } from '../config'
import { getNotificationSeverity } from '../types'

const SRC_ROOT = join(process.cwd(), 'src')
const ALLOWED_SONNER_IMPORTS = new Set([
  join('hooks', 'use-toast.ts'),
  join('components', 'ui', 'sonner.tsx'),
  join('lib', 'notifications', '__tests__', 'notification-architecture.test.ts'),
])

function walk(dir: string): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []

  for (const entry of entries) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      files.push(...walk(full))
    } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
      files.push(full)
    }
  }

  return files
}

describe('notification architecture', () => {
  it('keeps direct sonner imports isolated to the shared wrapper and toaster component', () => {
    const offenders = walk(SRC_ROOT)
      .filter((file) => {
        const rel = relative(SRC_ROOT, file)
        if (ALLOWED_SONNER_IMPORTS.has(rel)) return false
        const text = readFileSync(file, 'utf8')
        return text.includes("from 'sonner'") || text.includes('from "sonner"')
      })
      .map((file) => relative(process.cwd(), file))

    expect(offenders).toEqual([])
  })

  it('uses the shared toast abstraction inside the notification context', () => {
    const file = join(SRC_ROOT, 'contexts', 'notification-context.tsx')
    const text = readFileSync(file, 'utf8')

    expect(text).toContain("import { toast } from '@/hooks/use-toast'")
    expect(text).not.toContain('AnimatePresence')
    expect(text).not.toContain('motion/react')
  })

  it('routes Agent Ops performance alerts through the shared notification taxonomy', () => {
    expect(getNotificationSeverity('AGENT_OPS_PERFORMANCE_ALERT')).toBe('warning')
    expect(NOTIFICATION_CONFIG.TYPES.AGENT_OPS_PERFORMANCE_ALERT).toMatchObject({
      in_app: true,
      email: false,
      push: false,
      sms: false,
    })
  })
})
