#!/usr/bin/env node
/**
 * lucid-runtime / lucid-bridge CLI
 *
 * Connect any agent framework to Lucid Mission Control.
 *
 * Usage:
 *   npx lucid-runtime init --name my-agent
 *   npx lucid-runtime status <runtime-id>
 *   npx lucid-runtime list
 *   npx lucid-runtime env [file]
 */

import { Command } from 'commander'
import {
  capabilitiesCommand,
  envCommand,
  initCommand,
  listCommand,
  probeCommand,
  queueCommandCommand,
  runCommand,
  runtimeCommandsCommand,
  servicesCommand,
  statusCommand,
} from './commands.js'

const program = new Command()

program
  .name('lucid-runtime')
  .description('Connect an existing agent/runtime to Lucid Mission Control')
  .version('0.1.0')

// ---------------------------------------------------------------------------
// lucid-runtime init
// ---------------------------------------------------------------------------

program
  .command('init')
  .description('Create a BYO runtime and generate .env for @lucid/agent-bridge')
  .option('-n, --name <name>', 'Runtime display name')
  .option('-e, --engine <engine>', 'Engine: openclaw or hermes', 'openclaw')
  .option('-m, --mode <mode>', 'Bridge mode: full or observe')
  .option('-c, --channel-mode <mode>', 'Channel mode: relay or native')
  .option('--migrate-openclaw', 'For Hermes: import an existing OpenClaw profile on first start')
  .option('--migrate-preset <preset>', 'For Hermes migration: full or user-data')
  .option('--migrate-dry-run', 'For Hermes migration: preview only')
  .option('--migrate-overwrite', 'For Hermes migration: overwrite conflicts')
  .option('--migrate-source <path>', 'For Hermes migration: custom ~/.openclaw source path')
  .option('--migrate-workspace-target <path>', 'For Hermes migration: AGENTS.md workspace target')
  .option('--migrate-skill-conflict <mode>', 'For Hermes migration: skip, overwrite, or rename')
  .option('-o, --output <file>', 'Output env file path', '.env.lucid')
  .option('--no-wait', 'Skip waiting for agent connection')
  .option('--json', 'Output JSON (non-interactive)')
  .option('--token <token>', 'Auth token (overrides login/env)')
  .option('--url <url>', 'Control plane URL')
  .action((opts) => initCommand(opts))

// ---------------------------------------------------------------------------
// lucid-runtime status
// ---------------------------------------------------------------------------

program
  .command('status <runtime-id>')
  .description('Check connection status of a BYO runtime')
  .option('--json', 'Output JSON')
  .option('--token <token>', 'Auth token')
  .option('--url <url>', 'Control plane URL')
  .action((runtimeId, opts) => statusCommand(runtimeId, opts))

// ---------------------------------------------------------------------------
// lucid-runtime list
// ---------------------------------------------------------------------------

program
  .command('list')
  .description('List all BYO runtimes')
  .option('-a, --all', 'Show all runtimes (not just BYO)')
  .option('--json', 'Output JSON')
  .option('--token <token>', 'Auth token')
  .option('--url <url>', 'Control plane URL')
  .action((opts) => listCommand(opts))

// ---------------------------------------------------------------------------
// lucid-runtime env
// ---------------------------------------------------------------------------

program
  .command('env [file]')
  .description('Display env vars from .env.lucid (or specified file)')
  .action((file) => envCommand(file))

program
  .command('capabilities <runtime-id>')
  .description('Show runtime-advertised engine and adapter capabilities')
  .option('--json', 'Output JSON')
  .option('--token <token>', 'Auth token')
  .option('--url <url>', 'Control plane URL')
  .action((runtimeId, opts) => capabilitiesCommand(runtimeId, opts))

program
  .command('services <runtime-id>')
  .description('Show runtime-owned services reported by heartbeat')
  .option('--json', 'Output JSON')
  .option('--token <token>', 'Auth token')
  .option('--url <url>', 'Control plane URL')
  .action((runtimeId, opts) => servicesCommand(runtimeId, opts))

program
  .command('probe <runtime-id>')
  .description('Queue an adapter environment probe command')
  .option('--json', 'Output JSON')
  .option('--token <token>', 'Auth token')
  .option('--url <url>', 'Control plane URL')
  .action((runtimeId, opts) => probeCommand(runtimeId, opts))

program
  .command('command <runtime-id> <command-type>')
  .description('Queue a runtime management command such as transcript.parser.test or engine_home.snapshot')
  .option('--payload <json>', 'JSON object payload')
  .option('--target-capability-id <id>', 'Target capability id')
  .option('--json', 'Output JSON')
  .option('--token <token>', 'Auth token')
  .option('--url <url>', 'Control plane URL')
  .action((runtimeId, commandType, opts) => queueCommandCommand(runtimeId, commandType, opts))

program
  .command('commands <runtime-id>')
  .description('List runtime management commands and acknowledgements')
  .option('--json', 'Output JSON')
  .option('--token <token>', 'Auth token')
  .option('--url <url>', 'Control plane URL')
  .action((runtimeId, opts) => runtimeCommandsCommand(runtimeId, opts))

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

program
  .command('run')
  .description('Start a local/BYO Lucid runtime bridge, optionally running one engine turn')
  .option('--env-file <file>', 'Env file generated by lucid-runtime init', '.env.lucid')
  .option('-e, --engine <engine>', 'Engine: openclaw or hermes')
  .option('-m, --mode <mode>', 'Bridge mode: full or observe')
  .option('--agent-id <id>', 'Assistant UUID used for observe-mode run telemetry')
  .option('--prompt <text>', 'Run one local engine turn with this prompt')
  .option('--oneshot <text>', 'Alias for --prompt; starts bridge, runs once, flushes, and exits')
  .option('--command <path>', 'Engine executable/command override')
  .option('--args <json>', 'Engine argv JSON array; use "{prompt}" as placeholder')
  .option('--smoke', 'Do not call the engine; only prove bridge heartbeat/telemetry wiring')
  .option('--duration-ms <ms>', 'Keep bridge alive for this many ms after start/run')
  .option('--json', 'Output JSON')
  .action((opts) => runCommand(opts))

program.parse()
