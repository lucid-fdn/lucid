#!/usr/bin/env node

/**
 * Server Actions Migration Script
 * Migrates all server action error handling to use ErrorService
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Migrating Server Actions to ErrorService\n');

// Target file
const actionsFile = path.join(process.cwd(), 'src/lib/forms/actions.ts');

if (!fs.existsSync(actionsFile)) {
  console.error('❌ actions.ts not found at:', actionsFile);
  process.exit(1);
}

let content = fs.readFileSync(actionsFile, 'utf8');

// Check if already migrated
if (content.includes('ErrorService')) {
  console.log('⏭️  SKIP: actions.ts already migrated\n');
  process.exit(0);
}

console.log('📝 Processing: src/lib/forms/actions.ts\n');

// 1. Add ErrorService import after 'use server'
const useServerRegex = /('use server'[\s\S]*?)(import)/;
content = content.replace(useServerRegex, "$1\nimport { ErrorService } from '@/lib/errors/error-service';\n\n$2");

let replacementCount = 0;

// 2. Replace all standalone console.error calls with ErrorService
// Pattern: console.error('[tag] message:', error)
const patterns = [
  {
    // Pattern 1: console.error with tag and error variable
    regex: /console\.error\(\['([^\]]+)'\]\s+([^:]+):\s*,\s*error\)/g,
    replacement: (match, tag, message) => {
      replacementCount++;
      const actionName = tag.replace(/[[\]]/g, '').trim();
      return `ErrorService.captureException(error, {
      severity: 'error',
      context: {
        action: '${actionName}',
        message: '${message.trim()}'
      },
      tags: {
        layer: 'server-action',
        action: '${actionName}'
      }
    })`;
    }
  },
  {
    // Pattern 2: Simple console.error with just error
    regex: /console\.error\('([^']+)',\s*error\)/g,
    replacement: (match, message) => {
      replacementCount++;
      return `ErrorService.captureException(error, {
      severity: 'error',
      context: {
        message: '${message}'
      },
      tags: {
        layer: 'server-action'
      }
    })`;
    }
  }
];

patterns.forEach(({ regex, replacement }) => {
  content = content.replace(regex, replacement);
});

// Write the updated content
fs.writeFileSync(actionsFile, content, 'utf8');

console.log(`✅ Successfully migrated ${replacementCount} error handlers\n`);
console.log('='.repeat(60));
console.log('MIGRATION COMPLETE');
console.log('='.repeat(60));
console.log(`✅ Migrated: 1 file`);
console.log(`🔧 Replacements: ${replacementCount}`);
console.log('='.repeat(60) + '\n');
