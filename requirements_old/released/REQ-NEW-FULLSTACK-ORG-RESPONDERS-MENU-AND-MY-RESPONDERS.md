---
id: REQ-NEW-FULLSTACK-ORG-RESPONDERS-MENU-AND-MY-RESPONDERS
title: Split organization responder menu into search and my responders
status: released
source: user-2026-02-12-org-responders-menu-my-responders
implementation_scope: fullstack
review_risk: medium
review_scope: qa_ux
---

## Goal
Separate responder navigation into a search surface and a managed “my responders” surface, with booking + active-contract context.

## Scope
- Organization `web/` navigation and responder pages.
- Backend/app support needed for responder aggregates and contract-activity status used by the new page.
- Keep locale-prefixed routing (`/de`, `/en`) and organization role access model unchanged.

## Task Outline
- Rename the existing organization responder menu label to `Einsatzkräfte suchen`.
- Add a new organization menu entry `Meine Einsatzkräfte` above it.
- Implement `Meine Einsatzkräfte` listing responders with at least one organization-scoped `BOOKED` request.
- Include per-responder aggregated booking context (booking count, latest booking timestamp).
- Add contract-context indicator based on active contract state.
- Add filters for contract status: all, with active contract, without active contract.

## Acceptance Criteria
- Organization users can access both `Meine Einsatzkräfte` and `Einsatzkräfte suchen` in navigation.
- `Meine Einsatzkräfte` shows only responders with at least one `BOOKED` booking in the current organization context.
- Each responder card shows booking count and latest booking date/time.
- Active contract marker is shown deterministically using existing contract activity rules.
- Contract filters return expected results for each option.

## Out of Scope
- Changes to contract lifecycle states.
- New ranking/scoring behavior.
- Non-organization role menu redesigns.

## Constraints
- `web/` implementation must follow `docs/web-governance.md`.
- Keep Employer role and guard behavior aligned with `docs/roles-and-functions.md`.
- Keep terminology and behavior within defined scope (`docs/scope-boundaries.md`).
- Use docs-aligned wording and do not hardcode production copy.

## References
- `docs/glossary.md`
- `docs/roles-and-functions.md`
- `docs/data-model-reference.md`
- `docs/api-reference.md`
- `docs/web-governance.md`
- `docs/scope-boundaries.md`

## Architecture Notes
- Keep `EMPLOYER` role access on both responder surfaces and reuse existing role/route guard behavior.
- Add a single backend responder aggregate contract returning `bookedCount`, `latestBookingAt`, and `activeContract` per responder to avoid UI-side derivation.
- Compute `activeContract` from existing contract activity rules in one place and reuse it for both menu surfaces.
- Preserve locale routing (`/de`, `/en`) and menu structure order without changing legacy route contracts.
- Keep labels in i18n catalogs; avoid inline copy.

## Implementation Guardrails
- Run booking and contract filter logic in the data layer/API boundary to prevent page-level N+1 and keep results deterministic.
- Contract filter values are explicit: `all`, `withActiveContract`, `withoutActiveContract`.
- `Meine Einsatzkräfte` must only include responders with at least one `BOOKED` request in the current employer context.

## Architecture Results
- No conflict with navigation, role, or scope constraints in referenced docs.
- Changes: added architecture contracts for aggregate data shape, role-gated endpoints, deterministic active-contract marker, and locale-safe navigation split.

## PO Results
- Decision: no direct docs contradiction; requirement is implementation-ready after normalizing menu wording to umlauted UI terms.
- Decision: split is scoped to organization menu/navigation and responder data shaping and moved to `arch`.
- Changes: `/home/sebas/git/agents/requirements/selected/REQ-NEW-FULLSTACK-ORG-RESPONDERS-MENU-AND-MY-RESPONDERS.md` moved to `/home/sebas/git/agents/requirements/arch/REQ-NEW-FULLSTACK-ORG-RESPONDERS-MENU-AND-MY-RESPONDERS.md`

## QA Review Results
- Mode: quick per-requirement code review
- Decision: pass
- Summary: Organization responder navigation now exposes both `My Responders` and `Find Responders` entry points, with `Meine Einsatzkräfte` backed by a dedicated `GET /participants/profile/my-responders` aggregate endpoint and booking/active-contract indicators. No schema changes were introduced for this flow and the existing route/guard structure remains employer-scoped with locale routing preserved.
- Findings: none

## QA Batch Test Results
- Status: fail
- Summary: Batch checks showed web lint passes but backend tests fail with TypeScript regression and one deterministic assertion mismatch. The batch is not safe to advance until these are fixed.
- Blocking findings: TypeScript enum mismatch: booking/request status uses `CANCELLED`, but `CANCELED` is still referenced in `src/job-offers/job-offers.service.ts` and many job-offers tests, causing repeated compile failures. | Test compile errors also appear in `src/job-offers/job-offers.booking-deadline.test.ts` for unknown field `seriesStart` in `JobOfferInput`, indicating an API/input type drift. | One runtime test failure remains in `src/participant-profile/participant-profile.service.test.ts` due to expected participant ordering mismatch. | App test suite result: 188 tests, 162 passed, 26 failed (exit code 1).
