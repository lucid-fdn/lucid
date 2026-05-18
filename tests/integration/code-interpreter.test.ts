/**
 * Code Interpreter Tool — Integration Tests
 *
 * Tests sandboxed JavaScript execution:
 * 1. Basic execution + output capture
 * 2. Console.log capture
 * 3. Timeout enforcement
 * 4. Blocked dangerous globals
 * 5. eval() / new Function() blocked
 * 6. Output truncation
 * 7. Error handling
 * 8. Agent tool wrapper
 *
 * See docs/OPENCLAW_AUDIT_PLAN_V3.md §P2 #19
 */

import { describe, it, expect } from 'vitest'
import { executeCode, toolCodeInterpreter } from '../../worker/src/agent/tools/code-interpreter.js'

/* ─── 1. Basic Execution ─────────────────────────────── */

describe('Code Interpreter: Basic Execution', () => {
  it('executes simple expression and returns result', () => {
    const result = executeCode('2 + 2')
    expect(result.success).toBe(true)
    expect(result.returnValue).toBe('4')
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0)
  })

  it('executes multi-line code', () => {
    const result = executeCode(`
      const a = 10
      const b = 20
      a + b
    `)
    expect(result.success).toBe(true)
    expect(result.returnValue).toBe('30')
  })

  it('returns object results as JSON', () => {
    const result = executeCode('({ name: "test", value: 42 })')
    expect(result.success).toBe(true)
    expect(result.returnValue).toContain('"name"')
    expect(result.returnValue).toContain('"test"')
  })

  it('handles string return values', () => {
    const result = executeCode('"hello world"')
    expect(result.success).toBe(true)
    expect(result.returnValue).toBe('hello world')
  })

  it('handles undefined return (no expression result)', () => {
    const result = executeCode('const x = 5;')
    expect(result.success).toBe(true)
    // undefined return should not appear in output
    expect(result.output).not.toContain('undefined')
  })
})

/* ─── 2. Console Output Capture ──────────────────────── */

describe('Code Interpreter: Console Capture', () => {
  it('captures console.log output', () => {
    const result = executeCode('console.log("hello"); console.log("world")')
    expect(result.success).toBe(true)
    expect(result.output).toContain('hello')
    expect(result.output).toContain('world')
  })

  it('captures console.warn with prefix', () => {
    const result = executeCode('console.warn("caution!")')
    expect(result.success).toBe(true)
    expect(result.output).toContain('[warn]')
    expect(result.output).toContain('caution!')
  })

  it('captures console.error with prefix', () => {
    const result = executeCode('console.error("bad thing")')
    expect(result.success).toBe(true)
    expect(result.output).toContain('[error]')
    expect(result.output).toContain('bad thing')
  })

  it('serializes objects in console.log', () => {
    const result = executeCode('console.log({ key: "val" })')
    expect(result.success).toBe(true)
    expect(result.output).toContain('"key"')
    expect(result.output).toContain('"val"')
  })

  it('handles multiple arguments in console.log', () => {
    const result = executeCode('console.log("a", 1, true)')
    expect(result.success).toBe(true)
    expect(result.output).toContain('a')
    expect(result.output).toContain('1')
    expect(result.output).toContain('true')
  })
})

/* ─── 3. Timeout Enforcement ─────────────────────────── */

describe('Code Interpreter: Timeout', () => {
  it('kills infinite loops', () => {
    const result = executeCode('while(true) {}')
    expect(result.success).toBe(false)
    expect(result.error).toContain('timed out')
  }, 10_000)

  it('kills long-running computation', () => {
    const result = executeCode(`
      let x = 0
      for (let i = 0; i < 1e15; i++) { x += i }
      x
    `)
    expect(result.success).toBe(false)
    expect(result.error).toContain('timed out')
  }, 10_000)
})

/* ─── 4. Sandbox: Blocked Globals ────────────────────── */

describe('Code Interpreter: Sandbox Safety', () => {
  it('blocks process access', () => {
    const result = executeCode('process.env')
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('blocks require', () => {
    const result = executeCode('require("fs")')
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('blocks fetch', () => {
    const result = executeCode('fetch("https://example.com")')
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('blocks globalThis', () => {
    const result = executeCode('globalThis.process')
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('allows Math', () => {
    const result = executeCode('Math.PI')
    expect(result.success).toBe(true)
    expect(result.returnValue).toContain('3.14')
  })

  it('allows JSON', () => {
    const result = executeCode('JSON.stringify({ a: 1 })')
    expect(result.success).toBe(true)
    expect(result.returnValue).toBe('{"a":1}')
  })

  it('allows Date', () => {
    const result = executeCode('typeof new Date()')
    expect(result.success).toBe(true)
    expect(result.returnValue).toBe('object')
  })

  it('allows Array methods', () => {
    const result = executeCode('[1,2,3].map(x => x * 2)')
    expect(result.success).toBe(true)
    expect(result.returnValue).toContain('[')
    expect(result.returnValue).toContain('2')
    expect(result.returnValue).toContain('4')
    expect(result.returnValue).toContain('6')
  })
})

/* ─── 5. eval() / new Function() Blocked ─────────────── */

describe('Code Interpreter: Code Generation Blocked', () => {
  it('blocks eval()', () => {
    const result = executeCode('eval("1+1")')
    expect(result.success).toBe(false)
    expect(result.error).toContain('not allowed')
  })

  it('blocks new Function()', () => {
    const result = executeCode('new Function("return 1")()')
    expect(result.success).toBe(false)
    expect(result.error).toContain('not allowed')
  })
})

/* ─── 6. Error Handling ──────────────────────────────── */

describe('Code Interpreter: Error Handling', () => {
  it('catches syntax errors', () => {
    const result = executeCode('const x = {')
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('catches runtime errors', () => {
    const result = executeCode('undeclaredVariable')
    expect(result.success).toBe(false)
    expect(result.error).toContain('not defined')
  })

  it('catches type errors', () => {
    const result = executeCode('null.toString()')
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('preserves console output before error', () => {
    const result = executeCode(`
      console.log("before error")
      throw new Error("boom")
    `)
    expect(result.success).toBe(false)
    expect(result.output).toContain('before error')
    expect(result.output).toContain('boom')
  })

  it('rejects empty code', () => {
    const result = executeCode('')
    expect(result.success).toBe(false)
    expect(result.error).toContain('No code')
  })

  it('rejects unsupported language', () => {
    const result = executeCode('print("hello")', 'python')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unsupported language')
  })
})

/* ─── 7. Agent Tool Wrapper ──────────────────────────── */

describe('Code Interpreter: Agent Tool Wrapper', () => {
  it('returns success format for valid code', async () => {
    const result = await toolCodeInterpreter({ code: '1 + 1' })
    expect(result).toContain('✅')
    expect(result).toContain('Executed')
  })

  it('returns error format for failing code', async () => {
    const result = await toolCodeInterpreter({ code: 'throw new Error("test")' })
    expect(result).toContain('❌')
    expect(result).toContain('test')
  })

  it('requires code parameter', async () => {
    const result = await toolCodeInterpreter({})
    expect(result).toContain('Error')
    expect(result).toContain('code')
  })

  it('accepts script parameter as alias', async () => {
    const result = await toolCodeInterpreter({ script: '2 * 3' })
    expect(result).toContain('✅')
  })

  it('passes language parameter through', async () => {
    const result = await toolCodeInterpreter({ code: 'print("hi")', language: 'python' })
    expect(result).toContain('Error')
    expect(result).toContain('Unsupported')
  })
})

/* ─── 8. Complex Computation ─────────────────────────── */

describe('Code Interpreter: Complex Computation', () => {
  it('fibonacci', () => {
    const result = executeCode(`
      function fib(n) {
        if (n <= 1) return n
        return fib(n - 1) + fib(n - 2)
      }
      fib(10)
    `)
    expect(result.success).toBe(true)
    expect(result.returnValue).toBe('55')
  })

  it('array manipulation', () => {
    const result = executeCode(`
      const data = [5, 3, 8, 1, 9, 2, 7, 4, 6]
      const sorted = [...data].sort((a, b) => a - b)
      const sum = sorted.reduce((a, b) => a + b, 0)
      const avg = sum / sorted.length
      console.log('Sorted:', sorted)
      console.log('Sum:', sum)
      console.log('Average:', avg)
      avg
    `)
    expect(result.success).toBe(true)
    expect(result.returnValue).toBe('5')
    expect(result.output).toContain('Sorted:')
    expect(result.output).toContain('Sum:')
    expect(result.output).toContain('45')
  })

  it('map/set usage', () => {
    const result = executeCode(`
      const m = new Map()
      m.set('a', 1)
      m.set('b', 2)
      m.size
    `)
    expect(result.success).toBe(true)
    expect(result.returnValue).toBe('2')
  })

  it('regex usage', () => {
    const result = executeCode(`
      const text = 'Hello World 123'
      const numbers = text.match(/\\d+/)
      numbers[0]
    `)
    expect(result.success).toBe(true)
    expect(result.returnValue).toBe('123')
  })
})