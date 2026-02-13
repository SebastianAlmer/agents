---
id: REQ-NEW-WEB-SHIFT-TERMINOLOGY-AND-STATUS-COLOR-UNIFICATION
title: Unify shift terminology and status tone mapping in web UI
status: released
source: user-2026-02-12-shift-domain-clarification
implementation_scope: frontend
review_risk: medium
review_scope: qa_ux
---

# Goal
Use consistent shift terminology and shift-status tone and label mapping across active web surfaces.

# Scope
- Frontend behavior in `web/` where `ShiftOccurrenceStatus` is shown for organisation, responder, and admin users.
- Shared rendering for shift statuses only: `OPEN`, `HAS_APPLICANTS`, `ASSIGNED`, `CLOSED_EMPTY`, `WITHDRAWN`, `CANCELED`.
- Dashboard status grouping and order tied to the documented tone model.

# Task Outline
- Replace user-facing `job` and `offer` wording with shift-centric wording on in-scope screens.
- Apply one status mapping across in-scope screens: `OPEN` and `HAS_APPLICANTS` -> `warn_open`, `ASSIGNED` -> `success`, `CLOSED_EMPTY` -> `error`, `WITHDRAWN` -> `neutral`, `CANCELED` -> `error`.
- Apply one label mapping across in-scope screens: `OPEN` -> `Offen`, `HAS_APPLICANTS` -> `Offen mit Bewerbungen`, `ASSIGNED` -> `Besetzt`, `CLOSED_EMPTY` -> `Ohne Bewerbung`, `WITHDRAWN` -> `Zurueckgezogen`, `CANCELED` -> `Einsatzkraft abgesagt`.
- Keep non-shift status domains unchanged.
- Validate consistent behavior in dashboard, planning, shift-management, responder, and admin surfaces in `web/`.

# Acceptance Criteria
- In-scope UI uses shift-centric terminology and no user-facing `job` wording.
- All in-scope shift-status visuals follow the documented tone mapping.
- All in-scope shift-status labels follow the documented label mapping.
- `OfferRequest`, `ProfileRequest`, and account statuses are unchanged by this requirement.
- No behavior change is introduced in `web_legacy/`.

# Out of Scope
- Backend, API, database, or enum changes.
- New lifecycle states or business model changes.
- Harmonization of non-shift status domains.

# Constraints
- Follow `docs/web-governance.md` for shift status tone and label mapping.
- Keep role boundaries unchanged per `docs/roles-and-functions.md`.
- Keep locale routing under `/de` and `/en` unchanged.
- Keep UI terminology aligned with `docs/glossary.md`.

# References
- `docs/web-governance.md`
- `docs/glossary.md`
- `docs/scope-boundaries.md`
- `docs/data-model-reference.md`
- `docs/roles-and-functions.md`

## Architecture Notes
- Treat `docs/web-governance.md` status matrix as semantic source of truth (status -> tone), and resolve user-visible wording through i18n catalogs aligned with `docs/glossary.md`.
- Keep status rendering centralized in shared status mapping utilities so all in-scope screens consume one mapping contract.
- Limit this requirement to `ShiftOccurrenceStatus` only; do not change mapping behavior for request/account/profile/contract statuses.
- Apply terminology unification only to user-facing copy; API/runtime identifiers (`JobOffer`, `OfferRequest`) remain technical terms.
- Keep locale route behavior unchanged (`/de`, `/en`) and restrict changes to `web/` active track.

## Implementation Guardrails
- Drive labels through translation keys, not inline literals, so de/en remain consistent and governance-safe.
- Verify tone+label parity in each surface by checking the same status matrix path, not per-screen custom mappings.
- Keep `web_legacy/` untouched except existing maintenance-only allowances.

## Risks & Tradeoffs
- Centralizing mapping lowers drift risk but can expose latent inconsistencies at once across multiple screens in one release.

## Architecture Results
- No blocking architecture contradiction after reconciling governance matrix semantics with glossary-driven UI wording.
- Review routing kept at `medium` risk and expanded to `qa_ux` due cross-surface visual/status behavior changes.
- Changes: added architecture constraints for shared status contract, i18n-driven labels, and strict status-domain boundary.

# PO Results
- Decision: no direct contradiction found with current docs.
- Decision: requirement is implementation-ready and routed to `arch` with `implementation_scope: frontend`.
- Decision: set `review_risk: medium` due cross-surface impact; set `review_scope: qa_only`.

Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-WEB-SHIFT-TERMINOLOGY-AND-STATUS-COLOR-UNIFICATION.md -> /home/sebas/git/agents/requirements/arch/REQ-NEW-WEB-SHIFT-TERMINOLOGY-AND-STATUS-COLOR-UNIFICATION.md`

## QA Review Results
- Mode: quick per-requirement code review
- Decision: pass
- Summary: Requirement is implemented in web/i18n and shared status mapping for ShiftOccurrenceStatus with requested tone and label matrix now aligned to docs.
- Findings: none

## QA Batch Test Results
- Status: fail
- Summary: FE lint passed but BE batch tests failed: app reported 188 tests with 162 passing and 26 failing. The failures block both compilation and one runtime behavior check.
- Blocking findings: TypeScript compile errors in app: enum value 'CANCELED' is referenced but only 'CANCELLED' exists in status types (e.g., offer-request/job-offers contracts and service tests/files). | This enum mismatch causes many test files to fail during compilation with TS2551, including core job-offers service and rule tests. | One runtime regression in participant-profile.service.test.ts expects responder IDs sorted ['participant-2','participant-1']; actual order is ['participant-1','participant-2']; this sorting expectation may need update or sorting logic fix.
