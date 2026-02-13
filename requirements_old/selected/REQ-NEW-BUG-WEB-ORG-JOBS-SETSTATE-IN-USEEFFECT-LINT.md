---
id: REQ-NEW-BUG-WEB-ORG-JOBS-SETSTATE-IN-USEEFFECT-LINT
title: Fix synchronous setState in useEffect on organization jobs page
status: selected
implementation_scope: frontend
source: user-2026-02-13-blocked-release-followup
---

# Summary
Remove the lint-blocking pattern where React state is set synchronously inside `useEffect` in the organization jobs page.

# Notes
- Scope: `web/` only.
- Target file: `web/src/components/jobs/organization-jobs-page.tsx`.
- Replace effect logic so it does not synchronously call `setState` in ways that violate current lint rules.
- Keep existing behavior and route/query synchronization unchanged.
- Ensure `npm --prefix web run lint` passes after the fix.

# Acceptance Criteria
- [ ] Lint warnings/errors about synchronous `setState` in `useEffect` are removed for the organization jobs page.
- [ ] Behavior of filters/view state remains functionally equivalent.
- [ ] No new lint violations are introduced in modified files.

# ReqEng Results
- Captured one remaining frontend blocker after app-side fixes were already completed.
- Scoped bug to a concrete file and rule to keep fix small and verifiable.
- Requirement is clear and intended for immediate implementation, therefore routed to `selected`.

Changes: `/home/sebas/git/shift-matching/requirements/selected/REQ-NEW-BUG-WEB-ORG-JOBS-SETSTATE-IN-USEEFFECT-LINT.md`
