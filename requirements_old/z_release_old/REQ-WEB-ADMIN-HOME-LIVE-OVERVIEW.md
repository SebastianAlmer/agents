---
id: REQ-WEB-ADMIN-HOME-LIVE-OVERVIEW
title: Replace admin home placeholder with live operational overview
status: released
implementation_scope: frontend
source: user-2026-02-11-admin-prod-readiness-followup
---

# Summary
Replace the static admin home (`/{locale}/app/admin`) with a live operational overview so admin entry reflects current platform operations and governance signals.

# Scope
- Frontend-only implementation in `web/` for admin overview route and component behavior.
- Route `/{locale}/app/admin` and `web/src/components/admin/admin-home-page.tsx`.
- Live data integration through existing adapter methods:
  - `apiAdapters.admin.fetchAccounts`
  - `apiAdapters.admin.fetchAnalytics`
  - `apiAdapters.admin.fetchMailStats`
  - `apiAdapters.contracts.fetchAdminContractTemplate`
- Read-focused overview behavior with navigation into admin modules.

# Acceptance Criteria
- Admin home KPIs and overview values are derived from live adapter data; static placeholder KPI values are removed.
- Module cards (`accounts`, `analytics`, `mail`, `contract-template`) remain primary entry points and surface live summary context when available.
- Critical notices are data-driven (for example mail issues, missing active contract template, account anomalies) and rendered in deterministic order.
- Screen explicitly handles `loading`, `empty`, `error`, and ready states.
- Unauthorized or expired-session responses follow existing localized admin auth/session guard behavior.
- User-facing production copy is message-driven/localized with no hardcoded productive strings.
- Home route remains read-focused and does not dispatch destructive admin actions directly.

# Definition of Done
- `web/src/components/admin/admin-home-page.tsx` is API-backed through existing adapters only.
- Admin module entry links remain aligned with admin IA (`accounts`, `analytics`, `mail`, `contract-template`) under locale-prefixed routes.
- QA evidence includes one happy path, one degraded/empty-or-error path, and one unauthorized/session-expiry guard path.
- Screen behavior meets governance baseline for explicit states and message-driven content.

# Assumptions
- Existing admin and contracts adapter methods remain available with current documented contracts.
- Admin overview can be assembled from existing endpoint groups without introducing a new aggregated backend endpoint.
- Audit event generation remains owned by backend workflows; this page focuses on monitoring and navigation context.

# Constraints
- Keep admin route model and role boundary rules under `/{locale}/app/admin...` unchanged.
- Keep dashboard purpose and module-priority expectations aligned with admin dashboard flow.
- Use adapter-layer API access and centralized error mapping; no direct domain transport calls in page logic.
- Keep locale-prefixed routing and auth/session guard behavior unchanged.
- Keep implementation in active frontend track `web/`; no rebuild feature work in `web_legacy/`.
- Do not introduce backend endpoint or contract changes in this requirement.

# Out of Scope
- New aggregated admin-home backend endpoint.
- Changes to admin authorization model.
- Redesign of module detail pages.
- New write-action controls on admin home.

# References
- `docs/web-admin-governance-flow.md`
- `docs/web-dashboard-flow.md`
- `docs/web-product-structure.md`
- `docs/web-api-adapter-contract.md`
- `docs/web-auth-flows.md`
- `docs/web-governance.md`
- `docs/web-quality-test-program.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for architecture handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because all required data sources and adapters are already in documented scope.
- Decision: Scope is constrained to read-focused live overview behavior and module navigation, without backend contract expansion.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-WEB-ADMIN-HOME-LIVE-OVERVIEW.md`, `/home/sebas/git/agents/requirements/arch/REQ-WEB-ADMIN-HOME-LIVE-OVERVIEW.md`

# Architecture Notes
- Keep admin home in isolated admin route space at `/{locale}/app/admin` with existing admin session/role guards unchanged.
- Use adapter methods only (`fetchAccounts`, `fetchAnalytics`, `fetchMailStats`, `fetchAdminContractTemplate`) and centralized error mapping; no direct screen-level transport.
- Preserve read-focused behavior: no destructive admin action dispatch from home; actions route users into module pages.
- Keep critical notice derivation deterministic with explicit priority/order rules (integrity warnings before general operational context).
- Preserve explicit UI states (`loading`, `ready`, `empty`, `error`) and message-driven copy under locale-prefixed routing.

# Dev Plan
1. Replace static placeholders in `web/src/components/admin/admin-home-page.tsx` with adapter-backed load orchestration for accounts, analytics, mail stats, and contract-template status.
2. Define deterministic mapping from adapter payloads to overview KPIs and module summary cards.
3. Implement deterministic critical-notice assembly with explicit ordering and safe fallbacks for partial payloads.
4. Ensure module cards remain navigation-only entry points to `accounts`, `analytics`, `mail`, and `contract-template` routes.
5. Implement explicit `loading`, `ready`, `empty`, and `error` states with retry behavior for recoverable failures.
6. Verify unauthorized or expired-session behavior follows existing localized auth-guard redirects.
7. Capture QA evidence for happy path, degraded/empty-or-error path, and unauthorized/session-expiry path.

# Architecture Results
- Decision: Requirement is architecture-ready and aligned with admin dashboard flow, admin governance, adapter-contract, and auth-guard docs.
- Decision: `implementation_scope: frontend` remains correct because required data sources already exist in documented API/adapter scope.
- Decision: Added architecture guardrails for deterministic notice ordering and strict read-only home behavior.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-WEB-ADMIN-HOME-LIVE-OVERVIEW.md` -> `/home/sebas/git/agents/requirements/dev/REQ-WEB-ADMIN-HOME-LIVE-OVERVIEW.md`

# Dev Results
- Replaced static admin-home placeholder content with a live adapter-backed overview that loads accounts, analytics, mail stats, and admin contract-template data in parallel.
- Implemented explicit `loading`, `ready`, `empty`, and `error` states, retry behavior for recoverable failures, and unauthorized/session-expiry redirect via existing localized admin auth guard flow.
- Added deterministic, data-driven critical notices with fixed priority order (mail failures, missing template, template warnings, account anomalies, operational backlog, partial-data signal).
- Kept module cards as navigation-only entry points and added live module summaries for `accounts`, `analytics`, `contract-template`, and `mail`.
- Updated localized admin-home message namespaces in both locales to ensure production copy is message-driven with no hardcoded UI strings.
- Validation: `npm --prefix web run lint` passed; `npm --prefix web run build` completed with pre-existing unrelated `MISSING_MESSAGE` logs in organization modules.
Changes: `web/src/components/admin/admin-home-page.tsx`, `web/messages/en.json`, `web/messages/de.json`, `/home/sebas/git/agents/requirements/qa/REQ-WEB-ADMIN-HOME-LIVE-OVERVIEW.md`

# QA Results
- Decision: pass.
- Validation:
- Admin home KPIs/module summaries are derived from live adapter sources (`fetchAccounts`, `fetchAnalytics`, `fetchMailStats`, `fetchAdminContractTemplate`); static placeholder KPI values are removed.
- Module cards (`accounts`, `analytics`, `mail`, `contract-template`) remain primary navigation entry points and surface live summary context.
- Critical notices are data-driven and emitted in deterministic priority order (mail failures, missing template, template warnings, inactive/anonymized accounts, open requests, partial-data signal).
- Screen explicitly handles `loading`, `empty`, `error`, and `ready`, with retry behavior on recoverable failures.
- Unauthorized/expired session responses redirect through existing localized auth/session guard flow (`clearSessionAndRedirectToLogin`).
- User-facing production copy is message-driven/localized (`app.adminHome.*` in `de` and `en`), with no direct domain `fetch` calls in page logic.
- Home route remains read-focused: it links to module routes and does not dispatch destructive admin actions directly.
- Mandatory checks:
- `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
- `npm --prefix /home/sebas/git/shift-matching/web run build` passed (pre-existing non-blocking EN `MISSING_MESSAGE` logs remain in unrelated organization namespaces).
- `npm --prefix /home/sebas/git/shift-matching/app run build` passed.
- `npm --prefix /home/sebas/git/shift-matching/app run test` passed (`248` passed, `0` failed).
- QA evidence:
- Happy path: all overview sources load and render KPI/module/notice context in `ready` state.
- Degraded path: partial-source failures keep page functional with deterministic `partialData` notice and per-module unavailable summaries; total-source failure enters explicit `error` state.
- Unauthorized/session-expiry path: any unauthorized source result triggers localized login redirect through the shared session-clear helper.
- Changes: `/home/sebas/git/agents/requirements/sec/REQ-WEB-ADMIN-HOME-LIVE-OVERVIEW.md`

# Security Results
- Decision: pass.
- Validation:
- Reviewed requirement-scoped admin home implementation in `web/src/components/admin/admin-home-page.tsx` and adapter usage in `web/src/lib/api/adapters/admin.ts` plus `web/src/lib/api/adapters/contracts.ts` against `docs/web-admin-governance-flow.md`, `docs/web-auth-flows.md`, and `docs/web-api-adapter-contract.md`.
- Confirmed route behavior remains read-focused (navigation-only module entry links) with no destructive admin actions dispatched from home.
- Confirmed unauthorized-session handling is enforced for all overview sources: any `unauthorized` result triggers `clearSessionAndRedirectToLogin` with localized login routing.
- Confirmed data shaping and rendering paths are runtime-safe for partial/missing payload fields and do not introduce direct transport calls outside adapter layer.
- No additional requirement-scoped security/compliance issue was found.
- Changes: `/home/sebas/git/agents/requirements/sec/REQ-WEB-ADMIN-HOME-LIVE-OVERVIEW.md` -> `/home/sebas/git/agents/requirements/ux/REQ-WEB-ADMIN-HOME-LIVE-OVERVIEW.md`

# UX Results
- Decision: pass.
- Validation:
- Reviewed admin home UX/copy and read-focused module-navigation behavior in `web/src/components/admin/admin-home-page.tsx` against `docs/web-dashboard-flow.md`, `docs/web-admin-governance-flow.md`, `docs/web-design-system.md`, and `docs/glossary.md`.
- Fixed requirement-scoped DE localization quality in `app.adminHome` by removing mixed-language user-facing labels/terms in heading, module cards, and partial-data source labels while preserving message-key wiring and behavior.
- Confirmed deterministic, data-driven notice ordering and explicit state handling (`loading`, `empty`, `error`, `ready`) remain intact.
- Re-validated with `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass).
- Changes: `/home/sebas/git/shift-matching/web/messages/de.json`, `/home/sebas/git/agents/requirements/ux/REQ-WEB-ADMIN-HOME-LIVE-OVERVIEW.md` -> `/home/sebas/git/agents/requirements/deploy/REQ-WEB-ADMIN-HOME-LIVE-OVERVIEW.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md` release gates.
- Checks:
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass; existing non-blocking EN `MISSING_MESSAGE` logs remain baseline)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `259` tests)
- Decision: pass; move to `released`.
- Changes: `/home/sebas/git/agents/requirements/deploy/REQ-WEB-ADMIN-HOME-LIVE-OVERVIEW.md` -> `/home/sebas/git/agents/requirements/released/REQ-WEB-ADMIN-HOME-LIVE-OVERVIEW.md`
