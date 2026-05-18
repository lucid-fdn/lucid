#!/usr/bin/env node

import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const npmCommand = 'npm'
const lockDir = path.join(tmpdir(), 'lucid-worker-build-prereqs.lock')
const lockStaleMs = 10 * 60 * 1000

const packages = [
  'packages/runtime-compat',
  'packages/agent-routing',
  'packages/agent-bridge',
  'packages/plugin-policy',
  'packages/plugin-executor',
  'packages/integration-auth',
  'packages/agent-tools-core',
  'packages/content',
  'packages/code-interpreter',
  'packages/web3-types',
  'packages/web3-operator',
  'packages/hermes-runtime',
  'packages/openclaw-runtime',
]

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function acquireLock() {
  const startedAt = Date.now()
  while (true) {
    try {
      mkdirSync(lockDir)
      return
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error

      try {
        const ageMs = Date.now() - statSync(lockDir).mtimeMs
        if (ageMs > lockStaleMs) {
          rmSync(lockDir, { recursive: true, force: true })
          continue
        }
      } catch {
        continue
      }

      if (Date.now() - startedAt > lockStaleMs) {
        throw new Error(`Timed out waiting for worker build prereq lock at ${lockDir}`)
      }

      console.log('[worker:build-prereqs] Waiting for another package build to finish...')
      sleep(1000)
    }
  }
}

function releaseLock() {
  if (existsSync(lockDir)) rmSync(lockDir, { recursive: true, force: true })
}

function runBuild(packageDir) {
  const result = spawnSync(npmCommand, ['run', 'build', '--prefix', packageDir], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  })

  if (result.status !== 0) {
    const error = new Error(`Build failed for ${packageDir}`)
    error.exitCode = result.status ?? 1
    throw error
  }
}

acquireLock()
try {
  for (const packageDir of packages) runBuild(packageDir)
} catch (error) {
  process.exitCode = error?.exitCode ?? 1
  console.error(error instanceof Error ? error.message : error)
} finally {
  releaseLock()
}
