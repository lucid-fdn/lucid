/**
 * CLI Auth — Resolve credentials for bridge CLI commands.
 *
 * Priority:
 *   1. --token flag (explicit)
 *   2. LUCID_TOKEN env var (CI)
 *   3. ~/.lucid/credentials.json (written by `lucid login`)
 *
 * Control plane URL:
 *   1. --url flag
 *   2. LUCID_CONTROL_PLANE_URL env var
 *   3. api_url from credentials.json
 *   4. Default: https://lucid.foundation
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CliAuth {
  token: string
  controlPlaneUrl: string
}

export interface CliAuthOptions {
  token?: string
  url?: string
}

interface CredentialsFile {
  lucid?: {
    api_url?: string
    token?: string
    expires_at?: string
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CONTROL_PLANE_URL = 'https://lucid.foundation'

function getCredentialsPath(): string {
  const configDir = process.env.LUCID_CONFIG_DIR || path.join(os.homedir(), '.lucid')
  return process.env.LUCID_CREDENTIALS_FILE || path.join(configDir, 'credentials.json')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve CLI auth from flags → env → credential file.
 * Returns null if no credentials found.
 */
export function resolveCliAuth(opts?: CliAuthOptions): CliAuth | null {
  // Token: flag → env → file
  const token = opts?.token || process.env.LUCID_TOKEN || readTokenFromFile()
  if (!token) return null

  // URL: flag → env → file → default
  const controlPlaneUrl =
    opts?.url ||
    process.env.LUCID_CONTROL_PLANE_URL ||
    readUrlFromFile() ||
    DEFAULT_CONTROL_PLANE_URL

  return { token, controlPlaneUrl }
}

// ---------------------------------------------------------------------------
// File Helpers
// ---------------------------------------------------------------------------

function readCredentialsFile(): CredentialsFile | null {
  try {
    const filePath = getCredentialsPath()
    if (!fs.existsSync(filePath)) return null
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function readTokenFromFile(): string | undefined {
  return readCredentialsFile()?.lucid?.token
}

function readUrlFromFile(): string | undefined {
  return readCredentialsFile()?.lucid?.api_url
}
