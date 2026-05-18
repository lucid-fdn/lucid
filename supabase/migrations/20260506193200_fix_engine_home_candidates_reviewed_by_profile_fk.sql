-- Engine-home candidate reviews are performed by Lucid profile users.

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
    AND tc.table_name = 'knowledge_engine_home_projection_candidates'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'reviewed_by'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.knowledge_engine_home_projection_candidates DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

UPDATE public.knowledge_engine_home_projection_candidates candidate
SET reviewed_by = NULL
WHERE reviewed_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = candidate.reviewed_by
  );

ALTER TABLE public.knowledge_engine_home_projection_candidates
  ADD CONSTRAINT knowledge_engine_home_projection_candidates_reviewed_by_fkey
  FOREIGN KEY (reviewed_by)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;
