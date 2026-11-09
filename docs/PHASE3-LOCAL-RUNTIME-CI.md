# Phase 3 — Local runtime and CI (historical report)

This report describes the `phase3/runtime-ci-acceptance` work and its recorded setup. It is not current release status.

The branch added a production-artifact check before browser regression. CI built the app, scanned the public bundle, ran `bun run smoke:runtime`, then ran Chromium/WebKit E2E. Pushes to `phase3/**` also ran the quality workflow. The job limit was increased to 30 minutes to avoid the previous 20-minute timeout during the full browser suite.

After `bun run build`, `bun run preview` locally ran the Cloudflare Worker output through pinned Wrangler. `bun run smoke:runtime` started that local runtime and checked HTML for `/` and `/auth` plus the web manifest. The smoke process used test `.invalid` Supabase URLs and an empty service-role key; it did not contact hosted Supabase.

The Cloudflare compatibility date was pinned to `2026-10-19`, the last date supported by the Wrangler 4.151.1 version used in that review. Updating it was coupled to updating Wrangler after local workerd verification.

This check did not verify GitHub-hosted Actions, JWT/RLS behavior, staging, or production. Hosted acceptance remained blocked pending verified credentials and separate authorization.
