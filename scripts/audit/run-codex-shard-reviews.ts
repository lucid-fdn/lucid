import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import type { CodexReviewShard } from './audit-types'
import { buildCodexReviewShards, writeCodexReviewShards } from './codex-review-shards'
import { writeJson, writeMarkdown } from './audit-utils'

const DATE_STAMP = '2026-05-15'

type ShardReviewResult = {
  id: string
  title: string
  ok: boolean
  durationMs: number
  outputPath: string
  exitCode: number | null
  error?: string
}

async function main() {
  const root = process.cwd()
  const options = parseArgs(process.argv.slice(2))
  const shardMarkdownPath = `docs/generated/codex-review-shards-${DATE_STAMP}.md`
  const shardJsonPath = `docs/generated/codex-review-shards-${DATE_STAMP}.json`

  const shards = fs.existsSync(path.join(root, shardJsonPath))
    ? JSON.parse(fs.readFileSync(path.join(root, shardJsonPath), 'utf8')) as CodexReviewShard[]
    : await writeCodexReviewShards(root, shardMarkdownPath, shardJsonPath)
  if (!fs.existsSync(path.join(root, shardJsonPath))) {
    await writeJson(root, shardJsonPath, await buildCodexReviewShards(root))
  }

  const selected = shards
    .filter((shard) => options.shards.size === 0 || options.shards.has(shard.id))
    .slice(0, options.limit ?? shards.length)
  const results: ShardReviewResult[] = []

  for (const shard of selected) {
    const outputPath = `docs/generated/codex-review-${shard.id}-${DATE_STAMP}.md`
    const started = Date.now()
    const prompt = buildReviewPrompt(shard)
    const run = spawnSync(
      'codex',
      [
        'exec',
        '--cd',
        root,
        '--sandbox',
        'read-only',
        '--output-last-message',
        path.join(root, outputPath),
        prompt,
      ],
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: options.maxBufferBytes,
        timeout: options.timeoutMs,
        env: {
          ...process.env,
          NO_COLOR: '1',
        },
      },
    )

    const error = run.error?.message || (run.status === 124 ? 'timeout' : undefined)
    const ok = run.status === 0 && !error && fs.existsSync(path.join(root, outputPath))
    results.push({
      id: shard.id,
      title: shard.title,
      ok,
      durationMs: Date.now() - started,
      outputPath,
      exitCode: run.status,
      error,
    })

    process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${shard.id} ${Math.round((Date.now() - started) / 1000)}s\n`)
    if (!ok) {
      process.stderr.write(run.stderr || run.stdout || error || 'Codex shard review failed without output.')
      process.stderr.write('\n')
    }
  }

  await writeJson(root, `docs/generated/codex-review-shard-results-${DATE_STAMP}.json`, results)
  await writeMarkdown(root, `docs/generated/codex-review-shard-results-${DATE_STAMP}.md`, renderResults(results))

  const failed = results.filter((result) => !result.ok)
  if (failed.length > 0) {
    process.exitCode = 1
  }
}

function parseArgs(args: string[]) {
  const limitArg = args.find((arg) => arg.startsWith('--limit='))?.split('=')[1]
  const timeoutArg = args.find((arg) => arg.startsWith('--timeout-ms='))?.split('=')[1]
  const maxBufferArg = args.find((arg) => arg.startsWith('--max-buffer-mb='))?.split('=')[1]
  const shardArgs = [
    ...args.filter((arg) => arg.startsWith('--shard=')).map((arg) => arg.split('=')[1]),
    ...args.filter((arg) => arg.startsWith('--shards=')).flatMap((arg) => (arg.split('=')[1] ?? '').split(',')),
  ]
    .map((shard) => shard?.trim())
    .filter((shard): shard is string => Boolean(shard))
  return {
    shards: new Set(shardArgs),
    limit: limitArg ? Number.parseInt(limitArg, 10) : undefined,
    timeoutMs: timeoutArg ? Number.parseInt(timeoutArg, 10) : 1_200_000,
    maxBufferBytes: (maxBufferArg ? Number.parseInt(maxBufferArg, 10) : 256) * 1024 * 1024,
  }
}

function buildReviewPrompt(shard: CodexReviewShard): string {
  return [
    'You are running a read-only Lucid code review shard. Do not edit files.',
    'Review for concrete bugs, vulnerabilities, tenant leaks, runtime coupling, scalability/performance traps, dead code, duplicate logic, and missing tests.',
    'Findings must be actionable and include file/line references when possible. If no findings, say so clearly and list residual risk.',
    '',
    `Shard: ${shard.title}`,
    `Subsystem: ${shard.subsystem}`,
    `Risk checklist: ${shard.riskChecklist.join(', ')}`,
    '',
    'Representative files to inspect:',
    ...shard.files.slice(0, 160).map((file) => `- ${file}`),
    shard.files.length > 160 ? `- ... ${shard.files.length - 160} more files in shard inventory` : '',
    '',
    'Return only:',
    '1. Findings ordered by severity.',
    '2. Open questions/assumptions.',
    '3. Commands or tests you recommend next.',
  ].join('\n')
}

function renderResults(results: ShardReviewResult[]): string {
  const lines = [
    '# Codex Review Shard Results',
    '',
    `- Total shards: ${results.length}`,
    `- Passed: ${results.filter((result) => result.ok).length}`,
    `- Failed: ${results.filter((result) => !result.ok).length}`,
    '',
  ]
  for (const result of results) {
    lines.push(
      `## ${result.title}`,
      '',
      `- ID: \`${result.id}\``,
      `- Status: ${result.ok ? 'passed' : 'failed'}`,
      `- Duration: ${Math.round(result.durationMs / 1000)}s`,
      `- Output: \`${result.outputPath}\``,
      result.error ? `- Error: ${result.error}` : '',
      '',
    )
  }
  return lines.filter(Boolean).join('\n')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
