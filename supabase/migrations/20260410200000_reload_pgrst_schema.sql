-- Force PostgREST schema cache reload after recent function changes
SELECT pg_notify('pgrst', 'reload schema');
