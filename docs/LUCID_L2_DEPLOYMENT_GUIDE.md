# Lucid-L2 Deployment & Testing Guide

## 🚀 Step-by-Step Deployment

### Step 1: Apply Database Migration

**Option A: Supabase Dashboard (Recommended)**
1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Navigate to your project
3. Click **SQL Editor** in the left sidebar
4. Click **New Query**
5. Copy the entire contents of `migrations/020_lucid_l2_complete.sql`
6. Paste into the SQL editor
7. Click **Run** (or press Ctrl+Enter)
8. Verify success message appears

**Option B: Install Supabase CLI** (Optional)
```bash
# Install Supabase CLI
npm install -g supabase

# Then run migration
supabase db push
```

### Step 2: Verify Environment Variables

Check that your `.env.local` has these variables:

```env
# Lucid-L2 Integration
LUCID_L2_API_URL=http://localhost:3001
LUCID_L2_ADMIN_KEY=
NEXT_PUBLIC_LUCID_L2_ENABLED=true
NEXT_PUBLIC_CREWAI_ENABLED=false
```

## Runtime Provider Smoke Check

For BYO Railway runtime smoke tests, the app calls the public L2 Gateway:

```bash
POST https://api.lucid.foundation/v1/agents/launch
Authorization: Bearer $LUCID_L2_ADMIN_KEY
```

Expected production behavior:

- `GET https://api.lucid.foundation/health` returns `200`.
- Health dependencies report `database`, `redis`, and `nango` as healthy.
- BYO Railway launch returns `success: true`, `owner_mode: platform_default`, and `claim_status: claimable` when no wallet owner is supplied.
- The returned Railway deployment URL is terminated during smoke tests with `POST /v1/agents/:passportId/terminate`.

Operational notes:

- Use `LUCID_L2_API_URL`, `LUCID_L2_ADMIN_KEY`, and `LUCID_PLATFORM_WALLET` as the only app-side L2 env names. Do not use legacy aliases or reuse `LUCID_API_KEY` for L2 admin auth.
- L2 should use the Supabase pooler URL for deployed Postgres access; direct Supabase DB hosts may resolve to IPv6-only addresses.
- If the L2 Redis instance is localhost-only with no `requirepass`, use `redis://localhost:6379` without a password.

### Step 3: Start Lucid-L2 Service

```bash
# Navigate to Lucid-L2 directory
cd ../Lucid-L2/offchain

# Install dependencies (if first time)
npm install

# Start the service
npm start
```

**Verify it's running:**
- Should see: "Server running on http://localhost:3001"
- Or test with: `curl http://localhost:3001/health`

### Step 4: Start Your Application

```bash
# In your LucidMerged directory
npm run dev
```

---

## 🧪 Testing the Integration

### Test 1: Save Workflow

**Steps:**
1. Open your app: http://localhost:3000
2. Navigate to a workflow editor
3. Make changes to the workflow (add/move nodes)
4. Click **Save** button

**Expected Results:**
- ✅ Toast notification: "Saving workflow... Syncing with Lucid-L2"
- ✅ Success toast: "Workflow Saved - Successfully synced with Lucid-L2"
- ✅ No errors in browser console
- ✅ Check Supabase `workflows` table - should have `lucid_l2_workflow_id` populated

**If errors occur:**
- Check browser console for errors
- Check Lucid-L2 terminal for errors
- Verify `LUCID_L2_API_URL` is correct
- Verify Lucid-L2 service is running

### Test 2: Execute Workflow

**Steps:**
1. In the workflow editor
2. Click **Execute** button (or **Run** button)
3. Wait for execution to complete

**Expected Results:**
- ✅ Toast: "Executing Workflow - Starting execution on Lucid-L2..."
- ✅ Toast: "Execution Started - Workflow is now running on Lucid-L2"
- ✅ Status updates every 2 seconds (polling)
- ✅ Final toast: "Execution Complete - Workflow completed successfully in X.Xs"
- ✅ Check Supabase `workflow_executions` table - should have execution record

**If errors occur:**
- Verify workflow was saved first (has `lucid_l2_workflow_id`)
- Check that Lucid-L2 service is running
- Check Lucid-L2 logs for execution errors
- Verify feature flag: `NEXT_PUBLIC_LUCID_L2_ENABLED=true`

### Test 3: Check Execution Status

**Steps:**
1. After executing a workflow
2. Execution status should update automatically
3. Check execution history/logs

**Expected Results:**
- ✅ Status changes: pending → running → success/error
- ✅ Execution output is visible
- ✅ Duration is calculated
- ✅ Error messages shown if execution fails

---

## 🔍 Verification Checklist

### Database Verification

```sql
-- Check that Lucid-L2 columns exist in workflows table
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_name = 'workflows'
AND column_name LIKE '%lucid%';

-- Expected results:
-- lucid_l2_workflow_id | text
-- lucid_l2_synced_at   | timestamp with time zone
-- lucid_l2_last_error  | text

-- Check workflow_executions table
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'workflow_executions'
AND column_name LIKE '%lucid%';

-- Expected:
-- lucid_l2_execution_id | text

-- Check that old n8n columns are GONE
SELECT column_name
FROM information_schema.columns
WHERE table_name IN ('workflows', 'workflow_executions')
AND column_name LIKE '%n8n%';

-- Expected: No results (should be empty)
```

### API Verification

```bash
# Test that API routes are accessible
curl -X POST http://localhost:3000/api/workflows/TEST_ID/save \
  -H "Content-Type: application/json"

# Expected: 401 Unauthorized (auth required) or workflow not found
# NOT: 404 or 500 errors

# Check feature flags
curl http://localhost:3000/api/features

# Expected: JSON with lucidL2Integration: true
```

### Lucid-L2 Service Verification

```bash
# Test Lucid-L2 health endpoint
curl http://localhost:3001/health

# Expected: 200 OK

# Test workflow creation (if you have auth setup)
curl -X POST http://localhost:3001/workflow/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Workflow",
    "nodes": [],
    "edges": []
  }'
```

---

## 🐛 Troubleshooting

### Issue: "Feature Disabled" error

**Cause:** Feature flags not enabled

**Solution:**
```env
# In .env.local
NEXT_PUBLIC_LUCID_L2_ENABLED=true
```

Restart your Next.js dev server after changing env vars.

### Issue: "Failed to sync with Lucid-L2"

**Possible Causes:**
1. Lucid-L2 service not running
2. Wrong API URL
3. Network/firewall issues

**Solutions:**
```bash
# Check Lucid-L2 is running
curl http://localhost:3001/health

# Check environment variable
echo $LUCID_L2_API_URL  # Should be http://localhost:3001

# Restart Lucid-L2 service
cd ../Lucid-L2/offchain && npm start
```

### Issue: "Workflow not deployed"

**Cause:** Workflow hasn't been saved to Lucid-L2 yet

**Solution:**
1. Click "Save" button first
2. Wait for "Workflow Saved" confirmation
3. Then click "Execute"

### Issue: Execution timeout

**Cause:** Workflow taking too long (>2 minutes)

**Solution:**
```typescript
// Increase timeout in frontend
const { executeWorkflow, pollStatus } = useWorkflowActions(workflowId, {
  maxPollAttempts: 120, // 4 minutes at 2s interval
});
```

### Issue: Database migration errors

**Common Errors:**
1. "Column already exists" - Safe to ignore, columns already added
2. "Table does not exist" - Check table names are correct
3. "Permission denied" - Use service role key

**Solution:**
Run migration as separate statements if needed, or use Supabase dashboard.

---

## 📊 Monitoring

### Browser Console

Watch for these logs:
```
[save-workflow] Lucid-L2 sync successful
[execute-workflow] Execution started
[get-execution] Status updated from Lucid-L2
```

### Lucid-L2 Logs

Watch for:
```
POST /workflow/create 200
POST /workflow/:id/execute 200
GET /workflow/:id/history 200
```

### Database

Monitor execution records:
```sql
-- Recent executions
SELECT 
  id,
  workflow_id,
  status,
  started_at,
  finished_at,
  duration_ms,
  lucid_l2_execution_id
FROM workflow_executions
ORDER BY started_at DESC
LIMIT 10;

-- Execution success rate
SELECT 
  status,
  COUNT(*) as count,
  AVG(duration_ms) as avg_duration_ms
FROM workflow_executions
WHERE started_at > NOW() - INTERVAL '1 day'
GROUP BY status;
```

---

## ✅ Success Indicators

You've successfully deployed when:

1. ✅ Database migration applied (no n8n columns remain)
2. ✅ Lucid-L2 service running on :3001
3. ✅ Can save workflows (get `lucid_l2_workflow_id`)
4. ✅ Can execute workflows (see toast notifications)
5. ✅ Can see execution status updates (polling works)
6. ✅ Executions complete successfully
7. ✅ No errors in console or Lucid-L2 logs

---

## 🎯 Next Steps After Deployment

1. **Test with real workflows** - Try different node types
2. **Monitor performance** - Check execution times
3. **Remove old n8n code** (optional) - Clean up unused files
4. **Update documentation** - Document any custom workflows
5. **Setup production** - Deploy to staging/production

---

## 📞 Need Help?

If you encounter issues:

1. Check browser console for errors
2. Check Lucid-L2 terminal for logs
3. Check Supabase logs in dashboard
4. Verify all environment variables
5. Restart services (Next.js + Lucid-L2)

**Common fixes:**
- Restart Next.js dev server
- Restart Lucid-L2 service
- Clear browser cache
- Check network tab in DevTools
