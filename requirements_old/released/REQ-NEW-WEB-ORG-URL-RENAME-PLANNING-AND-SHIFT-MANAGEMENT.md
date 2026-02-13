---
id: REQ-NEW-WEB-ORG-URL-RENAME-PLANNING-AND-SHIFT-MANAGEMENT
title: Rename organization canonical route slugs to planning and shift-management
status: released
source: user-2026-02-12-org-url-rename-shifts-jobs
implementation_scope: frontend
review_risk: low
review_scope: qa_only
---

# Goal
Align canonical organization routes to explicit planning and shift-management slugs while preserving backward compatibility.

# Scope
- Frontend route and navigation behavior in `web/` for organization planning and shift-management.
- Canonicalization and alias behavior for legacy organization `shifts` and `jobs` paths.
- No backend/API or auth model changes.

# Task Outline
- Keep canonical routes as `/{locale}/app/organizations/planning` and `/{locale}/app/organizations/shift-management`.
- Keep occurrence detail canonical at `/{locale}/app/organizations/shift-management/{id}?occurrence={occurrenceId}`.
- Ensure legacy `/{locale}/app/organizations/jobs` routes to shift-management.
- Ensure legacy `/{locale}/app/organizations/jobs/{id}?occurrence={occurrenceId}` routes to shift-management detail.
- Ensure legacy `/{locale}/app/organizations/shifts` and `/{locale}/app/organizations/shifts/new` map to planning/shift-management equivalents per docs.
- Update in-app links, deep links, and UAT/docs references to canonical targets.

# Acceptance Criteria
- `/{locale}/app/organizations/planning` and `/{locale}/app/organizations/shift-management` are canonical surfaces.
- Legacy organization jobs/shifts URLs deterministically resolve to canonical counterparts.
- Occurrence detail links retain `occurrence` semantics after redirection.
- Route guards and locale behavior remain unchanged through legacy-to-canonical transitions.
- Canonical and alias references are consistent in relevant docs and in-app navigation.

# Out of Scope
- Backend/API contract changes.
- Permission/role behavior changes.
- Changes outside organization planning or shift-management surfaces.

# Constraints
- Canonical and alias route behavior must match `docs/web-product-structure.md` and `docs/web-shifts-planning-flow.md`.
- Shift-management occurrence deep-links must remain aligned with `docs/web-jobs-requests-flow.md`.

# References
- `docs/web-product-structure.md`
- `docs/web-shifts-planning-flow.md`
- `docs/web-jobs-requests-flow.md`

# Architecture Notes
- Keep canonical targets explicit and stable: `/app/organizations/planning` and `/app/organizations/shift-management`.
- Preserve deterministic legacy compatibility mapping only, with no new behavioral contracts beyond route aliasing.
- Ensure alias handling keeps occurrence detail semantics (`occurrence` query) intact on detail redirection.
- Keep route and locale guard model unchanged; only route-normalization behavior for organization URLs is in scope.
- Update internal docs/references only when they are user-facing canonical sources, to avoid navigation divergence.

# Implementation Guardrails
- Centralize route mapping in existing router/entry points for these aliases instead of duplicating redirect logic per component.
- Treat canonicalization as idempotent: canonical URLs should stay canonical and aliases should converge to the same surface repeatedly.
- Keep role checks and locale prefixing orthogonal to alias mapping to avoid accidental permission regressions.

# Architecture Results
- No doc-level contradictions found; route mappings are already declared in `web-product-structure.md`.
- Scope is narrow and front-end only; architecture risk remains low.
- Changes: moved to `/home/sebas/git/agents/requirements/dev/REQ-NEW-WEB-ORG-URL-RENAME-PLANNING-AND-SHIFT-MANAGEMENT.md`, set `status` to `dev`, replaced `PO Results` with `Architecture Notes`, `Implementation Guardrails`, and `Architecture Results`.

## QA Review Results
- Mode: quick per-requirement code review
- Decision: pass
- Summary: Canonical planning and shift-management routes are in place with alias paths redirecting deterministically to their canonical equivalents while preserving query strings, including occurrence deep-links.
- Findings: none

## QA Batch Test Results
- Status: fail
- Summary: Batch checks showed web lint passes but backend tests fail with TypeScript regression and one deterministic assertion mismatch. The batch is not safe to advance until these are fixed.
- Blocking findings: TypeScript enum mismatch: booking/request status uses `CANCELLED`, but `CANCELED` is still referenced in `src/job-offers/job-offers.service.ts` and many job-offers tests, causing repeated compile failures. | Test compile errors also appear in `src/job-offers/job-offers.booking-deadline.test.ts` for unknown field `seriesStart` in `JobOfferInput`, indicating an API/input type drift. | One runtime test failure remains in `src/participant-profile/participant-profile.service.test.ts` due to expected participant ordering mismatch. | App test suite result: 188 tests, 162 passed, 26 failed (exit code 1).

- Summary: Batch FE/BE validation failed due to a pre-existing frontend lint regression in organization-jobs-page; backend tests passed fully.
- Blocking findings: web lint fails: calling React setState synchronously inside useEffect in web/src/components/jobs/organization-jobs-page.tsx (lines 568 and 661), likely pre-existing but blocks batch pass.

## QA Re-Decision
- Mode: quick follow-up + required checks
- Decision: pass
- Summary: Canonical/alias route behavior is complete and consistent, and required checks pass (`npm --prefix web run lint`, `npm --prefix web run build`, `npm --prefix app run build`, `npm run test` in `app`) with no newly introduced hard blockers.
- Findings: none
- Changes: this blocker is cleared without additional code changes in this review step; implementation already resides in `web/src/lib/route-helpers.ts`, route/page aliases under `web/src/app/[locale]/app/organizations/`, and navigation updates in `web/src/lib/navigation.ts` and related org links.
