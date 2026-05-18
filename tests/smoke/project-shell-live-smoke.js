#!/usr/bin/env node

const fs = require('fs')
const { spawn } = require('child_process')
const net = require('net')
const path = require('path')

const DEFAULT_ROUTE_TIMEOUT_MS = Number(process.env.SMOKE_ROUTE_TIMEOUT_MS || '360000')

function logStep(message) {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${message}`)
}

async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Failed to allocate a free port'))
        return
      }
      const { port } = address
      server.close((closeErr) => {
        if (closeErr) reject(closeErr)
        else resolve(port)
      })
    })
    server.on('error', reject)
  })
}

async function waitForServer(baseUrl, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  let attempt = 0

  while (Date.now() < deadline) {
    attempt += 1
    if (child.exitCode !== null) {
      throw new Error(`Next dev exited early with code ${child.exitCode}`)
    }

    try {
      logStep(`Readiness probe ${attempt}: GET /ready`)
      const response = await fetchWithTimeout(`${baseUrl}/ready`, {
        redirect: 'manual',
      }, Math.min(timeoutMs, 10_000))
      if (response.status >= 200 && response.status < 500) {
        logStep(`Readiness probe ${attempt} succeeded with ${response.status}`)
        return
      }
      lastError = new Error(`Unexpected readiness status ${response.status}`)
    } catch (error) {
      logStep(`Readiness probe ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`)
      lastError = error
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw lastError || new Error(`Timed out waiting for ${baseUrl}`)
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchRoute(baseUrl, route) {
  const timeoutMs = route.timeoutMs || DEFAULT_ROUTE_TIMEOUT_MS
  const attempts = route.attempts || 3
  let lastError = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      logStep(`Fetching ${route.path} (attempt ${attempt}/${attempts})`)
      const response = await fetchWithTimeout(`${baseUrl}${route.path}`, {
        redirect: 'manual',
        headers: route.headers || {},
        method: route.method || (route.expectedBodyIncludes ? 'GET' : 'HEAD'),
      }, timeoutMs)

      const location = response.headers.get('location')
      const body = route.expectedBodyIncludes ? await response.text() : ''
      logStep(`Fetched ${route.path} with ${response.status}${location ? ` -> ${location}` : ''}`)

      return {
        status: response.status,
        location,
        body,
      }
    } catch (error) {
      logStep(`Fetch failed for ${route.path} (attempt ${attempt}/${attempts}): ${error instanceof Error ? error.message : String(error)}`)
      lastError = error
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
  }

  throw lastError || new Error(`Failed to fetch ${route.path}`)
}

function assertRoute(route, result) {
  const expectedStatuses = route.expectedStatuses || [route.expectedStatus]
  if (!expectedStatuses.includes(result.status)) {
    throw new Error(
      `${route.path} expected status ${expectedStatuses.join(' or ')}, received ${result.status}`,
    )
  }

  if (route.expectedLocation && result.location !== route.expectedLocation) {
    throw new Error(
      `${route.path} expected location ${route.expectedLocation}, received ${result.location || 'null'}`,
    )
  }

  if (route.allowedLocationIncludes && result.status >= 300) {
    const allowed = Array.isArray(route.allowedLocationIncludes)
      ? route.allowedLocationIncludes
      : [route.allowedLocationIncludes]
    const matched = result.location && allowed.some((value) => result.location.includes(value))
    if (!matched) {
      throw new Error(
        `${route.path} expected location containing one of ${allowed.join(', ')}, received ${result.location || 'null'}`,
      )
    }
  }

  if (route.expectedBodyIncludes && !result.body.includes(route.expectedBodyIncludes)) {
    throw new Error(
      `${route.path} body missing expected text: ${route.expectedBodyIncludes}`,
    )
  }
}

function buildProjectSmokeRoutes(workspaceSlug) {
  const projectSlug = process.env.SMOKE_PROJECT_SLUG || 'ops'
  return [
    {
      path: '/ready',
      expectedStatuses: [200],
      method: 'GET',
    },
    {
      path: `/${workspaceSlug}/projects/${projectSlug}`,
      expectedStatuses: [200, 307],
      allowedLocationIncludes: ['/login'],
    },
    {
      path: `/${workspaceSlug}/projects/${projectSlug}/inbox`,
      expectedStatuses: [200, 307],
      allowedLocationIncludes: ['/login'],
    },
    {
      path: `/${workspaceSlug}/projects/${projectSlug}/work`,
      expectedStatuses: [200, 307],
      allowedLocationIncludes: ['/login'],
    },
    {
      path: `/${workspaceSlug}/projects/${projectSlug}/runs`,
      expectedStatuses: [200, 307],
      allowedLocationIncludes: ['/login'],
    },
  ]
}

function pruneSmokeTypeIncludes(tsconfigPath) {
  if (!fs.existsSync(tsconfigPath)) return

  const before = fs.readFileSync(tsconfigPath, 'utf8')
  let parsed
  try {
    parsed = JSON.parse(before)
  } catch {
    return
  }

  if (!Array.isArray(parsed.include)) return

  let include = parsed.include.filter((entry) => {
    return typeof entry !== 'string' || !/^\.next-smoke-\d+-\d+\/types\/\*\*\/\*\.ts$/.test(entry)
  })
  include = normalizeSmokeTypeIncludes(include)
  if (
    include.length === parsed.include.length
    && include.every((entry, index) => entry === parsed.include[index])
  ) return

  parsed.include = include
  fs.writeFileSync(tsconfigPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
}

function normalizeSmokeTypeIncludes(include) {
  const canonicalNextTypeOrder = [
    '.next*/types/**/*.ts',
    '.next/types/**/*.ts',
    '.next-build/types/**/*.ts',
  ]
  const entries = include.filter((entry) => !canonicalNextTypeOrder.includes(entry))
  return [
    ...canonicalNextTypeOrder.filter((entry) => include.includes(entry)),
    ...entries,
  ]
}

async function killProcessTree(pid) {
  if (!pid) return

  if (process.platform !== 'win32') {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 3000))
    try {
      process.kill(pid, 0)
      process.kill(pid, 'SIGKILL')
    } catch {
      // Already exited.
    }
    return
  }

  await new Promise((resolve) => {
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
    })
    const finish = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      killer.kill('SIGKILL')
      resolve()
    }, 15_000)
    killer.once('exit', finish)
    killer.once('error', finish)
  })
}

async function killListenersOnPort(port) {
  if (process.platform !== 'win32') {
    await new Promise((resolve) => {
      const lsof = spawn('lsof', ['-ti', `tcp:${port}`], { stdio: ['ignore', 'pipe', 'ignore'] })
      let stdout = ''
      const timer = setTimeout(() => {
        lsof.kill('SIGKILL')
        resolve()
      }, 15_000)

      lsof.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
      })
      lsof.once('close', async () => {
        clearTimeout(timer)
        const pids = stdout
          .split(/\r?\n/)
          .map((line) => Number.parseInt(line.trim(), 10))
          .filter((value) => Number.isFinite(value))

        for (const pid of pids) {
          await killProcessTree(pid)
        }
        resolve()
      })
      lsof.once('error', () => {
        clearTimeout(timer)
        resolve()
      })
    })
    return
  }

  await new Promise((resolve) => {
    const cmd = spawn('powershell', [
      '-NoProfile',
      '-Command',
      `Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`,
    ], { stdio: ['ignore', 'pipe', 'ignore'] })

    let stdout = ''
    const timer = setTimeout(() => {
      cmd.kill('SIGKILL')
      resolve()
    }, 15_000)
    cmd.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })

    cmd.once('close', async () => {
      clearTimeout(timer)
      const pids = stdout
        .split(/\r?\n/)
        .map((line) => Number.parseInt(line.trim(), 10))
        .filter((value) => Number.isFinite(value))

      for (const pid of pids) {
        await killProcessTree(pid)
      }
      resolve()
    })

    cmd.once('error', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function stopServer(child) {
  if (child && child.exitCode === null) {
    logStep(`Stopping spawned Next dev process ${child.pid}`)
    child.kill('SIGTERM')
    await new Promise((resolve) => setTimeout(resolve, 3000))
    if (child.exitCode === null) {
      logStep(`SIGTERM did not stop ${child.pid}, killing process tree`)
      await killProcessTree(child.pid)
    }
  }
}

async function main() {
  const port = await getFreePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const workspaceSlug = process.env.SMOKE_WORKSPACE_SLUG || 'kevinwayne2'
  const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next')
  const smokeDistDir = `.next-smoke-${process.pid}-${port}`
  const smokeDistDirPath = path.join(process.cwd(), smokeDistDir)
  const tsconfigPath = path.join(process.cwd(), 'tsconfig.json')
  pruneSmokeTypeIncludes(tsconfigPath)
  fs.mkdirSync(smokeDistDirPath, { recursive: true })

  const baseEnv = {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    CI: '1',
    NEXT_DIST_DIR: smokeDistDir,
    NEXT_DISABLE_WEBPACK_BUILD_WORKER: '1',
  }

  let child = null
  let output = ''
  const routes = buildProjectSmokeRoutes(workspaceSlug)

  try {
    child = spawn(process.execPath, [nextBin, 'dev', '-H', '127.0.0.1', '-p', String(port)], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...baseEnv,
        NODE_ENV: 'development',
      },
    })

    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })

    logStep(`Starting Next dev server on ${baseUrl}`)
    await waitForServer(baseUrl, DEFAULT_ROUTE_TIMEOUT_MS, child)

    const results = []
    for (const route of routes) {
      const result = await fetchRoute(baseUrl, route)
      assertRoute(route, result)
      results.push({
        path: route.path,
        status: result.status,
        location: result.location || '',
      })
    }

    logStep('Live app smoke passed')
    for (const result of results) {
      const locationSuffix = result.location ? ` -> ${result.location}` : ''
      console.log(`  ${result.status} ${result.path}${locationSuffix}`)
    }
  } catch (error) {
    logStep('Live app smoke failed')
    console.error(error instanceof Error ? error.message : String(error))
    console.error(output.slice(-8000))
    process.exitCode = 1
  } finally {
    await stopServer(child)
    logStep(`Ensuring listeners on ${port} are gone`)
    await killListenersOnPort(port)
    pruneSmokeTypeIncludes(tsconfigPath)
    fs.rmSync(smokeDistDirPath, { recursive: true, force: true })
    logStep(`Removed temporary Next dist dir ${smokeDistDir}`)
  }
}

main()
  .then(() => {
    process.exit(process.exitCode ?? 0)
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error))
    process.exit(1)
  })
