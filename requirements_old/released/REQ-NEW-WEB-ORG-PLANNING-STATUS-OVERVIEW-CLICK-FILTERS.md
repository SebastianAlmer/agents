---
id: REQ-NEW-WEB-ORG-PLANNING-STATUS-OVERVIEW-CLICK-FILTERS
title: Make planning status overview clickable as filters
status: released
implementation_scope: frontend
source: user-2026-02-12-planning-status-overview-click-filters
review_risk: low
review_scope: qa_only
---

# Summary
On `/{locale}/app/organizations/planning`, the status overview at the top must act as an interactive filter for the planning content on the same page.

# Notes
- Scope: `web/` only, organization planning page.
- Keep locale-prefixed routing and documented status/color semantics unchanged.
- Make each status item in the overview clickable.
- Clicking a status applies that status filter to visible planning entries.
- Active filter must be visually explicit.
- Clicking the active status again resets to unfiltered (`all`).
- Keep loading/empty/error handling explicit under filtering.
- Do not introduce hardcoded production copy; use message keys.

# Acceptance Criteria
- [ ] Every status item in planning status overview is clickable.
- [ ] Click on status `X` shows only planning entries with status `X`.
- [ ] Active status filter is clearly highlighted.
- [ ] Clicking the active filter again resets to unfiltered `all`.
- [ ] Behavior works on `/de/...` and `/en/...` planning routes.
- [ ] Existing status labels/colors stay aligned with docs.
- [ ] No regression in planning page loading/empty/error behavior.

# References
- `docs/web-governance.md`
- `docs/glossary.md`
- `docs/web-product-structure.md`

# Architecture Notes
- Keep filter as a URL-state concern so navigation and reloads preserve active status filter.
- Maintain locale routing (`/de`, `/en`) and status copy via existing i18n keys.
- Treat status values as read-only enum keys and avoid any write/mutation side effects when filtering.
- Ensure active state and toggle-off behavior are deterministic and keyboard-accessible.
- Keep existing loading/empty/error branches unchanged except for view narrowing.

# Architecture Results
- Decision: Requirement is architecture-ready for frontend implementation.
- Decision: `status` moved to `dev`; `review_risk` remains `low`; `review_scope` remains `qa_only`.
- Changes: status updated to `dev`; added `Architecture Notes` and `Architecture Results` replacing PO-only handoff section.

## QA Review Results
- Mode: quick per-requirement code review
- Decision: pass
- Summary: Status overview items are now clickable links that toggle URL-backed `status` filtering, with active items visually highlighted and a second click clearing back to unfiltered view.
- Findings: none

## QA Batch Test Results
- Status: fail
- Summary: Batch checks showed web lint passes but backend tests fail with TypeScript regression and one deterministic assertion mismatch. The batch is not safe to advance until these are fixed.
- Blocking findings: TypeScript enum mismatch: booking/request status uses `CANCELLED`, but `CANCELED` is still referenced in `src/job-offers/job-offers.service.ts` and many job-offers tests, causing repeated compile failures. | Test compile errors also appear in `src/job-offers/job-offers.booking-deadline.test.ts` for unknown field `seriesStart` in `JobOfferInput`, indicating an API/input type drift. | One runtime test failure remains in `src/participant-profile/participant-profile.service.test.ts` due to expected participant ordering mismatch. | App test suite result: 188 tests, 162 passed, 26 failed (exit code 1).
