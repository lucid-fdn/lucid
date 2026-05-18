-- Reload PostgREST schema cache so claim_next_outbound_event(p_runtime_id) is visible
SELECT pg_notify('pgrst', 'reload schema');
