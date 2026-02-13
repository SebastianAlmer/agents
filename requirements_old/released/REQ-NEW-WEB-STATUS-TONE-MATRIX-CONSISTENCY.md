---
id: REQ-NEW-WEB-STATUS-TONE-MATRIX-CONSISTENCY
title: Harmonize status badges with binding status-tone matrix
status: released
implementation_scope: frontend
review_risk: medium
review_scope: qa_ux
source: user-2026-02-12-status-defaults-colors-consistency
---

# Goal
Apply one centralized, doc-aligned status-tone mapping so status badges are consistent across active web role surfaces.

# Scope
- Frontend status badge presentation in active `web/` surfaces.
- In-scope status domains:
  - `OfferRequestStatus`
  - `ShiftOccurrenceStatus`
  - `ProfileRequestStatus`
  - `AccountStatus`
  - contract UI statuses (`active`, `pending`, `expired`)
  - admin contract-template statuses (`active`, `inactive`)
- Responder, organization, and admin pages that render these statuses.

# Task Outline
- Introduce one reusable status mapping source for label and tone category.
- Align in-scope statuses with the binding matrix in `docs/web-design-system.md`.
- Apply mapping across role surfaces and remove per-page tone drift.
- Fix organization dashboard shift badges to use status-dependent tone mapping.
- Preserve enum semantics and spelling differences while keeping consistent user-facing labels.

# Acceptance Criteria
- [ ] All in-scope status badges use one centralized mapping source in `web/`.
- [ ] Offer request, shift occurrence, profile request, and account badges follow binding mappings from `docs/web-design-system.md`.
- [ ] Contract and admin contract-template badges follow binding mappings (`active` success, `pending` warn/open, `expired` neutral, `inactive` neutral).
- [ ] Organization dashboard shift badges are status-dependent and no longer use a static single-tone fallback.
- [ ] Status feedback remains text-plus-tone and never color-only.

# Out of Scope
- Backend, API, or database changes.
- Status lifecycle or business-rule changes.
- Route, auth-guard, or role-model changes.

# Constraints
- Keep implementation in active frontend track `web/` only.
- Keep status semantics aligned with `docs/web-jobs-requests-flow.md`, `docs/web-contracts-flow.md`, and `docs/web-api-adapter-contract.md`.
- Keep tone/accessibility behavior aligned with `docs/web-design-system.md`, `docs/modern-ui.md`, and `docs/web-quality-test-program.md`.
- Keep role and session behavior unchanged per `docs/web-auth-flows.md`.

# References
- `docs/web-design-system.md`
- `docs/modern-ui.md`
- `docs/web-jobs-requests-flow.md`
- `docs/web-contracts-flow.md`
- `docs/web-api-adapter-contract.md`
- `docs/web-quality-test-program.md`
- `docs/web-auth-flows.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for implementation handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because scope is UI status presentation consistency.
- Decision: `review_risk` is `medium` and `review_scope` is `qa_ux` due cross-role UI consistency and accessibility impact.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-WEB-STATUS-TONE-MATRIX-CONSISTENCY.md`, `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-STATUS-TONE-MATRIX-CONSISTENCY.md`

# Architecture Notes
- Use one shared status mapping in `web/` for badge label and tone category across all in-scope domains.
- Keep binding tone categories exactly `success`, `warn_open`, `error`, `neutral` per `docs/web-design-system.md`.
- Preserve domain enum spelling as-is (`CANCELLED` vs `CANCELED`) while normalizing user-facing labels.
- Do not allow page-local badge-tone overrides for statuses already covered by the binding matrix.
- Maintain text-plus-tone status presentation; no color-only status feedback.

# Implementation Guardrails
- Keep this requirement UI-only: no enum, lifecycle, API contract, auth, or routing behavior changes.
- Apply the shared mapping on responder, organization, and admin surfaces that render in-scope statuses.
- Validate organization dashboard shift badges against `ShiftOccurrenceStatus` mapping (no static fallback tone).

# Risks & Tradeoffs
- Centralizing mappings removes drift but increases blast radius if one mapping entry is wrong.
- Strictly preserving domain spellings avoids contract drift but requires careful mapping key discipline.

# Architecture Results
- Decision: Ready for DEV; docs already define a binding status-tone matrix and centralized mapping rule.
- Decision: `review_risk` remains `medium` due cross-role, multi-domain badge changes with accessibility implications.
- Decision: `review_scope` remains `qa_ux` to verify tone semantics and consistency across role surfaces.
- Changes: Updated front matter status to `dev`; added Architecture Notes, Implementation Guardrails, Risks & Tradeoffs, and Architecture Results.

# Dev Results
- Added one shared status-badge matrix in `web/src/lib/status/status-badge-matrix.ts` and replaced page-local status label/tone mappings across responder, organization, and admin role surfaces.
- Updated organization dashboard upcoming-context shift chips to use `ShiftOccurrenceStatus`-dependent tone mapping instead of a static single-tone style.
- Normalized in-scope status copy to align with the binding matrix for shared shift and contract labels in `web/messages/de.json` and `web/messages/en.json`.
- Validation:
  - `npm --prefix web run lint` (pass)
  - `npm --prefix web run build` (pass)
- Changes: `web/src/lib/status/status-badge-matrix.ts`, `web/src/components/jobs/responder-jobs-page.tsx`, `web/src/components/jobs/responder-requests-page.tsx`, `web/src/components/jobs/responder-shifts-page.tsx`, `web/src/components/dashboard/responder-dashboard.tsx`, `web/src/components/dashboard/organization-dashboard.tsx`, `web/src/components/jobs/organization-jobs-page.tsx`, `web/src/components/jobs/organization-shifts-page.tsx`, `web/src/components/jobs/organization-job-detail-page.tsx`, `web/src/components/jobs/organization-offer-requests-page.tsx`, `web/src/components/responders/organization-responders-page.tsx`, `web/src/components/admin/admin-accounts-page.tsx`, `web/src/components/admin/admin-contract-template-page.tsx`, `web/src/components/contracts/responder-contracts-page.tsx`, `web/src/components/contracts/organization-contracts-page.tsx`, `web/messages/de.json`, `web/messages/en.json`

## QA Review Results
- Mode: quick per-requirement code review
- Decision: pass
- Summary: Centralized status-tone mapping is in place and applied across responder, organization, and admin status badges for the in-scope domains, with translation keys aligned to the matrix. I also aligned organization responders status summary chips to the shared matrix so no hardcoded per-status tone overrides remain in this requirement area.
- Findings: none

# Security Results
- Reviewed implementation files:
  - `web/src/lib/status/status-badge-matrix.ts`
  - `web/src/components/jobs/responder-jobs-page.tsx`
  - `web/src/components/jobs/responder-requests-page.tsx`
  - `web/src/components/jobs/responder-shifts-page.tsx`
  - `web/src/components/dashboard/responder-dashboard.tsx`
  - `web/src/components/dashboard/organization-dashboard.tsx`
  - `web/src/components/jobs/organization-job-detail-page.tsx`
  - `web/src/components/jobs/organization-offer-requests-page.tsx`
  - `web/src/components/contracts/responder-contracts-page.tsx`
  - `web/src/components/contracts/organization-contracts-page.tsx`
  - `web/src/components/admin/admin-accounts-page.tsx`
  - `web/src/components/admin/admin-contract-template-page.tsx`
  - `web/src/components/jobs/organization-jobs-page.tsx`
  - `web/src/components/jobs/organization-shifts-page.tsx`
  - `web/src/components/responders/organization-responders-page.tsx`
  - `web/src/components/admin/admin-contract-template-page.tsx`
  - `docs/web-design-system.md`
- Decision: pass (`ux`)
- Findings: none
Changes: `security review only`, requirement file moved to `ux`; status updated to `ux`.

## UX Results
- Decision: pass
- Changes: web/src/lib/status/status-badge-matrix.ts, web/src/components/dashboard/organization-dashboard.tsx, web/src/components/jobs/organization-jobs-page.tsx, web/src/components/jobs/organization-shifts-page.tsx, web/src/components/jobs/organization-job-detail-page.tsx, web/src/components/jobs/organization-offer-requests-page.tsx, web/src/components/contracts/organization-contracts-page.tsx, web/src/components/contracts/responder-contracts-page.tsx, web/src/components/admin/admin-contract-template-page.tsx, web/src/components/admin/admin-accounts-page.tsx, web/src/components/responders/organization-responders-page.tsx, web/src/components/jobs/responder-jobs-page.tsx, web/src/components/jobs/responder-requests-page.tsx, web/src/components/jobs/responder-shifts-page.tsx

## Deploy Results
- `node scripts/qa-gate.js` (pass)
- `npm --prefix web run lint` (pass)
- `npm --prefix web run build` (pass)
- Scope: frontend batch check
