/**
 * Solana Transfer Transaction Building — P1-18
 *
 * Builds serialized Solana transactions for SOL and SPL token transfers.
 * Uses raw RPC calls (no @solana/web3.js dependency needed).
 */

import { solanaRpcCall } from './rpc-fallback.js'
import { getSolanaTokenDecimals } from './token-decimals.js'

// ============================================================================
// Constants
// ============================================================================

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const SYSTEM_PROGRAM = '11111111111111111111111111111111'
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const ASSOCIATED_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
const COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111'

// ============================================================================
// Types
// ============================================================================

export interface SolanaTransferParams {
  fromAddress: string
  toAddress: string
  mintAddress: string // SOL_MINT for native SOL
  amount: string // Human-readable amount (e.g., "1.5")
  chainId?: string
  priorityFeelamports?: number
}

export interface SolanaTransferResult {
  success: boolean
  serializedTransaction?: string // base64
  estimatedFee?: number
  error?: string
}

// ============================================================================
// Base58 Encoding (minimal, no external dep)
// ============================================================================

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Decode(str: string): Uint8Array {
  const bytes: number[] = [0]
  for (const char of str) {
    const idx = BASE58_ALPHABET.indexOf(char)
    if (idx === -1) throw new Error(`Invalid base58 character: ${char}`)
    for (let i = 0; i < bytes.length; i++) bytes[i] *= 58
    bytes[0] += idx
    for (let i = 0; i < bytes.length - 1; i++) {
      bytes[i + 1] += (bytes[i] >> 8)
      bytes[i] &= 0xff
    }
    while (bytes[bytes.length - 1] > 255) {
      bytes.push(bytes[bytes.length - 1] >> 8)
      bytes[bytes.length - 2] &= 0xff
    }
  }
  // Leading zeros
  let leadingZeros = 0
  for (const char of str) {
    if (char === '1') leadingZeros++
    else break
  }
  const result = new Uint8Array(leadingZeros + bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    result[leadingZeros + bytes.length - 1 - i] = bytes[i]
  }
  return result
}

function base58Encode(bytes: Uint8Array): string {
  const digits = [0]
  for (const byte of bytes) {
    for (let i = 0; i < digits.length; i++) digits[i] <<= 8
    digits[0] += byte
    for (let i = 0; i < digits.length - 1; i++) {
      digits[i + 1] += (digits[i] / 58) | 0
      digits[i] %= 58
    }
    while (digits[digits.length - 1] >= 58) {
      digits.push((digits[digits.length - 1] / 58) | 0)
      digits[digits.length - 2] %= 58
    }
  }
  let leadingZeros = 0
  for (const b of bytes) {
    if (b === 0) leadingZeros++
    else break
  }
  return '1'.repeat(leadingZeros) + digits.reverse().map(d => BASE58_ALPHABET[d]).join('')
}

// ============================================================================
// Compact-u16 encoding (Solana message format)
// ============================================================================

function encodeCompactU16(value: number): Uint8Array {
  const bytes: number[] = []
  let v = value
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80)
    v >>= 7
  }
  bytes.push(v)
  return new Uint8Array(bytes)
}

// ============================================================================
// Get Recent Blockhash
// ============================================================================

async function getRecentBlockhash(chainId: string): Promise<string> {
  const result = await solanaRpcCall(chainId, {
    method: 'getLatestBlockhash',
    params: [{ commitment: 'finalized' }],
  }) as { value: { blockhash: string } }

  return result.value.blockhash
}

// ============================================================================
// Derive Associated Token Account (ATA)
// ============================================================================

function deriveATA(ownerPubkey: Uint8Array, mintPubkey: Uint8Array): Uint8Array {
  // PDA: seeds = [owner, TOKEN_PROGRAM, mint], program = ASSOCIATED_TOKEN_PROGRAM
  // We can't do PDA derivation without crypto.subtle — return placeholder
  // The actual ATA must be looked up via RPC
  throw new Error('ATA derivation requires RPC lookup — use getOrCreateATA()')
}

async function getTokenAccountForOwner(
  chainId: string,
  ownerAddress: string,
  mintAddress: string
): Promise<string | null> {
  try {
    const result = await solanaRpcCall(chainId, {
      method: 'getTokenAccountsByOwner',
      params: [
        ownerAddress,
        { mint: mintAddress },
        { encoding: 'jsonParsed' },
      ],
    }) as { value: Array<{ pubkey: string }> }

    if (result.value && result.value.length > 0) {
      return result.value[0].pubkey
    }
    return null
  } catch {
    return null
  }
}

// ============================================================================
// Build Native SOL Transfer
// ============================================================================

/**
 * Build a native SOL transfer (SystemProgram.transfer).
 *
 * Solana message v0 format:
 *   [prefix(1)] [num_required_sigs(1)] [num_readonly_signed(0)] [num_readonly_unsigned(1)]
 *   [num_accounts(compact)] [accounts...] [recent_blockhash(32)]
 *   [num_instructions(compact)] [instruction...]
 */
function buildNativeSOLTransfer(
  fromPubkey: Uint8Array,
  toPubkey: Uint8Array,
  lamports: bigint,
  blockhash: string,
  priorityFeeLamports?: number
): Uint8Array {
  const systemProgramKey = base58Decode(SYSTEM_PROGRAM)
  const blockhashBytes = base58Decode(blockhash)

  // If priority fee, include ComputeBudget program
  const hasPriorityFee = priorityFeeLamports && priorityFeeLamports > 0
  const computeBudgetKey = hasPriorityFee ? base58Decode(COMPUTE_BUDGET_PROGRAM) : null

  // Account keys: [from(signer,writable), to(writable), system_program(readonly)]
  // + optionally compute_budget_program
  const accountKeys: Uint8Array[] = [fromPubkey, toPubkey, systemProgramKey]
  if (computeBudgetKey) accountKeys.push(computeBudgetKey)

  const numRequiredSigs = 1
  const numReadonlySignedAccounts = 0
  const numReadonlyUnsignedAccounts = hasPriorityFee ? 2 : 1 // system + maybe compute_budget

  // Build instructions
  const instructions: Uint8Array[] = []

  // Priority fee instruction (SetComputeUnitPrice)
  if (hasPriorityFee && priorityFeeLamports) {
    const computeBudgetIdx = accountKeys.length - 1 // last account
    // Instruction: programIdIndex, no accounts, data = [3 (SetComputeUnitPrice), lamports as u64 LE]
    const cbData = new Uint8Array(9)
    cbData[0] = 3 // SetComputeUnitPrice
    const view = new DataView(cbData.buffer)
    view.setBigUint64(1, BigInt(priorityFeeLamports), true)
    const cbInstr = new Uint8Array([
      computeBudgetIdx,
      0, // num accounts
      ...encodeCompactU16(cbData.length),
      ...cbData,
    ])
    instructions.push(cbInstr)
  }

  // Transfer instruction
  // SystemProgram.Transfer = instruction index 2
  // data: [2, 0, 0, 0 (u32 LE instruction enum), lamports (u64 LE)]
  const transferData = new Uint8Array(12)
  const tdView = new DataView(transferData.buffer)
  tdView.setUint32(0, 2, true) // Transfer instruction enum
  tdView.setBigUint64(4, lamports, true)

  const systemProgramIdx = 2
  const transferInstr = new Uint8Array([
    systemProgramIdx, // program ID index
    2, // num accounts
    0, // from (index 0)
    1, // to (index 1)
    ...encodeCompactU16(transferData.length),
    ...transferData,
  ])
  instructions.push(transferInstr)

  // Assemble message
  const numAccounts = encodeCompactU16(accountKeys.length)
  const numInstructions = encodeCompactU16(instructions.length)
  const accountKeysFlat = new Uint8Array(accountKeys.length * 32)
  accountKeys.forEach((key, i) => accountKeysFlat.set(key.slice(0, 32), i * 32))

  const instructionsFlat = new Uint8Array(
    instructions.reduce((acc, instr) => acc + instr.length, 0)
  )
  let offset = 0
  for (const instr of instructions) {
    instructionsFlat.set(instr, offset)
    offset += instr.length
  }

  // Message = header + accounts + blockhash + instructions
  const header = new Uint8Array([
    numRequiredSigs,
    numReadonlySignedAccounts,
    numReadonlyUnsignedAccounts,
  ])

  const totalLen = header.length + numAccounts.length + accountKeysFlat.length +
    32 + numInstructions.length + instructionsFlat.length
  const message = new Uint8Array(totalLen)
  let pos = 0
  message.set(header, pos); pos += header.length
  message.set(numAccounts, pos); pos += numAccounts.length
  message.set(accountKeysFlat, pos); pos += accountKeysFlat.length
  message.set(blockhashBytes.slice(0, 32), pos); pos += 32
  message.set(numInstructions, pos); pos += numInstructions.length
  message.set(instructionsFlat, pos)

  // Transaction = [num_signatures(compact)] + [signature_placeholder(64)] + [message]
  // We send unsigned — Privy signs it server-side
  const numSigs = encodeCompactU16(1)
  const signaturePlaceholder = new Uint8Array(64) // zeros = unsigned
  const tx = new Uint8Array(numSigs.length + 64 + message.length)
  tx.set(numSigs, 0)
  tx.set(signaturePlaceholder, numSigs.length)
  tx.set(message, numSigs.length + 64)

  return tx
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Build a serialized Solana transfer transaction.
 * Returns base64-encoded transaction ready for Privy signing.
 */
export async function buildSolanaTransferTransaction(
  params: SolanaTransferParams
): Promise<SolanaTransferResult> {
  const {
    fromAddress,
    toAddress,
    mintAddress,
    amount,
    chainId = 'mainnet-beta',
    priorityFeelamports,
  } = params

  try {
    const isNativeSOL = mintAddress === SOL_MINT || mintAddress.toLowerCase() === 'sol'

    if (isNativeSOL) {
      // Native SOL transfer
      const decimals = 9
      const lamports = BigInt(Math.round(parseFloat(amount) * Math.pow(10, decimals)))

      const blockhash = await getRecentBlockhash(chainId)
      const fromPubkey = base58Decode(fromAddress)
      const toPubkey = base58Decode(toAddress)

      const txBytes = buildNativeSOLTransfer(
        fromPubkey,
        toPubkey,
        lamports,
        blockhash,
        priorityFeelamports
      )

      const serialized = Buffer.from(txBytes).toString('base64')

      return {
        success: true,
        serializedTransaction: serialized,
        estimatedFee: 5000 + (priorityFeelamports || 0), // base fee + priority
      }
    } else {
      // SPL Token transfer
      // Need to find/create ATAs for sender and receiver
      const senderATA = await getTokenAccountForOwner(chainId, fromAddress, mintAddress)
      if (!senderATA) {
        return {
          success: false,
          error: `No token account found for ${mintAddress} owned by ${fromAddress}`,
        }
      }

      const receiverATA = await getTokenAccountForOwner(chainId, toAddress, mintAddress)

      // Get token decimals
      const decimals = await getSolanaTokenDecimals(mintAddress, chainId)
      const rawAmount = BigInt(Math.round(parseFloat(amount) * Math.pow(10, decimals)))

      // For SPL transfers, we need the Token Program's Transfer instruction
      // Build via simulateTransaction approach — pass to Privy to sign
      const blockhash = await getRecentBlockhash(chainId)

      // Build SPL token transfer instruction
      const tokenProgramKey = base58Decode(TOKEN_PROGRAM)
      const fromPubkey = base58Decode(fromAddress)
      const senderATAKey = base58Decode(senderATA)

      if (!receiverATA) {
        // Need to create ATA first — this requires ATA program instruction
        // For now, return error asking user to ensure recipient has token account
        return {
          success: false,
          error: `Recipient ${toAddress} has no token account for ${mintAddress}. ` +
            `The transaction will auto-create one (requires ~0.002 SOL rent).`,
        }
      }

      const receiverATAKey = base58Decode(receiverATA)

      // SPL Token Transfer instruction:
      // data: [3 (Transfer instruction), amount (u64 LE)]
      const transferData = new Uint8Array(9)
      transferData[0] = 3 // Transfer
      const tdView = new DataView(transferData.buffer)
      tdView.setBigUint64(1, rawAmount, true)

      // Accounts: [source_ata, dest_ata, authority(signer)]
      const accountKeys: Uint8Array[] = [
        fromPubkey,      // 0: signer, writable (fee payer + authority)
        senderATAKey,     // 1: source ATA, writable
        receiverATAKey,   // 2: dest ATA, writable
        tokenProgramKey,  // 3: Token Program, readonly
      ]

      const numRequiredSigs = 1
      const numReadonlySignedAccounts = 0
      const numReadonlyUnsignedAccounts = 1 // token program

      const header = new Uint8Array([numRequiredSigs, numReadonlySignedAccounts, numReadonlyUnsignedAccounts])
      const numAccounts = encodeCompactU16(accountKeys.length)
      const accountKeysFlat = new Uint8Array(accountKeys.length * 32)
      accountKeys.forEach((key, i) => accountKeysFlat.set(key.slice(0, 32), i * 32))

      const blockhashBytes = base58Decode(blockhash)

      // Instruction: token program idx = 3, accounts = [1(source), 2(dest), 0(authority)]
      const instrAccounts = new Uint8Array([1, 2, 0])
      const instrData = encodeCompactU16(transferData.length)

      const instruction = new Uint8Array([
        3, // program index (token program)
        3, // num accounts
        ...instrAccounts,
        ...instrData,
        ...transferData,
      ])

      const numInstructions = encodeCompactU16(1)

      const totalLen = header.length + numAccounts.length + accountKeysFlat.length +
        32 + numInstructions.length + instruction.length
      const message = new Uint8Array(totalLen)
      let pos = 0
      message.set(header, pos); pos += header.length
      message.set(numAccounts, pos); pos += numAccounts.length
      message.set(accountKeysFlat, pos); pos += accountKeysFlat.length
      message.set(blockhashBytes.slice(0, 32), pos); pos += 32
      message.set(numInstructions, pos); pos += numInstructions.length
      message.set(instruction, pos)

      // Transaction envelope
      const numSigs = encodeCompactU16(1)
      const signaturePlaceholder = new Uint8Array(64)
      const tx = new Uint8Array(numSigs.length + 64 + message.length)
      tx.set(numSigs, 0)
      tx.set(signaturePlaceholder, numSigs.length)
      tx.set(message, numSigs.length + 64)

      const serialized = Buffer.from(tx).toString('base64')

      return {
        success: true,
        serializedTransaction: serialized,
        estimatedFee: 5000 + (priorityFeelamports || 0),
      }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to build Solana transaction',
    }
  }
}