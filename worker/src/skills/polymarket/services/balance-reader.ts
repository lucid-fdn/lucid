/**
 * On-Chain CTF Balance Reader — ERC-1155 balanceOf via Polygon RPC.
 *
 * Reads CTF token balances without signing or gas.
 * Uses existing evmRpcCall for multi-provider fallback.
 */

import { evmRpcCall } from '../../../services/chain/rpc-fallback.js'
import { encodeFunctionData } from './abi-utils.js'
import { POLYMARKET_CONTRACTS, POLYGON_CHAIN_ID } from './constants.js'

/**
 * Read an agent's CTF ERC-1155 balance for a specific outcome token.
 *
 * @param walletAddress — Agent's EVM wallet address
 * @param tokenId — CTF outcome token ID (decimal string)
 * @returns Raw balance as string (uint256 — raw token units, NOT human-readable)
 */
export async function readCtfBalance(
  walletAddress: string,
  tokenId: string,
): Promise<string> {
  const calldata = encodeFunctionData('balanceOf', [walletAddress, tokenId])

  let result: unknown
  try {
    result = await evmRpcCall(POLYGON_CHAIN_ID, {
      method: 'eth_call',
      params: [
        {
          to: POLYMARKET_CONTRACTS.CTF,
          data: calldata,
        },
        'latest',
      ],
    })
  } catch (err) {
    throw new Error(
      `CTF balanceOf failed for wallet=${walletAddress} token=${tokenId}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  // Result is a hex-encoded uint256
  const hex = result as string
  if (!hex || hex === '0x' || hex === '0x0') return '0'
  return BigInt(hex).toString()
}
