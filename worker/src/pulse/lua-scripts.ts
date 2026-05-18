/**
 * Pulse Lua Scripts
 *
 * Three scripts — all single-key to avoid CROSSSLOT errors.
 *
 * IMPORTANT: These are mirrored in contracts/pulse.ts for control plane use.
 * Keep both in sync.
 *
 * CLAIM_LUA removed — Pulse v2 uses XREADGROUP instead of Lua ZPOPMIN.
 *
 * 1. conditional-del.lua — Fenced lease release (single key)
 * 2. floor-decr.lua — Decrement with floor guard (single key)
 * 3. renew-lease.lua — Atomic lease renewal with ownership check (single key)
 */

/**
 * @deprecated Pulse v2 uses XREADGROUP. Kept as named export for compat.
 */
export const CLAIM_LUA = ''

/**
 * Atomic fencing for complete/fail — only DEL if lease JSON contains matching workerId.
 * KEYS[1]: pulse:lease:{runId}
 * ARGV[1]: workerId (plain string to match against JSON field)
 * Returns: 1 if deleted, 0 if stale
 *
 * The lease value is JSON: {"workerId":"...","agentId":"...",...}
 * We check if the stored JSON contains the workerId pattern.
 * Using string.find on the serialized JSON is safe because workerId
 * is a simple alphanumeric string (no regex metachars).
 */
export const CONDITIONAL_DEL_LUA = `
local val = redis.call("GET", KEYS[1])
if val == false then return 0 end
local pattern = '"workerId":"' .. ARGV[1] .. '"'
if string.find(val, pattern, 1, true) then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`

/**
 * Plain string conditional DEL — for non-JSON values (e.g., lock keys).
 * KEYS[1]: key to delete
 * ARGV[1]: expected value (exact match)
 * Returns: 1 if deleted, 0 if value doesn't match
 */
export const PLAIN_CONDITIONAL_DEL_LUA = `
local val = redis.call("GET", KEYS[1])
if val == false then return 0 end
if val == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`

/**
 * Decrement with floor guard — prevents negative counters.
 * KEYS[1]: pulse:agent:{agentId}:inflight
 * Returns: new value (floored to 0)
 */
export const FLOOR_DECR_LUA = `
local v = redis.call("DECR", KEYS[1])
if v < 0 then
  redis.call("SET", KEYS[1], "0")
  return 0
end
return v
`

/**
 * Atomic compare-and-set for inflight counter reset.
 * Only resets if current value > expected — prevents overwriting
 * a concurrent INCR from the claim loop's postClaimFlow.
 * KEYS[1]: pulse:agent:{agentId}:inflight
 * ARGV[1]: expected count (from active lease scan)
 * Returns: 1 if reset, 0 if current <= expected
 */
export const RESET_INFLIGHT_LUA = `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local expected = tonumber(ARGV[1])
if current > expected then
  redis.call("SET", KEYS[1], ARGV[1])
  redis.call("EXPIRE", KEYS[1], 300)
  return 1
end
return 0
`

/**
 * Atomic lease renewal with ownership check — fixes TOCTOU race.
 * KEYS[1]: pulse:lease:{runId}
 * ARGV[1]: workerId (plain string to match against JSON field)
 * ARGV[2]: new TTL in seconds
 * Returns: 1 if renewed, 0 if lease expired or owned by another worker
 *
 * Uses string.find with plain mode (4th arg = true) — safe for alphanumeric workerIds.
 */
export const RENEW_LEASE_LUA = `
local val = redis.call("GET", KEYS[1])
if val == false then return 0 end
local pattern = '"workerId":"' .. ARGV[1] .. '"'
if string.find(val, pattern, 1, true) then
  redis.call("EXPIRE", KEYS[1], tonumber(ARGV[2]))
  return 1
else
  return 0
end
`
