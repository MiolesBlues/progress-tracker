-- Read-only metadata only. Run before approval and again after applying the B09 migration.
BEGIN READ ONLY;

SELECT c.relname AS table_name,
  CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
  a.privilege_type
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(c.relacl) a
WHERE n.nspname = 'public'
  AND c.relname IN ('program_days', 'program_exercises', 'workout_entries')
ORDER BY table_name, grantee, privilege_type;

SELECT r.rolname, t.name AS table_name,
  has_table_privilege(r.oid, format('public.%I', t.name), 'TRUNCATE') AS can_truncate
FROM pg_roles r
CROSS JOIN (VALUES ('program_days'), ('program_exercises'), ('workout_entries')) t(name)
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY r.rolname, t.name;

SELECT pg_get_userbyid(m.member) AS member, pg_get_userbyid(m.roleid) AS parent
FROM pg_auth_members m
WHERE pg_get_userbyid(m.member) IN ('anon', 'authenticated');

-- Future tables can receive broad grants independently of existing-table ACLs.
SELECT pg_get_userbyid(d.defaclrole) AS owner, n.nspname AS schema_name,
  d.defaclobjtype AS object_type, d.defaclacl
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
WHERE n.nspname = 'public' OR d.defaclnamespace = 0;

COMMIT;
