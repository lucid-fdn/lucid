import type { AgentEngine, RuntimeFlavor } from './types'

const OPENCLAW_DEFAULT_IMAGE = 'ghcr.io/daishizensensei/worker:latest'
const HERMES_INVALID_IMAGE_PATTERNS = [
  /\/hermes-agent(?::|@|$)/i,
  /\/worker:hermes-fix-\d{8}(?:-\d+)?$/i,
]

function getEnvImage(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

function getHermesConfiguredImage(
  runtimeFlavor: Exclude<RuntimeFlavor, 'shared'>
): string | undefined {
  return (
    getEnvImage(`LUCID_HERMES_${runtimeFlavor.toUpperCase()}_IMAGE`) ||
    getEnvImage('LUCID_HERMES_IMAGE')
  )
}

function getHermesImageCompatibilityError(image: string, runtimeFlavor: Exclude<RuntimeFlavor, 'shared'>): string | null {
  if (!HERMES_INVALID_IMAGE_PATTERNS.some((pattern) => pattern.test(image))) {
    return null
  }

  return (
    `Hermes runtime image "${image}" is not compatible with ${runtimeFlavor}. ` +
    `Dedicated Hermes deploys must use a current Lucid worker image with runtime bootstrap support, ` +
    `for example ghcr.io/daishizensensei/worker:latest.`
  )
}

export function getRuntimeImageCompatibilityError(
  engine: AgentEngine,
  runtimeFlavor: Exclude<RuntimeFlavor, 'shared'>,
  image: string,
): string | null {
  if (engine !== 'hermes') return null
  return getHermesImageCompatibilityError(image, runtimeFlavor)
}

export function getRuntimeImageConfigurationError(
  engine: AgentEngine,
  runtimeFlavor: Exclude<RuntimeFlavor, 'shared'>,
): string | null {
  if (engine !== 'hermes') return null

  const image = getHermesConfiguredImage(runtimeFlavor)

  if (!image) {
    return (
      `No Hermes runtime image configured for ${runtimeFlavor}. ` +
      `Set LUCID_HERMES_${runtimeFlavor.toUpperCase()}_IMAGE or LUCID_HERMES_IMAGE.`
    )
  }

  return getHermesImageCompatibilityError(image, runtimeFlavor)
}

export function isRuntimeImageConfigured(
  engine: AgentEngine,
  runtimeFlavor: Exclude<RuntimeFlavor, 'shared'>,
): boolean {
  return getRuntimeImageConfigurationError(engine, runtimeFlavor) == null
}

export function resolveRuntimeImage(
  engine: AgentEngine,
  runtimeFlavor: Exclude<RuntimeFlavor, 'shared'>
): string {
  if (engine === 'hermes') {
    const configError = getRuntimeImageConfigurationError(engine, runtimeFlavor)
    if (configError) {
      throw new Error(configError)
    }

    return (
      getHermesConfiguredImage(runtimeFlavor) ||
      OPENCLAW_DEFAULT_IMAGE
    )
  }

  return (
    getEnvImage(`LUCID_OPENCLAW_${runtimeFlavor.toUpperCase()}_IMAGE`) ||
    getEnvImage(`LUCID_${runtimeFlavor.toUpperCase()}_IMAGE`) ||
    getEnvImage('LUCID_WORKER_IMAGE') ||
    OPENCLAW_DEFAULT_IMAGE
  )
}

export function resolveRuntimeLaunchImage(
  engine: AgentEngine,
  runtimeFlavor: Exclude<RuntimeFlavor, 'shared'>,
  imageOverride?: string | null,
): string {
  if (imageOverride) {
    const compatibilityError = getRuntimeImageCompatibilityError(engine, runtimeFlavor, imageOverride)
    if (compatibilityError) {
      throw new Error(compatibilityError)
    }
    return imageOverride
  }

  try {
    return resolveRuntimeImage(engine, runtimeFlavor)
  } catch (error) {
    if (engine === 'hermes') {
      return OPENCLAW_DEFAULT_IMAGE
    }
    throw error
  }
}
