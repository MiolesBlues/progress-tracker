-- Forward-only optimistic concurrency for semantic program PATCHes.
BEGIN;
ALTER TABLE public.program_days ADD COLUMN revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0);
ALTER TABLE public.program_exercises ADD COLUMN revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0);

CREATE FUNCTION public.guard_program_edit_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  -- Invoker reorder RPCs only change position and remain compatible. Every
  -- update still advances the revision, so an open editor also notices reorder.
  -- Browser semantic edits must propose precisely the next current revision.
  IF current_user IN ('authenticated','anon') AND
    ((pg_catalog.to_jsonb(NEW)-'revision'-'position') IS DISTINCT FROM
       (pg_catalog.to_jsonb(OLD)-'revision'-'position') OR NEW.revision IS DISTINCT FROM OLD.revision) AND
    NEW.revision IS DISTINCT FROM OLD.revision + 1 THEN
    RAISE EXCEPTION 'program revision conflict' USING ERRCODE='40001';
  END IF;
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_program_edit_revision() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER program_days_revision BEFORE UPDATE ON public.program_days
  FOR EACH ROW EXECUTE FUNCTION public.guard_program_edit_revision();
CREATE TRIGGER program_exercises_revision BEFORE UPDATE ON public.program_exercises
  FOR EACH ROW EXECUTE FUNCTION public.guard_program_edit_revision();
COMMIT;
