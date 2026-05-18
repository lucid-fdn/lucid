-- Retrieval eval runs are launched by Lucid profile users.
-- Keep this FK aligned with the app's provider-agnostic profile identity.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT tc.constraint_name INTO constraint_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'knowledge_retrieval_eval_runs'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'created_by'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.knowledge_retrieval_eval_runs DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

UPDATE public.knowledge_retrieval_eval_runs run
SET created_by = NULL
WHERE created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = run.created_by
  );

ALTER TABLE public.knowledge_retrieval_eval_runs
  ADD CONSTRAINT knowledge_retrieval_eval_runs_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;
