-- =============================================================================
-- Phase 4N-c, Task 64 — Reference DAG Template Seeds
--
-- Three global (org_id IS NULL) DAG templates that every org can instantiate
-- read-only. These demonstrate the three archetypes operators should start from:
--
--   1. complaint_handler  — classify → reason → approval → respond
--   2. order_fulfillment  — parse → expansion_zone → barrier → confirm
--   3. content_pipeline   — research → draft → approval → publish
--
-- Idempotent: Postgres treats NULLs as distinct in unique constraints, so we
-- can't rely on ON CONFLICT for (NULL, slug, version). Use NOT EXISTS guards
-- keyed on (org_id IS NULL, slug, version) instead.
-- =============================================================================

-- 1. complaint_handler
INSERT INTO orchestration_dag_templates
  (org_id, slug, name, description, version, spec, trigger_intents, mission_type, is_active)
SELECT
  NULL::UUID,
  'complaint_handler',
  'Complaint Handler',
  'Inbound support complaint: classify intent, analyze severity, route to human approval on refund, then respond.',
  1,
  jsonb_build_object(
    'nodes', jsonb_build_array(
      jsonb_build_object('node_key','intake',   'node_type','leaf',     'step_type','inbound',  'route_class','fast'),
      jsonb_build_object('node_key','classify', 'node_type','leaf',     'step_type','scheduled','route_class','fast'),
      jsonb_build_object('node_key','analyze',  'node_type','leaf',     'step_type','scheduled','route_class','strong'),
      jsonb_build_object('node_key','refund_ok','node_type','approval', 'step_type','approval'),
      jsonb_build_object('node_key','respond',  'node_type','leaf',     'step_type','outbound', 'route_class','fast')
    ),
    'edges', jsonb_build_array(
      jsonb_build_object('parent','intake',   'child','classify', 'edge_kind','order'),
      jsonb_build_object('parent','classify', 'child','analyze',  'edge_kind','order'),
      jsonb_build_object('parent','analyze',  'child','refund_ok','edge_kind','order'),
      jsonb_build_object('parent','refund_ok','child','respond',  'edge_kind','order')
    ),
    'metadata', jsonb_build_object('archetype','support','author','lucid')
  ),
  ARRAY['support.complaint','support.refund_request']::TEXT[],
  'support',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM orchestration_dag_templates
  WHERE org_id IS NULL AND slug = 'complaint_handler' AND version = 1
);

-- 2. order_fulfillment
INSERT INTO orchestration_dag_templates
  (org_id, slug, name, description, version, spec, trigger_intents, mission_type, is_active)
SELECT
  NULL::UUID,
  'order_fulfillment',
  'Order Fulfillment',
  'Parse order, expand line items into parallel fulfillment work, barrier until all items confirmed, then send receipt.',
  1,
  jsonb_build_object(
    'nodes', jsonb_build_array(
      jsonb_build_object('node_key','parse_order',  'node_type','leaf',           'step_type','inbound',  'route_class','fast'),
      jsonb_build_object('node_key','fulfill_items','node_type','expansion_zone'),
      jsonb_build_object('node_key','all_ready',    'node_type','barrier'),
      jsonb_build_object('node_key','confirm',      'node_type','leaf',           'step_type','outbound', 'route_class','fast')
    ),
    'edges', jsonb_build_array(
      jsonb_build_object('parent','parse_order',  'child','fulfill_items','edge_kind','order'),
      jsonb_build_object('parent','fulfill_items','child','all_ready',    'edge_kind','barrier'),
      jsonb_build_object('parent','all_ready',    'child','confirm',      'edge_kind','order')
    ),
    'expansion_zones', jsonb_build_array('fulfill_items'),
    'metadata', jsonb_build_object('archetype','commerce','author','lucid')
  ),
  ARRAY['commerce.order_placed']::TEXT[],
  'fulfillment',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM orchestration_dag_templates
  WHERE org_id IS NULL AND slug = 'order_fulfillment' AND version = 1
);

-- 3. content_pipeline
INSERT INTO orchestration_dag_templates
  (org_id, slug, name, description, version, spec, trigger_intents, mission_type, is_active)
SELECT
  NULL::UUID,
  'content_pipeline',
  'Content Pipeline',
  'Research topic, draft content, editor approval gate, then publish to configured channel.',
  1,
  jsonb_build_object(
    'nodes', jsonb_build_array(
      jsonb_build_object('node_key','brief',    'node_type','leaf',     'step_type','inbound',  'route_class','fast'),
      jsonb_build_object('node_key','research', 'node_type','leaf',     'step_type','scheduled','route_class','strong'),
      jsonb_build_object('node_key','draft',    'node_type','leaf',     'step_type','scheduled','route_class','strong'),
      jsonb_build_object('node_key','review',   'node_type','approval', 'step_type','approval'),
      jsonb_build_object('node_key','publish',  'node_type','leaf',     'step_type','outbound', 'route_class','fast')
    ),
    'edges', jsonb_build_array(
      jsonb_build_object('parent','brief',   'child','research','edge_kind','order'),
      jsonb_build_object('parent','research','child','draft',   'edge_kind','data'),
      jsonb_build_object('parent','draft',   'child','review',  'edge_kind','order'),
      jsonb_build_object('parent','review',  'child','publish', 'edge_kind','order')
    ),
    'metadata', jsonb_build_object('archetype','content','author','lucid')
  ),
  ARRAY['content.brief_received']::TEXT[],
  'content',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM orchestration_dag_templates
  WHERE org_id IS NULL AND slug = 'content_pipeline' AND version = 1
);
