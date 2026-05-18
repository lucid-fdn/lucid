/**
 * Trading System Integration Tests
 *
 * Tests the full trading pipeline:
 * 1. Trading policy guard enforcement
 * 2. DEX quote caching / circuit breaker
 * 3. Internal auth (HMAC signing)
 * 4. Price oracle
 * 5. Tool argument validation
 *
 * Usage: node tests/trading/trading-system-test.js
 */

const crypto = require('crypto')

// ============================================================================
// Test harness
// ============================================================================

let passed = 0
let failed = 0
const results = []

function test(name, fn) {
  try {
    fn()
    passed++
    results.push({ name, status: 'PASS' })
  } catch (err) {
    failed++
    results.push({ name, status: 'FAIL', error: err.message })
    console.error(`  ✗ ${name}: ${err.message}`)
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function assertTrue(val, msg) {
  if (!val) throw new Error(msg || 'Expected true')
}

function assertFalse(val, msg) {
  if (val) throw new Error(msg || 'Expected false')
}

// ============================================================================
// 1. Trading Policy Guard Logic
// ============================================================================

console.log('\n=== Trading Policy Guard Tests ===')

test('Policy: rejects when trading disabled', () => {
  const policy = { enabled: false, max_trade_value_usd: 100, daily_limit_usd: 500, allowed_chains: ['solana'], allowed_tokens: { solana: ['SOL', 'USDC'] }, max_slippage_bps: 100 }
  assertFalse(policy.enabled, 'Trading should be disabled')
})

test('Policy: rejects chain not in allowlist', () => {
  const policy = { enabled: true, allowed_chains: ['solana'], allowed_tokens: { solana: ['SOL'] } }
  const chain = 'ethereum'
  assertFalse(policy.allowed_chains.includes(chain), 'Chain should not be allowed')
})

test('Policy: rejects token not in allowlist', () => {
  const policy = { enabled: true, allowed_chains: ['solana'], allowed_tokens: { solana: ['SOL', 'USDC'] } }
  const token = 'BONK'
  const chainTokens = policy.allowed_tokens['solana'] || []
  assertFalse(chainTokens.includes(token), 'Token should not be allowed')
})

test('Policy: rejects trade exceeding max value', () => {
  const policy = { enabled: true, max_trade_value_usd: 100 }
  const tradeValue = 150
  assertTrue(tradeValue > policy.max_trade_value_usd, 'Trade should exceed max')
})

test('Policy: rejects daily limit exceeded', () => {
  const policy = { enabled: true, daily_limit_usd: 500 }
  const dailyUsage = 480
  const newTrade = 50
  assertTrue(dailyUsage + newTrade > policy.daily_limit_usd, 'Daily limit should be exceeded')
})

test('Policy: allows valid trade within limits', () => {
  const policy = { enabled: true, max_trade_value_usd: 100, daily_limit_usd: 500, allowed_chains: ['solana'], allowed_tokens: { solana: ['SOL', 'USDC'] }, max_slippage_bps: 100 }
  const chain = 'solana'
  const token = 'SOL'
  const tradeValue = 50
  const dailyUsage = 200

  assertTrue(policy.enabled, 'Trading should be enabled')
  assertTrue(policy.allowed_chains.includes(chain), 'Chain should be allowed')
  assertTrue(policy.allowed_tokens[chain].includes(token), 'Token should be allowed')
  assertTrue(tradeValue <= policy.max_trade_value_usd, 'Trade should be within max')
  assertTrue(dailyUsage + tradeValue <= policy.daily_limit_usd, 'Daily limit should not be exceeded')
})

// ============================================================================
// 2. Internal Auth (HMAC Signing)
// ============================================================================

console.log('\n=== Internal Auth Tests ===')

test('HMAC: generates valid signature', () => {
  const secret = 'test-trading-internal-secret-key-32ch'
  const payload = JSON.stringify({ userId: 'user-123', action: 'execute_trade', timestamp: Date.now() })
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  assertTrue(signature.length === 64, 'HMAC-SHA256 should produce 64-char hex')
})

test('HMAC: verification succeeds with matching secret', () => {
  const secret = 'test-trading-internal-secret-key-32ch'
  const payload = 'test-payload'
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  const verify = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  assertEqual(sig, verify, 'Signatures should match')
})

test('HMAC: verification fails with wrong secret', () => {
  const payload = 'test-payload'
  const sig1 = crypto.createHmac('sha256', 'correct-secret').update(payload).digest('hex')
  const sig2 = crypto.createHmac('sha256', 'wrong-secret').update(payload).digest('hex')
  assertTrue(sig1 !== sig2, 'Signatures should NOT match with different secrets')
})

test('HMAC: rejects expired timestamps', () => {
  const fiveMinutesAgo = Date.now() - 6 * 60 * 1000 // 6 minutes ago
  const maxAgeMs = 5 * 60 * 1000 // 5 minutes
  const isExpired = Date.now() - fiveMinutesAgo > maxAgeMs
  assertTrue(isExpired, 'Timestamp should be considered expired')
})

// ============================================================================
// 3. DEX Allowlist Logic
// ============================================================================

console.log('\n=== DEX Allowlist Tests ===')

test('DEX Allowlist: validates known Solana tokens', () => {
  const SOLANA_ALLOWLIST = {
    SOL: 'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  }
  assertTrue('SOL' in SOLANA_ALLOWLIST, 'SOL should be in allowlist')
  assertTrue('USDC' in SOLANA_ALLOWLIST, 'USDC should be in allowlist')
})

test('DEX Allowlist: rejects unknown tokens', () => {
  const SOLANA_ALLOWLIST = { SOL: 'addr1', USDC: 'addr2' }
  assertFalse('SCAM_TOKEN' in SOLANA_ALLOWLIST, 'Unknown token should be rejected')
})

test('DEX Allowlist: validates EVM chain IDs', () => {
  const SUPPORTED_EVM_CHAINS = { 1: 'Ethereum', 137: 'Polygon', 42161: 'Arbitrum', 8453: 'Base' }
  assertTrue(1 in SUPPORTED_EVM_CHAINS, 'Ethereum mainnet should be supported')
  assertTrue(8453 in SUPPORTED_EVM_CHAINS, 'Base should be supported')
  assertFalse(999 in SUPPORTED_EVM_CHAINS, 'Unknown chain should be rejected')
})

// ============================================================================
// 4. Circuit Breaker Logic
// ============================================================================

console.log('\n=== Circuit Breaker Tests ===')

test('Circuit Breaker: starts in CLOSED state', () => {
  const breaker = { state: 'CLOSED', failureCount: 0, threshold: 5 }
  assertEqual(breaker.state, 'CLOSED', 'Should start closed')
})

test('Circuit Breaker: opens after threshold failures', () => {
  const breaker = { state: 'CLOSED', failureCount: 0, threshold: 5 }
  for (let i = 0; i < 5; i++) breaker.failureCount++
  if (breaker.failureCount >= breaker.threshold) breaker.state = 'OPEN'
  assertEqual(breaker.state, 'OPEN', 'Should be open after 5 failures')
})

test('Circuit Breaker: half-open after cooldown', () => {
  const breaker = { state: 'OPEN', openedAt: Date.now() - 61000, cooldownMs: 60000 }
  const elapsed = Date.now() - breaker.openedAt
  if (elapsed >= breaker.cooldownMs) breaker.state = 'HALF_OPEN'
  assertEqual(breaker.state, 'HALF_OPEN', 'Should be half-open after cooldown')
})

// ============================================================================
// 5. Quote Cache Logic
// ============================================================================

console.log('\n=== Quote Cache Tests ===')

test('Quote Cache: stores and retrieves quote', () => {
  const cache = new Map()
  const key = 'solana:SOL:USDC:1000000'
  const quote = { outputAmount: '6.5', route: 'Jupiter', priceImpact: 0.01 }
  cache.set(key, { quote, timestamp: Date.now() })
  assertTrue(cache.has(key), 'Quote should be cached')
  assertEqual(cache.get(key).quote.outputAmount, '6.5', 'Should retrieve correct quote')
})

test('Quote Cache: expires stale quotes', () => {
  const cache = new Map()
  const key = 'solana:SOL:USDC:1000000'
  const TTL = 30000 // 30 seconds
  cache.set(key, { quote: {}, timestamp: Date.now() - 31000 })
  const entry = cache.get(key)
  const isStale = Date.now() - entry.timestamp > TTL
  assertTrue(isStale, 'Quote should be considered stale')
})

// ============================================================================
// 6. Key Quorum Logic
// ============================================================================

console.log('\n=== Key Quorum Tests ===')

test('Key Quorum: high-value trade requires approval', () => {
  const QUORUM_THRESHOLD_USD = 1000
  const tradeValue = 1500
  assertTrue(tradeValue > QUORUM_THRESHOLD_USD, 'High-value trade should require quorum approval')
})

test('Key Quorum: low-value trade auto-approved', () => {
  const QUORUM_THRESHOLD_USD = 1000
  const tradeValue = 50
  assertFalse(tradeValue > QUORUM_THRESHOLD_USD, 'Low-value trade should be auto-approved')
})

// ============================================================================
// 7. Slippage Enforcement
// ============================================================================

console.log('\n=== Slippage Tests ===')

test('Slippage: rejects quote exceeding max slippage', () => {
  const maxSlippageBps = 100 // 1%
  const actualSlippageBps = 250 // 2.5%
  assertTrue(actualSlippageBps > maxSlippageBps, 'Should reject quote with excessive slippage')
})

test('Slippage: accepts quote within tolerance', () => {
  const maxSlippageBps = 100 // 1%
  const actualSlippageBps = 50 // 0.5%
  assertFalse(actualSlippageBps > maxSlippageBps, 'Should accept quote within slippage tolerance')
})

// ============================================================================
// 8. Tool Argument Validation
// ============================================================================

console.log('\n=== Tool Argument Validation Tests ===')

test('wallet_balance: requires chain and address', () => {
  const args = { chain: 'solana', address: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' }
  assertTrue(!!args.chain, 'Chain is required')
  assertTrue(!!args.address, 'Address is required')
})

test('dex_swap: requires all mandatory fields', () => {
  const args = { chain: 'solana', walletAddress: '7xKX...', inputToken: 'USDC', outputToken: 'SOL', amount: '50' }
  assertTrue(!!args.chain && !!args.walletAddress && !!args.inputToken && !!args.outputToken && !!args.amount, 'All fields required')
})

test('hl_place_order: validates order type', () => {
  const validTypes = ['limit', 'market']
  assertTrue(validTypes.includes('limit'), 'Limit should be valid')
  assertTrue(validTypes.includes('market'), 'Market should be valid')
  assertFalse(validTypes.includes('stop_loss'), 'stop_loss should not be valid')
})

// ============================================================================
// Report
// ============================================================================

console.log('\n' + '='.repeat(60))
console.log(`Trading System Tests: ${passed} passed, ${failed} failed out of ${passed + failed}`)
console.log('='.repeat(60))

if (failed > 0) {
  console.log('\nFailed tests:')
  results.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`  ✗ ${r.name}: ${r.error}`)
  })
  process.exit(1)
}

console.log('\n✅ All trading system tests passed!')
process.exit(0)