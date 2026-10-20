-- Normalize the hosted training-library ACL drift without changing its data.
-- Keep this forward-only: existing migrations and rows remain untouched.
BEGIN;

-- Supabase's current postgres-owned public defaults grant browser roles every
-- table privilege. Stop carrying that grant to future public tables.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
-- PostgreSQL's built-in default is PUBLIC EXECUTE; a schema-scoped REVOKE
-- cannot subtract a global default, so revoke that default at role scope too.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

REVOKE ALL ON TABLE public.training_exercise_catalog,
  public.training_templates,
  public.training_template_days,
  public.training_template_slots,
  public.training_template_applications
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.training_exercise_catalog,
  public.training_templates,
  public.training_template_days,
  public.training_template_slots
TO authenticated;
GRANT SELECT ON TABLE public.training_template_applications TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_training_library(jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_training_library(jsonb, text) TO service_role;

REVOKE ALL ON FUNCTION public.list_training_templates(integer, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_training_templates(integer, text) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_training_template(uuid, text, integer, text[], boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_training_template(uuid, text, integer, text[], boolean)
  TO authenticated;

COMMIT;
