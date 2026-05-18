#!/usr/bin/env node

/**
 * API Routes Migration Script
 * Migrates all API route handlers to use ErrorService
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all route.ts files in src/app/api
const apiDir = path.join(process.cwd(), 'src/app/api');
const routeFiles = glob.sync('**/route.ts', { cwd: apiDir, absolute: true });

console.log(`Found ${routeFiles.length} API route files to migrate\n`);

let migratedCount = 0;
let skippedCount = 0;
let errorCount = 0;

routeFiles.forEach((filePath) => {
  try {
    const relativePath = path.relative(process.cwd(), filePath);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Skip if already has ErrorService
    if (content.includes('ErrorService')) {
      console.log(`⏭️  SKIP: ${relativePath} (already migrated)`);
      skippedCount++;
      return;
    }
    
    // Skip if no console.error
    if (!content.includes('console.error')) {
      console.log(`⏭️  SKIP: ${relativePath} (no console.error found)`);
      skippedCount++;
      return;
    }
    
    let modified = false;
    
    // 1. Add ErrorService import after existing imports
    if (!content.includes("import { ErrorService }")) {
      const importRegex = /(import.*from.*['"];?\n)+/;
      const match = content.match(importRegex);
      if (match) {
        const lastImportIndex = content.indexOf(match[0]) + match[0].length;
        content = 
          content.slice(0, lastImportIndex) +
          "import { ErrorService } from '@/lib/errors/error-service';\n" +
          content.slice(lastImportIndex);
        modified = true;
      }
    }
    
    // 2. Extract route path from file path
    const routePath = filePath
      .replace(apiDir, '')
      .replace('/route.ts', '')
      .replace(/\\/g, '/')
      .replace(/\[([^\]]+)\]/g, ':$1') || '/';
    
    const routeName = routePath.split('/').filter(Boolean).pop() || 'root';
    
    // 3. Replace all console.error in catch blocks with ErrorService
    const errorRegex = /catch\s*\(([^)]+)\)\s*{[\s\S]*?console\.error\([^)]+\);?[\s\S]*?return\s+NextResponse\.json\(/g;
    
    content = content.replace(errorRegex, (match) => {
      // Check if this catch block already handles Unauthorized
      const hasUnauthorized = match.includes("error.message === 'Unauthorized'");
      
      // Replace console.error with ErrorService
      const updated = match.replace(
        /console\.error\([^)]+\);?/,
        `ErrorService.captureException(error, {
      severity: 'error',
      context: {
        endpoint: '${routePath}',
        method: 'REQUEST'
      },
      tags: {
        layer: 'api',
        route: '${routeName}'
      }
    });`
      );
      
      modified = true;
      return updated;
    });
    
    // 4. Handle cases where console.error is BEFORE the return
    content = content.replace(
      /console\.error\([^)]+\);?\s*\n\s*(if\s*\([^)]+error\.message === 'Unauthorized')/g,
      '$1'
    );
    
    // Write if modified
    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ MIGRATED: ${relativePath}`);
      migratedCount++;
    } else {
      console.log(`⏭️  SKIP: ${relativePath} (no changes needed)`);
      skippedCount++;
    }
  } catch (error) {
    console.error(`❌ ERROR: ${relativePath}`, error.message);
    errorCount++;
  }
});

console.log(`\n${'='.repeat(60)}`);
console.log('MIGRATION COMPLETE');
console.log(`${'='.repeat(60)}`);
console.log(`✅ Migrated: ${migratedCount}`);
console.log(`⏭️  Skipped:  ${skippedCount}`);
console.log(`❌ Errors:   ${errorCount}`);
console.log(`📁 Total:    ${routeFiles.length}`);
console.log(`${'='.repeat(60)}\n`);

if (errorCount > 0) {
  process.exit(1);
}
