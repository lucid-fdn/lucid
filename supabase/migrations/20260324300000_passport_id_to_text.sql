-- Change passport_id from UUID to TEXT to match L2 passport format (passport_xxx)
ALTER TABLE ai_assistants ALTER COLUMN passport_id TYPE TEXT USING passport_id::TEXT;

-- Also fix mc_receipt_events FK if it references the old type
-- (mc_receipt_events.agent_id references ai_assistants.id which is UUID — no change needed there)
