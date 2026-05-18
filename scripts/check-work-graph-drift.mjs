#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const scanRoots = [
  'contracts/work-graph.ts',
  'src/lib/work-graph',
  'src/lib/projects/work.ts',
  'src/app/api/workspaces',
  'src/app/api/webhooks/pm',
  'src/components/work',
  'src/app/(app)/[workspace-slug]/projects/[project-slug]/work',
]
const skippedSegments = [
  `${path.sep}__tests__${path.sep}`,
  `${path.sep}.next${path.sep}`,
  `${path.sep}dist${path.sep}`,
]

const centralizedDbFiles = new Set([
  'src/lib/work-graph/db.ts',
  'src/lib/db/human-work-items.ts',
  'src/lib/db/index.ts',
  'src/lib/db/mission-control.ts',
  'src/lib/db/pm-external-refs.ts',
])

const workGraphTablePattern = /\.from\(['"](?:work_goals|work_boards|work_board_columns|work_board_items|work_item_goal_links|work_item_relations|work_item_checkouts|work_artifact_links|work_item_engine_facets|work_graph_events|work_graph_planning_jobs)['"]\)/

const checks = [
  {
    name: 'Work Graph table access outside centralized DB adapters',
    pattern: workGraphTablePattern,
    allow: (file) => centralizedDbFiles.has(file),
  },
  {
    name: 'engine-specific Work Graph branching',
    pattern: /\b(?:engine|runtimeEngine)\s*(?:={2,3}|!==?)\s*['"](?:hermes|openclaw)['"]|['"](?:hermes|openclaw)['"]\s*(?:={2,3}|!==?)\s*\b(?:engine|runtimeEngine)\b/i,
    allow: (file) =>
      file.startsWith('contracts/') ||
      file.startsWith('src/lib/work-graph/') ||
      file.startsWith('src/lib/agent-ops/'),
  },
  {
    name: 'provider-specific PM code inside Work Graph core',
    pattern: /from\s+['"].*(?:linear|jira|asana|trello|monday)|provider\s*(?:={2,3}|!==?)\s*['"](?:linear|jira|asana|trello|monday)['"]/i,
    allow: (file) =>
      file.startsWith('src/lib/work-graph/pm-federation/') ||
      file.startsWith('src/app/api/webhooks/pm/'),
  },
  {
    name: 'Kanban move bypasses canonical completion path',
    pattern: /status\s*:\s*['"](?:done|completed|cancelled)['"]|transitionActiveWorkItemStatus\([^)]*['"](?:done|completed|cancelled)['"]/,
    allow: (file) =>
      file === 'src/lib/db/human-work-items.ts' ||
      file === 'src/lib/work-graph/constants.ts' ||
      file.startsWith('contracts/'),
  },
]

function walk(dir) {
  const out = []
  const rootInfo = statSync(dir)
  if (rootInfo.isFile()) return /\.(ts|tsx|js|mjs)$/.test(dir) ? [dir] : []

  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (skippedSegments.some((segment) => full.includes(segment))) continue
    const info = statSync(full)
    if (info.isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) out.push(full)
  }
  return out
}

const files = scanRoots.flatMap((entry) => walk(path.join(root, entry)))
const failures = []

for (const full of files) {
  const rel = path.relative(root, full)
  const text = readFileSync(full, 'utf8')
  text.split(/\r?\n/).forEach((line, index) => {
    for (const check of checks) {
      if (check.pattern.test(line) && !check.allow(rel, line)) {
        failures.push(`${rel}:${index + 1} ${check.name}: ${line.trim()}`)
      }
    }
  })
}

if (failures.length > 0) {
  console.error('Work Graph drift gate failed:')
  for (const failure of failures) console.error(`  - ${failure}`)
  process.exit(1)
}

console.log('Work Graph drift gate passed')
