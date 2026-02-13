---
id: REQ-NEW-WEB-ORG-DASHBOARD-PLANNING-STATUS-PARITY-AND-OVERVIEW
title: Align org dashboard and planning status tones with binding matrix
status: released
implementation_scope: frontend
review_risk: medium
review_scope: qa_ux
source: user-2026-02-12-org-dashboard-planning-status-overview
---

# Goal
Make organization dashboard and planning status visuals consistent, status-dependent, and aligned with the binding status-tone matrix.

# Scope
- Frontend behavior in active track `web/`.
- In-scope surfaces:
  - `/{locale}/app/organizations/dashboard`
  - `/{locale}/app/organizations/shifts`
- Cross-role consistency alignment for shared status badges on responder, organization, and admin surfaces where the same status domains appear.
- In-scope status domains:
  - `OfferRequestStatus`
  - `ShiftOccurrenceStatus`
  - `ProfileRequestStatus`
  - `AccountStatus`
  - contract statuses (`active`, `pending`, `expired`)
  - admin contract-template statuses (`active`, `inactive`)

# Task Outline
- Centralize status presentation mapping (label key plus tone category) and remove per-page mapping drift.
- Apply binding status-tone mapping to organization dashboard and planning status badges.
- Fix organization dashboard shift badges to be status-dependent instead of static tone.
- Add a planning top overview row with deterministic status buckets and counts.
- Apply deterministic deadline urgency chip tones for planning cards.

# Acceptance Criteria
- [ ] One centralized mapping source is used for in-scope status badges across active web role surfaces.
- [ ] Status badges follow binding tone mappings from `docs/web-design-system.md` for offer requests, shift occurrences, profile requests, accounts, contracts, and admin contract-template states.
- [ ] Organization dashboard and planning surfaces render status-dependent tones with no static single-tone fallback for shift statuses.
- [ ] Planning top overview displays deterministic counts for upcoming scope buckets derived from occurrence statuses, and deadline urgency chips follow deterministic thresholds (expired, within 5 days, beyond 5 days).
- [ ] Status feedback remains text plus tone (no color-only communication), and locale-prefixed routing and guard behavior remain unchanged.

# Out of Scope
- Backend, API, or database changes.
- Status lifecycle or business-rule changes.
- Route or role-model changes.

# Constraints
- Keep implementation in active frontend track `web/` only.
- Keep status semantics aligned with `docs/web-jobs-requests-flow.md`, `docs/web-contracts-flow.md`, and `docs/web-api-adapter-contract.md`.
- Keep status-tone and accessibility behavior aligned with `docs/web-design-system.md`, `docs/modern-ui.md`, and `docs/web-quality-test-program.md`.
- Keep dashboard and planning route behavior aligned with `docs/web-dashboard-flow.md`, `docs/web-shifts-planning-flow.md`, and `docs/web-auth-flows.md`.

# References
- `docs/web-dashboard-flow.md`
- `docs/web-shifts-planning-flow.md`
- `docs/web-design-system.md`
- `docs/modern-ui.md`
- `docs/web-jobs-requests-flow.md`
- `docs/web-contracts-flow.md`
- `docs/web-api-adapter-contract.md`
- `docs/web-quality-test-program.md`
- `docs/web-auth-flows.md`

# PO Results
- Decision: No direct contradiction with current docs; requirement is ready for implementation handoff.
- Decision: `implementation_scope` remains `frontend` in split mode because scope is UI status presentation and planning overview behavior.
- Decision: `review_risk` is `medium` and `review_scope` is `qa_ux` due cross-role consistency and accessibility impact across multiple UI surfaces.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-WEB-ORG-DASHBOARD-PLANNING-STATUS-PARITY-AND-OVERVIEW.md`, `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-ORG-DASHBOARD-PLANNING-STATUS-PARITY-AND-OVERVIEW.md`

# Architecture Notes
- Keep one shared status mapping source for badge label and tone across all in-scope domains and role surfaces in `web/`.
- Use only binding tone categories from `docs/web-design-system.md` and preserve domain enum spellings (`CANCELLED` vs `CANCELED`).
- Planning overview counts must be derived from `ShiftOccurrenceStatus` using deterministic bucket rules, not ad-hoc page logic.
- Deadline urgency chips must use one deterministic time reference per render cycle to avoid badge/count mismatches.
- Keep dashboard and planning routes, locale prefixes, and role/session guards unchanged.

# Implementation Guardrails
- Keep changes frontend-only; do not alter status lifecycles, API payload contracts, or backend query semantics.
- Do not introduce page-local tone overrides for statuses covered by the binding matrix.
- Preserve existing dashboard-to-planning action targets (`jobs`, `shifts?view=list|calendar`, `jobs?create=1`).
- Keep status feedback as text plus tone; no color-only communication.

# Risks & Tradeoffs
- Centralized mapping improves consistency but increases impact of mapping regressions across multiple surfaces.
- Adding planning overview buckets improves clarity but can create trust issues if count and card logic diverge.

# Architecture Results
- Decision: Ready for DEV; docs consistently support centralized status-tone mapping and org dashboard/planning responsibilities.
- Decision: `review_risk` remains `medium` due cross-surface UI behavior coupling and deterministic bucket/urgency logic.
- Decision: `review_scope` remains `qa_ux` to validate status semantics, accessibility, and parity across role surfaces.
- Changes: Updated front matter status to `dev`; added Architecture Notes, Implementation Guardrails, Risks & Tradeoffs, and Architecture Results.

# Dev Results
- Added a planning top overview row on `/{locale}/app/organizations/shifts` that shows deterministic upcoming counts bucketed by `ShiftOccurrenceStatus` (`OPEN`, `HAS_APPLICANTS`, `ASSIGNED`, `CLOSED_EMPTY`, `WITHDRAWN`, `CANCELED`).
- Applied deterministic deadline urgency chips on planning cards using one shared render reference timestamp and thresholds (`expired`, `within 5 days`, `beyond 5 days`).
- Wired urgency chip tones to binding categories through shared tone classes (`error`, `warn_open`, `neutral`) and kept text-plus-tone status feedback.
- Added localized copy for planning overview and urgency chip text in `de` and `en` message catalogs.
- Validation: `npm --prefix web run lint` (pass)
- Validation: `npm --prefix web run build` (pass)
- Changes: `web/src/components/jobs/organization-shifts-page.tsx`, `web/messages/de.json`, `web/messages/en.json`, `/home/sebas/git/agents/requirements/qa/REQ-NEW-WEB-ORG-DASHBOARD-PLANNING-STATUS-PARITY-AND-OVERVIEW.md`

## QA Review Results
- Mode: quick per-requirement code review
- Decision: pass
- Summary: Review passes: the org shifts planning page now uses the centralized status badge matrix for shift statuses, adds deterministic planning overview buckets, and applies deterministic deadline urgency tones. Locale strings and mapping updates are present in both en/de locales without introducing router or guard regressions.
- Findings: none

# Security Results
- Reviewed implementation files against binding docs and authentication/guard behavior:
  - `web/src/components/jobs/organization-shifts-page.tsx`
  - `web/src/components/dashboard/organization-dashboard.tsx`
  - `web/src/lib/status/status-badge-matrix.ts`
  - `web/src/app/[locale]/app/organizations/shifts/page.tsx`
  - `docs/web-design-system.md`
  - `docs/web-dashboard-flow.md`
  - `docs/web-shifts-planning-flow.md`
- Decision: pass -> `ux`.
- Findings: none
Changes: `/home/sebas/git/agents/requirements/sec/REQ-NEW-WEB-ORG-DASHBOARD-PLANNING-STATUS-PARITY-AND-OVERVIEW.md` -> `/home/sebas/git/agents/requirements/ux/REQ-NEW-WEB-ORG-DASHBOARD-PLANNING-STATUS-PARITY-AND-OVERVIEW.md`

## UX Results
- Decision: pass
- Changes: web/src/components/jobs/organization-shifts-page.tsx, web/src/components/dashboard/organization-dashboard.tsx, web/src/lib/status/status-badge-matrix.ts, web/messages/de.json, web/messages/en.json

## Deploy Results
- `node scripts/qa-gate.js` (pass)
- `npm --prefix web run lint` (pass)
- `npm --prefix web run build` (pass)
- Scope: frontend batch check
