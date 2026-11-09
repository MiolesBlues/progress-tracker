# Personal program, workout history, and analytics

> Historical implementation notes. Migration/application claims below reflect the reviewed point in time and must not be treated as current hosted database status. See the current [database release contract](DATABASE-RELEASE-CONTRACT.md) and verify hosted state separately.

## Program and workout relationships

`program_days.id` is a user-day UUID owned through `user_id`. A user may have one to seven active days; each day has a name up to 60 characters, an order (`position`), and an archive timestamp (`archived_at`). Signup does not create a program. `setup_program(_names, _template?)` atomically creates selected days; `upper_lower` is an optional template.

`program_exercises.day_id` references a day owned by the same user. An exercise has a name up to 100 characters, order, working weight, target sets/repetitions, sample repetitions, and archive state. Moving it changes only the current program. A legacy text `day` column, if present, is unused by the client. `NULL day_id` is displayed separately and can be assigned only through an explicit user action; no automatic backfill was added.

The program editor does not show or require working weight; the model retains the field for older programs and auto-fill fallback. The selected active program day is stored per user. Archive management is separate. The workout log groups exercises without an assigned day, including archived exercises, and displays 20 entries at a time without limiting server history loading.

`workout_entries` stores operation/entry UUID, owner, exercise UUID, `performed_on` date, creation timestamp, weight, repetitions array, RIR/notes, and historical `day_id/day_name` snapshot. New entries are allowed only for active exercises and their active day. Server logic verifies owner and day/exercise relationship and sets the name snapshot. Later rename/archive/move operations do not change history. RESTRICT and composite foreign keys protect the relationship. At the time documented, migration `20261015202500_archived_object_deletion.sql` added restricted RPCs for archived objects: deleting a day nulled `day_id` while retaining exercises and `day_name`; deleting an exercise deleted only its entries. Until that migration was separately applied to the selected database, delete buttons were unavailable.

Saving through SECURITY INVOKER `save_workout_entry` uses a UUID created before the first request and stored with the local draft. Repeating the same payload returns the original ID; reusing that ID with a different payload is rejected. A saved operation can be retried after archiving. A deliberate new result uses a new ID. There is no unique constraint on `(exercise_id, performed_on)`.

## Input constraints

Weight is required: 0–2000 kg with up to two decimal places; an empty string is not zero. Repetitions are an array of 1–20 non-empty sets, each an integer from 0 to 2147483647. A string such as `8-8-7-6` in one field is rejected with an explanation; values are entered in four separate fields. RIR is optional, 0–10 with one decimal place; notes are limited to 1,000 characters. Decimal commas are supported for weight/RIR. SQL CHECK constraints validate array dimensions, lower bound, count, and absence of NULL/negative values.

## History and analytics

Workout entries keep both day ID and day-name snapshot. Day archive/deletion preserves historical naming; moving an exercise affects only current program membership. History is per exercise and date, not a single container for a full training day.

Analytics compare the selected entry with the prior session and separately with the prior calendar week. Repetitions and volume are aggregated. The device's current date does not choose the comparison for a selected record.

The selected exercise history is loaded in pages of 250 with exact count and ordering. If the server returns fewer rows, the next offset advances by the number received. Programs and archives are also paginated. Partial data is not cached: errors, count changes, duplicate IDs, missing count, or the 100,000-row guard stop calculations and offer Retry. History UI displays 20 rows for the selected period; comparison selection uses the full loaded history.

Offset pagination is not a transactional snapshot: a concurrent edit that leaves the count unchanged can go unnoticed. Large histories or frequent concurrent edits need a server snapshot/RPC. If a change is detected, reload; warnings do not provide that future guarantee.

## Migrations and operations

Migrations 0000–0004 respectively define the initial schema/RLS, program fields and history preservation, personal days/no signup seed, day/order management and locks, and strict CHECK constraints, day snapshots, and idempotent saves. The journal also lists `20261015112617_revoke_workout_truncate`, `20261015144732_guard_new_exercise_day`, and `20261015144758_restrict_workout_table_grants`. A read-only V3 review on 16 October reported them applied to the then-active Supabase project under remote timestamps `20261015162555`, `20261015162607`, and `20261015162616`; do not repeat them on that basis. The archived-object deletion migration was then local and required separate staging acceptance.

Installed B12 checked that an exercise INSERT with non-NULL `day_id` referenced an active day owned by the same user, under an owner lock shared with day archiving. Existing NULL relationships and UPDATEs of archived exercises were not converted. B09 narrowed grants on three tables to SELECT/INSERT/UPDATE for `authenticated`; PUBLIC/anon and excess privileges were removed, while this migration did not change `service_role`/RLS. Creator-wide default privileges required separate review. The historical staging plan is [STAGING-V3.md](STAGING-V3.md).

Before an approved migration, create a backup; run `scripts/program-preflight.sql` and `scripts/workout-preflight.sql` in read-only transactions with suitable owner visibility; preserve results without publishing personal data; and decide separately how to handle NULL relationships and violations. `NOT VALID` constraints from 0004 protect new/updated rows but do not repair old rows. Do not validate, delete, backfill, or replay old migrations without review and authorization.

Check migrations 0000–0004 on an isolated copy. The runner must honor the journal and transactions, timeouts/locks, and apply only missing files in order. Empty declarative Drizzle schema/snapshots are not suitable for `push` or automatic generation. Then staging acceptance should test real JWTs for two users, grants/RLS, retries, concurrency, and backup restoration. Local PGlite tests with synthetic `auth.uid()` do not replace that verification.
