/**
 * Lucid Assistant Worker — entry point shim
 *
 * Order matters:
 * 1. dotenv — populate process.env from .env file (dev only)
 * 2. bootstrapRuntimeConfig — dedicated runtimes fetch full env from control
 *    plane before any module reads getConfig(). No-op on shared workers.
 * 3. main.ts — the actual worker (OTel, Express, polling/Pulse, crons…)
 *
 * Static imports in main.ts are hoisted within that module, but module-level
 * execution (getConfig(), initSentry(), etc.) runs after bootstrap completes.
 */

import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config as loadDotenv } from 'dotenv'

import { bootstrapRuntimeConfig } from './config-bootstrap.js'

function loadLocalEnvFiles(): void {
  const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const repoRoot = path.resolve(workerRoot, '..')

  for (const envFile of [
    path.join(workerRoot, '.env.local'),
    path.join(workerRoot, '.env'),
    path.join(repoRoot, '.env.local'),
    path.join(repoRoot, '.env'),
  ]) {
    loadDotenv({ path: envFile, override: false, quiet: true })
  }
}

function startStartupFailureServer(error: unknown): void {
  const port = Number.parseInt(process.env.PORT || '8080', 10)
  const message = error instanceof Error ? error.message : String(error)

  const server = http.createServer((req, res) => {
    const body = JSON.stringify({
      status: 'degraded',
      startup_error: message,
      timestamp: new Date().toISOString(),
    })

    if (req.url === '/ready') {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(body)
      return
    }

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(body)
      return
    }

    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(body)
  })

  server.listen(port, () => {
    console.error(`[bootstrap] Startup failed; fallback server listening on port ${port}: ${message}`)
  })
}

try {
  loadLocalEnvFiles()
  await bootstrapRuntimeConfig()
  await import('./main.js')
} catch (error) {
  console.error('[bootstrap] Worker startup failed before main import:', error)
  startStartupFailureServer(error)
}
