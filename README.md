# ADMD KI-Team HQ

## Existing dashboard
- `index.html` opens the Three.js `hq.html` dashboard in live mode.
- The URL supplies the Supabase `hq_feed()` RPC and a public publishable key.
- The browser polls every 5 seconds. Feed rows are visualised locally.
- The dashboard's SENDEN/FERTIG buttons, window.ADMD_HQ API, and postMessage interface only change browser memory. They do not submit or complete database jobs.
- Local animations can display "laeuft" before any server worker has claimed a job. They are not execution evidence.
- Historical completed rows are skipped by the browser; its completed counter is not a database total.
- No worker, model integration, auth flow, deployment workflow, Edge Function, or trigger was found in this repository. This does not rule out an external service.

## Server-only orchestration increment (2026-11-10)
Applied to project `aymwwomlvjtcikqzdeqz` as migration `hq_server_only_orchestration`.
`orchestration.sql` records the exact applied SQL (do not rerun on the same database).
Existing HTML, feed implementation, read grants, task status constraint, and status default are unchanged.

New SECURITY INVOKER RPCs are executable only by service_role (and the database owner):
- `hq_enqueue(p_id, p_bot, p_text)`: explicitly creates an `offen` task. Repeat the same ID/input to safely retry; differing input is rejected.
- `hq_claim(p_bot)`: atomically claims one oldest open task for that bot using FOR UPDATE SKIP LOCKED, sets `laeuft`, and returns an opaque token.
- `hq_finish(p_id, p_claim_token, p_result)`: completes only the matching claim. Identical completion retries are safe; changed results and wrong tokens are rejected.

The token and claim timestamp are not included in hq_feed(). No new public write grants or RLS policies were added. The server key must never be placed in HTML, query strings, browser storage, or git.

## Worker
Requires Node 22+; no packages to install.
`node --test worker/worker.test.mjs`
Run a single job with `node worker/worker.mjs` after configuring server environment:
- SUPABASE_URL: https://aymwwomlvjtcikqzdeqz.supabase.co
- SUPABASE_SERVER_KEY: secret/service-role server credential, provisioned outside git
- HQ_BOT: one of pixel, forge, guard, critic, planner, finance, spark, leno
- HQ_HANDLER_MODULE: absolute path to a trusted local ES module exporting `handlers`, a map of bot names to async functions

Handler contract: `async ({ id, bot, text }) => nonemptyResultString`.
No handler is supplied intentionally: bot names alone do not configure real agents. Each handler must implement its own model/provider, permissions, timeouts and restrictions on external actions. Task text and generated output are untrusted data. The handler receives no claim token or database client; it still runs in the worker process, so only trusted code may be installed.

The runner validates the configured handler before claiming. It runs once and exits; scheduling and hosting are not configured. Failed or interrupted jobs remain `laeuft` for operator review, never falsely completed. There is deliberately no automatic reclaim/retry of execution, because a timeout may follow an external side effect. This gives at-most-one claim through this API, not a guarantee of exactly-once external actions.

Recovery: an operator must first establish that the original worker has stopped and reconcile external effects. Only then, in a database transaction, reset the affected task to `offen` and clear `hq_claim_token` and `hq_claimed_at`. Never blindly reset all running tasks. A lost completion response may be reconciled by checking the stored result; do not rerun the handler automatically.

## Checks performed
- Rollback-only live SQL test as service_role: enqueue retries, input conflict, duplicate claim, wrong token, completion, identical completion retry, result overwrite rejection.
- All temporary test rows rolled back; original two completed rows retained.
- Seven Node tests cover routing, credential placement, unconfigured handlers, idle state, handler failure/invalid output, rejected completion and wrong bot.
- Public-role execution denials and the existing public feed are verified separately.
- Security advisors introduce no new findings; the pre-existing feed SECURITY DEFINER warnings remain.
- Browser rendering and real model execution were not tested.

## Remaining integration work / security
The current public feed exposes task text/results to anyone with the public dashboard URL. Retain compatibility until a real owner login and authorised read endpoint replace it. Do not put private customer data or credentials in tasks/results meanwhile. See [Supabase function privileges](https://supabase.com/docs/guides/database/functions) and [public definer advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

Before connecting SENDEN to a write endpoint, establish an owner identity/allowlist and validate it server-side. Signing up as any authenticated user must not grant HQ control. Add the authorised enqueue endpoint, provision a real bot handler and server credentials, choose worker hosting, and then test the full dashboard-to-agent round trip. These prerequisites are not currently configured.
