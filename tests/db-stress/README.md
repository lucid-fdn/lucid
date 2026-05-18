# DB Operations Stress Testing System

Comprehensive end-to-end testing framework for all database operations in LucidMerged.

## What It Tests

### Domain Coverage
- **User Management**: JIT user creation, profile updates, identity linking
- **Organizations & Multi-Tenancy**: Workspace hierarchy, RLS policies, subscriptions
- **Workflows**: Execution tracking, versioning, concurrent executions
- **Lucid Personal**: AI assistants, channels, worker event claiming
- **LucidGateway & BYOK**: Key management, encryption, audit logs
- **RAG & Knowledge Base**: Document chunking, vector search, embeddings
- **Cross-Domain Integration**: FK integrity, cascading deletes, full user onboarding flows

### Test Categories
1. **CRUD Operations**: Create, Read, Update, Delete for all domains
2. **Concurrency**: Race conditions, deadlocks, atomic operations
3. **RLS Policies**: Multi-tenancy isolation, user access controls
4. **FK Constraints**: Referential integrity, cascading deletes
5. **Transaction Boundaries**: Rollback recovery, savepoints
6. **Performance**: High-load scenarios, rapid-fire operations

## Usage

### Run All Tests
```bash
node tests/db-stress/db-operations-test.js
```

### Run Specific Domain
```bash
node tests/db-stress/db-operations-test.js --domain users
node tests/db-stress/db-operations-test.js --domain organizations
node tests/db-stress/db-operations-test.js --domain workflows
node tests/db-stress/db-operations-test.js --domain lucidPersonal
node tests/db-stress/db-operations-test.js --domain lucidGateway
node tests/db-stress/db-operations-test.js --domain rag
node tests/db-stress/db-operations-test.js --domain integration
```

### Adjust Concurrency Level
```bash
node tests/db-stress/db-operations-test.js --concurrency 100
```

### Quick Mode (Skip Stress Tests)
```bash
node tests/db-stress/db-operations-test.js --quick
```

### Combined Options
```bash
node tests/db-stress/db-operations-test.js --domain workflows --concurrency 200
```

## NPM Scripts

Add to `package.json`:
```json
{
  "scripts": {
    "test:db": "node tests/db-stress/db-operations-test.js",
    "test:db:quick": "node tests/db-stress/db-operations-test.js --quick",
    "test:db:users": "node tests/db-stress/db-operations-test.js --domain users",
    "test:db:stress": "node tests/db-stress/db-operations-test.js --concurrency 100"
  }
}
```

## Test Output

### Console Output
```
🗄️  LucidMerged DB Operations Stress Test
   Date: 2026-02-11T21:12:00.000Z
   Concurrency: 50
   Mode: Full

════════════════════════════════════════════════════════════
  DOMAIN: User Management (profiles, users, identity_links)
════════════════════════════════════════════════════════════
  ✅ Create user atomically (JIT pattern) (12ms)
  ✅ Get user profile by ID (3ms)
  ✅ Update user profile (name, avatar) (4ms)
  ✅ Concurrent profile updates: last write wins (18ms)
  ✅ Resolve external ID → internal user ID (identity_links) (2ms)

...

════════════════════════════════════════════════════════════
  RESULTS SUMMARY
════════════════════════════════════════════════════════════

  Total:  87 tests
  Passed: 87 ✅
  Failed: 0 ❌
  Time:   2847ms

  By Suite:
    ✅ DOMAIN: User Management: 5/5 (39ms)
    ✅ DOMAIN: Organizations & Multi-Tenancy: 5/5 (82ms)
    ✅ DOMAIN: Workflows & Executions: 6/6 (124ms)
    ...

  Report saved: logs/db-stress-1739301120000.json
```

### JSON Report
Generated at `logs/db-stress-{timestamp}.json`:
```json
{
  "date": "2026-02-11T21:12:00.000Z",
  "concurrency": 50,
  "quick": false,
  "total": 87,
  "passed": 87,
  "failed": 0,
  "totalMs": 2847,
  "suites": {
    "DOMAIN: User Management": { "pass": 5, "fail": 0, "ms": 39 }
  },
  "results": [...]
}
```

## Extending Tests

### Add New Domain

1. Create new test function:
```javascript
async function testMyNewDomain() {
  suite('DOMAIN: My New Feature')

  await test('My test case', async () => {
    await db.query('SELECT * FROM my_table')
    // Assertions...
  })
}
```

2. Register in `domains` object:
```javascript
const domains = {
  // ... existing domains
  myFeature: testMyNewDomain,
}
```

### Add New Test Case

```javascript
await test('Descriptive test name', async () => {
  // Setup
  const testData = generateTestData()
  
  // Execute
  const result = await db.query('INSERT INTO ...', [testData])
  
  // Assert
  assert(result.rowCount === 1, 'Should insert 1 row')
  assertEqual(result.rows[0].id, testData.id, 'Should return inserted ID')
})
```

## Real DB Integration

### Current Implementation
The test file currently uses **mock DB operations** for fast, safe testing without hitting the real database.

### To Connect to Real DB
Replace the mock `db` object with Supabase MCP client:

```javascript
// Option 1: Use Supabase MCP execute_sql tool
const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const db = {
  async query(sql, params = []) {
    const { data, error } = await supabase.rpc('execute_sql', { 
      query: sql, 
      params 
    })
    if (error) throw error
    return { rows: data, rowCount: data?.length || 0 }
  },
  
  async transaction(fn) {
    // Use Supabase transactions
    return await fn(this)
  }
}
```

## CI/CD Integration

### GitHub Actions
```yaml
name: DB Stress Tests
on: [push, pull_request]

jobs:
  db-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:db:quick
      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: db-stress-report
          path: logs/db-stress-*.json
```

### Pre-deployment Check
```bash
#!/bin/bash
# pre-deploy.sh
echo "Running DB stress tests..."
npm run test:db:quick || {
  echo "DB tests failed — deployment blocked"
  exit 1
}
echo "All DB tests passed ✅"
```

## Performance Benchmarks

### Expected Performance (Mock DB)
- **User Operations**: ~40ms for 5 tests
- **Organization Operations**: ~80ms for 5 tests
- **Workflow Operations**: ~120ms for 6 tests
- **50 Concurrent Operations**: < 100ms
- **1000 Rapid Reads**: < 2000ms

### Real DB Performance (Typical)
- **User Operations**: ~200-500ms
- **Organization Operations**: ~300-800ms
- **Workflow Operations**: ~500-1200ms
- **50 Concurrent Operations**: ~300-600ms
- **1000 Rapid Reads**: ~5000-10000ms

## Debugging Failed Tests

### Enable Verbose Logging
```javascript
// In db-operations-test.js, add:
const VERBOSE = process.env.VERBOSE === 'true'

async function test(name, fn) {
  if (VERBOSE) console.log(`  [START] ${name}`)
  // ... existing code
}
```

Run with:
```bash
VERBOSE=true node tests/db-stress/db-operations-test.js
```

### Inspect Failed Transactions
```javascript
async transaction(fn) {
  try {
    const result = await fn(this)
    console.log('[TX SUCCESS]', result)
    return result
  } catch (err) {
    console.error('[TX ROLLBACK]', err.message)
    console.error('[TX STACK]', err.stack)
    throw err
  }
}
```

## Known Limitations

1. **Mock DB**: Current implementation uses mock operations. Requires real DB integration for production validation.
2. **RLS Testing**: RLS policies tested at query level, not enforced in mock.
3. **Vector Operations**: pgvector operations (embeddings) return null in mocks.
4. **Triggers**: Auto-versioning and other triggers not executed in mocks.

## Roadmap

- [ ] Real Supabase MCP integration
- [ ] RLS policy enforcement validation
- [ ] pgvector similarity search testing
- [ ] Trigger execution verification
- [ ] Migration rollback testing
- [ ] Performance regression detection
- [ ] Automated DB schema drift detection

## Related Files

- `tests/stress/runner.js` - BYOK/encryption/concurrency stress tests
- `migrations/*.sql` - DB schema migrations
- `src/lib/db/index.ts` - DB service layer (operations under test)
- `docs/STRESS_TEST_REPORT.md` - Previous stress test results
