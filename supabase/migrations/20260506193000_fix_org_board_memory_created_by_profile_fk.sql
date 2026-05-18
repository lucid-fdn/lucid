-- Org board memory is keyed by Lucid profiles, not provider/auth rows.
-- Local/BYO users and Privy identities resolve to profiles.id throughout app code.

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
    AND tc.table_name = 'org_board_memory'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'created_by'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.org_board_memory DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

UPDATE public.org_board_memory bm
SET created_by = NULL
WHERE created_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = bm.created_by
  );

ALTER TABLE public.org_board_memory
  ADD CONSTRAINT org_board_memory_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES public.profiles(id)
  ON DELETE SET NULL;
