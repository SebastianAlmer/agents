---
id: REQ-DEV-BOOTSTRAP-DEMO-ACCOUNTS
title: Auto-bootstrap fixed demo accounts in development environment
status: new
source: user-2026-02-10-transcript-item-1
---

# Summary
In development systems (`ENV=dev`), the platform must automatically provide three fixed demo accounts in the database: one Admin, one Organisation, and one Einsatzkraft.

# Scope
- Dev-only account bootstrap behavior.
- AuthAccount provisioning for fixed demo credentials.
- Required role profile bootstrap for Organisation and Einsatzkraft accounts.
- Idempotent behavior across repeated application starts.

# Requirements
- In development mode (`ENV=dev`), ensure these accounts exist in DB:
  - `admin@demo.de` with role `ADMIN`, status `ACTIVE`, password `Start1234!`
  - `org@demo.de` with role `EMPLOYER`, status `ACTIVE`, password `Start1234!`
  - `user@demo.de` with role `PARTICIPANT` (Einsatzkraft), status `ACTIVE`, password `Start1234!`
- Passwords must be persisted as hashes only; no plaintext storage.
- For `org@demo.de` and `user@demo.de`, set `emailVerifiedAt` so password login works with existing auth rules.
- Ensure required linked profile records exist:
  - `OrganisationProfile` for `org@demo.de`
  - `ParticipantProfile` for `user@demo.de`
- Bootstrap must be idempotent (no duplicates; repeated runs converge to defined role/status/password).
- Bootstrap must not run outside dev mode.

# Implementation Direction (for Dev)
- Preferred placement: API-side dev bootstrap service/hook executed on backend startup after DB connection, guarded by `ENV=dev`.
- Reason: this guarantees accounts are present in DB whenever a dev system starts, without requiring manual seed commands.

# Acceptance Criteria (draft)
- [ ] With `ENV=dev`, after backend startup exactly the three defined demo accounts exist with expected roles and `ACTIVE` status.
- [ ] `org@demo.de` and `user@demo.de` can log in via password flow with `Start1234!`.
- [ ] Repeated backend starts in `ENV=dev` do not create duplicate records.
- [ ] With non-dev environment, no automatic creation/update of these demo accounts occurs.
- [ ] Logs do not expose plaintext passwords.

# References
- `docs/scope-boundaries.md`
- `docs/roles-and-functions.md`
- `docs/decision-rights-and-approval-flow.md`
- `docs/api-reference.md`
- `docs/database-setup.md`
