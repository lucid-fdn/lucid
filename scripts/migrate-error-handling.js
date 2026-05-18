#!/usr/bin/env node
/**
 * Automated Error Handling Migration Script
 * Migrates console.error to ErrorService.captureException across the codebase
 * 
 * Usage: node scripts/migrate-error-handling.js
 */

const fs = require('fs');
const path = require('path');

// Files to migrate
const MIGRATION_TARGETS = {
  database: {
    file: 'src/lib/db/index.ts',
    patterns: [
      {
        // Pattern: console.error('[db] Failed to...')
        search: /console\.error\('\[db\] Failed to ([^']+):', error\);/g,
        replace: (match, action) => {
          const table = inferTableFromAction(action);
          return `ErrorService.captureException(error, {
      severity: 'error',
      context: {
        table: '${table}',
        operation: '${inferOperation(action)}'
      },
      tags: {
        layer: 'database',
        table: '${table}'
      }
    });`;
        }
      },
      {
        // Pattern: console.error(`[db] Failed to...`)
        search: /console\.error\(`\[db\] Failed to ([^`]+):\$\{([^}]+)\}`, error\);/g,
        replace: (match, action, context) => {
          const table = inferTableFromAction(action);
          return `ErrorService.captureException(error, {
      severity: 'error',
      context: {
        ${context},
        table: '${table}',
        operation: '${inferOperation(action)}'
      },
      tags: {
        layer: 'database',
        table: '${table}'
      }
    });`;
        }
      }
    ]
  },
  serverActions: {
    file: 'src/lib/forms/actions.ts',
    patterns: [
      {
        // Pattern: console.error('[actions] ...error:', error)
        search: /console\.error\('\[actions\] ([^']+) error:', error\)/g,
        replace: (match, action) => {
          return `ErrorService.captureException(error, {
      severity: 'error',
      context: {
        action: '${action}',
        userId: await getUserId().catch(() => 'unknown')
      },
      tags: {
        layer: 'server-action',
        action: '${action.toLowerCase().replace(/\s+/g, '-')}'
      }
    })`;
        }
      }
    ]
  }
};

// Helper functions
function inferTableFromAction(action) {
  const lowerAction = action.toLowerCase();
  if (lowerAction.includes('profile')) return 'profiles';
  if (lowerAction.includes('organization') || lowerAction.includes('org')) return 'organizations';
  if (lowerAction.includes('user')) return 'profiles';
  if (lowerAction.includes('notification')) return 'notifications';
  if (lowerAction.includes('wallet')) return 'user_wallets';
  if (lowerAction.includes('agent')) return 'agents';
  if (lowerAction.includes('app')) return 'apps';
  if (lowerAction.includes('subscription')) return 'subscriptions';
  if (lowerAction.includes('invite')) return 'org_invites';
  return 'unknown';
}

function inferOperation(action) {
  const lowerAction = action.toLowerCase();
  if (lowerAction.includes('fetch') || lowerAction.includes('get')) return 'SELECT';
  if (lowerAction.includes('create') || lowerAction.includes('add')) return 'INSERT';
  if (lowerAction.includes('update') || lowerAction.includes('modify')) return 'UPDATE';
  if (lowerAction.includes('delete') || lowerAction.includes('remove')) return 'DELETE';
  return 'QUERY';
}

// Main migration function
function migrateFile(config) {
  const filePath = path.join(process.cwd(), config.file);
  
  console.log(`\nMigrating: ${config.file}`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`  ❌ File not found: ${config.file}`);
    return false;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  let changesMade = 0;
  
  // Check if ErrorService is already imported
  if (!content.includes("import { ErrorService }")) {
    console.log(`  ℹ️  Adding ErrorService import`);
    const importLine = "import { ErrorService } from '@/lib/errors/error-service';\n";
    
    // Find the last import statement
    const importRegex = /^import\s+.*from\s+['"].*['"];?\s*$/gm;
    const lastImportMatch = Array
