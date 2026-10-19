-- Versioned global strength-template library. The JSON bundle is seeded separately
-- through upsert_training_library(jsonb); this migration only creates the safe,
-- idempotent storage and user-scoped application path.
BEGIN;

ALTER TABLE public.program_days
  ADD COLUMN IF NOT EXISTS template_application_id uuid,
  ADD COLUMN IF NOT EXISTS template_day_key text;
ALTER TABLE public.program_exercises
  ADD COLUMN IF NOT EXISTS template_application_id uuid,
  ADD COLUMN IF NOT EXISTS template_slot_key text,
  ADD COLUMN IF NOT EXISTS template_exercise_key text,
  ADD COLUMN IF NOT EXISTS target_rir_min numeric(3,1) CHECK (target_rir_min IS NULL OR target_rir_min BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS target_rir_max numeric(3,1) CHECK (target_rir_max IS NULL OR target_rir_max BETWEEN 0 AND 10);
ALTER TABLE public.program_exercises
  ADD CONSTRAINT program_exercises_target_rir_range_check CHECK (
    (target_rir_min IS NULL AND target_rir_max IS NULL)
    OR (target_rir_min IS NOT NULL AND target_rir_max IS NOT NULL AND target_rir_min <= target_rir_max)
  );

CREATE TABLE public.training_exercise_catalog (
  exercise_key text PRIMARY KEY CHECK (exercise_key ~ '^[a-z0-9_]+$'),
  name_ru text NOT NULL CHECK (char_length(btrim(name_ru)) BETWEEN 1 AND 120),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.training_templates (
  template_key text NOT NULL CHECK (template_key ~ '^strength_[1-7]d_v[0-9]+$'),
  version integer NOT NULL CHECK (version > 0),
  title_ru text NOT NULL,
  days_per_week integer NOT NULL CHECK (days_per_week BETWEEN 1 AND 7),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_key, version),
  UNIQUE (template_key, content_sha256)
);

CREATE TABLE public.training_template_days (
  template_key text NOT NULL,
  version integer NOT NULL,
  day_key text NOT NULL CHECK (day_key ~ '^strength_[1-7]d_v[0-9]+_d[0-9]{2}$'),
  day_order integer NOT NULL CHECK (day_order > 0),
  weekday integer NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  session_type text NOT NULL CHECK (session_type IN ('developmental', 'light_strength')),
  title_ru text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (template_key, version, day_key),
  UNIQUE (template_key, version, day_order),
  FOREIGN KEY (template_key, version) REFERENCES public.training_templates(template_key, version) ON DELETE CASCADE
);

CREATE TABLE public.training_template_slots (
  template_key text NOT NULL,
  version integer NOT NULL,
  day_key text NOT NULL,
  slot_key text NOT NULL CHECK (slot_key ~ '^strength_[1-7]d_v[0-9]+_d[0-9]{2}_e[0-9]{2}$'),
  exercise_key text NOT NULL REFERENCES public.training_exercise_catalog(exercise_key),
  slot_order integer NOT NULL CHECK (slot_order > 0),
  prescription jsonb NOT NULL,
  PRIMARY KEY (template_key, version, slot_key),
  UNIQUE (template_key, version, day_key, slot_order),
  FOREIGN KEY (template_key, version, day_key) REFERENCES public.training_template_days(template_key, version, day_key) ON DELETE CASCADE
);

CREATE TABLE public.training_template_applications (
  application_id uuid PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  template_key text NOT NULL,
  version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, template_key, version),
  FOREIGN KEY (template_key, version) REFERENCES public.training_templates(template_key, version) ON DELETE RESTRICT
);

ALTER TABLE public.program_days
  ADD CONSTRAINT program_days_template_application_fkey
  FOREIGN KEY (template_application_id) REFERENCES public.training_template_applications(application_id) ON DELETE RESTRICT;
ALTER TABLE public.program_exercises
  ADD CONSTRAINT program_exercises_template_application_fkey
  FOREIGN KEY (template_application_id) REFERENCES public.training_template_applications(application_id) ON DELETE RESTRICT;

CREATE INDEX training_templates_days_filter_idx ON public.training_templates(days_per_week);
CREATE INDEX training_template_slots_lookup_idx ON public.training_template_slots(template_key, version, day_key, slot_order);
CREATE INDEX training_template_applications_user_idx ON public.training_template_applications(user_id, created_at DESC);

ALTER TABLE public.training_exercise_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_template_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_template_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_template_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "published catalog read" ON public.training_exercise_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "published templates read" ON public.training_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "published template days read" ON public.training_template_days FOR SELECT TO authenticated USING (true);
CREATE POLICY "published template slots read" ON public.training_template_slots FOR SELECT TO authenticated USING (true);
CREATE POLICY "own applications read" ON public.training_template_applications FOR SELECT TO authenticated USING (auth.uid() = user_id);

GRANT SELECT ON public.training_exercise_catalog, public.training_templates,
  public.training_template_days, public.training_template_slots TO authenticated;
GRANT SELECT ON public.training_exercise_catalog, public.training_templates,
  public.training_template_days, public.training_template_slots TO anon;
GRANT SELECT ON public.training_template_applications TO authenticated;
GRANT ALL ON public.training_exercise_catalog, public.training_templates,
  public.training_template_days, public.training_template_slots,
  public.training_template_applications TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_training_library(_bundle jsonb, _content_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  uid text := current_user;
  bundle_hash text := lower(_content_sha256);
  p jsonb;
  c jsonb;
  d jsonb;
  e jsonb;
  existing_sha text;
  inserted integer := 0;
BEGIN
  IF uid NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'library seed requires service role' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(_bundle->'programs') <> 'array' OR jsonb_array_length(_bundle->'programs') <> 7
     OR jsonb_typeof(_bundle->'exercise_catalog') <> 'array' THEN
    RAISE EXCEPTION 'invalid training library bundle' USING ERRCODE = '22023';
  END IF;
  IF bundle_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid training library content hash' USING ERRCODE = '22023';
  END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(_bundle->'exercise_catalog') LOOP
    INSERT INTO public.training_exercise_catalog(exercise_key, name_ru, metadata, content_sha256)
    VALUES (c->>'exercise_key', c->>'name_ru', c - 'name_ru', bundle_hash)
    ON CONFLICT (exercise_key) DO UPDATE SET name_ru = EXCLUDED.name_ru,
      metadata = EXCLUDED.metadata, content_sha256 = EXCLUDED.content_sha256;
  END LOOP;
  FOR p IN SELECT value FROM jsonb_array_elements(_bundle->'programs') LOOP
    SELECT content_sha256 INTO existing_sha FROM public.training_templates
      WHERE template_key = p->>'template_key' AND version = (p->>'version')::integer;
    IF existing_sha IS NOT NULL AND existing_sha <> bundle_hash THEN
      RAISE EXCEPTION 'template content conflict for % v%', p->>'template_key', p->>'version' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.training_templates(template_key, version, title_ru, days_per_week, metadata, content_sha256)
    VALUES (p->>'template_key', (p->>'version')::integer, p->>'title_ru', (p->>'days_per_week')::integer, p - 'title_ru', bundle_hash)
    ON CONFLICT (template_key, version) DO NOTHING;
    FOR d IN SELECT value FROM jsonb_array_elements(p->'sessions') LOOP
      INSERT INTO public.training_template_days(template_key, version, day_key, day_order, weekday, session_type, title_ru, metadata)
      VALUES (p->>'template_key', (p->>'version')::integer, d->>'day_key', (d->>'order')::integer,
        (d->>'weekday')::integer, d->>'session_type', d->>'title_ru', d - 'title_ru')
      ON CONFLICT (template_key, version, day_key) DO NOTHING;
      FOR e IN SELECT value FROM jsonb_array_elements(d->'exercises') LOOP
        INSERT INTO public.training_template_slots(template_key, version, day_key, slot_key, exercise_key, slot_order, prescription)
        VALUES (p->>'template_key', (p->>'version')::integer, d->>'day_key', e->>'slot_key', e->>'exercise_key',
          (e->>'order')::integer, e - 'exercise_key' - 'slot_key' - 'order')
        ON CONFLICT (template_key, version, slot_key) DO NOTHING;
        inserted := inserted + 1;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('content_sha256', bundle_hash, 'slots', inserted);
END $$;

CREATE OR REPLACE FUNCTION public.list_training_templates(_days_per_week integer, _experience text DEFAULT NULL)
RETURNS TABLE(template_key text, version integer, title_ru text, days_per_week integer, metadata jsonb)
LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  SELECT t.template_key, t.version, t.title_ru, t.days_per_week, t.metadata
  FROM public.training_templates t
  WHERE t.days_per_week = _days_per_week
    AND (_experience IS NULL OR _experience = ANY(ARRAY(SELECT jsonb_array_elements_text(t.metadata->'experience_levels'))))
  ORDER BY t.version DESC, t.template_key;
$$;

CREATE OR REPLACE FUNCTION public.apply_training_template(
  _application_id uuid, _template_key text, _version integer, _names text[], _daily_opt_in boolean DEFAULT false
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  uid uuid := auth.uid();
  t public.training_templates;
  d public.training_template_days;
  s public.training_template_slots;
  day_id uuid;
  day_ids jsonb := '{}'::jsonb;
  idx integer := 0;
  n text;
  template_day_count integer;
  template_slot_count integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  SELECT * INTO t FROM public.training_templates WHERE template_key = _template_key AND version = _version;
  IF NOT FOUND THEN RAISE EXCEPTION 'template not found' USING ERRCODE = '22023'; END IF;
  IF t.days_per_week = 7 AND NOT _daily_opt_in THEN RAISE EXCEPTION 'daily opt-in required' USING ERRCODE = '22023'; END IF;
  IF coalesce(array_length(_names, 1), 0) <> t.days_per_week THEN RAISE EXCEPTION 'names must match template day count' USING ERRCODE = '22023'; END IF;
  SELECT count(*) INTO template_day_count FROM public.training_template_days
    WHERE template_key = _template_key AND version = _version;
  SELECT count(*) INTO template_slot_count FROM public.training_template_slots
    WHERE template_key = _template_key AND version = _version;
  IF template_day_count <> t.days_per_week OR template_slot_count = 0 THEN
    RAISE EXCEPTION 'template data is incomplete' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.training_template_slots template_slot
    LEFT JOIN public.training_exercise_catalog catalog
      ON catalog.exercise_key = template_slot.exercise_key
    WHERE template_slot.template_key = _template_key
      AND template_slot.version = _version AND catalog.exercise_key IS NULL
  ) THEN
    RAISE EXCEPTION 'template exercise is missing from catalog' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.training_template_applications(application_id, user_id, template_key, version)
    VALUES (_application_id, uid, _template_key, _version)
    ON CONFLICT (application_id) DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.program_days WHERE user_id = uid)
     OR EXISTS (SELECT 1 FROM public.training_template_applications WHERE user_id = uid AND application_id <> _application_id) THEN
    RAISE EXCEPTION 'program already exists' USING ERRCODE = 'P0001';
  END IF;
  FOR d IN SELECT * FROM public.training_template_days WHERE template_key = _template_key AND version = _version ORDER BY day_order LOOP
    idx := idx + 1; n := left(coalesce(nullif(btrim(_names[idx]), ''), d.title_ru), 60);
    INSERT INTO public.program_days(user_id, name, position, template_application_id, template_day_key)
      VALUES (uid, n, d.day_order - 1, _application_id, d.day_key) RETURNING id INTO day_id;
    day_ids := day_ids || jsonb_build_object(d.day_key, day_id::text);
  END LOOP;
  FOR s IN SELECT * FROM public.training_template_slots WHERE template_key = _template_key AND version = _version ORDER BY slot_order LOOP
    INSERT INTO public.program_exercises(user_id, day_id, day, position, name, working_weight, target_sets, target_reps,
      template_application_id, template_slot_key, template_exercise_key, target_rir_min, target_rir_max)
    SELECT uid, (day_ids->>s.day_key)::uuid, s.day_key, s.slot_order - 1, c.name_ru, NULL,
      (s.prescription->>'working_sets')::integer,
      format('%s-%s', s.prescription->>'reps_min', s.prescription->>'reps_max'),
      _application_id, s.slot_key, s.exercise_key,
      (s.prescription->>'rir_min')::numeric, (s.prescription->>'rir_max')::numeric
    FROM public.training_exercise_catalog c WHERE c.exercise_key = s.exercise_key;
    IF NOT FOUND THEN RAISE EXCEPTION 'template exercise is missing from catalog' USING ERRCODE = '22023'; END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.upsert_training_library(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_training_library(jsonb, text) TO service_role;
REVOKE ALL ON FUNCTION public.list_training_templates(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_training_templates(integer, text) TO authenticated;
REVOKE ALL ON FUNCTION public.apply_training_template(uuid, text, integer, text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_training_template(uuid, text, integer, text[], boolean) TO authenticated;

COMMIT;
