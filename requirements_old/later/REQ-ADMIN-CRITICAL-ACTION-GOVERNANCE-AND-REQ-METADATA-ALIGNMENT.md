---
id: REQ-ADMIN-CRITICAL-ACTION-GOVERNANCE-AND-REQ-METADATA-ALIGNMENT
title: Define admin critical-action governance contract and requirement metadata alignment
status: refinement
implementation_scope: fullstack
source: user-2026-02-11-admin-prod-readiness-followup
---

# Summary
Clarify and formalize two linked gaps before implementation: (1) governance-hardening for irreversible admin actions and (2) requirement metadata/status consistency for the active admin delivery set.

# Problem Statement
- Admin governance doc requires `reason capture`, dependency checks, and auditable critical actions.
- Current runtime contracts and selected requirements do not yet define the exact enforcement model end-to-end.
- The active admin requirement set should follow consistent queue metadata semantics so flow gates remain deterministic.

# Scope Candidates
- Backend/API contract for critical admin actions (`activate`, `deactivate`, `anonymize`, `delete`, reset-class actions).
- Frontend UX contract for mandatory confirmations and reason input.
- Audit event persistence and payload policy.
- Requirement metadata policy for selected admin requirements (status and required result sections).

# Clarifications Needed
- Which actions require mandatory `reason` input, and what are validation rules (length, allowed values, optional context)?
- Dependency check policy for destructive actions: hard-block, soft-block with override, or forced alternative action?
- Audit storage policy: structured database audit table/events vs log-only, and retention expectations.
- API response contract for blocked critical actions (`409` vs `422`, error code taxonomy).
- Requirement metadata policy for queue files in `selected`: required status value, required sections, and enforcement point (manual vs gate check).

# Expected Outcome
- Architecture-ready requirement split into implementable items (FE/BE/QA/doc updates).
- Explicit decision log for governance rules and queue metadata rules.

# References
- `docs/web-admin-governance-flow.md`
- `docs/web-quality-test-program.md`
- `docs/development-constraints.md`
- `agents/requirements/README.md`
