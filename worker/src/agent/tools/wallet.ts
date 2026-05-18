/**
 * Wallet Tools
 * Read-only and transaction tools for blockchain wallets
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import type { SupportedChain } from '../../services/dex/types.js'
import { getChainId, resolveTokenAddress, SOLANA_TOKENS, EVM_TOKENS } from '../../services/dex/types.js'

// SPL Token constants (avoid requiring @solana/spl-token package)
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
import type { TransactionSigner } from '@lucid-fdn/agent-tools-core'
import { createTradingPolicyGuard } from '../../guards/TradingPolicyGuard.js'
import {
  getChainType,
  hasSessionSignerEnabled,
} from '../../services/session-signer/index.js'
import type { ToolContext } from './types.js'
import { translateTxError, sanitizeToolError } from './tx-error-translator.js'
import { toolCache } from '../../lib/cache/tool-cache.js'
import { redactObject, redact } from '../../utils/pii-redactor.js'

// ============================================================================
// Types
// ============================================================================

interface WalletBalanceArgs {
  chain: SupportedChain | 'all'
  address: string
  tokens?: string[]
}

interface WalletBalanceResult {
  address: string
  chain: string
  chainId: string
  balances: TokenBalance[]
  totalValueUsd: number
}

interface TokenBalance {
  token: string
  tokenAddress: string
  balance: string
  balanceRaw: string
  decimals: number
  valueUsd: number | null
}

interface WalletTransferArgs {
  chain: SupportedChain
  fromAddress?: string
  toAddress: string
  token: string
  amount: string
}

// ============================================================================
// Wallet Balance Tool
// ============================================================================

/** Simple get/set cache interface for dependency injection. */
export interface ToolCacheLike {
  get(tool: string, key: string): string | undefined
  set(tool: string, key: string, value: string): void
}

/**
 * Get token balances for a wallet address.
 * Delegates to get_portfolio (QuickNode primary, RPC fallback) for fast, complete results.
 *
 * @param args - wallet balance query args
 * @param deps - optional injected dependencies (cache). Falls back to module-level singletons.
 */
export async function toolWalletBalance(
  args: WalletBalanceArgs & { solanaAddress?: string },
  deps?: { cache?: ToolCacheLike },
): Promise<string> {
  const { chain, address } = args
  const cache = deps?.cache ?? toolCache

  if (!address) {
    return 'Error: "address" parameter is required'
  }

  // Check tool cache first
  const cacheKey = `${chain}:${address}`
  const cached = cache.get('wallet_balance', cacheKey)
  if (cached) return cached

  console.log('[WalletTool] Getting balances via get_portfolio:', { chain, address: address.substring(0, 10) + '...' })

  try {
    const { toolGetPortfolio } = await import('@lucid-fdn/web3-operator')
    const raw = await toolGetPortfolio({
      address,
      chain: chain as Parameters<typeof toolGetPortfolio>[0]['chain'],
      solanaAddress: args.solanaAddress,
    })

    // Parse and reformat to legacy wallet_balance output for backward compat
    const parsed = JSON.parse(raw) as {
      portfolio: {
        wallet: string
        chain: string
        balances: Array<{
          asset: { symbol: string; address: string; chain: string; decimals: number }
          balance: string
          valueUsd: number | null
        }>
        totalValueUsd: number
      }
      formatted: string
    }

    // Cache successful result
    const result = parsed.formatted
    cache.set('wallet_balance', cacheKey, result)

    // Return the formatted output directly — it's already human-readable
    return result
  } catch (error) {
    console.error('[WalletTool] Balance error:', sanitizeToolError(error))
    return `Error fetching balances: ${sanitizeToolError(error)}`
  }
}

const ALL_EVM_CHAINS: SupportedChain[] = ['ethereum', 'base', 'polygon', 'arbitrum']

/**
 * Fetch balances across all chains in parallel
 */
async function getAllChainBalances(evmAddress: string, solanaAddress?: string, tokens?: string[]): Promise<string> {
  const tasks: Promise<string>[] = ALL_EVM_CHAINS.map(c => getEVMBalances(c, evmAddress, tokens).catch(e => `${c}: Error - ${e instanceof Error ? e.message : 'failed'}`))

  if (solanaAddress) {
    tasks.push(getSolanaBalances(solanaAddress, tokens).catch(e => `solana: Error - ${e instanceof Error ? e.message : 'failed'}`))
  }

  const results = await Promise.all(tasks)
  return results.join('\n\n')
}

/**
 * Get Solana wallet balances
 */
async function getSolanaBalances(address: string, tokens?: string[]): Promise<string> {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'

  // Fetch SOL balance + token accounts in parallel
  const [solResponse, tokenResponse] = await Promise.all([
    fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [address],
      }),
      signal: AbortSignal.timeout(5000),
    }),
    fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'getTokenAccountsByOwner',
        params: [
          address,
          { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { encoding: 'jsonParsed' },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    }),
  ])

  const solData = await solResponse.json() as { result: { value: number } }
  const solBalance = solData.result?.value || 0
  const solBalanceFormatted = (solBalance / 1e9).toFixed(6)

  const tokenData = await tokenResponse.json() as {
    result: {
      value: Array<{
        account: {
          data: {
            parsed: {
              info: {
                mint: string
                tokenAmount: {
                  amount: string
                  decimals: number
                  uiAmountString: string
                }
              }
            }
          }
        }
      }>
    }
  }

  const balances: TokenBalance[] = []

  // Add SOL balance
  balances.push({
    token: 'SOL',
    tokenAddress: SOLANA_TOKENS['SOL'],
    balance: solBalanceFormatted,
    balanceRaw: solBalance.toString(),
    decimals: 9,
    valueUsd: null, // Would need price API
  })

  // Add token balances
  if (tokenData.result?.value) {
    for (const account of tokenData.result.value) {
      const info = account.account.data.parsed.info
      const mint = info.mint
      const amount = info.tokenAmount

      // Find symbol for known tokens
      let symbol = mint.substring(0, 8) + '...'
      for (const [sym, addr] of Object.entries(SOLANA_TOKENS)) {
        if (addr === mint) {
          symbol = sym
          break
        }
      }

      // Skip if filtering and token not in list
      if (tokens && tokens.length > 0) {
        const matchesFilter = tokens.some(t =>
          t.toLowerCase() === symbol.toLowerCase() ||
          t.toLowerCase() === mint.toLowerCase()
        )
        if (!matchesFilter) continue
      }

      // Skip zero balances
      if (amount.amount === '0') continue

      balances.push({
        token: symbol,
        tokenAddress: mint,
        balance: amount.uiAmountString,
        balanceRaw: amount.amount,
        decimals: amount.decimals,
        valueUsd: null,
      })
    }
  }

  return formatBalancesOutput(address, 'solana', 'mainnet-beta', balances)
}

/**
 * Get EVM wallet balances
 */
async function getEVMBalances(chain: SupportedChain, address: string, tokens?: string[]): Promise<string> {
  const chainId = getChainId(chain)
  const rpcUrl = getEVMRpcUrl(chainId)

  if (!rpcUrl) {
    return `Error: No RPC URL configured for chain ${chain}`
  }

  const balances: TokenBalance[] = []

  // Get native balance (ETH/MATIC/etc.)
  const nativeResponse = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getBalance',
      params: [address, 'latest'],
    }),
    signal: AbortSignal.timeout(5000),
  })

  const nativeData = await nativeResponse.json() as { result: string }
  const nativeBalanceHex = nativeData.result || '0x0'
  const nativeBalanceWei = BigInt(nativeBalanceHex)
  const nativeBalanceFormatted = (Number(nativeBalanceWei) / 1e18).toFixed(6)

  const nativeSymbol = chain === 'polygon' ? 'MATIC' : 'ETH'
  balances.push({
    token: nativeSymbol,
    tokenAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    balance: nativeBalanceFormatted,
    balanceRaw: nativeBalanceWei.toString(),
    decimals: 18,
    valueUsd: null,
  })

  // Get token balances in parallel
  const chainTokens = EVM_TOKENS[chainId] || {}
  const tokensToCheck = tokens && tokens.length > 0
    ? tokens
    : Object.keys(chainTokens).filter(t => t !== nativeSymbol && t !== 'WETH' && t !== 'WMATIC')

  const tokenResults = await Promise.all(
    tokensToCheck.map(async (tokenSymbol) => {
      const tokenAddress = resolveTokenAddress(tokenSymbol, chain, chainId)

      // Skip native token
      if (tokenAddress.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
        return null
      }

      try {
        // Parallel: ERC20 balanceOf + decimals (independent RPC calls)
        const balanceOfData = `0x70a08231000000000000000000000000${address.slice(2).toLowerCase()}`

        const [balanceData, decimals] = await Promise.all([
          fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              method: 'eth_call',
              params: [
                { to: tokenAddress, data: balanceOfData },
                'latest',
              ],
            }),
            signal: AbortSignal.timeout(5000),
          }).then(r => r.json() as Promise<{ result: string }>),
          fetchErc20Decimals(rpcUrl, tokenAddress, tokenSymbol),
        ])

        if (balanceData.result && balanceData.result !== '0x') {
          const balanceRaw = BigInt(balanceData.result)

          if (balanceRaw > 0n) {
            const balance = (Number(balanceRaw) / Math.pow(10, decimals)).toFixed(6)

            return {
              token: tokenSymbol,
              tokenAddress,
              balance,
              balanceRaw: balanceRaw.toString(),
              decimals,
              valueUsd: null,
            } as TokenBalance
          }
        }
      } catch (error) {
        console.warn('[WalletTool] Error fetching token balance:', {
          tokenSymbol,
          error: sanitizeToolError(error),
        })
      }
      return null
    })
  )

  for (const result of tokenResults) {
    if (result) balances.push(result)
  }

  return formatBalancesOutput(address, chain, chainId, balances)
}

/**
 * Format balances for display
 */
function formatBalancesOutput(
  address: string,
  chain: string,
  chainId: string,
  balances: TokenBalance[]
): string {
  const lines = [
    `Wallet Balances`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Address: ${address}`,
    `Chain: ${chain} (${chainId})`,
    ``,
  ]

  if (balances.length === 0) {
    lines.push('No token balances found.')
  } else {
    for (const balance of balances) {
      let line = `${balance.balance} ${balance.token}`
      if (balance.valueUsd !== null) {
        line += ` ($${balance.valueUsd.toFixed(2)})`
      }
      lines.push(`• ${line}`)
    }
  }

  return lines.join('\n')
}

/**
 * Get EVM RPC URL
 */
function getEVMRpcUrl(chainId: string): string | null {
  const rpcs: Record<string, string | undefined> = {
    '1': process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
    '8453': process.env.BASE_RPC_URL || 'https://mainnet.base.org',
    '42161': process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
  }
  return rpcs[chainId] || null
}

// ============================================================================
// Wallet Transfer Tool
// ============================================================================

/**
 * Transfer tokens to another address
 */
export async function toolWalletTransfer(
  args: WalletTransferArgs,
  context: ToolContext,
  signer: TransactionSigner,
): Promise<string> {
  const { chain, toAddress, token, amount } = args
  const { supabase, userId, assistantId, runId, toolCallId } = context

  // Resolve wallet: agent wallet (DB-managed) takes priority, then args (legacy session-signer mode)
  const chainKey = chain === 'solana' ? 'solana' : 'evm'
  const agentWallet = context.agentWallets?.[chainKey]
  const fromAddress = agentWallet?.address || args.fromAddress
  if (!fromAddress) {
    return 'Error: No wallet available. Enable agent wallet or provide fromAddress.'
  }

  // Validate required parameters
  if (!chain || !toAddress || !token || !amount) {
    return 'Error: Required parameters: chain, toAddress, token, amount'
  }

  console.log('[WalletTool] Initiating transfer:', {
    chain,
    from: fromAddress.substring(0, 10) + '...',
    to: toAddress.substring(0, 10) + '...',
    token,
    amount,
  })

  try {
    // 1. Check session signer permission (agent wallets bypass this — they are server-owned)
    const chainType = getChainType(chain)
    if (!context.agentWallets) {
      const hasPermission = await hasSessionSignerEnabled(userId, fromAddress, chainType)

      if (!hasPermission) {
        return `Transfer blocked: This wallet is not authorized for autonomous transfers.

To enable transfers, the wallet owner needs to:
1. Go to Trading Settings in the dashboard
2. Authorize the wallet for ${chain} trading
3. Configure a trading policy for this assistant`
      }
    }

    // 2. Estimate USD value via live price feed (CoinGecko) with hardcoded fallback
    const amountNum = parseFloat(amount)
    const tokenPrice = await fetchTokenPriceUsd(token)
    const estimatedValueUsd = amountNum * tokenPrice

    // 3. Check trading policy
    const policyGuard = createTradingPolicyGuard(supabase, assistantId, userId)
    const policyCheck = await policyGuard.canExecuteTrade({
      chain,
      inputToken: token,
      outputToken: token, // Same token for transfers
      valueUsd: estimatedValueUsd,
      type: 'transfer',
    })

    if (!policyCheck.allowed) {
      return `Transfer blocked by trading policy: ${policyCheck.reason}`
    }

    if (policyCheck.requiresConfirmation) {
      return `Transfer requires user confirmation.

Transfer Details:
• Amount: ${amount} ${token}
• From: ${fromAddress}
• To: ${toAddress}
• Chain: ${chain}
• Estimated Value: $${estimatedValueUsd.toFixed(2)}

Trade value exceeds confirmation threshold ($${policyCheck.confirmationThreshold || 0}).
Please confirm you want to proceed with this transfer.`
    }

    // 4. Record pending transaction
    const recordResult = await policyGuard.recordTrade({
      txHash: '',
      txType: 'transfer',
      chainType,
      chainId: getChainId(chain),
      inputToken: token,
      inputAmount: amount,
      outputToken: token,
      outputAmount: amount,
      valueUsd: estimatedValueUsd,
      status: 'pending',
      toolCallId,
      runId,
    })

    if (!recordResult.success) {
      return `Failed to record transaction: ${recordResult.error}`
    }

    const txId = recordResult.transactionId

    // 5. Build and execute transfer transaction
    let executionResult

    if (chain === 'solana') {
      // Build Solana transfer transaction
      const serializedTransaction = await buildSolanaTransferTransaction(
        fromAddress,
        toAddress,
        token,
        amount
      )

      if (!serializedTransaction) {
        await policyGuard.updateTransactionStatus(txId!, 'failed', {
          errorMessage: 'Failed to build Solana transfer transaction',
        })
        return `Error: Could not build Solana transfer transaction. Ensure the token address is valid.`
      }

      executionResult = await signer.executeTransaction({
        chain: 'solana',
        serializedTransaction,
      })
    } else {
      // Build EVM transfer transaction
      const txData = await buildEVMTransferTransaction(
        chain,
        fromAddress,
        toAddress,
        token,
        amount
      )

      if (!txData) {
        await policyGuard.updateTransactionStatus(txId!, 'failed', {
          errorMessage: 'Failed to build EVM transfer transaction',
        })
        return `Error: Could not build EVM transfer transaction. Ensure the token address is valid.`
      }

      executionResult = await signer.executeTransaction({
        chain: 'evm',
        chainId: getChainId(chain),
        to: txData.to,
        value: txData.value,
        data: txData.data,
        gasLimit: txData.gasLimit,
      })
    }

    // 6. Update transaction status
    if (executionResult.success && executionResult.txHash) {
      await policyGuard.updateTransactionStatus(txId!, 'submitted', {
        txHash: executionResult.txHash,
      })

      console.log('[WalletTool] Transfer executed successfully:', executionResult.txHash)

      return `Transfer executed successfully!

Transfer Details:
• Amount: ${amount} ${token}
• From: ${fromAddress.substring(0, 10)}...
• To: ${toAddress.substring(0, 10)}...
• Chain: ${chain}
• Estimated Value: $${estimatedValueUsd.toFixed(2)}

Transaction Hash: ${executionResult.txHash}
Status: Submitted
Transaction ID: ${txId}

The transaction has been broadcast to the ${chain} network.

Daily usage: $${((policyCheck.dailyUsed || 0) + estimatedValueUsd).toFixed(2)} / $${(policyCheck.dailyLimit || 0).toFixed(2)}`
    } else {
      const rawError = executionResult.error || 'Unknown execution error'
      const { summary, suggestion } = translateTxError(rawError)

      await policyGuard.updateTransactionStatus(txId!, 'failed', {
        errorMessage: rawError,
      })

      console.error('[WalletTool] Transfer execution failed:', redact(rawError))

      return `Transfer failed: ${summary}

What happened: ${summary}
What to do: ${suggestion}
Transaction ID: ${txId}`
    }
  } catch (error) {
    const rawError = error instanceof Error ? error.message : 'Unknown error'
    const { summary, suggestion } = translateTxError(rawError)

    console.error('[WalletTool] Transfer error:', redact(rawError))

    return `Transfer failed: ${summary}

What happened: ${summary}
What to do: ${suggestion}`
  }
}

// ============================================================================
// Transfer Transaction Builders
// ============================================================================

/**
 * Build a Solana transfer transaction (native SOL + SPL tokens).
 * Uses @solana/web3.js to create a serialized transaction for the session signer.
 */
async function buildSolanaTransferTransaction(
  from: string,
  to: string,
  token: string,
  amount: string
): Promise<string | null> {
  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
    const connection = new Connection(rpcUrl, 'confirmed')
    const fromPubkey = new PublicKey(from)
    const toPubkey = new PublicKey(to)

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')

    const transaction = new Transaction({
      recentBlockhash: blockhash,
      feePayer: fromPubkey,
    })

    if (token.toUpperCase() === 'SOL') {
      const lamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL)
      transaction.add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports,
        })
      )
      console.log('[WalletTool] Built SOL transfer:', redactObject({ from, to, lamports }))
    } else {
      // SPL token transfer
      const tokenMint = SOLANA_TOKENS[token.toUpperCase()]
      if (!tokenMint) {
        console.warn('[WalletTool] Unknown Solana asset symbol:', { symbol: redact(token) })
        return null
      }
      const mintPubkey = new PublicKey(tokenMint)

      // Derive associated token accounts for sender and receiver
      const senderAta = await deriveAta(fromPubkey, mintPubkey)
      const receiverAta = await deriveAta(toPubkey, mintPubkey)

      // Fetch token decimals from the mint account
      const mintInfo = await connection.getParsedAccountInfo(mintPubkey)
      const mintData = mintInfo.value?.data
      let decimals = 9 // default
      if (mintData && typeof mintData === 'object' && 'parsed' in mintData) {
        decimals = (mintData.parsed as { info: { decimals: number } }).info.decimals
      }

      const amountRaw = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, decimals)))

      // Check if receiver ATA exists, create if needed
      const receiverAccountInfo = await connection.getAccountInfo(receiverAta)
      if (!receiverAccountInfo) {
        transaction.add(
          createAssociatedTokenAccountIx(fromPubkey, toPubkey, mintPubkey, receiverAta)
        )
      }

      // SPL Token transfer instruction (Transfer = instruction index 3)
      const dataBuffer = Buffer.alloc(9)
      dataBuffer.writeUInt8(3, 0) // Transfer instruction
      dataBuffer.writeBigUInt64LE(amountRaw, 1)

      transaction.add(
        new TransactionInstruction({
          programId: TOKEN_PROGRAM_ID,
          keys: [
            { pubkey: senderAta, isSigner: false, isWritable: true },
            { pubkey: receiverAta, isSigner: false, isWritable: true },
            { pubkey: fromPubkey, isSigner: true, isWritable: false },
          ],
          data: dataBuffer,
        })
      )
      console.log('[WalletTool] Built SPL transfer:', redactObject({
        symbol: token,
        from,
        to,
        amountRaw: amountRaw.toString(),
        decimals,
      }))
    }

    // Serialize (no signature — session signer will sign)
    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    })
    return serialized.toString('base64')
  } catch (error) {
    console.error('[WalletTool] Error building Solana transfer:', sanitizeToolError(error))
    return null
  }
}

/** Derive the associated token account address (PDA). */
async function deriveAta(owner: PublicKey, mint: PublicKey): Promise<PublicKey> {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )
  return address
}

/** Build a CreateAssociatedTokenAccount instruction (no spl-token dependency). */
function createAssociatedTokenAccountIx(
  payer: PublicKey,
  owner: PublicKey,
  mint: PublicKey,
  ata: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0), // CreateAssociatedTokenAccount takes no data
  })
}

/**
 * Build an EVM transfer transaction
 */
async function buildEVMTransferTransaction(
  chain: SupportedChain,
  from: string,
  to: string,
  token: string,
  amount: string
): Promise<{
  to: string
  value?: string
  data?: string
  gasLimit?: string
} | null> {
  try {
    const chainId = getChainId(chain)
    const nativeSymbol = chain === 'polygon' ? 'MATIC' : 'ETH'

    if (token.toUpperCase() === nativeSymbol || token.toUpperCase() === 'ETH') {
      // Native ETH/MATIC transfer
      const valueWei = BigInt(Math.floor(parseFloat(amount) * 1e18))

      return {
        to,
        value: '0x' + valueWei.toString(16),
        gasLimit: '0x5208', // 21000 gas for simple transfer
      }
    } else {
      // ERC20 token transfer
      const tokenAddress = resolveTokenAddress(token, chain, chainId)
      const rpcUrl = getEVMRpcUrl(chainId)

      // Build ERC20 transfer data
      // transfer(address to, uint256 amount)
      const decimals = rpcUrl
        ? await fetchErc20Decimals(rpcUrl, tokenAddress, token)
        : (KNOWN_DECIMALS[token.toUpperCase()] ?? 18)
      const amountRaw = BigInt(Math.floor(parseFloat(amount) * Math.pow(10, decimals)))

      // Function selector for transfer(address,uint256)
      const transferSelector = '0xa9059cbb'

      // Encode parameters
      const toAddressPadded = to.slice(2).toLowerCase().padStart(64, '0')
      const amountPadded = amountRaw.toString(16).padStart(64, '0')

      const data = `${transferSelector}${toAddressPadded}${amountPadded}`

      return {
        to: tokenAddress,
        value: '0x0',
        data,
        gasLimit: '0x186a0', // 100000 gas for ERC20 transfer
      }
    }
  } catch (error) {
    console.error('[WalletTool] Error building EVM transfer:', sanitizeToolError(error))
    return null
  }
}

// ============================================================================
// Helpers: Live price + on-chain decimals
// ============================================================================

/** Known decimals for well-known ERC20 tokens (fallback when RPC fails). */
const KNOWN_DECIMALS: Record<string, number> = {
  USDC: 6, USDT: 6, GUSD: 2, WBTC: 8,
  DAI: 18, WETH: 18, ETH: 18, MATIC: 18, ARB: 18,
}

/** In-memory cache: tokenAddress → decimals (never changes per contract). */
const decimalsCache = new Map<string, number>()

/**
 * Query ERC20 decimals() on-chain, with cache + known fallback.
 */
async function fetchErc20Decimals(rpcUrl: string, tokenAddress: string, symbol: string): Promise<number> {
  const known = KNOWN_DECIMALS[symbol.toUpperCase()]
  if (known !== undefined) return known

  const cached = decimalsCache.get(tokenAddress.toLowerCase())
  if (cached !== undefined) return cached

  try {
    // ERC20 decimals() selector = 0x313ce567
    const resp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'eth_call',
        params: [{ to: tokenAddress, data: '0x313ce567' }, 'latest'],
      }),
    })
    const data = await resp.json() as { result?: string }
    if (data.result && data.result !== '0x' && data.result.length >= 66) {
      const dec = parseInt(data.result, 16)
      if (dec >= 0 && dec <= 77) { // reasonable range
        decimalsCache.set(tokenAddress.toLowerCase(), dec)
        return dec
      }
    }
  } catch (err) {
    console.warn('[WalletTool] Failed to fetch decimals:', {
      symbol,
      error: sanitizeToolError(err),
    })
  }
  // Ultimate fallback — log so we can add to KNOWN_DECIMALS
  console.warn('[WalletTool] Using default decimals for unknown asset', redactObject({
    symbol,
    tokenAddress,
    decimals: 18,
  }))
  return 18
}

/**
 * Fetch live token price in USD from CoinGecko simple/price API.
 * Falls back to hardcoded estimates on failure.
 */
const COINGECKO_IDS: Record<string, string> = {
  ETH: 'ethereum', SOL: 'solana', MATIC: 'matic-network',
  BTC: 'bitcoin', WBTC: 'bitcoin', ARB: 'arbitrum',
  USDC: 'usd-coin', USDT: 'tether', DAI: 'dai',
  LINK: 'chainlink', AVAX: 'avalanche-2', DOGE: 'dogecoin',
  OP: 'optimism', ATOM: 'cosmos',
}
const FALLBACK_PRICES: Record<string, number> = {
  ETH: 3000, SOL: 150, MATIC: 0.8, BTC: 90000, WBTC: 90000,
  USDC: 1, USDT: 1, DAI: 1, ARB: 1, LINK: 15, AVAX: 35,
  DOGE: 0.15, OP: 2, ATOM: 10,
}

/** Simple price cache: coingecko id → { price, ts }. 60s TTL. */
const priceCache = new Map<string, { price: number; ts: number }>()
const PRICE_CACHE_TTL = 60_000

async function fetchTokenPriceUsd(token: string): Promise<number> {
  const sym = token.toUpperCase()
  const geckoId = COINGECKO_IDS[sym]
  if (!geckoId) return FALLBACK_PRICES[sym] ?? 0

  const cached = priceCache.get(geckoId)
  if (cached && Date.now() - cached.ts < PRICE_CACHE_TTL) return cached.price

  try {
    const resp = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(5_000) }
    )
    if (resp.ok) {
      const data = await resp.json() as Record<string, { usd?: number }>
      const price = data[geckoId]?.usd
      if (price && price > 0) {
        priceCache.set(geckoId, { price, ts: Date.now() })
        return price
      }
    }
  } catch {
    // Non-fatal — use fallback
  }
  return FALLBACK_PRICES[sym] ?? 0
}
