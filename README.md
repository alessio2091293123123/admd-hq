# ADMD KI-Team HQ

The existing Three.js dashboard now has a real authenticated dispatch path:
`HQ login → hq-dispatch Edge Function → private Supabase task → role-specific OpenAI response → saved result → HQ polling`.

## Deployment state
- Supabase project: `aymwwomlvjtcikqzdeqz`.
- Applied migrations: `hq_server_only_orchestration` and `hq_private_owner_dispatch`.
- `orchestration.sql` and `dispatch.sql` record the exact already-applied SQL. Do not reapply them to this project.
- `hq-dispatch` is deployed. Set `OPENAI_API_KEY` as an Edge Function secret before enabling dispatch. Until configured, the authenticated API reports `ready:false` and POST rejects before creating a task.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` use Supabase's built-in Edge Function environment. No server credential is shipped to the browser or stored in this repository.
- Default model: `gpt-4.1-mini-2025-04-14`; `OPENAI_MODEL` can override it server-side. Each task uses at most 2400 output tokens and a 90-second model timeout.
- Real OpenAI execution and the signed-in browser round trip have not yet been verified. The local API connection test was blocked by the execution environment's network policy. Windows browser automation was stopped because the current Chrome URL could not be verified. An alternative in-app Supabase session lacked project access.

## Using HQ
Open `index.html` through its hosted site. Choose **+ AUFTRAG**, sign in with the owner's existing Supabase Auth email/password, select an agent, enter a task and press **SENDEN**. Results appear in **AUFTRÄGE & ERGEBNISSE** and can be expanded/copied. The owner has confirmed the existing Auth account; server authorization is pinned to that verified user UUID, not editable user metadata or any authenticated account.

Sessions are kept in sessionStorage for the current browser tab; passwords are not saved. Signing out clears private results immediately and ignores late responses. Private server jobs continue after the browser is closed, subject to Edge Function runtime limits.

The eight agents provide real OpenAI-generated text/code/reviews according to server-owned roles: Pixel, Forge, Guard, Critic, Planner, Finance, Spark and Leno. They have no external tools in this release: they cannot publish sites, edit remote repositories, send messages or perform live browser checks. Their instructions require them to disclose these limits and return useful drafts/code rather than fabricated action receipts. **DEMO** remains a separate local simulation.

## Security and compatibility
- `verify_jwt=false` is deliberate: the handler permits CORS preflight and performs its own authentication on every GET/POST through Supabase Auth `/auth/v1/user`, then checks the exact owner UUID, email confirmation and non-anonymous status.
- CORS accepts only the existing GitHub Pages origin and explicit local development origins. CORS is not the authorization boundary.
- All write/detail RPCs are SECURITY INVOKER and service-role-only. No anon/authenticated execute permissions or table policies were added.
- The existing `hq_feed()` signature and anon/authenticated grants are preserved. Its two historical public rows remain available. Newly submitted rows are atomically marked private in the same transaction and are excluded from this public feed, including their completed results.
- The owner-only detail endpoint omits claim tokens. The browser uses textContent for server content; generated code is displayed as text, never executed.
- Stable client request IDs, serialized enqueue rate checks, atomic task-specific claims and token-checked completion prevent duplicate API submissions from re-executing a claimed task.
- Limits: 3 active tasks and 30 submissions per rolling 24 hours. Unknown bots, oversized inputs, id conflicts, wrong completion tokens and incomplete model responses are rejected.
- Failed runs retain status `laeuft` with `hq_error` set; the UI displays **Fehlgeschlagen**. This preserves the original status constraint. Failure never counts as successful completion.
- Interrupted jobs are not automatically reclaimed. After 3 minutes without completion the UI asks for operator review. This is bounded background execution, not a durable queue with automatic retries.
- The pre-existing public SECURITY DEFINER feed advisory remains intentional for historical compatibility; new private jobs are filtered. Other pre-existing advisor notices include no RLS policy on the locked-down table and disabled leaked-password protection. [Function advisory](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

## Source
- `hq.html`: original 3D scene plus login/task panel. Live animation follows server state and cannot mark tasks completed. The local ADMD_HQ commands and same-origin postMessage interface apply only in demo mode.
- `hq-client.mjs`: auth, private polling, duplicate-safe submission, public viewer fallback and safe result rendering. It starts separately from WebGL so the form can still work if the scene fails to load.
- `supabase/functions/hq-dispatch/index.ts`: deployed Deno entrypoint.
- `supabase/functions/hq-dispatch/handler.mjs`: authentication, role routing, limits, background dispatch and results.
- `worker/`: optional original one-job Node worker with a trusted handler contract. The hosted Edge Function is the dashboard execution path; no separate local worker is required.
- `supabase-setup.sql`: historical initial setup only; rerunning it would overwrite the newer privacy-aware feed.

## Validation
Run on Node 22+ with no dependencies:
```text
node --test hq-client.test.mjs worker/worker.test.mjs supabase/functions/hq-dispatch/handler.test.mjs
```
20 tests pass. Client tests use a minimal DOM/event harness, not a real browser: they cover anonymous denial, missing-key gating, stable retry IDs and discarded late private responses after logout. Handler tests cover owner authorization, CORS, missing keys, input checks, role routing, duplicate claims, provider failures and incomplete output. Original worker tests also pass.

Live rollback-only service_role SQL checks passed for enqueue/claim/finish, wrong tokens, private-row exclusion from the public feed and recorded failures without token leakage. The two original completed rows remain. JavaScript syntax and duplicate HTML IDs were checked. Local browser preview was unreachable from the in-app browser; no visual or signed-in browser QA is claimed.

## Recovery
Never automatically replay a running or failed job. First establish that its worker stopped and reconcile any stored response. An operator may then reset a specific job to `offen`, clearing `hq_claim_token`, `hq_claimed_at` and `hq_error`, and explicitly resubmit its original id/input. Avoid bulk resets.

A lost finish response may follow a successful save; inspect the stored result before retrying execution. Secrets must be configured only through a protected server-secret channel; never insert them into HTML, SQL source, git, task text, browser storage or URLs.


