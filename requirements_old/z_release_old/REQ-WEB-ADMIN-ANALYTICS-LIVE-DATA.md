---
id: REQ-WEB-ADMIN-ANALYTICS-LIVE-DATA
title: Replace admin analytics placeholder with live read-only analytics data
status: released
implementation_scope: frontend
source: user-2026-02-11-admin-area-and-legacy-review
---

# Summary
Replace static placeholder content on the admin analytics screen with live, read-only analytics data from the existing admin analytics adapter contract.

# Scope
- Frontend-only implementation in `web/` for admin analytics screen behavior.
- Route `/{locale}/app/admin/analytics` and analytics page component rendering.
- Adapter-backed analytics loading via `apiAdapters.admin.fetchAnalytics`.
- Read-only KPI and trend presentation based on available payload fields.

# Acceptance Criteria
- Analytics values are fetched from live adapter data and static placeholder metrics are removed.
- Screen remains read-only and does not introduce create/update/delete controls on analytics route.
- KPI and trend/early-warning sections render from available analytics payload fields with deterministic field mapping.
- If a trend/list section is present, item ordering is deterministic and date/time values are formatted consistently.
- UI explicitly handles `loading`, `empty`, `error`, and ready states for analytics load flow.
- Unauthorized or expired-session responses follow localized auth-guard redirect behavior for protected routes.
- Productive user-facing copy remains message-driven/localized with no hardcoded production strings.

# Definition of Done
- `web/src/components/admin/admin-analytics-page.tsx` is API-backed through admin adapter methods only and stays read-only.
- Rendering handles partial or missing payload fields without runtime failure and surfaces explicit safe empty/error states.
- QA evidence includes one happy path, one empty-or-partial payload path, and one error/unauthorized path.
- Route behavior remains locale-prefixed and admin-guard compliant.

# Assumptions
- `GET /admin/analytics` remains available as documented and is sufficient for phase-1 analytics UI needs.
- Analytics payload shape may evolve; UI maps known keys deterministically and tolerates absent optional keys.
- No new analytics backend aggregation logic is required in this requirement.

# Constraints
- Keep analytics under admin route space and boundary rules (`/{locale}/app/admin...`) without cross-role shortcuts.
- Keep analytics module read-only as defined in admin governance flow.
- Use adapter-layer API integration and centralized error mapping; no direct domain `fetch` in screen logic.
- Keep frontend delivery in `web/` as active track; no rebuild feature work in `web_legacy/`.
- Keep locale-prefixed routing behavior unchanged (`/de/...`, `/en/...`).

# Out of Scope
- New analytics endpoint design or backend aggregation changes.
- Export/report generation features.
- Changes to admin accounts, admin mail, or contract-template modules.
- Auth/session architecture redesign beyond existing guard behavior.

# References
- `docs/web-admin-governance-flow.md`
- `docs/api-reference.md`
- `docs/web-api-adapter-contract.md`
- `docs/web-auth-flows.md`
- `docs/web-governance.md`
- `docs/web-quality-test-program.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for architecture handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because required analytics endpoint and adapter contract are already documented.
- Decision: Scope is constrained to read-only live analytics rendering and state handling, without backend or feature-scope expansion.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-WEB-ADMIN-ANALYTICS-LIVE-DATA.md`, `/home/sebas/git/agents/requirements/arch/REQ-WEB-ADMIN-ANALYTICS-LIVE-DATA.md`

# Architecture Notes
- Keep analytics in admin route space only at `/{locale}/app/admin/analytics` with existing admin-session guards unchanged.
- Keep module strictly read-only: no write/mutate controls are introduced on the analytics screen.
- Use admin adapter contract only (`apiAdapters.admin.fetchAnalytics`) and centralized API error classification; no direct screen-level `fetch`.
- Map analytics payload keys deterministically and tolerate partial payloads with explicit safe `empty`/`error` states.
- Preserve locale-prefixed routing, message-driven copy, and deterministic ordering/formatting for any date-based trend lists.

# Dev Plan
1. Replace static analytics placeholders in `web/src/components/admin/admin-analytics-page.tsx` with adapter-backed load flow.
2. Implement deterministic KPI mapping from analytics payload keys to visible metric blocks.
3. Implement trend/timeline section rendering with explicit ordering and consistent date/time formatting.
4. Add explicit UI states for `loading`, `ready`, `empty`, and `error`, including retry behavior for recoverable failures.
5. Verify unauthorized/session-expired handling follows existing admin guard redirect behavior to localized login.
6. Capture QA evidence for happy path, partial/empty payload path, and unauthorized/error path.

# Architecture Results
- Decision: Requirement is architecture-ready and aligns with admin governance, adapter contract rules, and auth/session guard behavior.
- Decision: `implementation_scope: frontend` remains correct because `GET /admin/analytics` and admin adapter coverage are already documented.
- Decision: Added architecture guardrails for deterministic payload mapping and explicit partial-payload tolerance.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-WEB-ADMIN-ANALYTICS-LIVE-DATA.md` -> `/home/sebas/git/agents/requirements/dev/REQ-WEB-ADMIN-ANALYTICS-LIVE-DATA.md`

# Dev Results
- Replaced static admin analytics placeholders with adapter-backed live loading in `web/src/components/admin/admin-analytics-page.tsx` using `apiAdapters.admin.fetchAnalytics`.
- Kept module read-only: no create/update/delete analytics controls were introduced on `/{locale}/app/admin/analytics`.
- Implemented deterministic KPI mapping from payload keys:
- `accounts.total` and `accounts.createdToday.*` aggregation,
- `offers.total` / `offers.createdToday`,
- `shifts.upcoming` / `shifts.past`,
- `requests.offerRequests.pending` / `requests.offerRequests.total`.
- Implemented deterministic trend mapping for last-7-day sections from payload arrays:
- `accounts.createdLast7Days`,
- `offers.createdLast7Days`,
- `shifts.createdLast7Days`,
- with stable date ordering and locale-aware date/count formatting.
- Added explicit UI states for `loading`, `empty`, `error`, and `ready`, including retry for recoverable failures.
- Added unauthorized handling consistent with auth guard behavior by redirecting via `clearSessionAndRedirectToLogin` when analytics fetch returns `unauthorized`.
- Hardened payload tolerance by adding typed optional analytics DTO structure in admin adapter and runtime-safe parsing for partial/missing fields.
- Added localized message keys for analytics live-state copy and KPI/trend labels in `de` and `en`.
- Verification:
- `npm --prefix web run lint` passed.
- `npm --prefix web run build` passed (pre-existing non-blocking `MISSING_MESSAGE` logs for unrelated EN namespaces still appear during static generation).
- Changes: `/home/sebas/git/shift-matching/web/src/components/admin/admin-analytics-page.tsx`, `/home/sebas/git/shift-matching/web/src/lib/api/adapters/admin.ts`, `/home/sebas/git/shift-matching/web/messages/de.json`, `/home/sebas/git/shift-matching/web/messages/en.json`, `/home/sebas/git/agents/requirements/qa/REQ-WEB-ADMIN-ANALYTICS-LIVE-DATA.md`

# QA Results
- Decision: pass.
- Validation:
- Analytics page is adapter-backed (`apiAdapters.admin.fetchAnalytics`) and static placeholder metrics are removed in `web/src/components/admin/admin-analytics-page.tsx`.
- Screen remains read-only with no create/update/delete controls on `/{locale}/app/admin/analytics`.
- KPI mapping is deterministic for documented payload keys (`accounts`, `offers`, `shifts`, `requests.offerRequests`) and trend rows are deterministically ordered by date.
- Trend/date/count rendering uses locale-aware, consistent formatting via `Intl.DateTimeFormat` and `Intl.NumberFormat`.
- UI state handling is explicit for `loading`, `empty`, `error`, and `ready`, with retry on retryable errors.
- Unauthorized/session-expired handling routes through `clearSessionAndRedirectToLogin` for localized auth redirect behavior.
- Productive copy remains message-driven/localized with `app.adminAnalytics.*` namespaces in both `de` and `en`.
- Mandatory checks:
- `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
- `npm --prefix /home/sebas/git/shift-matching/web run build` passed (pre-existing non-blocking EN `MISSING_MESSAGE` logs in unrelated namespaces remain).
- `npm --prefix /home/sebas/git/shift-matching/app run build` passed.
- `npm --prefix /home/sebas/git/shift-matching/app run test` passed (`248` passed, `0` failed).
- QA evidence:
- Happy path: successful `fetchAnalytics` maps payload into KPI + trend sections and renders `ready` state.
- Empty/partial path: missing/partial payload safely maps through runtime guards (`asRecord`, `readNumber`, `readDailySeries`) and renders explicit `empty`/missing-value states without runtime failure.
- Error/unauthorized path: `unauthorized` result clears session and redirects localized login; retryable non-auth failures render explicit error state with retry control.
- Changes: `/home/sebas/git/agents/requirements/sec/REQ-WEB-ADMIN-ANALYTICS-LIVE-DATA.md`

# Security Results
- Decision: pass.
- Validation:
- Reviewed requirement-scoped analytics access paths in `web/src/components/admin/admin-analytics-page.tsx`, `web/src/lib/api/adapters/admin.ts`, `app/src/admin/admin-analytics.controller.ts`, `app/src/admin/admin-analytics.service.ts`, and `app/src/admin/admin.guard.ts` against `docs/web-admin-governance-flow.md`, `docs/web-auth-flows.md`, and `docs/web-api-adapter-contract.md`.
- Fixed an authorization hardening gap affecting admin analytics access: `AdminGuard` now rejects tokens missing/invalid `sub` and only sets `request.adminId` from a non-empty trimmed subject, aligning admin guard behavior with other role guards.
- Added regression tests for `AdminGuard` accept/reject paths (`sub` present, `sub` missing, role mismatch) to prevent reintroduction.
- Mandatory checks:
- `npm --prefix /home/sebas/git/shift-matching/app run test` passed (`252` passed, `0` failed).
- `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
- `npm --prefix /home/sebas/git/shift-matching/web run build` passed (pre-existing non-blocking EN `MISSING_MESSAGE` logs remain outside this requirement scope).
- Changes: `/home/sebas/git/shift-matching/app/src/admin/admin.guard.ts`, `/home/sebas/git/shift-matching/app/src/admin/admin.guard.test.ts`, `/home/sebas/git/agents/requirements/sec/REQ-WEB-ADMIN-ANALYTICS-LIVE-DATA.md` -> `/home/sebas/git/agents/requirements/ux/REQ-WEB-ADMIN-ANALYTICS-LIVE-DATA.md`

# UX Results
- Decision: pass.
- Validation:
- Reviewed analytics screen UX/copy in `web/src/components/admin/admin-analytics-page.tsx` against `docs/web-admin-governance-flow.md`, `docs/web-design-system.md`, `docs/web-governance.md`, and `docs/glossary.md`.
- Fixed requirement-scoped DE copy compliance by removing mixed-language UI terms in the admin analytics namespace (`badge`, heading description, and guardrail labels/text), keeping behavior and message-key wiring unchanged.
- Confirmed read-only behavior, deterministic KPI/trend rendering, and explicit `loading`/`empty`/`error`/`ready` states remain intact.
- Re-validated with `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass).
- Changes: `/home/sebas/git/shift-matching/web/messages/de.json`, `/home/sebas/git/agents/requirements/ux/REQ-WEB-ADMIN-ANALYTICS-LIVE-DATA.md` -> `/home/sebas/git/agents/requirements/deploy/REQ-WEB-ADMIN-ANALYTICS-LIVE-DATA.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md` release gates.
- Checks:
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; existing non-blocking EN `MISSING_MESSAGE` logs remain baseline)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `259` tests)
- Decision: pass; move to `released`.
- Changes: `/home/sebas/git/agents/requirements/deploy/REQ-WEB-ADMIN-ANALYTICS-LIVE-DATA.md` -> `/home/sebas/git/agents/requirements/released/REQ-WEB-ADMIN-ANALYTICS-LIVE-DATA.md`
