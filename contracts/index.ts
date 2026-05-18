/**
 * AI Assistant Contracts
 * 
 * Pure TypeScript + Zod schemas shared between:
 * - src/ (Next.js app on Vercel)
 * - worker/ (Event processor on Railway/Fly)
 * 
 * NO framework dependencies allowed here.
 */

// Event schemas (inbound/outbound message queue)
export * from './events'

// Channel schemas (Telegram, WhatsApp, etc.)
export * from './channels'

// Assistant configuration schemas
export * from './assistants'

// Plugin system schemas
export * from './plugin'

// Launchpad schemas
export * from './launchpad'

// Crew orchestration schemas
export * from './crew'

// Introspection stream types
export * from './introspection'

// Pulse orchestration contracts (shared between worker + control plane)
export * from './pulse'

// App Service Foundry contracts (generated agent-service apps + runtime API)
export * from './app-service'
export * from './app-runtime'

// Project blueprint contracts (shared creation/deploy source of truth)
export * from './project-blueprint'

// Agent commerce contracts (Link Agents, SPTs, machine payments, provider-neutral)
export * from './agent-commerce'

// Browser Operator contracts (provider-neutral browser actions, accounts, policies, and commerce-safe sessions)
export * from './browser-operator'

// AgentOps event taxonomy shared across runtimes, Mission Control, and stack events
export * from './agentops'
export * from './agent-ops-run-mode'

// Versioned agent identity documents and runtime identity package
export * from './agent-identity'

// Shared thesis/signals/feedback/daily-intel context records
export * from './shared-context'

// Native Lucid Agent/Organization/Project Card contracts
export * from './lucid-card'

// Runtime execution context and engine/runtime/channel contract
export * from './runtime-execution'
export * from './runtime-execution-target'
export * from './runtime-transcript'
export * from './runtime-adapter'
export * from './runtime-capability'
export * from './runtime-capabilities'

// Engine Home Virtualization snapshot/diff/archive contract
export * from './engine-home'

// Template and Lucid Assembly contracts shared across catalog, deploy, and generated apps
export * from './template'
export * from './template-composition'

// Lucid stack IDs shared across app, worker, docs, and telemetry
export * from './stack'

// External Agent OS pattern contracts
export * from './global-search'
export * from './system-notice'
export * from './knowledge-claims'
export * from './eval-receipts'
export * from './lucid-pack'
export * from './knowledge-imports'
export * from './knowledge-auth'

// Work Graph contracts for goals, Kanban projections, checkouts, and PM federation
export * from './work-graph'
