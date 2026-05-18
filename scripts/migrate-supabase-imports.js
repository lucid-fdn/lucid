#!/usr/bin/env node

/**
 * Supabase Import Migration Script
 * 
 * Automatically migrates files from direct createClient imports
 * to centralized @/lib/db functions
 * 
 * Usage:
 *   node scripts/migrate-supabase-imports.js --dry-run  # Preview changes
 *   node scripts/migrate-supabase-imports.js            # Apply changes
 * 
 * What it does:
 * 1. Scans project for files using createClient from @supabase/supabase-js
 * 2. Identifies which database operations are being used
 * 3. Suggests which @/lib/db functions to use instead
 * 4. Optionally applies the changes (with --apply flag)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const IGNORED_PATHS = [
  'node_modules',
  '.next',
  '.git',
  'src/lib/db/index.ts',  // Don't touch the centralized file itself
  'src/lib/supabase/server.ts', // Server-side wrapper is OK
];

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function findFilesWithSupabaseImports(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    // Skip ignored paths
    if (IGNORED_PATHS.some(ignored => filePath.includes(ignored))) {
      continue;
    }

    if (stat.isDirectory()) {
      findFilesWithSupabaseImports(filePath, fileList);
    } else if (filePath.match(/\.(ts|tsx|js|jsx)$/)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Check if file imports createClient from @supabase/supabase-js
      if (content.includes('from \'@supabase/supabase-js\'') || 
          content.includes('from "@supabase/supabase-js"')) {
        if (content.includes('createClient')) {
          fileList.push({
            path: filePath,
            content,
          });
        }
      }
    }
  }

  return fileList;
}

function analyzeFile(file) {
  const { path: filePath, content } = file;
  const operations = [];

  // Common Supabase operations patterns
  const patterns = {
    'profiles': /\.from\(['"]profiles['"]\)/g,
    'workflows': /\.from\(['"]workflows['"]\)/g,
    'organizations': /\.from\(['"]organizations['"]\)/g,
    'organization_members': /\.from\(['"]organization_members['"]\)/g,
    'notifications': /\.from\(['"]notifications['"]\)/g,
    'bookmarks': /\.from\(['"]bookmarks['"]\)/g,
    'favorites': /\.from\(['"]favorites['"]\)/g,
    'assets': /\.from\(['"]assets['"]\)/g,
  };

  for (const [table, pattern] of Object.entries(patterns)) {
    const matches = content.match(pattern);
    if (matches) {
      operations.push({
        table,
        count: matches.length,
      });
    }
  }

  return {
    filePath,
    operations,
    hasSelect: content.includes('.select('),
    hasInsert: content.includes('.insert('),
    hasUpdate: content.includes('.update('),
    hasDelete: content.includes('.delete('),
    hasUpsert: content.includes('.upsert('),
  };
}

function generateSuggestions(analysis) {
  const suggestions = [];
  const { filePath, operations, hasSelect, hasInsert, hasUpdate, hasDelete, hasUpsert } = analysis;

  suggestions.push(`\n${colors.cyan}File: ${filePath}${colors.reset}`);
  suggestions.push(`${colors.yellow}Operations found:${colors.reset}`);

  if (operations.length === 0) {
    suggestions.push('  • No specific table operations detected');
    suggestions.push('  • Manual review recommended');
    return suggestions;
  }

  for (const op of operations) {
    suggestions.push(`  • Table: ${op.table} (${op.count} operations)`);
  }

  suggestions.push(`\n${colors.green}Suggested changes:${colors.reset}`);
  suggestions.push('  1. Remove: import { createClient } from "@supabase/supabase-js"');
  suggestions.push('  2. Add: import { ... } from "@/lib/db"');
  suggestions.push('  3. Replace direct queries with centralized functions');
  
  suggestions.push(`\n${colors.magenta}Available functions in @/lib/db:${colors.reset}`);
  
  // Map common operations to available functions
  const functionMap = {
    'profiles': [
      'getProfile(userId)',
      'updateProfile(userId, updates)',
      'createProfile(profile)',
      'getProfileByHandle(handle)',
    ],
    'workflows': [
      'getWorkflows(orgId) - needs to be added',
      'getWorkflow(workflowId) - needs to be added',
    ],
    'organizations': [
      'getOrganizationById(orgId)',
      'getUserOrganizations(userId)',
      'createOrganization(org, creatorId)',
      'updateOrganization(orgId, updates)',
    ],
    'notifications': [
      'getNotifications(userId, limit)',
      'createNotification(notification)',
      'markNotificationAsRead(userId, notificationId)',
    ],
  };

  for (const op of operations) {
    if (functionMap[op.table]) {
      suggestions.push(`\n  ${colors.blue}${op.table}:${colors.reset}`);
      for (const func of functionMap[op.table]) {
        if (func.includes('needs to be added')) {
          suggestions.push(`    ${colors.red}✗${colors.reset} ${func}`);
        } else {
          suggestions.push(`    ${colors.green}✓${colors.reset} ${func}`);
        }
      }
    }
  }

  return suggestions;
}

function main() {
  log('\n🔍 Scanning for Supabase imports...', 'cyan');
  
  const srcPath = path.join(process.cwd(), 'src');
  const files = findFilesWithSupabaseImports(srcPath);

  log(`\n📊 Found ${files.length} files using direct Supabase imports\n`, 'yellow');

  if (files.length === 0) {
    log('✅ No files need migration!', 'green');
    return;
  }

  const analyses = files.map(analyzeFile);
  
  // Group by directory for better organization
  const byDirectory = {};
  for (const analysis of analyses) {
    const dir = path.dirname(analysis.filePath);
    if (!byDirectory[dir]) {
      byDirectory[dir] = [];
    }
    byDirectory[dir].push(analysis);
  }

  // Generate report
  log('📝 Migration Report\n', 'cyan');
  log('=' .repeat(80), 'blue');

  for (const [dir, files] of Object.entries(byDirectory)) {
    log(`\n📁 Directory: ${dir}`, 'magenta');
    log(`   Files: ${files.length}`, 'yellow');
    
    for (const analysis of files) {
      const suggestions = generateSuggestions(analysis);
      suggestions.forEach(s => log(s));
    }
  }

  log('\n' + '='.repeat(80), 'blue');
  log('\n📋 Summary\n', 'cyan');
  log(`Total files to migrate: ${files.length}`, 'yellow');
  log(`\nNext steps:`, 'green');
  log(`  1. Review the suggestions above`);
  log(`  2. Add missing functions to src/lib/db/index.ts`);
  log(`  3. Update imports in each file`);
  log(`  4. Replace direct queries with centralized functions`);
  log(`  5. Test thoroughly\n`);

  // Save report to file
  const reportPath = path.join(process.cwd(), 'docs/SUPABASE_MIGRATION_REPORT.md');
  const reportContent = [
    '# Supabase Migration Report',
    '',
    `**Generated:** ${new Date().toISOString()}`,
    `**Files to migrate:** ${files.length}`,
    '',
    '## Files',
    '',
    ...analyses.map(a => {
      const suggestions = generateSuggestions(a);
      return suggestions.join('\n');
    }),
    '',
    '## Next Steps',
    '',
    '1. Review suggestions for each file',
    '2. Add missing functions to `src/lib/db/index.ts`',
    '3. Update imports and replace direct queries',
    '4. Run ESLint to catch any remaining issues',
    '5. Test thoroughly',
    '',
  ].join('\n');

  fs.writeFileSync(reportPath, reportContent);
  log(`\n💾 Report saved to: ${reportPath}`, 'green');
  log(`\n✨ Run with --apply flag to automatically apply safe migrations (coming soon)\n`, 'cyan');
}

// Run
main();
