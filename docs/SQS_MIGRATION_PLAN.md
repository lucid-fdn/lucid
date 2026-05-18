# Migration Plan: Railway → AWS SQS + ECS Fargate

## Overview

This document outlines the complete migration from Railway-hosted worker polling to AWS SQS + ECS Fargate with managed autoscaling.

---

## Current Architecture

```
┌──────────────┐    ┌─────────────┐    ┌──────────────┐
│   Vercel     │───▶│  Supabase   │◀───│   Railway    │
│   (API)      │    │  (Polling)  │    │   (Worker)  │
└──────────────┘    └─────────────┘    └──────────────┘
```

The worker currently polls Supabase for events using `claim_next_inbound_event` and `claim_next_outbound_event` RPCs.

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Vercel (Producer)                              │
│  ┌────────────────┐    ┌──────────────────────────────────────────┐    │
│  │  API Routes    │───▶│  Write to Supabase (system of record)  │    │
│  │                │    │  Call Lambda enqueue → SQS              │    │
│  └────────────────┘    └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        AWS API Gateway + Lambda                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  /enqueue endpoint (API Key + Usage Plan auth)                  │   │
│  │  IAM role with sqs:SendMessage only                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          AWS SQS Queues                                 │
│  ┌─────────────────────────────┐    ┌────────────────────────────────┐  │
│  │  queue-high-priority     │    │  queue-low-priority           │  │
│  │  (chat turns, user-facing)│    │  (embeddings, background)    │  │
│  │  - VisibilityTimeout: 5min│    │  - VisibilityTimeout: 15min    │  │
│  │  - maxReceiveCount: 10   │    │  - maxReceiveCount: 5         │  │
│  └─────────────────────────────┘    └────────────────────────────────┘  │
│                    │                              │                      │
│                    └──────────┬──────────────────┘                      │
│                                 ▼                                       │
│                    ┌────────────────────────────────┐                  │
│                    │  DLQ (dead-letter queue)       │                  │
│                    │  After max retries → alert     │                  │
│                    └────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     ECS Fargate (Workers)                               │
│  ┌─────────────────────────────┐    ┌──────────────────────────────┐  │
│  │  worker-high (ECS Service) │    │  worker-low (ECS Service)   │  │
│  │  - Reads queue-high        │    │  - Reads queue-low          │  │
│  │  - Min: 2, Max: 10       │    │  - Min: 1, Max: 5          │  │
│  │  - Scale on Age < 10s     │    │  - Scale on Age < 30s      │  │
│  └─────────────────────────────┘    └──────────────────────────────┘  │
│                                      │                                  │
│                                      ▼                                  │
│                    ┌────────────────────────────────┐                  │
│                    │  Supabase (System of Record)  │                  │
│                    │  - Events table (source)      │                  │
│                    │  - Claim pattern for safety   │                  │
│                    └────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Migration Checklist

### Phase 1: AWS Infrastructure Setup

- [ ] **1.1** Create AWS account (if not already)
- [ ] **1.2** Set up IAM with STS assume role (avoid long-lived keys)
- [ ] **1.3** Create two SQS queues:
  - `queue-high-priority` (chat turns, maxReceiveCount: 10)
  - `queue-low-priority` (background tasks, maxReceiveCount: 5)
- [ ] **1.4** Create SQS dead-letter queue (DLQ)
- [ ] **1.5** Configure SQS settings:
  - VisibilityTimeout: 5-15 minutes (> p99 job duration)
  - ReceiveMessageWaitTimeSeconds: 20 (long polling)
  - redrivePolicy: maxReceiveCount 5-10
- [ ] **1.6** Create ECS cluster (Fargate in public subnets for MVP)
- [ ] **1.7** Create IAM task role with minimal permissions
- [ ] **1.8** Set up SSM Parameter Store for secrets
- [ ] **1.9** Create CloudWatch log group for worker

---

### Phase 2: Producer (Vercel → Lambda)

- [ ] **2.1** Create AWS API Gateway REST API
- [ ] **2.2** Add usage plan with API key for Vercel
- [ ] **2.3** Create Lambda "enqueue" function:
  ```typescript
  // Lambda handler
  export async function handler(event: APIGatewayEvent) {
    const { eventId, eventType, priority } = JSON.parse(event.body);
    
    const queueUrl = priority === 'high' 
      ? process.env.HIGH_PRIORITY_QUEUE_URL 
      : process.env.LOW_PRIORITY_QUEUE_URL;
    
    await sqs.sendMessage({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({ eventId, eventType }),
      MessageAttributes: {
        priority: { StringValue: priority, DataType: 'String' }
      }
    }).promise();
    
    return { statusCode: 200, body: 'OK' };
  }
  ```
- [ ] **2.4** Configure Lambda IAM role with `sqs:SendMessage` only
- [ ] **2.5** Update Vercel API routes to call Lambda after DB insert

---

### Phase 3: Database Schema

Your current schema is already SQS-ready. Add one new RPC:

```sql
-- Claim a specific event by ID (for SQS consumer)
-- Fixed: removed locked_by IS DISTINCT FROM for safe retry recovery
CREATE OR REPLACE FUNCTION claim_event(
  p_event_id UUID,
  p_worker_id TEXT,
  p_event_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_table TEXT;
  v_rows int;
BEGIN
  v_table := CASE WHEN p_event_type='inbound'
    THEN 'assistant_inbound_events'
    ELSE 'assistant_outbound_events' END;

  -- Atomic claim: only if pending OR (processing + expired lock)
  EXECUTE format(
    'UPDATE %I
     SET status = ''processing'',
         locked_at = NOW(),
         locked_by = $1,
         locked_until = NOW() + INTERVAL ''15 minutes'',
         attempts = attempts + 1
     WHERE id = $2
       AND (
         status = ''pending''
         OR (status = ''processing'' AND locked_until < NOW())
       )',
    v_table
  )
  USING p_worker_id, p_event_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

-- Renew event lease (heartbeat - only if we own the lock)
CREATE OR REPLACE FUNCTION renew_event_lease(
  p_event_id UUID,
  p_worker_id TEXT,
  p_event_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_table TEXT;
  v_rows int;
BEGIN
  v_table := CASE WHEN p_event_type='inbound'
    THEN 'assistant_inbound_events'
    ELSE 'assistant_outbound_events' END;

  -- Only renew if we own the lock (safety check)
  EXECUTE format(
    'UPDATE %I
     SET locked_until = NOW() + INTERVAL ''15 minutes''
     WHERE id = $1
       AND locked_by = $2
       AND status = ''processing''',
    v_table
  )
  USING p_event_id, p_worker_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;
END;
$$;

-- Mark event as done
CREATE OR REPLACE FUNCTION mark_event_done(
  p_event_id UUID,
  p_event_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_table TEXT;
BEGIN
  v_table := CASE WHEN p_event_type='inbound'
    THEN 'assistant_inbound_events'
    ELSE 'assistant_outbound_events' END;

  EXECUTE format(
    'UPDATE %I
     SET status = ''done'',
         processed_at = NOW(),
         locked_until = NULL
     WHERE id = $1',
    v_table
  )
  USING p_event_id;
END;
$$;

-- Mark event as failed (only when DLQ'd)
CREATE OR REPLACE FUNCTION mark_event_failed(
  p_event_id UUID,
  p_event_type TEXT,
  p_error TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_table TEXT;
BEGIN
  v_table := CASE WHEN p_event_type='inbound'
    THEN 'assistant_inbound_events'
    ELSE 'assistant_outbound_events' END;

  EXECUTE format(
    'UPDATE %I
     SET status = ''failed'',
         last_error = $1,
         locked_until = NULL
     WHERE id = $2',
    v_table
  )
  USING p_error, p_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_event TO service_role;
GRANT EXECUTE ON FUNCTION renew_event_lease TO service_role;
GRANT EXECUTE ON FUNCTION mark_event_done TO service_role;
GRANT EXECUTE ON FUNCTION mark_event_failed TO service_role;
```

---

### Phase 4: Worker Code Changes

- [ ] **4.1** Add `@aws-sdk/client-sqs` and `p-limit` to worker
- [ ] **4.2** Implement bounded concurrency SQS consumer
- [ ] **4.3** Implement visibility timeout heartbeat with retries
- [ ] **4.4** Add proper error handling + graceful shutdown
- [ ] **4.5** Keep Discord Gateway Manager (real-time)
- [ ] **4.6** Add SQS metrics to CloudWatch

---

#### Node.js Worker Template (Production-Ready)

```typescript
import { 
  SQSClient, 
  ReceiveMessageCommand, 
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand 
} from '@aws-sdk/client-sqs';
import pLimit from 'p-limit';
import { createSupabaseClient } from './adapters/supabase.js';

const sqs = new SQSClient({ region: process.env.AWS_REGION });
const supabase = createSupabaseClient();

// Configuration
const QUEUE_URL = process.env.SQS_QUEUE_URL!;
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '5', 10);
const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds
const VISIBILITY_TIMEOUT = 300; // 5 minutes (set from now)
const DB_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes (must match DB)

// Bounded concurrency
const limiter = pLimit(MAX_CONCURRENT);

let isShuttingDown = false;
const activeJobs = new Map<string, NodeJS.Timeout>();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('📴 Received SIGTERM, finishing current jobs...');
  isShuttingDown = true;
  
  const maxWait = 60000;
  const start = Date.now();
  while (activeJobs.size > 0 && Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('🛑 Shutdown complete');
  process.exit(0);
});

// Heartbeat with retry logic - also renews DB lock
// Note: eventId and eventType are passed in to avoid parsing twice
async function startHeartbeat(
  message: Message, 
  eventId: string, 
  eventType: string
): Promise<NodeJS.Timeout> {
  const receiptHandle = message.ReceiptHandle!;
  let consecutiveFailures = 0;
  const maxRetries = 3;
  
  const timer = setInterval(async () => {
    if (isShuttingDown) return;
    
    try {
      // Extend SQS visibility timeout
      await sqs.send(new ChangeMessageVisibilityCommand({
        QueueUrl: QUEUE_URL,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: VISIBILITY_TIMEOUT
      }));
      
      // Also renew DB lock (heartbeat the lease)
      await supabase.rpc('renew_event_lease', {
        p_event_id: eventId,
        p_worker_id: process.env.WORKER_ID,
        p_event_type: eventType
      });
      
      consecutiveFailures = 0; // Reset on success
      console.log('💓 Heartbeat sent (SQS + DB)');
    } catch (error) {
      consecutiveFailures++;
      console.error(`❌ Heartbeat failed (${consecutiveFailures}/${maxRetries}):`, error);
      
      if (consecutiveFailures >= maxRetries) {
        console.error('❌ Heartbeat max retries reached, stopping');
        clearInterval(timer);
        // Don't delete from activeJobs - let finally handle cleanup
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
  
  return timer;
}

async function handleMessage(message: Message) {
  if (isShuttingDown) return;
  
  const { eventId, eventType } = JSON.parse(message.Body);
  console.log(`📨 Processing: ${eventId}`);
  
  let heartbeatTimer: NodeJS.Timeout | undefined;
  
  try {
    // STEP 1: Claim in DB (idempotent)
    const { data: claimed } = await supabase.rpc('claim_event', {
      p_event_id: eventId,
      p_worker_id: process.env.WORKER_ID,
      p_event_type: eventType
    });
    
    if (!claimed) {
      console.log(`✅ Already claimed, deleting: ${eventId}`);
      await deleteMessage(message);
      return;
    }
    
    // STEP 2: Start heartbeat AFTER claim (only renew DB when we own it)
    heartbeatTimer = await startHeartbeat(message, eventId, eventType);
    activeJobs.set(message.MessageId!, heartbeatTimer);
    
    // STEP 3: Process the event
    if (eventType === 'inbound') {
      await processInboundEvent(eventId);
    } else {
      await processOutboundEvent(eventId);
    }
    
    // STEP 4: Mark done in DB
    await supabase.rpc('mark_event_done', {
      p_event_id: eventId,
      p_event_type: eventType
    });
    
    // STEP 5: Delete from SQS
    await deleteMessage(message);
    console.log(`✅ Completed: ${eventId}`);
    
  } catch (error) {
    console.error(`❌ Failed: ${eventId}`, error);
    // Don't delete - let SQS retry naturally
    // Only mark failed when retries exhausted (handled by DLQ consumer)
  } finally {
    // Cleanup heartbeat - let finally own this
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
    activeJobs.delete(message.MessageId!);
  }
}

async function deleteMessage(message: Message) {
  await sqs.send(new DeleteMessageCommand({
    QueueUrl: QUEUE_URL,
    ReceiptHandle: message.ReceiptHandle
  }));
}

async function consumeMessages() {
  if (isShuttingDown) return;
  
  const command = new ReceiveMessageCommand({
    QueueUrl: QUEUE_URL,
    MaxNumberOfMessages: 10,
    WaitTimeSeconds: 20,
    MessageAttributeNames: ['All'],
    AttributeNames: ['All']
  });
  
  const { Messages } = await sqs.send(command);
  
  if (!Messages || Messages.length === 0) {
    // Add jitter on empty polls to reduce API calls
    const jitter = Math.random() * 200 + 100; // 100-300ms
    await new Promise(r => setTimeout(r, jitter));
    return;
  }
  
  console.log(`📥 Received ${Messages.length} messages`);
  
  // Process with bounded concurrency
  await Promise.all(Messages.map(msg => limiter(() => handleMessage(msg))));
}

async function main() {
  console.log(`🚀 SQS Worker starting (max ${MAX_CONCURRENT} concurrent)...`);
  
  while (!isShuttingDown) {
    try {
      await consumeMessages();
    } catch (error) {
      console.error('❌ Consumer error:', error);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

main();
```

---

#### DLQ Consumer (Lambda) - Marks Failed Events

```typescript
// Lambda that processes DLQ messages and marks them as failed
// Uses partial batch response to handle poison-pill messages properly
// Requires: ReportBatchItemFailures = true in SQS event source mapping
export async function handler(event: SQSEvent) {
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      const { eventId, eventType } = JSON.parse(record.body);
      
      // Mark as failed in DB
      await supabase.rpc('mark_event_failed', {
        p_event_id: eventId,
        p_event_type: eventType,
        p_error: 'DLQ: max retries exceeded'
      });
      
      // Send alert to Slack/PagerDuty
      await notifyDLQ(eventId, eventType);
      
    } catch (e) {
      // Only fail the specific message that errored, not the whole batch
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  // Return only the failed items - AWS retries only those
  return { batchItemFailures };
}
```

**AWS Configuration Required:**
```
In SQS Event Source Mapping:
- ReportBatchItemFailures = true
```

---

### Phase 5: ECS Deployment

- [ ] **5.1** Update `worker/Dockerfile` with health check
- [ ] **5.2** Build and push Docker image to ECR
- [ ] **5.3** Create ECS task definitions (one per service)
- [ ] **5.4** Create two ECS services:
  - `worker-high` (reads queue-high, min=2, max=10)
  - `worker-low` (reads queue-low, min=1, max=5)
- [ ] **5.5** Configure auto-scaling with target tracking:

  **worker-high (user-facing):**
  ```
  Target: ApproximateAgeOfOldestMessage <= 10 seconds
  Guard: ApproximateNumberOfMessagesVisible >= 5 (prevent single stuck message)
  Scale-out: +2 tasks when breach > 60s
  Scale-in: -1 task when healthy for 300s (5 min cooldown)
  ```

  **worker-low (background):**
  ```
  Target: ApproximateAgeOfOldestMessage <= 30 seconds
  Guard: ApproximateNumberOfMessagesVisible >= 10
  Scale-out: +1 task when breach > 120s
  Scale-in: -1 task when healthy for 600s (10 min cooldown)
  ```

---

### Phase 6: Observability & Alerting

- [ ] **6.1** Create CloudWatch dashboard
- [ ] **6.2** Set up DLQ alarm → SNS → Slack/PagerDuty
- [ ] **6.3** Document DLQ redrive procedure
- [ ] **6.4** Configure Sentry for ECS workers
- [ ] **6.5** Add OpenTelemetry spans with trace_id

---

### Phase 7: Testing & Cutover

- [ ] **7.1** Test SQS → Worker → Supabase flow
- [ ] **7.2** Test visibility timeout heartbeat
- [ ] **7.3** Test bounded concurrency
- [ ] **7.4** Test auto-scaling behavior
- [ ] **7.5** Deploy ECS alongside Railway
- [ ] **7.6** Monitor for 24-48 hours
- [ ] **7.7** Cutover: Switch Vercel producer to SQS
- [ ] **7.8** Keep Railway worker 1 week as backup
- [ ] **7.9** Decommission Railway worker

---

## Worker Environment Variables

```bash
# AWS (no keys - uses ECS task role automatically)
AWS_REGION=us-east-1

# SQS (each ECS service has its own)
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/queue-high-priority

# Supabase (system of record)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=xxx

# Worker (bounded concurrency)
WORKER_ID=ecs-{task-id}
MAX_CONCURRENT=5
```

---

## Cost Estimation (Monthly)

| Resource | Usage | Est. Cost |
|----------|-------|-----------|
| SQS (per million) | 1M messages | $0.40 |
| ECS Fargate (2-10 tasks) | ~100 hours | $15-50 |
| NAT Gateway (if private) | 10GB | $35 |
| CloudWatch Logs | 5GB | $5 |
| API Gateway (Lambda) | 100K | $3 |
| **Total (public subnets)** | | **~$25-60/mo** |
| **Total (private + NAT)** | | **$55-110/mo** |

---

## Rollback Plan

1. Keep Railway worker running during migration
2. Revert Vercel API to write Supabase only
3. Railway continues processing
4. Investigate and fix ECS issues
5. Re-enable SQS when ready

---

## Implementation Order (Lowest Risk)

1. SQS + DLQ setup
2. Worker SQS consumer + DB claim + DeleteMessage
3. Lambda enqueue endpoint + API key auth
4. ECS deploy (two services)
5. Backlog autoscaling (target tracking)
6. DLQ alarms
7. Parallel run with Railway
8. Cutover
9. Decommission Railway

---

## Summary

| Aspect | Current | Target |
|--------|---------|--------|
| Job source | Supabase polling | SQS queue |
| Scaling | Manual | Managed (backlog-based) |
| Latency | Poll interval | Near-instant |
| Retry | DB attempts | SQS DLQ |
| Auth | Railway config | IAM roles |
| Concurrency | p-limit | p-limit (bounded) |
| Heartbeat | DB renewal | SQS visibility |
| Services | 1 (Railway) | 2 (ECS) |

### Production Patterns Applied

1. ✅ No AWS keys - uses ECS task role
2. ✅ Fixed claim RPC - uses GET DIAGNOSTICS
3. ✅ Heartbeat with retry logic
4. ✅ Bounded concurrency (p-limit)
5. ✅ Target tracking autoscaling
6. ✅ Two separate ECS services
7. ✅ Scale-in cooldown (5-10 min)
8. ✅ Mark done/failed DB updates
9. ✅ API key auth for Lambda
