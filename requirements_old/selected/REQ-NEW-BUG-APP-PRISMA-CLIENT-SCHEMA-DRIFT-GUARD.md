---
id: REQ-NEW-BUG-APP-PRISMA-CLIENT-SCHEMA-DRIFT-GUARD
title: Add guard against Prisma client/schema drift in app quality gates
status: selected
implementation_scope: fullstack
source: user-2026-02-13-blocked-release-followup
---

# Summary
Prevent recurring compile/test failures caused by stale Prisma client generation after schema or enum changes.

# Notes
- Scope: `app/` build/test pipeline and related scripts only.
- Add an explicit guard in quality flow so Prisma client is aligned with current schema before compile/tests.
- Preferred outcome: deterministic CI/local checks fail fast with clear guidance if generated client is stale.
- Keep domain behavior unchanged; this is tooling/quality hardening.

# Acceptance Criteria
- [ ] App quality workflow includes a deterministic Prisma client alignment check or generation step.
- [ ] Stale generated client state is detected before TypeScript compile/test phases.
- [ ] Error message/action for developers is explicit and reproducible.
- [ ] Existing passing app test baseline remains intact.

# ReqEng Results
- Converted repeated blocker pattern (enum/type drift) into a dedicated preventive bug requirement.
- Scoped to tooling/quality gates to avoid repeating blocked batches.
- Requirement is clear and intended for immediate implementation, therefore routed to `selected`.

Changes: `/home/sebas/git/shift-matching/requirements/selected/REQ-NEW-BUG-APP-PRISMA-CLIENT-SCHEMA-DRIFT-GUARD.md`
