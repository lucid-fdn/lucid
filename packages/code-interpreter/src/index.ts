/**
 * Code Interpreter — Sandboxed JavaScript Execution
 *
 * Uses Node.js `vm` module with strict timeouts and output capture.
 * Runs user code in an isolated context with no access to:
 * - File system (no `fs`, `path`, `child_process`)
 * - Network (no `fetch`, `http`, `net`)
 * - Process (no `process`, `require`)
 * - Global state (fresh context per execution)
 *
 * Limits:
 * - 5s execution timeout
 * - 10K character output limit
 * - 100 console.log calls max
 * - No async/await (synchronous only in vm.runInContext)
 */

import vm from 'node:vm'

const EXEC_TIMEOUT_MS = 5_000
const MAX_OUTPUT_CHARS = 10_000
const MAX_LOG_CALLS = 100

export interface CodeInterpreterResult {
  success: boolean
  output: string
  returnValue?: string
  error?: string
  executionTimeMs: number
}

/**
 * Execute JavaScript code in a sandboxed VM context.
 *
 * The sandbox provides:
 * - console.log / console.warn / console.error (captured)
 * - JSON, Math, Date, Array, Object, Map, Set, RegExp, etc.
 * - setTimeout / setInterval are NOT available (sync only)
 * - No require, import, fetch, process, or fs access
 */
export function executeCode(code: string, language = 'javascript'): CodeInterpreterResult {
  if (language !== 'javascript' && language !== 'js') {
    return {
      success: false,
      output: '',
      error: `Unsupported language: "${language}". Only JavaScript is supported in the current sandbox.`,
      executionTimeMs: 0,
    }
  }

  if (!code || code.trim().length === 0) {
    return {
      success: false,
      output: '',
      error: 'No code provided.',
      executionTimeMs: 0,
    }
  }

  const logs: string[] = []
  let logCount = 0
  let totalChars = 0

  function captureLog(level: string, ...args: unknown[]) {
    if (logCount >= MAX_LOG_CALLS) return
    logCount++
    const line = args
      .map((a) => {
        try {
          if (typeof a === 'string') return a
          return JSON.stringify(a, null, 2)
        } catch {
          return String(a)
        }
      })
      .join(' ')
    const prefixed = level === 'log' ? line : `[${level}] ${line}`
    totalChars += prefixed.length
    if (totalChars <= MAX_OUTPUT_CHARS) {
      logs.push(prefixed)
    }
  }

  const sandbox: Record<string, unknown> = {
    console: {
      log: (...args: unknown[]) => captureLog('log', ...args),
      warn: (...args: unknown[]) => captureLog('warn', ...args),
      error: (...args: unknown[]) => captureLog('error', ...args),
      info: (...args: unknown[]) => captureLog('info', ...args),
      table: (...args: unknown[]) => captureLog('log', ...args),
    },
    JSON, Math, Date, Array, Object, Map, Set, WeakMap, WeakSet,
    RegExp, Error, TypeError, RangeError, SyntaxError,
    Number, String, Boolean, Symbol, BigInt,
    parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
    undefined, NaN, Infinity,
    // Explicitly block dangerous globals
    process: undefined, require: undefined, globalThis: undefined,
    global: undefined, fetch: undefined, XMLHttpRequest: undefined,
    WebSocket: undefined, Worker: undefined,
    SharedArrayBuffer: undefined, Atomics: undefined,
  }

  const context = vm.createContext(sandbox, {
    name: 'code-interpreter-sandbox',
    codeGeneration: { strings: false, wasm: false },
  })

  const start = Date.now()

  try {
    const result = vm.runInContext(code, context, {
      timeout: EXEC_TIMEOUT_MS,
      displayErrors: true,
      filename: 'user-code.js',
    })

    const executionTimeMs = Date.now() - start

    let returnValue: string | undefined
    if (result !== undefined) {
      try {
        returnValue = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      } catch {
        returnValue = String(result)
      }
    }

    const outputParts: string[] = []
    if (logs.length > 0) outputParts.push(logs.join('\n'))
    if (logCount >= MAX_LOG_CALLS) {
      outputParts.push(`\n... (output truncated after ${MAX_LOG_CALLS} log calls)`)
    }
    if (returnValue !== undefined && returnValue !== 'undefined') {
      outputParts.push(`\n→ ${returnValue}`)
    }

    return {
      success: true,
      output: outputParts.join('\n').slice(0, MAX_OUTPUT_CHARS),
      returnValue,
      executionTimeMs,
    }
  } catch (err) {
    const executionTimeMs = Date.now() - start
    const errorMessage = err instanceof Error ? err.message : String(err)

    let userFriendlyError: string
    if (errorMessage.includes('Script execution timed out')) {
      userFriendlyError = `Execution timed out after ${EXEC_TIMEOUT_MS}ms. Your code may have an infinite loop.`
    } else if (errorMessage.includes('Code generation from strings disallowed')) {
      userFriendlyError = 'eval() and new Function() are not allowed in the sandbox.'
    } else {
      userFriendlyError = errorMessage
    }

    const outputParts: string[] = []
    if (logs.length > 0) outputParts.push(logs.join('\n'))
    outputParts.push(`\nError: ${userFriendlyError}`)

    return {
      success: false,
      output: outputParts.join('\n').slice(0, MAX_OUTPUT_CHARS),
      error: userFriendlyError,
      executionTimeMs,
    }
  }
}

/**
 * Agent tool wrapper — formats output for LLM consumption.
 */
export async function toolCodeInterpreter(args: Record<string, unknown>): Promise<string> {
  const code = (args.code as string) || (args.script as string) || ''
  const language = (args.language as string) || 'javascript'

  if (!code) {
    return 'Error: "code" parameter is required. Provide JavaScript code to execute.'
  }

  if (language !== 'javascript' && language !== 'js') {
    return `Error: Unsupported language "${language}". Only JavaScript is supported in the current sandbox.`
  }

  const result = executeCode(code, language)

  if (result.success) {
    const parts = [`Executed in ${result.executionTimeMs}ms`]
    if (result.output) parts.push(`\nOutput:\n${result.output}`)
    if (!result.output && result.returnValue === undefined) parts.push('\n(no output)')
    return parts.join('')
  }

  return `Execution failed (${result.executionTimeMs}ms)\n${result.output}`
}
