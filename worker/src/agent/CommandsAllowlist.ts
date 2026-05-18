/**
 * CommandsAllowlist — Phase 2: Per-assistant tool/command gating
 *
 * Controls which tools an agent can invoke during a run.
 * Per-assistant allowlist stored in policy_config JSONB.
 * Plugin tools are dynamically registered via registerPluginTools().
 *
 * See docs/OPENCLAW_INTEGRATION_SPEC.md §4.2
 */

import type { ActivatedPlugin } from './plugin-types.js'
import { toWireToolName } from './plugin-types.js'
import { tradingPolicySchema } from './internal-tools/index.js'
// WEB3_OPERATOR_SCHEMAS was previously imported from @lucid-fdn/web3-operator but the
// package doesn't export it. Schemas are now defined inline below (WEB3_OPERATOR_TOOLS).

/** Built-in tools available in the platform (dispatched via BuiltInToolExecutor).
 *
 * All tools listed here MUST have a dispatch path in BuiltInToolExecutor.
 *
 * NOTE: web_search and web_fetch are NOT listed here — they're provided by
 * OpenClaw's native tools (controlled via tools.allow policy whitelist in
 * OpenClawAgent.ts). OpenClaw owns their schemas, caching, and execution.
 */

// ============================================================================
// RUNTIME PRIMITIVES — Agent infrastructure, tightly coupled to worker.
// These tools exist because agents need infrastructure to BE agents.
// Maintained with OpenClaw updates. Cannot be plugins.
// ============================================================================
const RUNTIME_TOOLS = {
  spawn_subagent: {
    name: 'spawn_subagent',
    description: 'Spawn a focused sub-task agent. The subagent inherits your tools and capabilities but has a limited budget. Use this to break complex tasks into focused sub-steps (e.g., analyze → plan → execute). Returns the subagent result text and usage.',
    category: 'orchestration',
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'Clear description of the sub-task to perform',
        },
        maxToolCalls: {
          type: 'number',
          description: 'Maximum tool calls for the subagent (default: 10, max: 10)',
          default: 10,
        },
        maxWallTimeMs: {
          type: 'number',
          description: 'Maximum wall time in milliseconds (default: 60000, max: 60000)',
          default: 60000,
        },
        model: {
          type: 'string',
          description: 'Override LLM model for this subagent (e.g., "gpt-4o-mini" for fast tasks). Defaults to parent model.',
        },
      },
      required: ['task'],
    },
    when_to_use: ['user asks to delegate a sub-task', 'need parallel research on multiple topics', 'need a cheaper/faster model for a simple sub-task'],
    related_tools: ['send_message_to_agent'],
  },

  send_message_to_agent: {
    name: 'send_message_to_agent',
    description: 'Send a message to another agent in your organization. The target agent will receive and process it on its next run. Use this for agent collaboration (e.g., research agent reports findings to trading agent).',
    category: 'messaging',
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object',
      properties: {
        target_assistant_id: {
          type: 'string',
          description: 'UUID of the target assistant. Provide this OR target_name.',
        },
        target_name: {
          type: 'string',
          description: 'Human-readable name of the target assistant (case-insensitive lookup within your org). Provide this OR target_assistant_id.',
        },
        message: {
          type: 'string',
          description: 'Message to send to the target agent (max 50KB)',
        },
      },
      required: ['message'],
    },
    when_to_use: ['user wants to contact another agent', 'need to send data to a specific agent'],
    related_tools: ['spawn_subagent'],
  },

  schedule_task: {
    name: 'schedule_task',
    description: 'Schedule a future agent run. Provide EITHER cron_expression (recurring) OR run_at (one-shot), never both. The task_prompt runs autonomously — write it as a self-contained instruction. Output is delivered to the originating channel if available, or stored as task output.',
    category: 'scheduling',
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Human-readable name for the scheduled task',
        },
        task_prompt: {
          type: 'string',
          description: 'The prompt/instruction to execute when the task runs. IMPORTANT: Write self-contained prompts — the task runs autonomously without conversation context. Be specific about what to do (e.g., "Check SOL price and report" not "send a message"). If the task should deliver output to a channel, the originating channel is automatically captured.',
        },
        cron_expression: {
          type: 'string',
          description: 'Cron expression for recurring tasks (5-field: minute hour day month weekday). Any valid interval is supported — from every minute ("* * * * *") to yearly ("0 0 1 1 *"). Examples: "*/5 * * * *" (every 5min), "0 */2 * * *" (every 2h), "0 9 * * *" (daily 9am UTC).',
        },
        run_at: {
          type: 'string',
          description: 'ISO 8601 datetime for one-shot tasks (e.g., "2025-01-15T09:00:00Z")',
        },
        timezone: {
          type: 'string',
          description: 'IANA timezone for the schedule (default: "UTC")',
          default: 'UTC',
        },
        idempotency_key: {
          type: 'string',
          description: 'Unique key to prevent duplicate task creation per assistant',
        },
        webhook_url: {
          type: 'string',
          description: 'HTTPS URL to POST the task output to on completion (fire-and-forget)',
        },
      },
      required: ['name', 'task_prompt'],
    },
    when_to_use: ['user wants to schedule a recurring task', 'user says "remind me" or "every day at"'],
    examples: [
      { user: 'send me an update every 2 minutes', tool_call: { name: 'Frequent update', task_prompt: 'Provide a brief status update.', cron_expression: '*/2 * * * *' } },
      { user: 'check SOL price every hour', tool_call: { name: 'Hourly SOL price check', task_prompt: 'Check the current price of SOL and provide a brief market update with any notable changes.', cron_expression: '0 * * * *' } },
      { user: 'remind me every Monday at 9am', tool_call: { name: 'Weekly Monday reminder', task_prompt: 'Provide a weekly summary and reminder for the start of the week.', cron_expression: '0 9 * * 1' } },
      { user: 'run a portfolio check on the 1st of every month', tool_call: { name: 'Monthly portfolio review', task_prompt: 'Analyze my portfolio holdings, calculate PnL, and provide a monthly performance summary.', cron_expression: '0 9 1 * *' } },
    ],
    related_tools: ['list_scheduled_tasks', 'cancel_scheduled_task'],
  },

  list_scheduled_tasks: {
    name: 'list_scheduled_tasks',
    description: 'List scheduled tasks for this assistant. Optionally filter by status.',
    category: 'scheduling',
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status: pending, claimed, running, completed, failed, dead_letter, cancelled',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of tasks to return (default: 20)',
          default: 20,
        },
      },
      required: [],
    },
    when_to_use: ['user asks what tasks are scheduled', 'user wants to see active cron jobs'],
    related_tools: ['schedule_task', 'cancel_scheduled_task'],
  },

  cancel_scheduled_task: {
    name: 'cancel_scheduled_task',
    description: 'Cancel a scheduled task by ID. Sets it to cancelled and disables it.',
    category: 'scheduling',
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'UUID of the scheduled task to cancel',
        },
      },
      required: ['task_id'],
    },
    when_to_use: ['user wants to stop a scheduled task', 'user wants to cancel a cron job'],
    related_tools: ['list_scheduled_tasks'],
  },

  soul_edit: {
    name: 'soul_edit',
    description: 'Update your persistent identity (SOUL). This is your long-term persona, values, and behavioral identity that persists across all conversations. Use this to evolve who you are based on experiences and feedback.',
    category: 'identity',
    dangerLevel: 'elevated' as const,
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The new SOUL content. This replaces your entire current identity. Include everything you want to persist (personality, values, learned behaviors, preferences).',
        },
      },
      required: ['content'],
    },
    when_to_use: ['user asks you to change your personality', 'you learn something fundamental about how you should behave', 'user says "remember that you are..." or "from now on..."'],
    related_tools: [],
  },

  plan_dag: {
    name: 'plan_dag',
    description: 'Instantiate a multi-step workflow from a DAG template. Loads the template by slug, creates the live DAG (nodes + edges), and promotes the root nodes to ready. Use this when a task requires a predefined multi-step plan with dependencies (e.g., research → draft → approval → deliver). Returns the dag_id, total node count, and root node IDs.',
    category: 'orchestration',
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object',
      properties: {
        template_slug: {
          type: 'string',
          description: 'Slug of the DAG template to instantiate (org-scoped or global).',
        },
        version: {
          type: 'number',
          description: 'Optional template version pin. Defaults to the latest active version.',
        },
        root_event_id: {
          type: 'string',
          description: 'Optional root event ID that triggered this plan (inbound event, scheduled task, etc.).',
        },
        root_event_type: {
          type: 'string',
          description: 'Type of the root event: "inbound", "outbound", "scheduled", or "webhook".',
          enum: ['inbound', 'outbound', 'scheduled', 'webhook'],
        },
      },
      required: ['template_slug'],
    },
    when_to_use: [
      'user asks to run a predefined multi-step workflow',
      'task requires a DAG of dependent steps from a template',
    ],
    related_tools: ['cron_schedule', 'sessions_spawn'],
  },

  expand_dag: {
    name: 'expand_dag',
    description: 'Expand an in-flight DAG with additional nodes and edges under CAS+lock. Use this when an agent needs to grow a running DAG (e.g., add follow-up steps discovered mid-run). Requires the current expected_version (CAS) and an idempotency_key. Returns the new applied_graph_version, added node IDs, and a key→ID map. Common errors: cas_conflict (re-fetch and retry), cycle (additions would close a cycle), idempotent_replay (key already applied).',
    category: 'orchestration',
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object',
      properties: {
        dag_id: {
          type: 'string',
          description: 'ID of the in-flight DAG to expand.',
        },
        expected_version: {
          type: 'number',
          description: 'Expected current graph_version of the DAG (CAS guard). Re-fetch the dag if a cas_conflict is returned.',
        },
        idempotency_key: {
          type: 'string',
          description: 'Caller-supplied unique key for this mutation. Replays with the same key are no-ops.',
        },
        expansion_zone_node_id: {
          type: 'string',
          description: 'Optional: the node_id under which the agent is expanding (audit-only, helps operators trace the expansion zone).',
        },
        additions: {
          type: 'object',
          description: 'New nodes and edges to add. Must contain at least one node or edge.',
          properties: {
            nodes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  node_key: { type: 'string', description: 'Stable key used to reference this node in edges (within this mutation).' },
                  node_type: { type: 'string', enum: ['leaf', 'group', 'barrier'] },
                  step_type: { type: 'string', description: 'Optional step_type (e.g., "outbound", "webhook").' },
                  runtime_target: { type: 'string' },
                  route_class: { type: 'string' },
                  payload: {},
                  confidence_floor: { type: 'number' },
                },
                required: ['node_key', 'node_type'],
              },
            },
            edges: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  parent: { type: 'string', description: 'Parent: either an existing dag_node_id (UUID) or a node_key from this mutation.' },
                  child: { type: 'string', description: 'Child: either an existing dag_node_id (UUID) or a node_key from this mutation.' },
                  edge_kind: { type: 'string', enum: ['data', 'order', 'barrier'] },
                },
                required: ['parent', 'child'],
              },
            },
          },
        },
      },
      required: ['dag_id', 'expected_version', 'idempotency_key', 'additions'],
    },
    when_to_use: [
      'agent discovers additional steps mid-run that need to join the live DAG',
      'extending an in-flight workflow with follow-up nodes under a known graph_version',
    ],
    related_tools: ['plan_dag'],
  },

  dag_status: {
    name: 'dag_status',
    description: 'Read-only snapshot of a live DAG: status, node counters (total/completed/failed/ready), budget consumption (live + cumulative tokens, USD cap), and the most recent mutations. Reads counters directly from the DAG row (no graph scan). Use this to check progress on an in-flight plan before deciding whether to expand, cancel, or wait.',
    category: 'orchestration',
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object',
      properties: {
        dag_id: {
          type: 'string',
          description: 'ID of the DAG to inspect.',
        },
      },
      required: ['dag_id'],
    },
    when_to_use: [
      'check progress on a previously planned DAG',
      'decide whether to expand or cancel an in-flight plan based on current state',
      'inspect budget consumption before authorizing further expansion',
    ],
    related_tools: ['plan_dag', 'expand_dag'],
  },

  crew_complete: {
    name: 'crew_complete',
    description: 'Signal that the crew run is complete. Only available to the coordinator of an active crew run. Call this when the crew objective has been achieved or when the crew cannot make further progress.',
    category: 'orchestration',
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object',
      properties: {
        outcome_summary: {
          type: 'string',
          description: 'Summary of what the crew accomplished (or why it could not complete)',
        },
        status: {
          type: 'string',
          description: 'Final run status: "completed" (objective achieved) or "failed" (could not complete). Defaults to "completed".',
          enum: ['completed', 'failed'],
          default: 'completed',
        },
      },
      required: ['outcome_summary'],
    },
    when_to_use: ['crew objective has been achieved', 'all crew members have reported back', 'crew cannot make further progress'],
    related_tools: ['send_message_to_agent'],
  },
  create_work_item: {
    name: 'create_work_item',
    description: 'Create a human work item for review, approval, or task assignment. The item appears in the unified work queue and can optionally be mirrored to an external project management tool.',
    category: 'orchestration',
    dangerLevel: 'safe',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title of the work item (max 500 chars)',
        },
        description: {
          type: 'string',
          description: 'Detailed description of what needs to be done',
        },
        assignee: {
          type: 'string',
          description: 'UUID of the assigned user, or a role name (e.g. "reviewer", "legal")',
        },
        priority: {
          type: 'string',
          enum: ['critical', 'high', 'normal', 'low'],
          description: 'Priority level. Defaults to "normal".',
        },
        external_mirror: {
          type: 'boolean',
          description: 'If true, mirror this item to the org\'s primary external PM tool (Linear, Jira, etc.)',
        },
        due_at: {
          type: 'string',
          description: 'Due date in ISO 8601 format (e.g. "2026-04-15T12:00:00Z")',
        },
      },
      required: ['title'],
    },
    when_to_use: [
      'a task needs human review or approval before proceeding',
      'work should be assigned to a specific person or role',
      'creating a ticket that should be tracked in an external PM tool',
    ],
    related_tools: ['plan_dag'],
  },
} as const

// ============================================================================
// PLATFORM TOOLS — Elevated execution requiring session signing.
// These tools mutate on-chain state (transfers, swaps, perp orders).
// Gated by trading policy + authorized wallet. High-trust surface area.
// ============================================================================
const PLATFORM_TOOLS = {
  wallet_transfer: {
    name: 'wallet_transfer',
    description: 'Transfer tokens to another address. Requires an authorized wallet and trading policy.',
    category: 'blockchain',
    dangerLevel: 'elevated' as const,
    parameters: {
      type: 'object',
      properties: {
        chain: {
          type: 'string',
          description: 'Chain for the transfer: "solana", "ethereum", "base", "polygon", "arbitrum"',
          enum: ['solana', 'ethereum', 'base', 'polygon', 'arbitrum'],
        },
        fromAddress: {
          type: 'string',
          description: 'Wallet address to send from (must be authorized for trading)',
        },
        toAddress: {
          type: 'string',
          description: 'Recipient wallet address',
        },
        token: {
          type: 'string',
          description: 'Token to transfer (symbol or address)',
        },
        amount: {
          type: 'string',
          description: 'Amount to transfer (in token units)',
        },
      },
      required: ['chain', 'fromAddress', 'toAddress', 'token', 'amount'],
    },
    when_to_use: ['user wants to send/transfer tokens to an address'],
    examples: [{ user: 'send 1 SOL to abc123', tool_call: { chain: 'solana', fromAddress: '0x...', toAddress: 'abc123', token: 'SOL', amount: '1' } }],
    related_tools: ['wallet_balance', 'risk_check'],
    requires_confirmation: true,
  },

  dex_swap: {
    name: 'dex_swap',
    description: 'Execute a token swap via DEX. Requires an authorized wallet and trading policy.',
    category: 'trading',
    dangerLevel: 'elevated' as const,
    parameters: {
      type: 'object',
      properties: {
        chain: {
          type: 'string',
          description: 'Chain for the swap: "solana", "ethereum", "base", "polygon", "arbitrum"',
          enum: ['solana', 'ethereum', 'base', 'polygon', 'arbitrum'],
        },
        walletAddress: {
          type: 'string',
          description: 'Wallet address to swap from (must be authorized for trading)',
        },
        inputToken: {
          type: 'string',
          description: 'Token to swap from (symbol or address)',
        },
        outputToken: {
          type: 'string',
          description: 'Token to swap to (symbol or address)',
        },
        amount: {
          type: 'string',
          description: 'Amount to swap (in token units)',
        },
        slippageBps: {
          type: 'number',
          description: 'Maximum slippage in basis points (100 = 1%)',
          default: 100,
        },
      },
      required: ['chain', 'walletAddress', 'inputToken', 'outputToken', 'amount'],
    },
    when_to_use: ['user wants to swap/trade/exchange tokens on a DEX (NOT Hyperliquid — if user mentions HL or Hyperliquid, use hl_place_order instead)'],
    examples: [{ user: 'swap 10 USDC for SOL', tool_call: { chain: 'solana', inputToken: 'USDC', outputToken: 'SOL', amount: '10' } }],
    related_tools: ['dex_get_quote', 'risk_check', 'get_price'],
    requires_confirmation: true,
  },

  hl_place_order: {
    name: 'hl_place_order',
    description: 'Place a perpetual futures order on Hyperliquid (HL). Use this for ANY trade the user wants on Hyperliquid — long, short, buy, sell, swap. Hyperliquid only supports perps, not spot swaps. If the user says "swap on HL" or "trade on Hyperliquid", use this tool (not dex_swap). Requires an authorized wallet and trading policy.',
    category: 'trading',
    dangerLevel: 'elevated' as const,
    parameters: {
      type: 'object',
      properties: {
        walletAddress: {
          type: 'string',
          description: 'Wallet address to place order from (must be authorized for trading)',
        },
        market: {
          type: 'string',
          description: 'Market symbol (e.g., "ETH", "BTC", "SOL")',
        },
        side: {
          type: 'string',
          description: 'Order side: "long" or "short"',
          enum: ['long', 'short'],
        },
        size: {
          type: 'string',
          description: 'Position size in contracts',
        },
        orderType: {
          type: 'string',
          description: 'Order type: "market" or "limit"',
          enum: ['market', 'limit'],
        },
        price: {
          type: 'string',
          description: 'Limit price (required for limit orders)',
        },
        reduceOnly: {
          type: 'boolean',
          description: 'If true, only reduce existing position',
          default: false,
        },
        leverage: {
          type: 'number',
          description: 'Leverage multiplier (1-50x)',
          default: 1,
        },
      },
      required: ['walletAddress', 'market', 'side', 'size', 'orderType'],
    },
    when_to_use: [
      'user wants to place a perpetual futures order on Hyperliquid',
      'user mentions "HL", "hl", or "Hyperliquid" for any trade',
      'user says "swap on HL", "trade on HL", "sell on Hyperliquid", "buy on Hyperliquid"',
      'user wants to go long or short on a token via Hyperliquid',
      'user wants to convert tokens on Hyperliquid (HL only has perps — map swap intent to long/short)',
    ],
    examples: [
      { user: 'long 0.1 ETH at market on Hyperliquid', tool_call: { walletAddress: '0x...', market: 'ETH', side: 'long', size: '0.1', orderType: 'market' } },
      { user: 'swap 10% of my SOL to USDC in hl', tool_call: { walletAddress: '0x...', market: 'SOL', side: 'short', size: '0.007', orderType: 'market' } },
      { user: 'short SOL on hyperliquid', tool_call: { walletAddress: '0x...', market: 'SOL', side: 'short', size: '1', orderType: 'market' } },
    ],
    related_tools: ['hl_account_info', 'risk_check'],
    requires_confirmation: true,
  },

  hl_cancel_order: {
    name: 'hl_cancel_order',
    description: 'Cancel an open order on Hyperliquid. Requires an authorized wallet.',
    category: 'trading',
    dangerLevel: 'elevated' as const,
    parameters: {
      type: 'object',
      properties: {
        walletAddress: {
          type: 'string',
          description: 'Wallet address that placed the order',
        },
        orderId: {
          type: 'string',
          description: 'Order ID to cancel',
        },
        market: {
          type: 'string',
          description: 'Market symbol of the order',
        },
      },
      required: ['walletAddress', 'orderId', 'market'],
    },
    when_to_use: ['user wants to cancel an open Hyperliquid order'],
    related_tools: ['hl_account_info'],
    requires_confirmation: true,
  },

  hl_deposit: {
    name: 'hl_deposit',
    description: 'Deposit USDC from the Arbitrum wallet into Hyperliquid L1 for trading. Transfers USDC to the Hyperliquid Bridge2 contract on Arbitrum. Minimum deposit is 5 USDC. Use this when the agent needs to fund its Hyperliquid account before placing orders.',
    category: 'trading',
    dangerLevel: 'elevated' as const,
    parameters: {
      type: 'object',
      properties: {
        amount: {
          type: 'string',
          description: 'Amount of USDC to deposit (minimum 5 USDC)',
        },
      },
      required: ['amount'],
    },
    when_to_use: [
      'agent needs to deposit USDC into Hyperliquid before trading',
      'user asks to fund or deposit into Hyperliquid',
      'hl_account_info shows $0 balance and user wants to trade on HL',
    ],
    examples: [
      { user: 'deposit 100 USDC to Hyperliquid', tool_call: { amount: '100' } },
      { user: 'fund my HL account with 50 USDC', tool_call: { amount: '50' } },
    ],
    related_tools: ['hl_account_info', 'hl_place_order', 'wallet_balance'],
    requires_confirmation: true,
  },

  hl_withdraw: {
    name: 'hl_withdraw',
    description: 'Withdraw USDC from Hyperliquid L1 back to the Arbitrum wallet. Uses EIP-712 signed withdrawal. Minimum withdrawal is 5 USDC. Only withdrawable balance (not margin-locked) can be withdrawn.',
    category: 'trading',
    dangerLevel: 'elevated' as const,
    parameters: {
      type: 'object',
      properties: {
        amount: {
          type: 'string',
          description: 'Amount of USDC to withdraw (minimum 5 USDC, must not exceed withdrawable balance)',
        },
      },
      required: ['amount'],
    },
    when_to_use: [
      'user wants to withdraw USDC from Hyperliquid to their wallet',
      'user wants to move funds out of HL back to Arbitrum',
    ],
    examples: [
      { user: 'withdraw 50 USDC from Hyperliquid', tool_call: { amount: '50' } },
      { user: 'move my HL balance back to my wallet', tool_call: { amount: '100' } },
    ],
    related_tools: ['hl_account_info', 'wallet_balance', 'bridge'],
    requires_confirmation: true,
  },

  polymarket_trade: {
    name: 'polymarket_trade',
    description: 'Trade on Polymarket prediction markets. Search markets, view orderbooks, buy/sell outcome tokens (YES/NO), manage orders. Requires an authorized agent wallet on Polygon.',
    category: 'trading',
    dangerLevel: 'elevated' as const,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action to perform',
          enum: ['search', 'market_info', 'orderbook', 'buy_yes', 'buy_no', 'sell_yes', 'sell_no', 'split_and_sell', 'open_orders', 'cancel_order', 'cancel_orders', 'cancel_all', 'redeem', 'get_positions'],
        },
        conditionId: {
          type: 'string',
          description: 'Market condition ID (required for most actions except search)',
        },
        question: {
          type: 'string',
          description: 'Search query (for search action)',
        },
        amount: {
          type: 'string',
          description: 'Trade amount in USDC (for buy/sell actions)',
        },
        limitPrice: {
          type: 'number',
          description: 'Limit price between 0 and 1 (optional — omit for market/FOK order)',
        },
        keepOutcome: {
          type: 'string',
          description: 'Which outcome to keep after split: "yes" or "no" (for split_and_sell)',
          enum: ['yes', 'no'],
        },
        orderId: {
          type: 'string',
          description: 'Order ID (for cancel_order action)',
        },
        orderIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of order IDs (for cancel_orders action)',
        },
      },
      required: ['action'],
    },
    when_to_use: [
      'user wants to trade on Polymarket prediction markets',
      'user asks about prediction market prices or odds',
      'user wants to buy YES or NO shares on an event',
      'user wants to search for prediction markets',
      'user asks about orderbook depth or liquidity on a market',
      'user wants to check or cancel open orders',
      'user wants guaranteed position entry on a thin market (split_and_sell)',
      'user asks about market details, closing date, or order requirements',
      'user asks about their prediction market positions or P&L',
    ],
    examples: [
      { user: 'search for prediction markets about the election', tool_call: { action: 'search', question: 'election' } },
      { user: 'buy 50 USDC of YES on this market', tool_call: { action: 'buy_yes', conditionId: '0x...', amount: '50' } },
      { user: 'show me the orderbook for this market', tool_call: { action: 'orderbook', conditionId: '0x...' } },
      { user: 'what are the details of this prediction market?', tool_call: { action: 'market_info', conditionId: '0x...' } },
      { user: 'do I have any open orders?', tool_call: { action: 'open_orders' } },
      { user: 'I want guaranteed entry — use split and sell for YES', tool_call: { action: 'split_and_sell', conditionId: '0x...', amount: '100', keepOutcome: 'yes' } },
      { user: 'what are my polymarket positions?', tool_call: { action: 'get_positions' } },
      { user: 'cancel all my open orders', tool_call: { action: 'cancel_all' } },
      { user: 'redeem my winning positions on this market', tool_call: { action: 'redeem', conditionId: '0x...' } },
    ],
    related_tools: ['lucid_hedge', 'dex_swap', 'wallet_balance', 'risk_check'],
    requires_confirmation: true,
  },
  lucid_hedge: {
    name: 'lucid_hedge',
    description: 'Analyze known prediction market exposure for hedging. Evaluate estimated risk, suggest strategies, compute concentration metrics. Read-only — does not execute trades.',
    category: 'blockchain',
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action to perform',
          enum: ['analyze_position', 'analyze_portfolio', 'suggest_hedge'],
        },
        conditionId: {
          type: 'string',
          description: 'Market condition ID (required for analyze_position, suggest_hedge)',
        },
        conditionIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Known position market IDs (required for analyze_portfolio)',
        },
        riskTolerance: {
          type: 'string',
          description: 'Risk tolerance for recommendations',
          enum: ['conservative', 'moderate', 'aggressive'],
        },
        maxHedgeCostUsd: {
          type: 'number',
          description: 'Max USD budget for hedge recommendations',
        },
      },
      required: ['action'],
    },
    when_to_use: [
      'user asks about hedging prediction market positions',
      'user wants to analyze risk exposure on Polymarket',
      'user asks about portfolio concentration in prediction markets',
    ],
    examples: [
      { user: 'analyze my position on this market', tool_call: { action: 'analyze_position', conditionId: '0x...' } },
      { user: 'should I hedge this prediction market bet?', tool_call: { action: 'suggest_hedge', conditionId: '0x...' } },
    ],
    related_tools: ['polymarket_trade', 'risk_check', 'polymarket_automation'],
  },
  polymarket_automation: {
    name: 'polymarket_automation',
    description: 'Manage protective alerts and automated exit rules for Polymarket positions. Create stop-loss, take-profit, trailing-stop, time-based exit rules for individual positions, or portfolio-level rules (portfolio stop-loss, portfolio take-profit, concentration guard, exposure cap). Rules are evaluated every 60 seconds.',
    category: 'trading',
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Action to perform',
          enum: ['list_rules', 'list_executions', 'create_rule', 'update_rule', 'delete_rule'],
        },
        rule_id: {
          type: 'string',
          description: 'Rule ID (required for update_rule, delete_rule)',
        },
        condition_id: {
          type: 'string',
          description: 'Market condition ID (required for create_rule)',
        },
        rule_type: {
          type: 'string',
          description: 'Type of automation rule',
          enum: ['stop_loss', 'take_profit', 'trailing_stop', 'time_exit', 'portfolio_stop_loss', 'portfolio_take_profit', 'concentration_guard', 'exposure_cap'],
        },
        threshold_price: {
          type: 'number',
          description: 'Price threshold (0-1) for stop_loss or take_profit rules',
        },
        trail_percent: {
          type: 'number',
          description: 'Trail percentage (0-100) for trailing_stop rules',
        },
        exit_hours_before_close: {
          type: 'number',
          description: 'Hours before market close to trigger time_exit',
        },
        threshold_pnl_percent: {
          type: 'number',
          description: 'PnL % threshold for portfolio_stop_loss (negative, e.g., -20) or portfolio_take_profit (positive, e.g., 50)',
        },
        max_concentration_pct: {
          type: 'number',
          description: 'Max concentration % for concentration_guard (1-99). Trigger when any position exceeds this.',
        },
        target_concentration_pct: {
          type: 'number',
          description: 'Target concentration % for concentration_guard (default: max - 5). Hysteresis target to trim to.',
        },
        max_exposure_usd: {
          type: 'number',
          description: 'Max total exposure in USD for exposure_cap. Trigger when total exposure exceeds this.',
        },
        target_exposure_usd: {
          type: 'number',
          description: 'Target exposure in USD for exposure_cap (default: max * 0.9). Hysteresis target to reduce to.',
        },
        exit_action: {
          type: 'string',
          description: 'What to sell when triggered (required for position rules, auto-resolved for portfolio rules)',
          enum: ['sell_yes', 'sell_no'],
        },
        exit_amount_pct: {
          type: 'number',
          description: 'Percentage of position to exit (1-100, default 100)',
        },
        cooldown_seconds: {
          type: 'integer',
          description: 'Minimum seconds between triggers (default 300)',
        },
        max_triggers: {
          type: 'integer',
          description: 'Maximum number of times this rule can trigger (null = unlimited)',
        },
        enabled: {
          type: 'boolean',
          description: 'Enable or disable the rule (for update_rule)',
        },
        execution_mode: {
          type: 'string',
          description: 'Execution mode: "approval" (default, requires owner approval) or "auto_execute" (trades execute immediately on trigger). Requires execute:predictions_automation capability for auto_execute.',
          enum: ['approval', 'auto_execute'],
        },
      },
      required: ['action'],
    },
    when_to_use: [
      'user asks to set a stop-loss on a prediction market position',
      'user wants automatic take-profit alerts for Polymarket',
      'user asks about trailing stops for prediction markets',
      'user wants to exit a position before a market closes',
      'user asks to list or manage their automation rules',
      'user wants to see execution history for automated rules',
      'user wants auto-executing rules without manual approval',
      'user wants portfolio-wide risk management for all prediction positions',
      'user asks to exit everything if portfolio drops a certain percentage',
      'user wants concentration limits on individual positions as a percent of portfolio',
      'user wants to cap total portfolio exposure in USD',
    ],
    examples: [
      { user: 'set a stop-loss at 0.30 on this market', tool_call: { action: 'create_rule', condition_id: '0x...', rule_type: 'stop_loss', threshold_price: 0.30, exit_action: 'sell_yes' } },
      { user: 'add a trailing stop of 10% on my YES position', tool_call: { action: 'create_rule', condition_id: '0x...', rule_type: 'trailing_stop', trail_percent: 10, exit_action: 'sell_yes' } },
      { user: 'what automation rules do I have?', tool_call: { action: 'list_rules' } },
      { user: 'disable that stop-loss rule', tool_call: { action: 'update_rule', rule_id: '...', enabled: false } },
      { user: 'exit all positions if my portfolio drops 20%', tool_call: { action: 'create_rule', rule_type: 'portfolio_stop_loss', threshold_pnl_percent: -20 } },
      { user: 'take profit on everything when portfolio is up 50%', tool_call: { action: 'create_rule', rule_type: 'portfolio_take_profit', threshold_pnl_percent: 50 } },
      { user: 'no single position should exceed 40% of my portfolio', tool_call: { action: 'create_rule', rule_type: 'concentration_guard', max_concentration_pct: 40 } },
      { user: 'cap my total exposure at $1000', tool_call: { action: 'create_rule', rule_type: 'exposure_cap', max_exposure_usd: 1000 } },
    ],
    related_tools: ['polymarket_trade', 'lucid_hedge'],
  },
} as const

// ============================================================================
// BUILT-IN SERVICE TOOLS — Hardcoded integrations (active, not legacy).
//
// These wrap external APIs (Jupiter, 1inch, Hyperliquid, Payload CMS) and
// sandboxed execution (code interpreter). They are the ACTIVE implementations
// called by BuiltInToolExecutor.ts.
//
// Future: read-only tools (wallet_balance, dex_get_quote, hl_account_info)
// will migrate into the lucid-trade embedded MCP skill. Elevated tools
// (dex_swap, wallet_transfer, hl_place/cancel) stay built-in permanently.
//
// See tools/index.ts for full architecture notes.
// ============================================================================
const BUILTIN_SERVICE_TOOLS = {
  wallet_balance: {
    name: 'wallet_balance',
    description: 'Get current token balances/holdings for a wallet address (NOT transaction history — use wallet_history for past transactions). Use chain "all" to check every chain in one call.',
    category: 'blockchain',
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object',
      properties: {
        chain: {
          type: 'string',
          description: 'Chain to query. Use "all" to fetch all chains in parallel (fastest). Or pick one: "solana", "ethereum", "base", "polygon", "arbitrum".',
          enum: ['all', 'solana', 'ethereum', 'base', 'polygon', 'arbitrum'],
        },
        address: {
          type: 'string',
          description: 'Wallet address to check balance for. For "all" chains, pass the EVM address (Solana address is resolved from agent wallets).',
        },
        tokens: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of specific token symbols or addresses to query',
        },
      },
      required: ['chain', 'address'],
    },
    when_to_use: ['user asks about their balance', 'user asks "how much X do I have"'],
    examples: [{ user: 'what is my SOL balance?', tool_call: { chain: 'solana', address: '0x...', tokens: ['SOL'] } }],
    related_tools: ['get_portfolio', 'get_price'],
  },

  dex_get_quote: {
    name: 'dex_get_quote',
    description: 'Get a swap quote from DEX aggregators (Jupiter for Solana, 1inch for EVM)',
    category: 'trading',
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object',
      properties: {
        chain: {
          type: 'string',
          description: 'Chain for the swap: "solana", "ethereum", "base", "polygon", "arbitrum"',
          enum: ['solana', 'ethereum', 'base', 'polygon', 'arbitrum'],
        },
        inputToken: {
          type: 'string',
          description: 'Token to swap from (symbol or address)',
        },
        outputToken: {
          type: 'string',
          description: 'Token to swap to (symbol or address)',
        },
        amount: {
          type: 'string',
          description: 'Amount to swap (in token units, not smallest denomination)',
        },
        slippageBps: {
          type: 'number',
          description: 'Maximum slippage in basis points (100 = 1%)',
          default: 100,
        },
      },
      required: ['chain', 'inputToken', 'outputToken', 'amount'],
    },
    when_to_use: ['user wants a swap quote/preview', 'user asks "how much would I get if I swap"'],
    examples: [{ user: 'how much SOL would I get for 100 USDC?', tool_call: { chain: 'solana', inputToken: 'USDC', outputToken: 'SOL', amount: '100' } }],
    related_tools: ['dex_swap', 'get_price'],
  },

  hl_account_info: {
    name: 'hl_account_info',
    description: 'Get Hyperliquid account state including positions, balances, and margin info',
    category: 'trading',
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object',
      properties: {
        walletAddress: {
          type: 'string',
          description: 'Wallet address to check account state for',
        },
      },
      required: ['walletAddress'],
    },
    when_to_use: [
      'user asks about Hyperliquid positions or account state',
      'user asks about HL balance, margin, or PnL',
      'before placing an HL order, check account state first',
    ],
    examples: [
      { user: 'show my Hyperliquid positions', tool_call: { walletAddress: '0x...' } },
      { user: 'what is my HL balance?', tool_call: { walletAddress: '0x...' } },
    ],
    related_tools: ['hl_place_order', 'hl_cancel_order'],
  },

  get_trading_policy: tradingPolicySchema,

  generate_content: {
    name: 'generate_content',
    description:
      'Create a content item (blog post, social post, newsletter, changelog). Body should be written in markdown. Items are created as drafts by default for human review.',
    category: 'content',
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object',
      properties: {
        content_type: {
          type: 'string',
          description: 'Type of content to create',
          enum: ['blog_post', 'social_post', 'newsletter', 'changelog'],
        },
        title: {
          type: 'string',
          description: 'Title of the content item',
        },
        body: {
          type: 'string',
          description: 'Body content in markdown format',
        },
        excerpt: {
          type: 'string',
          description: 'Short excerpt or summary',
        },
        publish: {
          type: 'boolean',
          description: 'Whether to publish immediately (default: false, creates as draft)',
          default: false,
        },
      },
      required: ['content_type', 'title', 'body'],
    },
    when_to_use: ['user asks to write/create content (blog, social post, newsletter)'],
    examples: [{ user: 'write a blog post about DeFi trends', tool_call: { content_type: 'blog_post', title: 'DeFi Trends in 2026', body: '# DeFi Trends\n\n...' } }],
  },

  code_interpreter: {
    name: 'code_interpreter',
    description: 'Execute JavaScript code in a sandboxed environment. No filesystem, network, or process access. 5s timeout.',
    category: 'compute',
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'JavaScript code to execute',
        },
        language: {
          type: 'string',
          description: 'Programming language (only "javascript" supported)',
          default: 'javascript',
        },
      },
      required: ['code'],
    },
    when_to_use: ['user asks to run code, calculate something, or analyze data programmatically'],
    examples: [{ user: 'calculate compound interest on 1000 USDC at 5% APY', tool_call: { code: '1000 * 1.05 - 1000' } }],
  },
} as const

// ============================================================================
// WEB3 OPERATOR — 12 tools from @lucid-fdn/web3-operator package.
// Schemas defined inline (package exports tool functions, not schema objects).
// ============================================================================
const WEB3_OPERATOR_TOOLS: Record<string, ToolDefinition> = {
  get_price: {
    name: 'get_price',
    description: 'Get current token price, 24h change, volume, and market cap. Use chain "solana" for SPL tokens.',
    category: 'blockchain' as const,
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Token address or symbol (e.g. "SOL", "0x...")' },
        chain: { type: 'string', description: 'Chain: solana, eth, polygon, bsc, arbitrum, base, optimism. Default: solana' },
      },
      required: ['token'],
    },
  },
  search_token: {
    name: 'search_token',
    description: 'Search for tokens by name, symbol, or partial address. Returns matches with price and metadata.',
    category: 'blockchain' as const,
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Search query (name, symbol, or address)' },
        chain: { type: 'string', description: 'Optional chain filter' },
      },
      required: ['query'],
    },
  },
  get_portfolio: {
    name: 'get_portfolio',
    description: 'Get all token balances and total portfolio value for a wallet address.',
    category: 'blockchain' as const,
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        address: { type: 'string', description: 'Wallet address' },
        chain: { type: 'string', description: 'Chain: solana, eth, polygon, bsc, arbitrum, base, optimism, all' },
      },
      required: ['address'],
    },
  },
  wallet_history: {
    name: 'wallet_history',
    description: 'Get recent transaction history for a wallet address. Shows swaps, transfers, and other on-chain activity.',
    category: 'blockchain' as const,
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        address: { type: 'string', description: 'Wallet address' },
        chain: { type: 'string', description: 'Chain: solana, eth, polygon, bsc, arbitrum, base, optimism' },
        limit: { type: 'number', description: 'Max transactions to return (default 20)' },
      },
      required: ['address'],
    },
  },
  get_quote_0x: {
    name: 'get_quote_0x',
    description: 'Get a swap quote from 0x aggregator (EVM chains). Shows price, route, and gas estimate.',
    category: 'blockchain' as const,
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        sellToken: { type: 'string', description: 'Token address to sell' },
        buyToken: { type: 'string', description: 'Token address to buy' },
        sellAmount: { type: 'string', description: 'Amount in smallest unit (wei)' },
        chain: { type: 'string', description: 'Chain: eth, polygon, bsc, arbitrum, base, optimism' },
      },
      required: ['sellToken', 'buyToken', 'sellAmount'],
    },
  },
  risk_check: {
    name: 'risk_check',
    description: 'Evaluate token risk: liquidity depth, holder concentration, contract verification, honeypot detection.',
    category: 'blockchain' as const,
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Token address' },
        chain: { type: 'string', description: 'Chain' },
      },
      required: ['token'],
    },
  },
  portfolio_snapshot: {
    name: 'portfolio_snapshot',
    description: 'Save a snapshot of current portfolio state for later PnL comparison.',
    category: 'blockchain' as const,
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        address: { type: 'string', description: 'Wallet address' },
        chain: { type: 'string', description: 'Chain' },
        label: { type: 'string', description: 'Optional label for this snapshot' },
      },
      required: ['address'],
    },
  },
  get_pnl: {
    name: 'get_pnl',
    description: 'Calculate profit/loss between two portfolio snapshots or from a snapshot to current state.',
    category: 'blockchain' as const,
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        address: { type: 'string', description: 'Wallet address' },
        chain: { type: 'string', description: 'Chain' },
        fromSnapshot: { type: 'string', description: 'Snapshot ID to compare from' },
        toSnapshot: { type: 'string', description: 'Optional snapshot ID (defaults to current)' },
      },
      required: ['address'],
    },
  },
  limit_order: {
    name: 'limit_order',
    description: 'Place a limit order to buy/sell a token at a specific price.',
    category: 'blockchain' as const,
    dangerLevel: 'elevated' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        inputMint: { type: 'string', description: 'Token to sell' },
        outputMint: { type: 'string', description: 'Token to buy' },
        inAmount: { type: 'string', description: 'Amount to sell' },
        outAmount: { type: 'string', description: 'Minimum amount to receive (sets the limit price)' },
        chain: { type: 'string', description: 'Chain (default: solana)' },
      },
      required: ['inputMint', 'outputMint', 'inAmount', 'outAmount'],
    },
  },
  dca_create: {
    name: 'dca_create',
    description: 'Create a Dollar-Cost Average order to buy a token over time at regular intervals.',
    category: 'blockchain' as const,
    dangerLevel: 'elevated' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        inputMint: { type: 'string', description: 'Token to sell (e.g. USDC)' },
        outputMint: { type: 'string', description: 'Token to buy' },
        inAmount: { type: 'string', description: 'Total amount to invest' },
        inAmountPerCycle: { type: 'string', description: 'Amount per DCA cycle' },
        cycleSeconds: { type: 'number', description: 'Seconds between cycles' },
        chain: { type: 'string', description: 'Chain (default: solana)' },
      },
      required: ['inputMint', 'outputMint', 'inAmount', 'inAmountPerCycle', 'cycleSeconds'],
    },
  },
  stop_loss: {
    name: 'stop_loss',
    description: 'Set a stop-loss order: auto-sell a token if its price drops below a threshold.',
    category: 'blockchain' as const,
    dangerLevel: 'elevated' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        inputMint: { type: 'string', description: 'Token to sell on trigger' },
        outputMint: { type: 'string', description: 'Token to receive' },
        inAmount: { type: 'string', description: 'Amount to sell' },
        triggerPrice: { type: 'string', description: 'Price threshold to trigger the sell' },
        chain: { type: 'string', description: 'Chain (default: solana)' },
      },
      required: ['inputMint', 'outputMint', 'inAmount', 'triggerPrice'],
    },
  },
  bridge: {
    name: 'bridge',
    description: 'Bridge tokens between chains (e.g. Solana to Ethereum) using deBridge.',
    category: 'blockchain' as const,
    dangerLevel: 'elevated' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        srcChain: { type: 'string', description: 'Source chain' },
        dstChain: { type: 'string', description: 'Destination chain' },
        srcToken: { type: 'string', description: 'Source token address' },
        dstToken: { type: 'string', description: 'Destination token address' },
        amount: { type: 'string', description: 'Amount to bridge' },
        dstAddress: { type: 'string', description: 'Destination wallet address' },
      },
      required: ['srcChain', 'dstChain', 'srcToken', 'amount', 'dstAddress'],
    },
  },
}

// ============================================================================
// DATA INTELLIGENCE — New tools powered by Moralis/Helius internally.
// These don't exist in @lucid-fdn/web3-operator; they're worker-only.
// ============================================================================
const DATA_INTELLIGENCE_TOOLS = {
  get_token_info: {
    name: 'get_token_info',
    description: 'Complete token profile: price, volume, holders, security score, analytics, and top DEX pairs. Use for due diligence before trading.',
    category: 'blockchain' as const,
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Token contract address' },
        chain: { type: 'string', description: 'Chain: eth, polygon, bsc, arbitrum, base, optimism, solana' },
      },
      required: ['token'],
    },
    when_to_use: ['user asks about a token', 'before trading a new token', 'due diligence'],
    examples: [{ user: 'tell me about this token 0xabc...', tool_call: { token: '0xabc...' } }],
  },
  get_trending: {
    name: 'get_trending',
    description: 'Market movers: trending tokens, top gainers, top losers, smart money signals, buying pressure, and rising liquidity.',
    category: 'blockchain' as const,
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        chain: { type: 'string', description: 'Filter by chain (optional)' },
        category: { type: 'string', description: 'Focus: smart_money, liquidity, or all (default)' },
      },
    },
    when_to_use: ['user asks what is trending', 'user wants trading opportunities', 'market overview'],
    examples: [{ user: 'what tokens are trending?', tool_call: {} }],
  },
  get_liquidity: {
    name: 'get_liquidity',
    description: 'DEX pair liquidity depth, reserves, and volume for a token. Critical for assessing slippage on large trades.',
    category: 'blockchain' as const,
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Token contract address' },
        chain: { type: 'string', description: 'Chain: eth, polygon, bsc, arbitrum, base, optimism, solana' },
      },
      required: ['token'],
    },
    when_to_use: ['before large trades', 'checking slippage', 'liquidity analysis'],
  },
  get_holders: {
    name: 'get_holders',
    description: 'Token holder analysis: top holders (whales), ownership concentration, historical holder count. Use for whale tracking.',
    category: 'blockchain' as const,
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Token contract address' },
        chain: { type: 'string', description: 'Chain: eth, polygon, bsc, arbitrum, base, optimism, solana' },
      },
      required: ['token'],
    },
    when_to_use: ['whale tracking', 'holder concentration', 'who owns this token'],
  },
  get_defi_positions: {
    name: 'get_defi_positions',
    description: 'DeFi portfolio summary: LP positions, staking, lending across protocols (Aave, Compound, Uniswap, etc.). EVM only.',
    category: 'blockchain' as const,
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        address: { type: 'string', description: 'Wallet address' },
        chain: { type: 'string', description: 'EVM chain: eth, polygon, bsc, arbitrum, base, optimism' },
      },
      required: ['address'],
    },
    when_to_use: ['DeFi positions', 'LP positions', 'staking positions', 'lending positions'],
  },
  get_wallet_profile: {
    name: 'get_wallet_profile',
    description: 'Wallet intelligence: activity metrics, profitability, identity, active chains, token approvals, funding source. Use for counterparty analysis.',
    category: 'blockchain' as const,
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        address: { type: 'string', description: 'Wallet address' },
        chain: { type: 'string', description: 'Chain: eth, polygon, bsc, arbitrum, base, optimism, solana' },
      },
      required: ['address'],
    },
    when_to_use: ['who is this wallet', 'wallet analysis', 'counterparty check', 'is this trader profitable'],
  },
  get_market_data: {
    name: 'get_market_data',
    description: 'Global market overview: top cryptocurrencies by market cap and trading volume.',
    category: 'blockchain' as const,
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Number of results (default 20, max 100)' },
      },
    },
    when_to_use: ['market overview', 'top coins', 'market summary'],
    examples: [{ user: 'show me the top coins by market cap', tool_call: { limit: 20 } }],
  },
  detect_snipers: {
    name: 'detect_snipers',
    description: 'Detect sniper bots on a DEX pair. Shows which wallets sniped the token at launch. Use for safety assessment.',
    category: 'blockchain' as const,
    dangerLevel: 'safe' as const,
    parameters: {
      type: 'object' as const,
      properties: {
        pair_address: { type: 'string', description: 'DEX pair contract address' },
        chain: { type: 'string', description: 'Chain: eth, polygon, bsc, arbitrum, base, optimism, solana' },
      },
      required: ['pair_address'],
    },
    when_to_use: ['sniper detection', 'is this token sniped', 'launch safety'],
  },
} as const

// ── New stable names (aliases during transition) ──────────────────
const RUNTIME_TOOL_ALIASES = {
  cron_schedule: { ...RUNTIME_TOOLS.schedule_task, name: 'cron_schedule' },
  cron_list: { ...RUNTIME_TOOLS.list_scheduled_tasks, name: 'cron_list' },
  cron_cancel: { ...RUNTIME_TOOLS.cancel_scheduled_task, name: 'cron_cancel' },
  sessions_send: { ...RUNTIME_TOOLS.send_message_to_agent, name: 'sessions_send' },
  sessions_spawn: { ...RUNTIME_TOOLS.spawn_subagent, name: 'sessions_spawn' },
} as const

/** All built-in tools. Categories: runtime (5+5 aliases) + platform (4) + service (5) + web3-operator (10). */
export const BUILT_IN_TOOLS = {
  ...RUNTIME_TOOLS,
  ...RUNTIME_TOOL_ALIASES,
  ...PLATFORM_TOOLS,
  ...BUILTIN_SERVICE_TOOLS,
  ...WEB3_OPERATOR_TOOLS,
  ...DATA_INTELLIGENCE_TOOLS,
} as const

/** Runtime primitive tool names */
export const RUNTIME_TOOL_NAMES = new Set(Object.keys(RUNTIME_TOOLS))

/** Platform tool names (elevated, need signing) */
export const PLATFORM_TOOL_NAMES = new Set(Object.keys(PLATFORM_TOOLS))

/** Built-in service tool names (active — future MCP migration targets) */
export const BUILTIN_SERVICE_TOOL_NAMES = new Set(Object.keys(BUILTIN_SERVICE_TOOLS))

/**
 * @deprecated Use BUILTIN_SERVICE_TOOL_NAMES — kept for backward compatibility
 */
export const LEGACY_TOOL_NAMES = BUILTIN_SERVICE_TOOL_NAMES

/**
 * DANGER_TOOLS — Hard-gated tools that are ALWAYS blocked regardless of policy_config.
 *
 * These tools represent capabilities with known security risks:
 * - browser/CDP: Can exfiltrate data, execute arbitrary JS
 * - cron: Can schedule persistent tasks (known risk vector)
 * - shell_exec: Direct OS access
 * - file_write: Filesystem mutation
 * - plugin_install: Arbitrary code loading
 *
 * Skills/plugins are default-deny: only BUILT_IN_TOOLS can be allowed.
 * Any tool name NOT in BUILT_IN_TOOLS is automatically blocked.
 *
 * See dev review: "Danger features hard-gating isn't written"
 */
export const DANGER_TOOLS = new Set([
  'browser',
  'cdp',
  'browser_cdp',
  'cron',           // native OpenClaw cron — blocked, Lucid uses cron_schedule/list/cancel
  'shell_exec',
  'shell',
  'file_write',
  'file_delete',
  'plugin_install',
  'plugin_load',
  'exec',
])

/**
 * ELEVATED_TRADING_TOOLS — Tools that require trading policy approval
 *
 * These tools can execute financial transactions and require:
 * 1. Session signer enabled for the wallet
 * 2. Trading policy enabled for the assistant
 * 3. Trade within policy limits (value, daily limit, allowed tokens/chains)
 */
export const ELEVATED_TRADING_TOOLS = new Set([
  'wallet_transfer',
  'dex_swap',
  'hl_place_order',
  'hl_cancel_order',
  'hl_deposit',
  'hl_withdraw',
  'polymarket_trade',
  'limit_order',
  'dca_create',
  'stop_loss',
  'bridge',
])

/**
 * TRADING_TOOLS — All trading-related tools (read-only + elevated)
 */
export const TRADING_TOOLS = new Set([
  'wallet_balance',
  'dex_get_quote',
  'wallet_transfer',
  'dex_swap',
  'hl_account_info',
  'hl_place_order',
  'hl_cancel_order',
  'hl_deposit',
  'hl_withdraw',
  'polymarket_trade',
  'lucid_hedge',
  'polymarket_automation',
  // Web3 operator tools
  'get_price',
  'search_token',
  'get_portfolio',
  'wallet_history',
  'get_quote_0x',
  'risk_check',
  'portfolio_snapshot',
  'get_pnl',
  'limit_order',
  'dca_create',
  'stop_loss',
  'bridge',
])

export type ToolName = keyof typeof BUILT_IN_TOOLS
export type DangerLevel = 'safe' | 'elevated' | 'dangerous'

export interface ToolDefinition {
  name: string
  description: string
  category: string
  dangerLevel?: DangerLevel
  parameters?: Record<string, unknown>
  // ── Optional enrichment (for automated tool awareness) ──
  when_to_use?: string[]
  examples?: { user: string; tool_call: unknown }[]
  related_tools?: string[]
  requires_confirmation?: boolean
  capability?: string
  progress_label?: string
  progress_phase?: 'thinking' | 'memory' | 'fetching' | 'browser' | 'tool_running' | 'approval_waiting' | 'writing'
}

// ── Capability-Based Policy ──────────────────────────────────────────
// Capabilities are semantic groups of tools. Policy grants capabilities,
// not individual tool names. New tools in a capability auto-appear.

/** Supported capability names for policy_config.capabilities */
export type Capability =
  | 'read:wallet'
  | 'read:price'
  | 'read:portfolio'
  | 'read:history'
  | 'read:quote'
  | 'reason:risk'
  | 'reason:snapshot'
  | 'execute:swap'
  | 'execute:transfer'
  | 'execute:perpetuals'
  | 'execute:orders'
  | 'execute:predictions'
  | 'reason:hedge'
  | 'execute:predictions_automation'
  | 'execute:predictions_portfolio'
  | 'read:predictions_automation'
  | 'manage:predictions_automation'
  | 'schedule'
  | 'messaging'
  | 'subagent'
  | 'manage:orchestration'
  | 'read:orchestration'
  | 'manage:human_tasks'
  | 'content'
  | 'code'

/** Maps capabilities to the tools they grant */
export const CAPABILITY_TOOLS: Record<Capability, string[]> = {
  'read:wallet':       ['wallet_balance'],
  'read:price':        ['get_price', 'search_token'],
  'read:portfolio':    ['get_portfolio'],
  'read:history':      ['wallet_history'],
  'read:quote':        ['dex_get_quote', 'get_quote_0x'],
  'reason:risk':       ['risk_check'],
  'reason:snapshot':   ['portfolio_snapshot', 'get_pnl'],
  'execute:swap':      ['dex_swap'],
  'execute:transfer':  ['wallet_transfer'],
  'execute:perpetuals':['hl_place_order', 'hl_cancel_order', 'hl_account_info', 'hl_deposit', 'hl_withdraw'],
  'execute:orders':    ['limit_order', 'dca_create', 'stop_loss', 'bridge'],
  'execute:predictions': ['polymarket_trade'],
  'reason:hedge':        ['lucid_hedge'],
  'execute:predictions_automation': ['polymarket_automation'],
  'execute:predictions_portfolio':  ['polymarket_automation'],
  'read:predictions_automation':   ['polymarket_automation'],
  'manage:predictions_automation': ['polymarket_automation'],
  'schedule':          ['schedule_task', 'list_scheduled_tasks', 'cancel_scheduled_task',
                        'cron_schedule', 'cron_list', 'cron_cancel'],
  'messaging':         ['send_message_to_agent', 'sessions_send'],
  'subagent':          ['spawn_subagent', 'sessions_spawn'],
  'manage:orchestration': ['plan_dag', 'expand_dag'],
  'read:orchestration': ['dag_status'],
  'manage:human_tasks': ['create_work_item'],
  'content':           ['generate_content'],
  'code':              ['code_interpreter'],
}

/** Capabilities that are safe (auto-granted, no explicit policy needed) */
const SAFE_CAPABILITIES: Capability[] = [
  'read:wallet', 'read:price', 'read:portfolio', 'read:history', 'read:quote',
  'reason:risk', 'reason:snapshot', 'reason:hedge',
  'read:predictions_automation',
  'schedule', 'messaging', 'subagent', 'manage:orchestration', 'read:orchestration', 'manage:human_tasks', 'content', 'code',
]

/** Capabilities that require explicit grant (elevated, signing-dependent) */
const ELEVATED_CAPABILITIES: Capability[] = [
  'execute:swap', 'execute:transfer', 'execute:perpetuals', 'execute:orders', 'execute:predictions',
  'execute:predictions_automation', 'execute:predictions_portfolio',
]

/** Resolve a list of capabilities into tool names */
function resolveCapabilities(capabilities: Capability[]): Set<string> {
  const tools = new Set<string>()
  for (const cap of capabilities) {
    const capTools = CAPABILITY_TOOLS[cap]
    if (capTools) {
      for (const t of capTools) tools.add(t)
    }
  }
  return tools
}

export class CommandsAllowlist {
  private allowedTools: Set<string>
  private toolDefinitions: Map<string, ToolDefinition>
  private pluginToolMap = new Map<string, { pluginSlug: string; toolName: string }>()

  constructor(policyConfig: Record<string, unknown> | null) {
    // Policy model (capability-based with backwards compat):
    //   1. Safe capabilities are ALWAYS granted (read, reason, schedule, etc.)
    //   2. Elevated capabilities (execute:*) require explicit grant
    //   3. Supports both formats:
    //      - NEW: { "capabilities": ["execute:swap", "execute:transfer"] }
    //      - OLD: { "allowed_tools": ["dex_swap", "wallet_transfer"] }
    //      - NONE: all tools allowed (backwards compat)

    this.allowedTools = new Set<string>()

    // Always grant safe capabilities (all safe tools auto-available)
    const safeTools = resolveCapabilities(SAFE_CAPABILITIES)
    for (const name of safeTools) {
      this.allowedTools.add(name)
    }

    // Also add any safe tools not covered by capabilities (future-proof)
    for (const [name, def] of Object.entries(BUILT_IN_TOOLS)) {
      if (def.dangerLevel === 'safe') {
        this.allowedTools.add(name)
      }
    }

    // Resolve elevated tools from policy
    const capabilities = policyConfig?.capabilities as Capability[] | undefined
    const allowedToolNames = policyConfig?.allowed_tools as string[] | undefined

    if (capabilities) {
      // NEW format: capability-based
      const elevatedTools = resolveCapabilities(capabilities)
      for (const name of elevatedTools) {
        this.allowedTools.add(name)
      }
    } else if (allowedToolNames) {
      // OLD format: explicit tool name list (backwards compat)
      for (const name of allowedToolNames) {
        this.allowedTools.add(name)
      }
    } else {
      // No config at all — include everything (backwards compat)
      for (const [name] of Object.entries(BUILT_IN_TOOLS)) {
        this.allowedTools.add(name)
      }
    }

    // Internal tools always available (get_trading_policy, etc.)
    for (const [name, def] of Object.entries(BUILT_IN_TOOLS)) {
      if (def.category === 'internal') {
        this.allowedTools.add(name)
      }
    }

    // Build tool definition registry
    this.toolDefinitions = new Map()
    for (const [name, def] of Object.entries(BUILT_IN_TOOLS)) {
      this.toolDefinitions.set(name, def as ToolDefinition)
    }
  }

  /** Register plugin tools dynamically for this run */
  registerPluginTools(plugins: ActivatedPlugin[]): void {
    for (const plugin of plugins) {
      for (const tool of plugin.tools) {
        const wireName = toWireToolName(plugin.slug, tool.name)
        this.pluginToolMap.set(wireName, { pluginSlug: plugin.slug, toolName: tool.name })
        this.toolDefinitions.set(wireName, {
          name: wireName,
          description: `[${plugin.name}] ${tool.description}`,
          category: 'plugin',
          dangerLevel: 'safe',
          parameters: tool.parameters,
        })
        this.allowedTools.add(wireName)
      }
    }
  }

  /** Check if a tool is a plugin tool */
  isPluginTool(toolName: string): boolean {
    return this.pluginToolMap.has(toolName)
  }

  /** Get plugin info for a tool (slug + original name) */
  getPluginToolInfo(toolName: string): { pluginSlug: string; toolName: string } | undefined {
    return this.pluginToolMap.get(toolName)
  }

  /** Check if a tool is allowed for this assistant */
  isAllowed(toolName: string): boolean {
    // Hard-gate: DANGER_TOOLS are NEVER allowed regardless of policy
    if (DANGER_TOOLS.has(toolName)) return false
    // Plugin tools are always allowed (registered = allowed)
    if (this.pluginToolMap.has(toolName)) return true
    // Only BUILT_IN_TOOLS can be in the allowlist
    if (!this.toolDefinitions.has(toolName)) return false
    return this.allowedTools.has(toolName)
  }

  /** Check if a tool is an elevated trading tool */
  isElevatedTradingTool(toolName: string): boolean {
    return ELEVATED_TRADING_TOOLS.has(toolName)
  }

  /** Check if a tool is any trading tool */
  isTradingTool(toolName: string): boolean {
    return TRADING_TOOLS.has(toolName)
  }

  /** Get the list of allowed tool definitions (for LLM function calling) */
  getAllowedTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = []
    for (const name of this.allowedTools) {
      const def = this.toolDefinitions.get(name)
      if (def) tools.push(def)
    }
    return tools
  }

  /** Get tool names as array */
  getAllowedToolNames(): string[] {
    return Array.from(this.allowedTools)
  }

  /** Check if any tools are enabled */
  hasTools(): boolean {
    return this.allowedTools.size > 0
  }

  /** Check if any trading tools are enabled */
  hasTradingTools(): boolean {
    for (const tool of this.allowedTools) {
      if (TRADING_TOOLS.has(tool)) return true
    }
    return false
  }

  /** Get tool definition by name */
  getToolDefinition(toolName: string): ToolDefinition | undefined {
    return this.toolDefinitions.get(toolName)
  }

  /** Validate a tool call against the allowlist. Returns error message if blocked. */
  validate(toolName: string): string | null {
    if (DANGER_TOOLS.has(toolName)) {
      return `Tool "${toolName}" is hard-gated and cannot be enabled. This tool category is blocked for security reasons.`
    }
    if (!this.toolDefinitions.has(toolName)) {
      return `Tool "${toolName}" is not a recognized tool.`
    }
    if (!this.isAllowed(toolName)) {
      return `Tool "${toolName}" is not in the allowed tools list for this assistant. Allowed: [${this.getAllowedToolNames().join(', ')}]`
    }
    return null
  }

  /**
   * Strip walletAddress/fromAddress from trading tool schemas (agent-wallet mode).
   *
   * When wallet_enabled=true the backend derives the wallet address from the DB,
   * so the LLM must NOT see these params — prevents arbitrary address injection.
   * Deep-clones affected definitions to avoid mutating the global BUILT_IN_TOOLS.
   */
  stripWalletAddressParams(): void {
    for (const [name, def] of this.toolDefinitions.entries()) {
      if (!TRADING_TOOLS.has(name)) continue
      const params = def.parameters as Record<string, unknown> | undefined
      if (!params?.properties) continue

      const props = params.properties as Record<string, unknown>
      if (!('walletAddress' in props) && !('fromAddress' in props)) continue

      // Deep clone to avoid mutating the global BUILT_IN_TOOLS object
      const clonedDef = JSON.parse(JSON.stringify(def)) as ToolDefinition
      const clonedParams = clonedDef.parameters as Record<string, unknown>
      const clonedProps = clonedParams.properties as Record<string, unknown>
      delete clonedProps.walletAddress
      delete clonedProps.fromAddress
      if (Array.isArray(clonedParams.required)) {
        clonedParams.required = (clonedParams.required as string[]).filter(
          (r: string) => r !== 'walletAddress' && r !== 'fromAddress'
        )
      }
      this.toolDefinitions.set(name, clonedDef)
    }
  }
}
