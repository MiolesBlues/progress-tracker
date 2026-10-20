-- Read-only inventory of broad defaults that can affect API browser roles.
-- The migration runner owns application objects as postgres. Supabase-managed
-- supabase_admin defaults are reported separately and are never altered here.
SELECT
  pg_get_userbyid(d.defaclrole) AS owner,
  COALESCE(n.nspname, '<global>') AS schema_name,
  CASE d.defaclobjtype
    WHEN 'r' THEN 'table'
    WHEN 'S' THEN 'sequence'
    WHEN 'f' THEN 'function'
    ELSE d.defaclobjtype::text
  END AS object_type,
  pg_get_userbyid(a.grantor) AS grantor,
  CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS grantee,
  a.privilege_type
FROM pg_default_acl d
LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
CROSS JOIN LATERAL aclexplode(d.defaclacl) a
WHERE (
    n.nspname = 'public'
    AND a.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)
    AND (
      (d.defaclobjtype = 'r' AND a.privilege_type IN (
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
      ))
      OR (d.defaclobjtype = 'S' AND a.privilege_type IN ('USAGE', 'SELECT', 'UPDATE'))
      OR (d.defaclobjtype = 'f' AND a.privilege_type = 'EXECUTE')
    )
  )
  OR (
    d.defaclnamespace = 0
    AND d.defaclobjtype = 'f'
    AND a.grantee = 0
    AND a.privilege_type = 'EXECUTE'
  )
ORDER BY owner, schema_name, object_type, grantor, grantee, privilege_type;
