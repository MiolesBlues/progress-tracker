# Phase 4 — Product hardening and data lifecycle (historical report)

This report records Phase 4 decisions and implementation findings. It is not a current hosted-system status report.

## PT-14: Account deletion

The reviewed personal tables were `program_days`, `program_exercises`, `workout_entries`, `workout_entry_sets`, `workout_entry_operations`, `workout_entry_operation_tombstones`, `workout_entry_set_tombstones`, and `training_template_applications`. Days were archived; exercise deletion used a separately confirmed archive-only RPC; workout entries were protected by restrictive foreign keys. Sets belonged to an owner and entry and were deleted with the entry/exercise. Operation ledgers and tombstones had `auth.users` cascade relationships. Template applications were per-user metadata.

`training_exercise_catalog`, `training_templates`, `training_template_days`, and `training_template_slots` were shared published catalog data and must not be removed with one account. Some legacy personal tables lacked an `auth.users` foreign key, so deleting the Auth user alone did not guarantee removal of every record. A read-only relationship check existed in [`account-data-preflight.sql`](../scripts/account-data-preflight.sql).

A proposed safe default was to require explicit confirmation, then delete all personal and technical/backup records in one transaction without promising recovery. The operation would check ownership and orphan state first. Workout entries (and their sets), exercises, days, applications, and operation/set tombstones would be removed for that account; the shared template catalog would remain. Existing archive RPCs would remain separate actions with their own confirmation.

The product owner had not approved this default. Phase 4 added no account-deletion RPC, Auth-delete hook, UI, migration, or hosted operation. Before implementation, the product must decide whether workout history is deleted, backup retention, and treatment of rows left in legacy tables after an Auth account is removed. Local PGlite lifecycle tests are appropriate only after approval of the exact contract.

## PT-12: Leaked password protection

Read-only Supabase information available to the review indicated that production `ProgressTracker` and the staging project were on the Free plan; the MCP project view did not expose the Auth leaked-password setting. Supabase's [Password Security documentation](https://supabase.com/docs/guides/auth/password-security) stated that the setting was in Auth settings and available on Pro and above. The review therefore recorded it as plan-blocked and made no Auth changes. After separate plan/access approval, the owner should enable **Auth → Password Security → Prevent the use of leaked passwords** and confirm it in project settings. `authMessage` was prepared to handle compromised/leaked-password errors. Hosted Auth behavior and a real rejected-password test were not verified.

## PT-19: Product guidance

The signup trigger was removed by migration `0002`; users create a program in onboarding, and the Upper/Lower template is optional. Archiving and separately confirmed permanent deletion are distinct actions. Archiving a day preserves history; permanently deleting an exercise deletes that exercise's history. Production migrations require the release contract and separate authorization. Local SQL does not prove that the hosted schema is updated.
