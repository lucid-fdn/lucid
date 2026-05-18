import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { resolveCliAuth } from '../cli/auth.js'

describe('resolveCliAuth', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    // Clean env vars
    delete process.env.LUCID_TOKEN
    delete process.env.LUCID_CONTROL_PLANE_URL
    delete process.env.LUCID_CONFIG_DIR
    delete process.env.LUCID_CREDENTIALS_FILE
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it('returns null when no credentials found', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    expect(resolveCliAuth()).toBeNull()
  })

  it('prefers --token flag over env var', () => {
    process.env.LUCID_TOKEN = 'env-token'
    const result = resolveCliAuth({ token: 'flag-token' })
    expect(result?.token).toBe('flag-token')
  })

  it('falls back to LUCID_TOKEN env var', () => {
    process.env.LUCID_TOKEN = 'env-token'
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    const result = resolveCliAuth()
    expect(result?.token).toBe('env-token')
  })

  it('reads token from credentials file', () => {
    const creds = { lucid: { token: 'file-token', api_url: 'https://custom.example.com' } }
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(creds))
    const result = resolveCliAuth()
    expect(result?.token).toBe('file-token')
    expect(result?.controlPlaneUrl).toBe('https://custom.example.com')
  })

  it('uses --url flag over env and file', () => {
    process.env.LUCID_TOKEN = 'token'
    process.env.LUCID_CONTROL_PLANE_URL = 'https://env.example.com'
    const result = resolveCliAuth({ url: 'https://flag.example.com' })
    expect(result?.controlPlaneUrl).toBe('https://flag.example.com')
  })

  it('uses LUCID_CONTROL_PLANE_URL env var', () => {
    process.env.LUCID_TOKEN = 'token'
    process.env.LUCID_CONTROL_PLANE_URL = 'https://env.example.com'
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    const result = resolveCliAuth()
    expect(result?.controlPlaneUrl).toBe('https://env.example.com')
  })

  it('defaults to https://lucid.foundation', () => {
    process.env.LUCID_TOKEN = 'token'
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    const result = resolveCliAuth()
    expect(result?.controlPlaneUrl).toBe('https://lucid.foundation')
  })

  it('handles malformed credentials file gracefully', () => {
    process.env.LUCID_TOKEN = 'env-token'
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readFileSync').mockReturnValue('not-json')
    const result = resolveCliAuth()
    expect(result?.token).toBe('env-token')
  })

  it('respects LUCID_CONFIG_DIR env var', () => {
    process.env.LUCID_CONFIG_DIR = '/tmp/custom-lucid'
    const creds = { lucid: { token: 'custom-dir-token' } }
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(creds))
    const result = resolveCliAuth()
    expect(result?.token).toBe('custom-dir-token')
  })
})
