#!/usr/bin/env node

/**
 * MCP Config Sync Script
 * 
 * Generates IDE-specific MCP configurations from the centralized .mcp/servers.json
 * Replaces environment variable placeholders with actual values from .mcp/.env
 * 
 * Usage: node scripts/sync-mcp-config.js
 * 
 * Output:
 *   - .cursor/mcp.json (for Cursor IDE)
 *   - .vscode/mcp.json (for VS Code / Cline)
 */

const fs = require('fs')
const path = require('path')

const ROOT_DIR = path.join(__dirname, '..')
const MCP_DIR = path.join(ROOT_DIR, '.mcp')
const SERVERS_FILE = path.join(MCP_DIR, 'servers.json')
const ENV_FILE = path.join(MCP_DIR, '.env')

// IDE-specific output locations
const OUTPUTS = {
  cursor: path.join(ROOT_DIR, '.cursor', 'mcp.json'),
  vscode: path.join(ROOT_DIR, '.vscode', 'mcp.json'),
}

function loadEnvFile(envPath) {
  const env = {}
  
  if (!fs.existsSync(envPath)) {
    console.warn(`⚠️  Warning: ${envPath} not found. Using placeholders.`)
    console.warn(`   Copy .mcp/.env.example to .mcp/.env and fill in your values.`)
    return env
  }

  const content = fs.readFileSync(envPath, 'utf-8')
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue
    
    const [key, ...valueParts] = trimmed.split('=')
    if (key && valueParts.length > 0) {
      env[key.trim()] = valueParts.join('=').trim()
    }
  }

  return env
}

function replaceEnvVars(obj, env) {
  if (typeof obj === 'string') {
    // Replace ${VAR_NAME} with actual value
    return obj.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      return env[varName] || match // Keep placeholder if not found
    })
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => replaceEnvVars(item, env))
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const result = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = replaceEnvVars(value, env)
    }
    return result
  }
  
  return obj
}

function generateCursorConfig(servers) {
  // Cursor uses a slightly different format with "type": "stdio"
  const cursorServers = {}
  
  for (const [name, config] of Object.entries(servers)) {
    cursorServers[name] = {
      description: config.description || `${name} MCP server`,
      type: 'stdio',
      command: config.command,
      args: config.args,
    }
    
    if (config.env) {
      cursorServers[name].env = config.env
    }
  }
  
  return { mcpServers: cursorServers }
}

function generateVSCodeConfig(servers) {
  // VS Code / Cline format
  const vscodeServers = {}
  
  for (const [name, config] of Object.entries(servers)) {
    vscodeServers[name] = {
      command: config.command,
      args: config.args,
    }
    
    if (config.env) {
      vscodeServers[name].env = config.env
    }
  }
  
  return { mcpServers: vscodeServers }
}

function ensureDir(filePath) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function main() {
  console.log('🔄 MCP Config Sync\n')
  
  // Load centralized config
  if (!fs.existsSync(SERVERS_FILE)) {
    console.error(`❌ Error: ${SERVERS_FILE} not found`)
    process.exit(1)
  }
  
  const serversConfig = JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf-8'))
  console.log(`📖 Loaded ${Object.keys(serversConfig.mcpServers).length} servers from .mcp/servers.json`)
  
  // Load environment variables
  const env = loadEnvFile(ENV_FILE)
  const envCount = Object.keys(env).length
  if (envCount > 0) {
    console.log(`🔐 Loaded ${envCount} environment variables from .mcp/.env`)
  }
  
  // Replace environment variables
  const resolvedServers = replaceEnvVars(serversConfig.mcpServers, env)
  
  // Generate Cursor config
  const cursorConfig = generateCursorConfig(resolvedServers)
  ensureDir(OUTPUTS.cursor)
  fs.writeFileSync(OUTPUTS.cursor, JSON.stringify(cursorConfig, null, 2))
  console.log(`✅ Generated ${OUTPUTS.cursor}`)
  
  // Generate VS Code config
  const vscodeConfig = generateVSCodeConfig(resolvedServers)
  ensureDir(OUTPUTS.vscode)
  fs.writeFileSync(OUTPUTS.vscode, JSON.stringify(vscodeConfig, null, 2))
  console.log(`✅ Generated ${OUTPUTS.vscode}`)
  
  console.log('\n🎉 MCP configs synced successfully!')
  console.log('\n📝 Next steps:')
  console.log('   1. Restart your IDE to load the new MCP servers')
  console.log('   2. If you see connection errors, check your tokens in .mcp/.env')
}

main()