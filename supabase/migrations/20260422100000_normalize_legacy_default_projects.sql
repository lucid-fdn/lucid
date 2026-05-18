DO $$
DECLARE
  project_record RECORD;
  candidate_slug TEXT;
  slug_attempt INTEGER;
  candidate_name TEXT;
BEGIN
  FOR project_record IN
    SELECT
      id,
      org_id,
      name,
      slug
    FROM projects
    WHERE deleted_at IS NULL
      AND (
        is_default = true
        OR slug = 'default'
        OR lower(name) IN ('default', 'default project')
      )
    ORDER BY org_id, created_at, id
  LOOP
    candidate_slug := project_record.slug;
    candidate_name := project_record.name;

    IF candidate_slug = 'default' OR candidate_slug IS NULL OR candidate_slug = '' THEN
      candidate_slug := 'project';
      slug_attempt := 2;

      WHILE EXISTS (
        SELECT 1
        FROM projects p
        WHERE p.org_id = project_record.org_id
          AND p.deleted_at IS NULL
          AND p.id <> project_record.id
          AND p.slug = candidate_slug
      ) LOOP
        candidate_slug := 'project-' || slug_attempt::text;
        slug_attempt := slug_attempt + 1;
      END LOOP;
    END IF;

    IF lower(candidate_name) IN ('default', 'default project') THEN
      candidate_name := 'Project';
    END IF;

    UPDATE projects
    SET
      name = candidate_name,
      slug = candidate_slug,
      is_default = false,
      updated_at = NOW()
    WHERE id = project_record.id;
  END LOOP;
END $$;
