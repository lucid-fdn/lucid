import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

function shouldRunWebControlPlane(): boolean {
  const mode = process.env.WORKER_MODE?.trim().toLowerCase()
  const serviceName = process.env.RAILWAY_SERVICE_NAME?.trim().toLowerCase()
  // Keep Railway's Lucid service on the bundled control-plane entrypoint.
  return mode === 'web' || serviceName === 'lucid'
}

async function main() {
  if (!shouldRunWebControlPlane()) {
    await import('./index.js')
    return
  }

  if (!existsSync('/app/web/server.js')) {
    throw new Error(
      'This worker image does not contain the Next.js control plane. Deploy the Lucid web service with Dockerfile.web.',
    )
  }

  const child = spawn(process.execPath, ['/app/web/server.js'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      HOSTNAME: process.env.HOSTNAME || '0.0.0.0',
    },
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 0)
  })
}

main().catch((error) => {
  console.error('[railway-entrypoint] failed', error)
  process.exit(1)
})
