---
id: REQ-ORG-DASHBOARD-DATA-STATE-CONSISTENCY-AND-PARTIAL-FAILURE-UX
title: Enforce dashboard data-state consistency for loading, error, and KPI rendering
status: released
implementation_scope: frontend
source: user-2026-02-11-field-feedback-auth-navigation
---

# Summary
Harden the organization dashboard state model so KPI cards, worklist blocks, and error feedback remain consistent during loading, empty responses, and partial data failures. The UI must avoid contradictory presentation and make recovery actions explicit.

# Scope
- Organization dashboard frontend behavior in `web/` for `/{locale}/app/organizations/dashboard`.
- State handling for dashboard data sources used by this screen, including mixed-success responses.
- KPI/worklist rendering rules when one source succeeds and another fails.
- Retry and fallback actions for recoverable errors based on adapter error classification.

# Acceptance Criteria
- [ ] The organization dashboard uses explicit UI states aligned to documented load-state semantics (`loading`, `ready`, `empty`, `error`) and does not render contradictory global screen states.
- [ ] If one dashboard data source fails while another succeeds, the UI surfaces a scoped inline warning/error for the failed block instead of replacing successful blocks with a full-page hard error.
- [ ] Recoverable error classes (`network`, `timeout`, `server`, `conflict`) show a retry action at the affected scope.
- [ ] Unauthorized and forbidden responses follow documented behavior (`401` reauth redirect, `403` role/permission state) without stale privileged data remaining visible.
- [ ] Empty-state treatment includes explicit reason text and one clear progression CTA, with no dead-end dashboard screen.
- [ ] Productive user-facing copy is served by message keys and remains locale-safe for `/de` and `/en` routes.

# Definition of Done
- [ ] Organization dashboard state transitions and partial-failure rendering behavior are implemented and documented for `web/src/components/dashboard/organization-dashboard.tsx`.
- [ ] QA evidence includes one happy path, one partial-failure path, and one auth/permission error path for the organization dashboard route.
- [ ] Deterministic ordering of organization dashboard worklist blocks remains unchanged from documented prioritization.
- [ ] No new backend endpoint or contract change is required to ship this requirement.

# Assumptions
- Existing dashboard endpoints remain available: `GET /organisations/dashboard/me` and `GET /job-offers/upcoming/context/organisation`.
- Frontend adapter classification in `web/src/lib/api/errors.ts` remains the source for UI error-class decisions.
- This requirement addresses UI state consistency and does not alter KPI business definitions.

# Constraints
- Implement in active frontend track `web/`, not `web_legacy/` (`docs/web-governance.md`).
- Keep organization dashboard purpose, KPI/worklist intent, and action mapping unchanged (`docs/web-dashboard-flow.md`).
- Respect target UI state rules: explicit loading, empty, and error states with deterministic retry/fallback action (`docs/web-product-structure.md`).
- Respect frontend adapter error classification matrix and class-based UI behavior (`docs/web-api-adapter-contract.md`).
- Do not introduce hardcoded productive copy; use centralized messages (`docs/web-governance.md`).

# Out of Scope
- Backend endpoint additions or payload redesign for dashboard APIs.
- KPI definition changes, reprioritization logic changes, or new dashboard widgets.
- Admin or responder dashboard behavior changes.
- Any route or navigation model change outside `/{locale}/app/organizations/dashboard`.

# References
- `docs/web-dashboard-flow.md`
- `docs/web-governance.md`
- `docs/web-api-adapter-contract.md`
- `docs/web-product-structure.md`
- `docs/web-quality-test-program.md`
- `docs/web-auth-flows.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for architecture handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because this work concerns UI state orchestration and error presentation using existing adapter contracts.
- Decision: Scope is constrained to organization dashboard consistency and partial-failure UX without changing backend contracts.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-ORG-DASHBOARD-DATA-STATE-CONSISTENCY-AND-PARTIAL-FAILURE-UX.md`, `/home/sebas/git/agents/requirements/arch/REQ-ORG-DASHBOARD-DATA-STATE-CONSISTENCY-AND-PARTIAL-FAILURE-UX.md`

# Architecture Notes
- Keep state precedence explicit: auth/session guard outcomes and route-level role guards apply before dashboard data-state rendering.
- For mixed-success fetches, preserve successful KPI/worklist blocks and localize failures to the affected block with retry/fallback actions.
- Apply adapter error classes as documented: `401` clears session and redirects to localized login, `403` renders permission state without exposing stale privileged data.
- Preserve organization dashboard worklist priority/order and CTA mappings from dashboard flow docs; no reprioritization in this requirement.
- Keep productive copy message-key driven and locale-safe under `/{locale}` routing with DE runtime-active and EN prepared.

# Dev Plan
1. Audit current organization dashboard data dependencies and map each source to explicit UI load states (`loading`, `ready`, `empty`, `error`).
2. Define render precedence so global contradictory states cannot appear when one source is loading/failing and another is ready.
3. Implement scoped partial-failure UI blocks with class-based retry/fallback behavior from adapter classification.
4. Verify auth and permission behavior for dashboard fetch failures (`401`, `403`) matches documented session and guard handling.
5. Confirm deterministic worklist ordering and existing CTA routes remain unchanged in ready and degraded states.
6. Add/refresh QA checklist evidence for happy path, partial-failure path, and auth/permission path on `/{locale}/app/organizations/dashboard`.

# Architecture Results
- Decision: Requirement is architecture-ready and aligned with dashboard flow, UI-state policy, and adapter error-class contracts.
- Decision: `implementation_scope: frontend` remains correct because this is UI state orchestration and copy/error presentation only.
- Decision: Added guardrails for state precedence and partial-failure scoping to avoid global contradictory rendering.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-ORG-DASHBOARD-DATA-STATE-CONSISTENCY-AND-PARTIAL-FAILURE-UX.md` -> `/home/sebas/git/agents/requirements/dev/REQ-ORG-DASHBOARD-DATA-STATE-CONSISTENCY-AND-PARTIAL-FAILURE-UX.md`

# Dev Results
- Refactored `web/src/components/dashboard/organization-dashboard.tsx` to explicit global load states (`loading`, `ready`, `empty`, `error`) and scoped source states for dashboard-data and upcoming-context blocks.
- Implemented partial-failure UX so mixed-success responses keep successful blocks visible while failed blocks render inline scoped error/permission states.
- Added class-based recoverability behavior at affected scope: retry button for retryable classes (`network`, `timeout`, `server`, `conflict`) and no retry for forbidden/other non-retryable classes.
- Added explicit auth/permission handling in dashboard data loading:
- `401` now clears session and redirects to localized login via existing login-redirect helper.
- `403` now renders permission state and clears failed-source data to prevent stale privileged content visibility.
- Added explicit empty-state reason text with one clear progression CTA for organization dashboard no-signal scenarios.
- Updated locale message coverage for dashboard state and scoped-error copy in both `de` and `en` (`app.organizationDashboard.*`) without hardcoded productive UI copy.
- Preserved existing dashboard intent and routing/action mapping:
- worklist bucket order from backend remains unchanged,
- CTA destinations remain in documented organization routes.
- Validation evidence:
- `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
- `npm --prefix /home/sebas/git/shift-matching/web run build` passed.
Changes: `/home/sebas/git/shift-matching/web/src/components/dashboard/organization-dashboard.tsx`, `/home/sebas/git/shift-matching/web/messages/de.json`, `/home/sebas/git/shift-matching/web/messages/en.json`, `/home/sebas/git/agents/requirements/qa/REQ-ORG-DASHBOARD-DATA-STATE-CONSISTENCY-AND-PARTIAL-FAILURE-UX.md`

# QA Results
- Binding docs validation completed:
- `docs/web-dashboard-flow.md` confirms organization dashboard purpose, worklist priority order, and CTA mappings.
- `docs/web-governance.md` requires explicit loading/empty/error states and message-key driven productive copy.
- `docs/web-api-adapter-contract.md` defines retryable classes (`network`, `timeout`, `server`, `conflict`) and `401`/`403` UI behavior.
- `docs/web-product-structure.md` requires non-contradictory screen state handling with explicit progression CTA for empty state.
- `docs/web-quality-test-program.md` and `docs/web-auth-flows.md` require deterministic auth/permission handling and localized login redirects.
- Requirement-scoped issues found and fixed during QA:
- Fixed contradictory global state resolution in mixed-success/partial-failure scenarios by preventing global `empty` when one source failed (`web/src/components/dashboard/organization-dashboard.tsx`).
- Added missing EN status keys used by organization dashboard upcoming entries (`app.organizationJobs.status.*`) to preserve `/en` locale readiness (`web/messages/en.json`).
- Post-fix behavior validation:
- mixed-success responses now keep successful blocks visible with scoped errors and no global empty/error contradiction.
- `401` path still clears session and redirects via existing localized login helper.
- `403` source failures remain scoped and clear failed-source data to avoid stale privileged data.
- deterministic worklist bucket ordering and CTA destinations remain unchanged.
- locale key coverage for dashboard component usage now resolves in both DE and EN (`missing_de: 0`, `missing_en: 0`).
- Mandatory QA checks passed in required order (post-fix):
- `npm --prefix /home/sebas/git/shift-matching/web run lint`
- `npm --prefix /home/sebas/git/shift-matching/web run build`
- `npm --prefix /home/sebas/git/shift-matching/app run build`
- `npm --prefix /home/sebas/git/shift-matching/app run test` (`267` passed, `0` failed)
- Decision: pass, moved to `sec`.
- Changes: `/home/sebas/git/shift-matching/web/src/components/dashboard/organization-dashboard.tsx`, `/home/sebas/git/shift-matching/web/messages/en.json`, `/home/sebas/git/agents/requirements/qa/REQ-ORG-DASHBOARD-DATA-STATE-CONSISTENCY-AND-PARTIAL-FAILURE-UX.md` -> `/home/sebas/git/agents/requirements/sec/REQ-ORG-DASHBOARD-DATA-STATE-CONSISTENCY-AND-PARTIAL-FAILURE-UX.md`

# Security Results
- Reviewed requirement-scoped security behavior in:
  `web/src/components/dashboard/organization-dashboard.tsx`,
  `web/src/app/[locale]/app/organizations/dashboard/page.tsx`,
  `web/src/lib/auth/login-redirect.ts`,
  `web/src/lib/api/errors.ts`,
  and `web/src/proxy.ts`.
- Confirmed mixed-success partial-failure handling keeps successful blocks visible while failed sources are scoped to local error/forbidden states, with failed-source data cleared on errors.
- Confirmed `401` handling uses session clear plus localized login redirect, and `403` handling remains scoped without exposing stale privileged dashboard data.
- Confirmed retry action is limited to adapter-classified retryable errors (`network`, `timeout`, `server`, `conflict`) at the affected scope.
- Confirmed dashboard worklist/action links remain on organization-internal routes only; no new cross-role or external navigation vectors introduced.
- Confirmed productive UI copy for the scoped states remains message-key driven for DE/EN locale routes.
- Verification run:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
- Decision: pass. Move requirement to `ux`.
Changes: `/home/sebas/git/agents/requirements/sec/REQ-ORG-DASHBOARD-DATA-STATE-CONSISTENCY-AND-PARTIAL-FAILURE-UX.md` -> `/home/sebas/git/agents/requirements/ux/REQ-ORG-DASHBOARD-DATA-STATE-CONSISTENCY-AND-PARTIAL-FAILURE-UX.md`

# UX Results
- Reviewed requirement-scoped UX/copy behavior against `docs/web-dashboard-flow.md`, `docs/web-governance.md`, `docs/web-api-adapter-contract.md`, and `docs/web-product-structure.md`.
- Confirmed dashboard state behavior meets scope intent:
  - explicit global states (`loading`, `ready`, `empty`, `error`) without contradictory global rendering,
  - partial failures remain scoped to affected blocks while successful blocks stay visible,
  - retry is offered only for retryable scoped failures,
  - `401`/`403` behavior is handled per documented auth/permission rules.
- Confirmed productive copy remains message-key driven and locale key coverage for `organization-dashboard.tsx` is complete (`missing_de=0`, `missing_en=0`).
- Applied requirement-scoped terminology cleanup in `app.organizationDashboard.*` copy for consistency:
  - replaced mixed/ambiguous "assignment/Einsatz" wording with "shift/Schicht" where the screen describes planning and upcoming context,
  - aligned DE empty-state and worklist descriptions to prefer `Jobs`/`Schichten` wording.
- Validation:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
- Decision: pass. Move requirement to `deploy`.
Changes: `/home/sebas/git/shift-matching/web/messages/de.json`, `/home/sebas/git/shift-matching/web/messages/en.json`, `/home/sebas/git/agents/requirements/ux/REQ-ORG-DASHBOARD-DATA-STATE-CONSISTENCY-AND-PARTIAL-FAILURE-UX.md` -> `/home/sebas/git/agents/requirements/deploy/REQ-ORG-DASHBOARD-DATA-STATE-CONSISTENCY-AND-PARTIAL-FAILURE-UX.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md`.
- Checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `269` tests)
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
- Decision: pass; move to `released`.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-ORG-DASHBOARD-DATA-STATE-CONSISTENCY-AND-PARTIAL-FAILURE-UX.md` -> `/home/sebas/git/agents/requirements/released/REQ-ORG-DASHBOARD-DATA-STATE-CONSISTENCY-AND-PARTIAL-FAILURE-UX.md`
