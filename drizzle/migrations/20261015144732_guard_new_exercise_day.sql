-- B12: check the destination in the same transaction as creation.
-- The existing day guard takes this same owner lock when archiving/restoring.
-- No backfill: legacy NULL links, updates of archived exercises and history remain intact.
CREATE OR REPLACE FUNCTION public.lock_program_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));
  IF TG_OP = 'INSERT' AND NEW.day_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.program_days
    WHERE id = NEW.day_id AND user_id = NEW.user_id AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Выбранный тренировочный день больше недоступен. Упражнение не создано.'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
