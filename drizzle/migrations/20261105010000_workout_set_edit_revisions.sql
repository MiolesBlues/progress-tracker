-- Forward-only: original entry snapshots and current set values are preserved.
BEGIN;

ALTER TABLE public.workout_entry_sets ADD COLUMN revision integer NOT NULL DEFAULT 0
  CHECK (revision >= 0);

CREATE FUNCTION public.bump_workout_set_revision()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.bump_workout_set_revision() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER workout_entry_sets_revision BEFORE UPDATE ON public.workout_entry_sets
  FOR EACH ROW EXECUTE FUNCTION public.bump_workout_set_revision();

CREATE TABLE public.workout_set_edit_operations (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  workout_entry_id uuid NOT NULL,
  set_id uuid NOT NULL,
  expected_revision integer NOT NULL CHECK (expected_revision >= 0),
  payload jsonb NOT NULL,
  result_revision integer NOT NULL CHECK (result_revision = expected_revision + 1),
  PRIMARY KEY (user_id, operation_id),
  FOREIGN KEY (workout_entry_id, user_id) REFERENCES public.workout_entries(id, user_id) ON DELETE CASCADE
);
CREATE INDEX workout_set_edit_operations_entry_idx
  ON public.workout_set_edit_operations(workout_entry_id, user_id);
ALTER TABLE public.workout_set_edit_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_set_edit_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.workout_set_edit_operations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.workout_set_edit_operations TO service_role;

-- The old signature cannot express a base revision; remove it from the public
-- write API. The new definer RPC reuses its validated implementation internally.
REVOKE ALL ON FUNCTION public.update_workout_entry_set(uuid,uuid,text,integer,text,text,text)
  FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.edit_workout_entry_set(
  _operation_id uuid, _entry_id uuid, _set_id uuid, _expected_revision integer,
  _weight text, _reps integer, _rir text,
  _set_type text DEFAULT 'working', _load_type text DEFAULT 'external'
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := auth.uid(); current_revision integer;
        previous public.workout_set_edit_operations; desired jsonb; result integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE='42501'; END IF;
  IF _operation_id IS NULL OR _expected_revision IS NULL OR _expected_revision < 0 THEN
    RAISE EXCEPTION 'operation ID and revision are required' USING ERRCODE='22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text,0));
  PERFORM 1 FROM public.workout_entries w WHERE w.id=_entry_id AND w.user_id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'entry unavailable' USING ERRCODE='42501'; END IF;
  desired := public.normalize_workout_entry_sets(pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('id',_set_id,'position',1,'weight',_weight,'reps',_reps,
      'rir',CASE WHEN _rir IS NULL THEN NULL ELSE pg_catalog.to_jsonb(_rir) END,
      'set_type',_set_type,'load_type',_load_type))) -> 0;
  SELECT * INTO previous FROM public.workout_set_edit_operations
    WHERE user_id=uid AND operation_id=_operation_id;
  IF FOUND THEN
    IF (previous.workout_entry_id,previous.set_id,previous.expected_revision,previous.payload)
      IS DISTINCT FROM (_entry_id,_set_id,_expected_revision,desired) THEN
      RAISE EXCEPTION 'operation ID already used with different payload' USING ERRCODE='22023';
    END IF;
    RETURN previous.result_revision; -- Never reapply an old edit after a newer edit.
  END IF;
  SELECT s.revision INTO current_revision FROM public.workout_entry_sets s
    WHERE s.id=_set_id AND s.workout_entry_id=_entry_id AND s.user_id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'set unavailable' USING ERRCODE='P0002'; END IF;
  IF current_revision <> _expected_revision THEN
    RAISE EXCEPTION 'workout set revision conflict' USING ERRCODE='40001';
  END IF;
  PERFORM public.update_workout_entry_set(_entry_id,_set_id,_weight,_reps,_rir,_set_type,_load_type);
  SELECT revision INTO result FROM public.workout_entry_sets WHERE id=_set_id AND user_id=uid;
  INSERT INTO public.workout_set_edit_operations
    (user_id,operation_id,workout_entry_id,set_id,expected_revision,payload,result_revision)
    VALUES(uid,_operation_id,_entry_id,_set_id,_expected_revision,desired,result);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.edit_workout_entry_set(uuid,uuid,uuid,integer,text,integer,text,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_workout_entry_set(uuid,uuid,uuid,integer,text,integer,text,text,text)
  TO authenticated;

COMMIT;
