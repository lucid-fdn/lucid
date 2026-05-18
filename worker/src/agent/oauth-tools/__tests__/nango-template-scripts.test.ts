/**
 * Nango Template Scripts — Migration Quality Tests
 *
 * Validates the 33 migrated template scripts in tools/nango-template-sync/output/.
 * These are compiled CJS files exporting action objects with:
 *   { type, description, version, endpoint, input, output, scopes, exec }
 *
 * Tests cover: structure, naming, input field conventions, error handling,
 * endpoint uniqueness, and schema descriptions.
 */

import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'

const OUTPUT_DIR = resolve(process.cwd(), '../tools/nango-template-sync/output')
const require = createRequire(import.meta.url)

const VALID_PROVIDERS = ['slack', 'notion']
const FILENAME_PATTERN = /^(.+)_actions_(.+)\.cjs$/

// Discover all .cjs scripts
const allFiles = existsSync(OUTPUT_DIR)
  ? readdirSync(OUTPUT_DIR).filter((f) => f.endsWith('.cjs'))
  : []

/** Load a script module, resolving default export */
function loadScript(filename: string) {
  const mod = require(resolve(OUTPUT_DIR, filename))
  return mod.default || mod
}

/** Read source text of a script */
function readSource(filename: string): string {
  return readFileSync(resolve(OUTPUT_DIR, filename), 'utf-8')
}

/** Extract provider from filename */
function getProvider(filename: string): string | null {
  const match = filename.match(FILENAME_PATTERN)
  return match ? match[1] : null
}

describe('Nango Template Scripts — Migration Quality', () => {
  // ------------------------------------------------------------------
  // 0. Preconditions
  // ------------------------------------------------------------------
  it('output directory exists and contains scripts', () => {
    expect(existsSync(OUTPUT_DIR)).toBe(true)
    expect(allFiles.length).toBe(33)
  })

  // ------------------------------------------------------------------
  // 1. Naming convention: {provider}_actions_{action-name}.cjs
  // ------------------------------------------------------------------
  describe('naming conventions', () => {
    it('all filenames match {provider}_actions_{action-name}.cjs pattern', () => {
      const bad: string[] = []
      for (const f of allFiles) {
        if (!FILENAME_PATTERN.test(f)) bad.push(f)
      }
      expect(bad, `Bad filenames: ${bad.join(', ')}`).toHaveLength(0)
    })

    it('all providers are slack or notion', () => {
      const bad: string[] = []
      for (const f of allFiles) {
        const provider = getProvider(f)
        if (!provider || !VALID_PROVIDERS.includes(provider)) {
          bad.push(`${f} → provider="${provider}"`)
        }
      }
      expect(bad, `Invalid providers: ${bad.join(', ')}`).toHaveLength(0)
    })
  })

  // ------------------------------------------------------------------
  // 2. Script structure validation (all 33)
  // ------------------------------------------------------------------
  describe('script structure (per-script)', () => {
    for (const filename of allFiles) {
      describe(filename, () => {
        const script = loadScript(filename)

        it('has exec function', () => {
          expect(typeof script.exec).toBe('function')
        })

        it('has type: "action"', () => {
          expect(script.type).toBe('action')
        })

        it('has semver-like version string', () => {
          expect(typeof script.version).toBe('string')
          expect(script.version).toMatch(/^\d+\.\d+\.\d+$/)
        })

        it('has non-empty description string', () => {
          expect(typeof script.description).toBe('string')
          expect(script.description.length).toBeGreaterThan(0)
        })

        it('has endpoint with method, path, and group', () => {
          expect(script.endpoint).toBeDefined()
          expect(typeof script.endpoint.method).toBe('string')
          expect(script.endpoint.method).toMatch(/^(GET|POST|PUT|PATCH|DELETE)$/)
          expect(typeof script.endpoint.path).toBe('string')
          expect(script.endpoint.path.startsWith('/')).toBe(true)
          expect(typeof script.endpoint.group).toBe('string')
          expect(script.endpoint.group.length).toBeGreaterThan(0)
        })

        it('has input (zod schema)', () => {
          expect(script.input).toBeDefined()
          // Zod schemas have a _def property
          expect(script.input._def).toBeDefined()
        })

        it('has output (zod schema)', () => {
          expect(script.output).toBeDefined()
          expect(script.output._def).toBeDefined()
        })

        it('has scopes array', () => {
          expect(Array.isArray(script.scopes)).toBe(true)
        })
      })
    }
  })

  // ------------------------------------------------------------------
  // 3. Input field naming conventions (Slack-specific)
  // ------------------------------------------------------------------
  describe('Slack input field naming conventions', () => {
    const slackFiles = allFiles.filter((f) => getProvider(f) === 'slack')

    for (const filename of slackFiles) {
      const source = readSource(filename)

      it(`${filename}: uses channel_id (not bare "channel") for channel inputs`, () => {
        // Check InputSchema definitions — if the script has a channel-related input field,
        // it should use channel_id not a bare "channel" as the field key.
        // Exceptions: "channels" (plural, e.g. upload-file), channel in .describe() text,
        // and scripts that don't take channel input at all (create-channel, list-channels).
        const inputSection = source.split('InputSchema')[1]?.split('OutputSchema')[0] || ''
        // Look for a bare "channel" as a field key (not in .describe() text, not "channels" plural)
        const hasBareChannelKey = /\bchannel\b\s*:(?!.*\.describe)/.test(inputSection)
          || /["']channel["']\s*:/.test(inputSection)
        if (hasBareChannelKey) {
          expect(inputSection).toContain('channel_id')
        }
      })

      it(`${filename}: uses user_id (not bare "user") for user inputs`, () => {
        const inputSection = source.split('InputSchema')[1]?.split('OutputSchema')[0] || ''
        if (inputSection.includes('user') && !inputSection.includes('user_id')) {
          // If it references a user field in the input, it should be user_id
          // Exception: "users" (plural) in list-users is fine, as well as nested fields
          const hasBareName = /(?<!\w)user(?!_id|s\b|\.|\w)/.test(inputSection)
          expect(hasBareName, `${filename} uses bare "user" instead of "user_id" in input`).toBe(false)
        }
      })

      it(`${filename}: uses message_ts or thread_ts (not bare "timestamp") for timestamp inputs`, () => {
        const inputSection = source.split('InputSchema')[1]?.split('OutputSchema')[0] || ''
        // Check for "timestamp" as a field key name — not inside .describe() strings.
        // "timestamp" appearing only inside .describe() text is fine (documentation).
        const hasBareTimestampKey = /\btimestamp\s*:(?!.*\.describe)/.test(inputSection)
          || /["']timestamp["']\s*:/.test(inputSection)
        if (hasBareTimestampKey) {
          expect.fail(`${filename} uses bare "timestamp" field key instead of message_ts/thread_ts`)
        }
      })
    }
  })

  // ------------------------------------------------------------------
  // 4. Error handling in exec functions
  // ------------------------------------------------------------------
  describe('error handling patterns', () => {
    describe('Slack scripts check response.data?.ok', () => {
      const slackFiles = allFiles.filter((f) => getProvider(f) === 'slack')

      for (const filename of slackFiles) {
        it(`${filename}: checks response.data?.ok`, () => {
          const source = readSource(filename)
          // Slack API convention: check ok field on response
          expect(source).toMatch(/response\.data\?\.ok|response\.data\.ok/)
        })
      }
    })

    describe('Notion scripts check for error objects', () => {
      const notionFiles = allFiles.filter((f) => getProvider(f) === 'notion')

      for (const filename of notionFiles) {
        it(`${filename}: checks for error in response`, () => {
          const source = readSource(filename)
          // Notion API convention: check for error object
          expect(source).toMatch(/["']error["']|\.object\s*===?\s*["']error["']|error/)
        })
      }
    })
  })

  // ------------------------------------------------------------------
  // 5. Endpoint uniqueness
  // ------------------------------------------------------------------
  describe('endpoint uniqueness', () => {
    it('no two scripts share the same endpoint path', () => {
      const pathMap = new Map<string, string>()
      const duplicates: string[] = []

      for (const filename of allFiles) {
        const script = loadScript(filename)
        const path = script.endpoint?.path
        if (path) {
          if (pathMap.has(path)) {
            duplicates.push(`"${path}" used by both ${pathMap.get(path)} and ${filename}`)
          } else {
            pathMap.set(path, filename)
          }
        }
      }

      expect(duplicates, `Duplicate endpoint paths: ${duplicates.join('; ')}`).toHaveLength(0)
    })
  })

  // ------------------------------------------------------------------
  // 6. Schema descriptions
  // ------------------------------------------------------------------
  describe('schema descriptions', () => {
    for (const filename of allFiles) {
      it(`${filename}: input schema fields have .describe()`, () => {
        const source = readSource(filename)
        // Look at the InputSchema section — it should contain .describe( calls.
        // Exception: scripts with empty input (z.object({})) have no fields to describe.
        const inputSection = source.split('InputSchema')[1]?.split('OutputSchema')[0] || ''
        const isEmptyObject = /z\.object\(\s*\{\s*\}\s*\)/.test(inputSection)
        if (inputSection.length > 0 && !isEmptyObject) {
          expect(inputSection).toContain('.describe(')
        }
      })

      it(`${filename}: output schema fields have .describe()`, () => {
        const source = readSource(filename)
        // Look at the OutputSchema section — it should contain .describe( calls
        const outputSection = source.split('OutputSchema')[1]?.split('var action')[0] || ''
        if (outputSection.length > 0) {
          expect(outputSection).toContain('.describe(')
        }
      })
    }
  })
})
