-- Browser edits use authoritative per-set RPCs; retain the original legacy
-- metrics for compatibility/retry evidence. Metadata updates remain supported.
BEGIN;
CREATE FUNCTION public.guard_legacy_workout_metrics()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
    AND (NEW.weight,NEW.reps,NEW.rir) IS DISTINCT FROM (OLD.weight,OLD.reps,OLD.rir) THEN
    RAISE EXCEPTION 'legacy workout metrics are immutable; edit authoritative sets'
      USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_legacy_workout_metrics() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER workout_entries_legacy_metrics_guard
  BEFORE UPDATE OF weight,reps,rir ON public.workout_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_workout_metrics();
COMMIT;
