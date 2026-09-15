# Business Logic Audit

Date: 2026-09-15. Branch: `codex/windows-desktop`.
Baseline: `002b9e1`, the native Windows browser launcher implementation.

## Scope And Method

Exercised gift allocation and sending, limited-time inventory, collection over
WebSocket, Yuba sign-in, account-scoped caches, asynchronous config reconciliation,
configuration HTTP routes, and scheduled/manual inventory coordination.
Tests use synthetic credentials and mocked Douyu HTTP/WebSocket responses. Route
tests run a real local Express server; allocation tests execute the shared
production code and gift job chain. No real account login or gift mutation was
performed.

## Confirmed Defects And Fixes

| Area | Reproduction / impact | Corrected behavior |
| --- | --- | --- |
| Gift response loss | Room A may accept a gift before its response times out. Carrying that quantity to room B can send it twice. | Stop on an uncertain send result. Only a definite business rejection or a failed pre-send room lookup allows carry-over. |
| Gift success validation | Missing status, malformed numeric fields, or `code: 200` masking `status_code: 500` could be accepted. An early error could also mask another malformed field. | Validate all supplied status fields before classifying the result. Missing/malformed status is uncertain, explicit failure rejects, and success requires a valid status. |
| Weighted allocation | Fewer gifts than positive-weight rooms could leave a room with zero or produce invalid quantities while trying to reserve one per room. | Reject insufficient inventory. For a sufficient budget, every positive-weight room receives at least one and the total matches the budget. Zero-weight rooms remain zero. |
| Invalid inventory / plan | Negative, fractional, non-finite or unsafe counts and malformed destination IDs could enter allocation or sending. | Validate inventory and the complete send plan before any remote mutation. Reject invalid room IDs and fixed counts at config save. |
| Expired backpack rows | Already expired or malformed rows were included in the expiring-gift / limited-time double-card budget. | Exclude expired rows, invalid gift IDs/counts and invalid expiry times. Earliest expiry ignores expired rows. |
| Collection authentication | Substring matching accepted `roomgroup=10` as `roomgroup=1`. Duplicate login frames or early completion could trigger incorrect state changes. | Match the parsed group exactly, enter once, require successful login/entry before completion, and ignore frames after settlement. |
| Yuba result parsing | Explicit API failure could be overridden by empty/success-like text and object data. | Failure codes take precedence over success heuristics. |
| Yuba pacing | A closed/deleted group bypassed the delay before the next group. | Retain normal pacing after skipped groups. |
| Yuba task outcome | Some failed or prematurely stopped sign-ins still resolved as a successful task. | Propagate an incomplete-task summary to the caller without triggering whole-task credential replay. |
| Account cache isolation | A failed switch to B could relabel A's cached fans. A -> B -> A requests could let old A overwrite the latest A. Full status/pending work could be reused across accounts. | Invalidate account-dependent generations and scope fans status/pending work to the requested cookie. Old completions cannot repopulate the current cache. |
| Concurrent config writes | A slow fans sync could overwrite credentials or settings saved while it awaited the remote list. | Reject stale explicit saves or credential/source changes. Background sync preserves newer same-account settings. |
| Queued account changes | A queued inventory task captured old room settings but later resolved the newly selected account's cookie. | Compare credentials before and after waiting for the inventory lock; cancel on change. |
| Legacy cookie updates | Saving the supported top-level `cookie` alias updated state without running credential lifecycle hooks. | Apply the same credential/cache/scheduler lifecycle as canonical login-cookie updates. |
| Malformed config requests | Invalid objects, arrays and credential types could normalize into defaults or empty strings, damaging saved settings. CookieCloud validation also skipped false-like inputs. | Reject invalid payloads before persistence with HTTP 400, including non-string CookieCloud address/UUID/password values. |

## Regression Evidence

- `test/business-gifts.test.js`: uncertain outcomes; complete status-envelope
  validation; allocation budget invariants; invalid plans; expired inventory;
  real gift API -> send loop -> replay guard integration; expiring/double-card jobs.
- `test/business-collect-yuba.test.js`: collection protocol ordering, exact auth
  group matching, Yuba failure precedence, pacing, and incomplete-task outcomes.
- `test/business-config-state.test.js`: account switching, overlapping responses,
  stale writes, same-account settings preservation, config validation and legacy
  credential lifecycle.
- `test/scheduler-safety.test.js`: queued credential changes, shared FIFO locks,
  failure release, cron reload and shutdown waiting.
- `test/server-route-guardrails-contract.test.js`: actual HTTP validation before
  persistence, authentication, response envelopes and config secret boundaries.
- Existing gift, Passport, CookieCloud, cache refresh, WebUI, shutdown and
  architecture tests remain enabled. The two API sorting tests use the shared
  TypeScript loader so relative production dependencies resolve correctly.

The full suite passed 87/87 cases (24 more than the launcher baseline), with
ESLint and all three TypeScript checks passing. `npm run dist:win` rebuilt the
WebUI, backend, native launcher, x64 ZIP and NSIS installer.
The rebuilt package passed `npm run test:windows`: eight browser pages, config
persistence, native lifecycle, installer/uninstaller running guards, spaced
installation paths, config retention and early shutdown.

## Limits And Operational Changes

- Live Douyu authentication, actual inventory changes, daily rewards, rate limits
  and anti-abuse challenges remain unverified without a real account session.
- HTTP 200 alone is not gift success. An unrecognized envelope now stops the
  task and requires checking inventory before a manual retry.
- Credential refresh for the same account also cancels already queued inventory
  tasks conservatively. Trigger them again after the refresh completes.
- Daily intimacy-cap-aware allocation remains deferred. Existing gift API
  semantics still operate at gift ID/count granularity, not selectable backpack
  batches.
- Optional Yuba fast-sign failure still falls back to per-group sign-in;
  supplementary-sign failures are logged separately. The incomplete-task check
  covers the main per-group sign-in result, not a new guarantee for every optional
  reward action.
- Backend cache isolation does not retract a response already delivered to its
  original caller. The current cache rejects stale population; browser account
  switching still depends on its existing request invalidation logic.
