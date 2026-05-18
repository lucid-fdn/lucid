/**
 * Polymarket constants — Single source of truth for contract addresses + config.
 *
 * Canonical source: @lucid-fdn/trade polymarket.ts
 * Duplicated here because worker/ cannot import from lucid-skills packages at runtime.
 * Keep in sync with lucid-trade/plugin/src/constants/polymarket.ts.
 */

export const POLYGON_CHAIN_ID = '137'

export const POLYMARKET_CONTRACTS = {
  USDC_E: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  CTF: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
  CTF_EXCHANGE: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
  NEG_RISK_CTF_EXCHANGE: '0xC5d563A36AE78145C45a50134d48A1215220f80a',
  NEG_RISK_ADAPTER: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296',
} as const

export const POLYMARKET_CLOB_URL = 'https://clob.polymarket.com'
export const POLYMARKET_GAMMA_URL = 'https://gamma-api.polymarket.com'
export const POLYMARKET_DATA_URL = 'https://data-api.polymarket.com'

export const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000'
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

// ── EIP-712 Order Signing ──

/** EIP-712 domain name for order signing */
export const ORDER_PROTOCOL_NAME = 'Polymarket CTF Exchange'
export const ORDER_PROTOCOL_VERSION = '1'

/** EIP-712 ORDER_STRUCTURE type fields (matches @polymarket/order-utils) */
export const ORDER_STRUCTURE = [
  { name: 'salt', type: 'uint256' },
  { name: 'maker', type: 'address' },
  { name: 'signer', type: 'address' },
  { name: 'taker', type: 'address' },
  { name: 'tokenId', type: 'uint256' },
  { name: 'makerAmount', type: 'uint256' },
  { name: 'takerAmount', type: 'uint256' },
  { name: 'expiration', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'feeRateBps', type: 'uint256' },
  { name: 'side', type: 'uint8' },
  { name: 'signatureType', type: 'uint8' },
] as const

/** Signature types matching @polymarket/order-utils */
export const SIGNATURE_TYPE = {
  EOA: 0,
  POLY_PROXY: 1,
  POLY_GNOSIS_SAFE: 2,
} as const

/** Numeric order side (for EIP-712 struct, not REST API) */
export const ORDER_SIDE = {
  BUY: 0,
  SELL: 1,
} as const

/** Collateral token decimals (USDC.e = 6) */
export const COLLATERAL_TOKEN_DECIMALS = 6

/** USDC.e decimals on Polygon */
export const USDC_DECIMALS = 6

/** Binary market partition (YES=1, NO=2) */
export const BINARY_PARTITION = [1, 2] as const

/** API key cache TTL (23h — keys expire at 24h on CLOB side) */
export const CLOB_API_KEY_TTL_MS = 23 * 60 * 60 * 1000

/** Max cached API keys (LRU eviction when exceeded) */
export const CLOB_API_KEY_CACHE_MAX = 500

/** Fetch timeout for CLOB/Gamma API calls */
export const API_TIMEOUT_MS = 30_000

/** Max retries for transient failures (429, 503, network errors) */
export const MAX_RETRIES = 3

/** Base delay for exponential backoff (ms) */
export const RETRY_BASE_DELAY_MS = 500

// ── Bridge ──

export const POLYMARKET_BRIDGE_URL = 'https://bridge.polymarket.com'

/** Solana USDC mint address (SPL, mainnet) */
export const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
