---
id: REQ-NEW-WEB-EN-MESSAGE-COVERAGE-BASELINE
title: Close global EN missing-message gaps in active web flows
status: released
implementation_scope: frontend
source: reqeng-2026-02-12-qa-followup-from-REQ-WEB-RESPONDER-PROFILE-SETTINGS-LIVE-READINESS
---

# Summary
Resolve global EN message-key gaps that currently emit `MISSING_MESSAGE` logs during `web` production build outside responder profile/settings scope.

# Scope
- Frontend-only requirement in active `web/` track.
- In-scope coverage is EN message-key gaps in active organization/admin responder-adjacent web flows flagged by QA baseline build logs.
- Message coverage work is limited to i18n message catalogs and key usage alignment required to remove build-time missing-message findings.
- No route, auth, or backend contract expansion is included.

# Acceptance Criteria
- `npm --prefix web run build` completes without EN `MISSING_MESSAGE` findings for all in-scope namespaces.
- Every in-scope productive UI key referenced by active `web/` flows has an EN message value in centralized message catalogs.
- No hardcoded productive UI copy is introduced while closing gaps; productive copy remains key-driven.
- DE runtime behavior remains unchanged and EN remains prepared-only (not runtime-enabled) after this requirement.
- Locale-prefixed routing and guard behavior for active flows remains unchanged.

# Definition of Done
- Missing EN keys for in-scope flows are resolved in centralized message files with build validation evidence.
- QA evidence includes one successful `web` production build check and one smoke review on affected routes confirming no missing-message placeholders.
- No regressions are introduced in DE runtime copy behavior for affected flows.
- Requirement remains frontend-only with no backend endpoint or schema changes.

# Assumptions
- Current missing-message findings are caused by EN catalog coverage gaps, not by missing backend data contracts.
- Active route and flow ownership in `web/` remains unchanged while this requirement is implemented.
- EN is still prepared but not enabled at runtime in phase 1.

# Constraints
- Keep phase-1 locale policy unchanged: DE runtime active, EN prepared for later enablement.
- Keep copy governance unchanged: productive UI copy must come from centralized message keys.
- Keep locale-prefixed route model and English route slug model unchanged.
- Keep changes in `web/` only; no rebuild feature work in `web_legacy/`.
- Keep scope limited to message coverage baseline, not functional flow redesign.

# Out of Scope
- Enabling EN as an active runtime locale.
- Backend/API/auth/session model changes.
- New flow behavior or IA changes unrelated to message-key coverage.
- Copy rewrites beyond resolving missing-key coverage and required consistency.

# References
- `docs/web-quality-test-program.md`
- `docs/web-governance.md`
- `docs/web-product-structure.md`
- `docs/web-profile-settings-flow.md`
- `docs/ui-language-policy.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for architecture handoff.
- Decision: `implementation_scope` is `frontend` in split mode because the requirement targets i18n message coverage in `web/`.
- Decision: Scope is constrained to EN message-key baseline closure without enabling EN runtime or changing backend contracts.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-WEB-EN-MESSAGE-COVERAGE-BASELINE.md`, `/home/sebas/git/agents/requirements/arch/REQ-NEW-WEB-EN-MESSAGE-COVERAGE-BASELINE.md`

# Architecture Notes
- Keep phase-1 locale policy unchanged: DE stays runtime-active and EN remains prepared-only; this requirement closes catalog gaps only.
- Use centralized message catalogs as the only source for productive copy and resolve missing keys by key alignment, not hardcoded fallbacks.
- Limit in-scope fixes to active `web/` flows validated by build-time `MISSING_MESSAGE` findings and QA smoke review.
- Preserve locale-prefixed routing and role-guard behavior; message-coverage fixes must not alter navigation or auth flow semantics.
- Keep changes inside `web/` message/key usage boundaries with no backend/API contract changes.

# Dev Plan
1. Capture current EN `MISSING_MESSAGE` findings from `npm --prefix web run build` and lock an explicit in-scope namespace list.
2. Trace each missing key to its active `web/` flow usage and confirm key ownership in centralized message catalogs.
3. Add missing EN values and align mismatched key names between components and catalogs without changing route or flow behavior.
4. Re-run `web` production build until EN `MISSING_MESSAGE` findings are cleared for scoped namespaces.
5. Smoke-check affected routes for placeholder regressions and confirm DE runtime copy remains unchanged.
6. Record QA evidence for successful build and route-level message coverage validation.

# Architecture Results
- Decision: Requirement is architecture-ready and aligned with language policy, governance copy rules, and quality-program EN readiness checks.
- Decision: `implementation_scope: frontend` remains correct because this is message-catalog and key-usage alignment work in `web/` only.
- Decision: Added architecture guardrails for scoped namespace closure and non-regression of DE runtime behavior.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-NEW-WEB-EN-MESSAGE-COVERAGE-BASELINE.md` -> `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-EN-MESSAGE-COVERAGE-BASELINE.md`

# Dev Results
- Captured current EN baseline gaps from production build logs and resolved all reported `MISSING_MESSAGE` keys for scoped organization/admin-adjacent namespaces in `web/messages/en.json`.
- Added missing EN keys for in-scope active flow namespaces:
- `app.organizationDashboard.*` (stats/messages/planning/upcoming coverage gaps)
- `app.organizationJobs.*` (missing empty state and task-field option labels)
- `app.organizationOfferRequests.*` (history/messages session and empty states)
- `app.organizationContracts.*` (messages session/empty states)
- `app.organizationProfile.*` (live profile field, identity fallback, week/time metadata, session message)
- `app.organizationSettings.messages.sessionMissing`
- `app.organizationResponders.*` and `app.organizationLinkedParticipants.*` (missing heading/filter/message/status/request blocks referenced by active flows)
- Preserved locale policy and routing/guard behavior (no runtime locale enablement changes, no route/auth/backend changes).
- Validation evidence:
- `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
- `npm --prefix /home/sebas/git/shift-matching/web run build` passed with no EN `MISSING_MESSAGE` findings.
- Smoke review evidence on affected routes/namespaces:
- Re-checked all baseline build-missing keys against updated EN catalog: `baseline_missing_keys: 74`, `resolved_now: 74`, `remaining_unresolved: 0`.
- Changes: `/home/sebas/git/shift-matching/web/messages/en.json`, `/home/sebas/git/agents/requirements/qa/REQ-NEW-WEB-EN-MESSAGE-COVERAGE-BASELINE.md`

# QA Results
- Requirement behavior is aligned with binding docs (`docs/web-quality-test-program.md`, `docs/web-governance.md`, `docs/web-product-structure.md`, `docs/web-profile-settings-flow.md`, `docs/ui-language-policy.md`).
- EN coverage validation passed:
  - `web` production build completes without EN `MISSING_MESSAGE` output in the current baseline run.
  - In-scope EN namespaces are present in `web/messages/en.json`: `app.organizationDashboard`, `app.organizationJobs`, `app.organizationOfferRequests`, `app.organizationContracts`, `app.organizationProfile`, `app.organizationSettings.messages.sessionMissing`, `app.organizationResponders`, `app.organizationLinkedParticipants`.
  - Productive copy remains message-key driven in active `web` flows (no requirement-scoped hardcoded fallback introduced).
- Locale/routing policy remains unchanged:
  - DE runtime remains active and EN remains prepared-only.
  - No route/guard/backend contract changes were introduced by this requirement scope.
- Mandatory QA checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `267/267`)
- Changes: `/home/sebas/git/agents/requirements/qa/REQ-NEW-WEB-EN-MESSAGE-COVERAGE-BASELINE.md` -> `/home/sebas/git/agents/requirements/sec/REQ-NEW-WEB-EN-MESSAGE-COVERAGE-BASELINE.md`

# Security Results
- Reviewed requirement-scoped EN message coverage implementation for active `web` flows and message-key usage alignment.
- Confirmed no requirement-scoped security regressions:
  - no auth/routing/backend contract changes in scope,
  - no hardcoded productive fallback copy introduced,
  - no unguarded dynamic translation-key paths were introduced by this requirement scope.
- Confirmed message-coverage baseline closes missing-key availability risks for prepared EN catalogs without enabling EN runtime.
- Verification run:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
- Decision: pass. Move requirement to `ux`.
Changes: `/home/sebas/git/agents/requirements/sec/REQ-NEW-WEB-EN-MESSAGE-COVERAGE-BASELINE.md` -> `/home/sebas/git/agents/requirements/ux/REQ-NEW-WEB-EN-MESSAGE-COVERAGE-BASELINE.md`

# UX Results
- Reviewed requirement-scoped copy and terminology against `docs/web-governance.md`, `docs/web-design-system.md`, `docs/web-quality-test-program.md`, and `docs/ui-language-policy.md`.
- Identified unresolved EN coverage gaps in active organization flow namespaces during UX verification (`app.organizationJobs.*`, `app.organizationShifts.*`, `app.organizationSettings.*`) and added missing EN values in centralized catalog.
- Confirmed scoped active translation usage now resolves fully (`missing_in_en=0`) for static organization/admin keys used in `web/src`.
- Confirmed DE-to-EN scoped namespace parity for this requirement after fix (`scoped_missing_in_en=0`).
- Validation: `npm --prefix /home/sebas/git/shift-matching/web run build` passes with no EN `MISSING_MESSAGE` output.
- Decision: pass. Move requirement to `deploy`.
Changes: `/home/sebas/git/shift-matching/web/messages/en.json`, `/home/sebas/git/agents/requirements/ux/REQ-NEW-WEB-EN-MESSAGE-COVERAGE-BASELINE.md` -> `/home/sebas/git/agents/requirements/deploy/REQ-NEW-WEB-EN-MESSAGE-COVERAGE-BASELINE.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md`.
- Checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `269` tests)
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
- Decision: pass; move to `released`.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-NEW-WEB-EN-MESSAGE-COVERAGE-BASELINE.md` -> `/home/sebas/git/agents/requirements/released/REQ-NEW-WEB-EN-MESSAGE-COVERAGE-BASELINE.md`
