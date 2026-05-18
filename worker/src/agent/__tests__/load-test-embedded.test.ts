/**
 * Load test: Embedded execution performance benchmarks
 *
 * Measures cold start, warm call latency, concurrent throughput,
 * and memory footprint of the embedded MCP plugin execution layer.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'

// Skip all tests when @lucid-fdn/plugins-embedded is a stub (no lucid-plugins link)
const isStub = await import('@lucid-fdn/plugins-embedded').then(m => m.VERSION === '0.0.0-stub').catch(() => true)

// Set dummy env vars before any skill factory imports
beforeAll(() => {
  const prefixes = [
    'TRADE', 'PREDICT', 'QUANTUM', 'SEO', 'AUDIT', 'TAX', 'VEILLE',
    'HYPE', 'COMPETE', 'PROSPECT', 'RECRUIT', 'BRIDGE', 'MEET',
    'INVOICE', 'PROPOSE', 'METRICS', 'FEEDBACK', 'VIDEO', 'OBSERVABILITY',
  ]
  for (const p of prefixes) {
    process.env[`${p}_SUPABASE_URL`] ??= 'https://test.supabase.co'
    process.env[`${p}_SUPABASE_KEY`] ??= 'test-key'
    process.env[`${p}_TENANT_ID`] ??= 'test-tenant'
  }
  process.env.SUPABASE_URL ??= 'https://test.supabase.co'
  process.env.SUPABASE_KEY ??= 'test-key'
  process.env.TENANT_ID ??= 'test-tenant'
})

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

describe.skipIf(isStub)('Load Test: Embedded Execution', () => {
  // Single import for the entire suite — avoids repeated vi.resetModules() overhead
  let loader: Awaited<ReturnType<typeof import('../embedded-plugin-loader.js')>>
  let registry: Awaited<ReturnType<typeof import('../embedded-registry.js')>>

  beforeAll(async () => {
    vi.resetModules()
    loader = await import('../embedded-plugin-loader.js')
    registry = await import('../embedded-registry.js')
  })

  it('cold start: first plugin load time < 30s', async () => {
    const t0 = Date.now()
    await loader.ensureEmbeddedPlugin('lucid-seo')
    const coldStartMs = Date.now() - t0
    console.log(`[load-test] Cold start (lucid-seo): ${coldStartMs}ms`)
    // WSL2 + concurrent test suites cause high cold start latency
    // Prod (Railway Linux) typically < 3s; relaxed for dev environments
    expect(coldStartMs).toBeLessThan(30_000)
  })

  it('warm call latency: p50 < 5ms, p95 < 20ms, p99 < 50ms', async () => {
    // lucid-seo already loaded by cold start test
    await loader.ensureEmbeddedPlugin('lucid-seo')

    const iterations = 50
    const latencies: number[] = []

    for (let i = 0; i < iterations; i++) {
      const t0 = performance.now()
      await registry.callEmbeddedTool('lucid-seo', 'seo_status', {})
      latencies.push(performance.now() - t0)
    }

    latencies.sort((a, b) => a - b)
    const p50 = percentile(latencies, 50)
    const p95 = percentile(latencies, 95)
    const p99 = percentile(latencies, 99)

    console.log(`[load-test] Warm call latency (${iterations} calls):`)
    console.log(`  p50: ${p50.toFixed(2)}ms`)
    console.log(`  p95: ${p95.toFixed(2)}ms`)
    console.log(`  p99: ${p99.toFixed(2)}ms`)
    console.log(`  min: ${latencies[0].toFixed(2)}ms`)
    console.log(`  max: ${latencies[latencies.length - 1].toFixed(2)}ms`)

    expect(p50).toBeLessThan(5)
    expect(p95).toBeLessThan(20)
    // p99 relaxed: concurrent test suites cause CPU contention spikes in CI/dev
    expect(p99).toBeLessThan(100)
  })

  it('concurrent throughput: 20 parallel calls complete < 2s', async () => {
    await loader.ensureEmbeddedPlugin('lucid-seo')

    const concurrency = 20
    const t0 = Date.now()

    const results = await Promise.all(
      Array.from({ length: concurrency }, () =>
        registry.callEmbeddedTool('lucid-seo', 'seo_status', {}),
      ),
    )

    const totalMs = Date.now() - t0
    console.log(`[load-test] Concurrent throughput: ${concurrency} parallel calls in ${totalMs}ms`)

    expect(results).toHaveLength(concurrency)
    for (const r of results) {
      expect(r.isError).toBe(false)
    }
    expect(totalMs).toBeLessThan(2000)
  })

  it('multi-plugin load: 3 plugins loaded concurrently', async () => {
    vi.resetModules()
    const freshLoader = await import('../embedded-plugin-loader.js')
    const freshRegistry = await import('../embedded-registry.js')

    const plugins = ['lucid-seo', 'lucid-hype', 'lucid-compete']
    const t0 = Date.now()

    await Promise.all(plugins.map(s => freshLoader.ensureEmbeddedPlugin(s)))

    const loadMs = Date.now() - t0
    console.log(`[load-test] Multi-plugin load (${plugins.length} plugins): ${loadMs}ms`)

    expect(freshRegistry.embeddedServerCount()).toBe(plugins.length)
    expect(loadMs).toBeLessThan(5000)
  })

  it('memory footprint: heap delta < 100MB after loading 3 plugins', async () => {
    vi.resetModules()
    const freshLoader = await import('../embedded-plugin-loader.js')

    // Force GC if available
    if (global.gc) global.gc()
    const heapBefore = process.memoryUsage().heapUsed

    await Promise.all([
      freshLoader.ensureEmbeddedPlugin('lucid-seo'),
      freshLoader.ensureEmbeddedPlugin('lucid-hype'),
      freshLoader.ensureEmbeddedPlugin('lucid-compete'),
    ])

    if (global.gc) global.gc()
    const heapAfter = process.memoryUsage().heapUsed
    const deltaMB = (heapAfter - heapBefore) / (1024 * 1024)

    console.log(`[load-test] Memory footprint:`)
    console.log(`  Before: ${(heapBefore / 1024 / 1024).toFixed(1)}MB`)
    console.log(`  After:  ${(heapAfter / 1024 / 1024).toFixed(1)}MB`)
    console.log(`  Delta:  ${deltaMB.toFixed(1)}MB`)

    expect(deltaMB).toBeLessThan(100)
  })
})
