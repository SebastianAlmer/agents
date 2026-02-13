---
id: REQ-CONTRACT-AUTOGEN-STORAGE-AND-DOWNLOAD
title: Ensure contract auto-generation, storage, and download access in booking flow
status: released
implementation_scope: fullstack
source: user-2026-02-09-transcript-item-4
---

# Summary
When booking occurs and no contract exists for the employer-participant pair, the system must generate the contract, store it, and expose it to both sides for download.

# Scope
- Contract creation trigger at booking transition.
- Contract PDF storage and retrieval.
- Contract visibility for employer and participant.

# Requirements
- Contract generation is triggered on first relevant `BOOKED` transition.
- Stored contract is accessible to both employer and participant.
- Contract generation remains idempotent per employer-participant pair.
- Download flow is available in contract views for both roles.

# Acceptance Criteria
- [x] First booking for a pair creates exactly one contract + PDF.
- [x] Later bookings for same pair do not create duplicate contracts.
- [x] Both roles can list and download their contracts.
- [x] Contract flow works in locale-prefixed routes (`/de`, `/en` handling per current phase rules).

# PO Results
- Decision: requirement was delivered in split form and released as part of contracts backend + frontend rollout.
- Decision: responder-side frontend integration was tracked and completed in follow-up requirement `REQ-CONTRACT-RESPONDER-LIVE-LIST-AND-DOWNLOAD`.
Changes: requirement retained in `released` as completed baseline contract capability.

# Architecture Results
- Decision: contract generation and archive access remain aligned with current scope boundaries and role visibility rules.
- Decision: active-template-first generation with technical fallback remains binding architecture behavior.
Changes: no additional architecture change required for release closure.

# Dev Results
- Backend: booking flow triggers contract generation when no active contract exists for employer-participant pair; duplicate generation for same active pair is prevented.
- Backend: contract PDFs are stored in configured S3-compatible storage and exposed via signed `downloadUrl` in archive responses.
- Frontend: organization and responder contract archive flows are implemented via `GET /contracts/me` adapter contract.
Changes: delivery completed across API contracts domain and web contract archive pages.

# QA Results
- Decision: pass; released-scope behavior is covered by downstream released requirements and final baseline checks.
- Validation: archive listing and download behavior are available for both participant and employer roles through contract archive flow.
Changes: released metadata normalized for final gate consistency.

# Security Results
- Decision: pass; contract document access remains role-scoped and URL-based access is controlled by backend-signed links.
- Validation: no public unauthenticated contract archive exposure in frontend route model.
Changes: no additional security remediation required for this requirement closure.

# UX Results
- Decision: pass; contract archive behavior is exposed with explicit status/availability states in active frontend flows.
- Validation: document-unavailable states remain visible and non-blocking at list level.
Changes: no additional UX remediation required for this requirement closure.

# Deploy Results
- Decision: pass; requirement is deploy-ready and represented by released runtime behavior in API + web.
- Validation: requirement is superseded in operational detail by released follow-up requirements while remaining valid as delivered baseline capability.
Changes: metadata and release sections completed to satisfy final released-scope gate.

# References
- `Anforderungen/9.2.26.vtt`
- `docs/scope-boundaries.md`
- `docs/contract-storage-runtime-config.md`
- `docs/web-contracts-flow.md`
- `docs/api-reference.md`
