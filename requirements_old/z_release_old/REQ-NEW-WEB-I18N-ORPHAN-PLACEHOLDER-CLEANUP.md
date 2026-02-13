---
id: REQ-NEW-WEB-I18N-ORPHAN-PLACEHOLDER-CLEANUP
title: Remove orphan placeholder i18n message blocks from active web flows
status: released
implementation_scope: frontend
source: user-2026-02-12-frontend-wiring-stub-audit
---

# Summary
Clean up unreferenced placeholder-oriented message blocks in active `web/` flow namespaces to reduce stub-like leftovers and keep the message catalog aligned with live UI usage.

# Scope
- Frontend-only cleanup in `web/`.
- Message catalog and key-usage alignment for active role flows.
- Initial in-scope namespace candidates identified in audit:
  - `app.jobs.cards.*`
  - `app.jobs.advancedFilters.*`

# Acceptance Criteria
- [ ] Unreferenced placeholder-style keys in scoped namespaces are removed or replaced with actively used keys.
- [ ] `web` build and lint pass after cleanup.
- [ ] No new `MISSING_MESSAGE` findings are introduced by key cleanup.
- [ ] Active flow screens keep full message coverage with no hardcoded productive copy.
- [ ] DE runtime behavior and EN prepared-locale policy remain unchanged.

# Definition of Done
- [ ] In-scope placeholder-oriented message keys are reconciled (removed, merged, or replaced) based on active `web/` key usage.
- [ ] Validation evidence includes successful `npm --prefix web run lint` and `npm --prefix web run build` runs after cleanup.
- [ ] QA evidence confirms no user-facing regression in active DE runtime routes touched by this cleanup.
- [ ] Requirement delivery remains frontend-only with no backend endpoint or schema changes.

# Assumptions
- EN missing-message findings for this requirement are caused by stale or orphaned message catalog entries/usage in scoped namespaces.
- Active runtime locale remains DE, while EN remains prepared and validated through key presence/build behavior.
- In-scope cleanup can be completed without changing route structure or auth/session logic.

# Constraints
- Keep locale-prefixed routing and role-guard behavior unchanged.
- Keep implementation in `web/` only.
- Follow copy governance: productive copy only via centralized message keys.
- Avoid deleting keys that are still referenced by active `web/` routes/components.
- Keep phase locale policy unchanged (`de` runtime active, `en` prepared only).

# Out of Scope
- Functional redesign of jobs/profile/settings/admin flows.
- Backend/API/auth/session model changes.
- Runtime EN enablement.

# References
- `docs/web-governance.md`
- `docs/web-quality-test-program.md`
- `docs/web-product-structure.md`
- `docs/ui-language-policy.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for architecture handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because scope is limited to i18n message-catalog hygiene in `web/`.
- Decision: Scope is constrained to orphan placeholder cleanup and missing-message prevention without locale-policy or backend changes.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-WEB-I18N-ORPHAN-PLACEHOLDER-CLEANUP.md`, `/home/sebas/git/agents/requirements/arch/REQ-NEW-WEB-I18N-ORPHAN-PLACEHOLDER-CLEANUP.md`

# Architecture Notes
- Keep locale policy unchanged: DE remains runtime-active and EN remains prepared-only; this requirement is catalog hygiene only.
- Determine orphan status from active `web/` key usage before deletion to avoid removing still-referenced keys.
- Resolve placeholder leftovers by either removing truly unused keys or aligning component usage to canonical active keys in centralized catalogs.
- Preserve copy governance and routing/guard invariants; no hardcoded productive text and no route/auth behavior changes.
- Validate with `web` lint/build so no new `MISSING_MESSAGE` findings are introduced by cleanup.

# Dev Plan
1. Collect current `MISSING_MESSAGE` and orphan-key candidates from `web` build logs and static key-usage scan in active namespaces.
2. Cross-check each candidate key against active component usage to classify as remove, merge, or rename alignment.
3. Update centralized message catalogs (`de` and `en`) and corresponding key references in active `web/` flows.
4. Re-run `npm --prefix web run lint` and `npm --prefix web run build` to verify no new missing-message regressions.
5. Smoke-check affected DE routes for copy regressions and ensure EN prepared-state behavior is unchanged.
6. Capture QA evidence for build success and no user-facing placeholder regressions in touched flows.

# Architecture Results
- Decision: Requirement is architecture-ready and aligned with language-policy, governance copy rules, and quality-program build gates.
- Decision: `implementation_scope: frontend` remains correct because this is i18n catalog/key alignment inside `web/` only.
- Decision: Added architecture guardrails for safe orphan-key classification and non-regression of DE runtime behavior.
- Changes: `/home/sebas/git/agents/requirements/arch/REQ-NEW-WEB-I18N-ORPHAN-PLACEHOLDER-CLEANUP.md` -> `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-I18N-ORPHAN-PLACEHOLDER-CLEANUP.md`

# Dev Results
- Removed orphan placeholder message blocks in the scoped namespaces:
- `app.jobs.cards.*`
- `app.jobs.advancedFilters.*`
- Cleanup was applied in both centralized catalogs:
- `web/messages/de.json`
- `web/messages/en.json`
- Verified orphan classification against active frontend usage: no `web/src` references exist for `app.jobs.cards.*` or `app.jobs.advancedFilters.*`.
- Validation evidence:
- `npm --prefix /home/sebas/git/shift-matching/web run lint` passed.
- `npm --prefix /home/sebas/git/shift-matching/web run build` passed with no `MISSING_MESSAGE` findings introduced.
- Smoke evidence on touched flow (`/{locale}/app/responders/jobs`): static key-coverage check for `app.jobs.*` usage in `responder-jobs-page.tsx` reports `missing_de: 0` and `missing_en: 0`.
- Changes: `/home/sebas/git/shift-matching/web/messages/de.json`, `/home/sebas/git/shift-matching/web/messages/en.json`, `/home/sebas/git/agents/requirements/qa/REQ-NEW-WEB-I18N-ORPHAN-PLACEHOLDER-CLEANUP.md`

# QA Results
- Validation against binding docs completed:
- `docs/web-governance.md` (copy governance and orphan placeholder removal in active namespaces)
- `docs/web-quality-test-program.md` (baseline lint/build gates and DE runtime with EN prepared policy)
- `docs/web-product-structure.md` (locale-prefixed routing model unchanged)
- `docs/ui-language-policy.md` (DE runtime active, EN prepared; centralized i18n message policy maintained)
- Requirement implementation is frontend-only and remains scoped to `web/messages/de.json` and `web/messages/en.json`.
- Scoped orphan-key verification completed:
- `app.jobs.cards.*` not referenced in `web/src` and not present in active message catalogs.
- `app.jobs.advancedFilters.*` not referenced in `web/src` and not present in active message catalogs.
- Touched active flow non-regression check passed:
- `web/src/components/jobs/responder-jobs-page.tsx` literal `app.jobs.*` key coverage check reports `missing_de: 0` and `missing_en: 0`.
- Mandatory QA checks passed in required order:
- `npm --prefix /home/sebas/git/shift-matching/web run lint`
- `npm --prefix /home/sebas/git/shift-matching/web run build`
- `npm --prefix /home/sebas/git/shift-matching/app run build`
- `npm --prefix /home/sebas/git/shift-matching/app run test` (`267` passed, `0` failed)
- Decision: pass, moved to `sec`.
- Changes: `/home/sebas/git/agents/requirements/qa/REQ-NEW-WEB-I18N-ORPHAN-PLACEHOLDER-CLEANUP.md` -> `/home/sebas/git/agents/requirements/sec/REQ-NEW-WEB-I18N-ORPHAN-PLACEHOLDER-CLEANUP.md`

# Security Results
- Reviewed requirement-scoped i18n orphan cleanup and active `app.jobs.*` key usage in `web/src` and message catalogs.
- Confirmed no requirement-scoped security regressions:
  - no auth/routing/backend behavior changes,
  - no hardcoded productive fallback copy introduced,
  - no untrusted dynamic translation-key paths introduced by this cleanup scope.
- Confirmed scoped orphan cleanup did not remove still-referenced active keys and did not introduce new missing-message runtime/build failures.
- Verification run:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
- Decision: pass. Move requirement to `ux`.
Changes: `/home/sebas/git/agents/requirements/sec/REQ-NEW-WEB-I18N-ORPHAN-PLACEHOLDER-CLEANUP.md` -> `/home/sebas/git/agents/requirements/ux/REQ-NEW-WEB-I18N-ORPHAN-PLACEHOLDER-CLEANUP.md`

# UX Results
- Reviewed requirement-scoped UX/copy alignment against `docs/web-governance.md`, `docs/ui-language-policy.md`, and `docs/web-quality-test-program.md`.
- Confirmed scoped orphan namespaces are fully removed from active catalogs and source usage:
  - no `web/src` references for `app.jobs.cards.*` or `app.jobs.advancedFilters.*`
  - no remaining placeholder blocks for those namespaces in `web/messages/de.json` and `web/messages/en.json`
- Confirmed active `app.jobs.*` translation usage in `web/src` has full DE/EN key coverage (`missing_de=0`, `missing_en=0`).
- Requirement-scoped UX/copy review found no unresolved issues.
- Decision: pass. Move requirement to `deploy`.
Changes: `/home/sebas/git/agents/requirements/ux/REQ-NEW-WEB-I18N-ORPHAN-PLACEHOLDER-CLEANUP.md` -> `/home/sebas/git/agents/requirements/deploy/REQ-NEW-WEB-I18N-ORPHAN-PLACEHOLDER-CLEANUP.md`

# Deploy Results
- Validation: Coolify deploy-readiness gates are green for this requirement scope and align with `README.md` deployment commands plus `docs/web-release-versioning-model.md` and `docs/web-quality-test-program.md`.
- Checks:
  - `npm --prefix /home/sebas/git/shift-matching/web run lint` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/web run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run build` (pass)
  - `npm --prefix /home/sebas/git/shift-matching/app run test` (pass, `269` tests)
  - `node /home/sebas/git/shift-matching/scripts/qa-gate.js` (pass)
- Decision: pass; move to `released`.
Changes: `/home/sebas/git/agents/requirements/deploy/REQ-NEW-WEB-I18N-ORPHAN-PLACEHOLDER-CLEANUP.md` -> `/home/sebas/git/agents/requirements/released/REQ-NEW-WEB-I18N-ORPHAN-PLACEHOLDER-CLEANUP.md`
