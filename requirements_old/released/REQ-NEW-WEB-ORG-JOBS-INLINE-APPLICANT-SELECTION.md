---
id: REQ-NEW-WEB-ORG-JOBS-INLINE-APPLICANT-SELECTION
title: Inline applicant selection in organization jobs workspace
status: released
implementation_scope: frontend
review_risk: low
review_scope: qa_only
source: user-2026-02-12-org-jobs-remove-request-workbench-inline-applicants
---

# Goal
Enable organization users to review and decide applicants directly in `/{locale}/app/organizations/jobs` without a separate request workbench block.

# Scope
- Frontend behavior in active track `web/`.
- Organization jobs workspace route `/{locale}/app/organizations/jobs`.
- Left occurrence selection with right applicant panel in the same screen.
- Inline applicant decisions (`BOOKED`, `DECLINED`) for the selected occurrence.

# Task Outline
- Remove the standalone request workbench block and related CTA from jobs workspace.
- Ensure deterministic master-detail behavior: selected occurrence on the left drives right-panel applicant data.
- Provide inline `BOOKED` and `DECLINED` actions in the right panel using existing adapter contracts.
- Reflect decision outcomes in panel data and relevant status indicators.
- Preserve locale-prefixed routing, auth/session guard handling, and message-key based production copy.

# Acceptance Criteria
- [ ] `/{locale}/app/organizations/jobs` no longer renders a separate request workbench block.
- [ ] Selecting an occurrence on the left updates the right panel with applicants for that exact occurrence.
- [ ] `BOOKED` and `DECLINED` actions are executable inline and decision results are reflected deterministically.
- [ ] The applicant panel explicitly handles `loading`, `empty`, and `error` states, and shows decision success feedback.
- [ ] Locale-prefixed routing and guard behavior stay unchanged, and no hardcoded production copy is introduced.

# Out of Scope
- Backend, API, or database schema changes.
- Removing `/{locale}/app/organizations/offer-requests` as a route.
- Permission or role model redesign.

# Constraints
- New frontend behavior must be implemented in `web/` (not `web_legacy/`).
- Request decision lifecycle and actions must remain aligned with documented jobs/request flow.
- Existing adapter/API contract boundaries for request decisions must remain unchanged.
- QA evidence must follow frontend flow baseline for happy path, error path, guards, and locale routing.

# References
- `docs/web-jobs-requests-flow.md`
- `docs/web-api-adapter-contract.md`
- `docs/web-product-structure.md`
- `docs/web-governance.md`
- `docs/web-quality-test-program.md`

# Architecture Notes
- Keep the selected occurrence as the single source of truth for applicant panel state to prevent stale or cross-occurrence actions.
- Keep decision execution on the existing jobs request adapter contracts; avoid adding direct network paths in components.
- Preserve route and guard invariants from `docs/web-product-structure.md` and `docs/web-governance.md`; only UI composition changes are in scope.
- Treat inline decision effects as stateful UI updates first, with existing adapter/error handling for non-happy paths.
- Keep i18n-driven UI copy and existing status feedback tokens to satisfy `web-quality-test-program.md` hardcoded-copy and locale checks.

# Implementation Guardrails
- Maintain boundary: jobs page shell owns selection state; request list, panels, and actions consume it as input.
- Keep adapter contract usage unchanged; any new action/error path should remain through existing `ApiResult` and error-class handling.
- If decision changes affect occurrence status counters or badges, refresh from the same canonical data source the page already uses.

# Architecture Results
- Ready for implementation handoff; requirement aligns with `docs/web-jobs-requests-flow.md` and routing invariants.
- Scope remains in `web/` with bounded UI risk.
- Changes: moved to `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-ORG-JOBS-INLINE-APPLICANT-SELECTION.md`, set `status: dev`, added `Architecture Notes` and `Architecture Results`.

## QA Review Results
- Mode: quick per-requirement code review
- Decision: pass
- Summary: Inline applicant selection is implemented in the organization jobs workspace with left-side occurrence selection driving the right applicant panel, and inline BOOKED/DECLINED actions using existing request-decision contracts. Loading, empty, and error states plus explicit action feedback remain message-key-driven, with deterministic refresh after decision updates via loadData.
- Findings: none

# Security Results
- Reviewed implementation files:
  - `web/src/components/jobs/organization-jobs-page.tsx`
  - `web/src/lib/api/adapters/jobs.ts`
  - `web/src/app/[locale]/app/organizations/jobs/page.tsx`
  - `docs/web-jobs-requests-flow.md`
  - `docs/web-auth-flows.md`
  - `docs/web-product-structure.md`
  - `docs/web-governance.md`
- Decision: pass (`ux`)
- Findings: none
Changes: reviewed implementation and docs; no security code changes were required; requirement file moved from `/home/sebas/git/agents/requirements/sec/REQ-NEW-WEB-ORG-JOBS-INLINE-APPLICANT-SELECTION.md` to `/home/sebas/git/agents/requirements/ux/REQ-NEW-WEB-ORG-JOBS-INLINE-APPLICANT-SELECTION.md`.

## UX Results
- Decision: pass
- Changes: web/src/components/jobs/organization-jobs-page.tsx, web/src/components/jobs/organization-offer-requests-page.tsx

## Deploy Results
- `node scripts/qa-gate.js` (pass)
- `npm --prefix web run lint` (pass)
- `npm --prefix web run build` (pass)
- Scope: frontend batch check
