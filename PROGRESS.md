# Guardify production-readiness progress

Status values: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED`, `N/A`.

## Step 0 and Milestone 1: audit and baseline — DONE

- DONE — Cloned the existing repository, preserved its history, and created `production-ready` without touching `main`.
- DONE — Mapped the inherited Vue/Firebase/Express architecture and sensitive data flows.
- DONE — Recorded severity-rated findings, target architecture, decisions, and mandatory secret rotation.
- DONE — Removed the BFG binary, OS/IDE junk, committed environment file, Firebase cache/config, old build config, and unused starter code.
- DONE — Added comprehensive ignores, agent guidance, pinned dependencies, strict TypeScript, ESLint, Prettier, Husky, and lint-staged.
- DONE — Replaced the vulnerable production dependency graphs; both production audits currently report zero vulnerabilities.

## Milestone 2: backend foundation and security — DONE

- DONE — Validated fail-fast environment configuration, separate modes, Railway proxy support, and production-safe errors.
- DONE — Firebase identity exchange, verified identities, 15-minute access cookies, rotating hashed refresh sessions, reuse-family revocation, logout/logout-all, device listing/revocation.
- DONE — Central user/admin authorization, owner-scoped resources, and negative cross-user tests.
- DONE — Strict Zod body/params/query schemas, unknown-field rejection, E.164 normalization, safe DTOs, and no arbitrary database paths/operators.
- DONE — Helmet/CSP/HSTS, exact-origin credentialed CORS, SameSite plus origin-based CSRF defense, body/time limits, global/auth/SOS/public rate limits.
- DONE — Redacted structured logging, request IDs, liveness/readiness, and graceful shutdown.
- DONE — Firestore and in-memory adapters, deny-all browser rules, required indexes, AES-256-GCM field encryption/key IDs, retention cleanup, and backup/restore runbook.
- N/A — A separate SQL migration layer and Redis container are not used because the retained platform is Firestore; a distributed limiter remains a production scaling control documented in the runbook.
- N/A — Password hashing, reset tokens, breached-password checks, progressive login protection, and optional MFA are delegated to Firebase Authentication and must be enabled/verified in the owner's Firebase policy.

## Milestone 3: core safety features — IN PROGRESS

- DONE — Encrypted emergency contacts with count limits, explicit single-use opt-in, destination-change re-consent, and explicit opt-out.
- DONE — Idempotent SOS, encrypted location, expiring tracking link, independent channel results, encrypted retry outbox, exponential backoff, dead-letter state, acknowledgement escalation, safety PIN, and silent duress PIN.
- DONE — Consent-bound live sharing with named audience, expiry/revoke/kill switch, location updates, SSE heartbeat/backpressure/revocation, tracking view, map-on-click, and acknowledgement.
- DONE — Safe journeys and scheduled check-ins with grace-period escalation jobs.
- DONE — Incident history, JSON export, per-incident delete, complete account erasure, and consent logs.
- DONE — Fake call, quick exit, Bangladesh 999/109, safety tips, and explicit nearby police/hospital lookup with graceful OpenStreetMap fallback.
- DONE — Persistent sharing indicator with current audience plus private abuse reporting/admin review.
- DONE — Twilio SMS and Resend email adapters with fail-fast configuration, isolation, timeouts, retries, and dead letters.
- BLOCKED — Web Push/VAPID subscription and delivery require provider/browser integration and VAPID keys; configuration placeholders and UI honesty are present, but launch must not claim push delivery.
- N/A — Power/volume-button native triggers are unavailable to a standards-based PWA; the accessible one-tap SOS and quick-exit remain available.

## Milestone 4: frontend — DONE

- DONE — Mobile-first route-split installable PWA, offline shell, Workbox background-sync queue for idempotent SOS, and sub-150 kB route/vendor chunks.
- DONE — Accessible high-contrast interface, skip link, focus states, status announcements, one-handed SOS, dark mode, large-text responsiveness, and reduced motion.
- DONE — English and Bangla i18n foundation.
- DONE — Firebase identity only in memory; application credentials only in HttpOnly cookies; no manually stored tokens, embedded secrets, inline scripts/eval, or production source maps.
- DONE — Loading/error/offline/empty/geolocation-denied states, safe error boundary, privacy/terms placeholders, and public pages without advertising/analytics.

## Milestone 5: testing — IN PROGRESS

- DONE — Backend unit/integration/security suites: 28 tests, 88.75% lines, 87% statements, 65.8% branches, 91.95% functions; auth and security crypto/PIN path line coverage is 100%.
- DONE — Frontend unit/component suite: 8 tests; API client 100% line/statement/function coverage and 84.84% branch coverage.
- DONE — Playwright covers public tracking/acknowledgement, expiration privacy, permission denial, contact opt-in, and logout.
- DONE — Provider isolation/rejection, retry/dead-letter, maintenance/escalation, SOS replay, cross-user IDOR, strict validation, CORS, refresh reuse, and duress behavior are automated.
- DONE — A guarded k6 staging SOS script and GitHub dependency audit, CodeQL, gitleaks, dependency review, and ZAP workflows exist.
- BLOCKED — Full authenticated provider-sandbox drills, measured k6 results, ZAP findings, Lighthouse 90+ evidence, and physical assistive-technology/device checks require an owner-controlled staging deployment.

## Milestone 6: CI/CD and deployment — IN PROGRESS

- DONE — CI installs reproducibly and checks formatting, lint, strict types, coverage tests, builds, high/critical audits, Playwright, container build, CodeQL, gitleaks, and dependency review.
- DONE — Dependabot for npm and GitHub Actions.
- DONE — Combined multi-stage, non-root, read-only-capable Docker image with healthcheck; Compose supplies the external Firebase-backed application.
- DONE — Railway Docker build, readiness gate, restart policy, environment table, staging/production, zero-downtime, and rollback instructions.
- BLOCKED — Local container execution is not possible on this host because Docker is unavailable; the CI container build and owner staging deployment are the verification gates.
- TODO — Push `production-ready` and record the resulting GitHub checks.

## Milestone 7: documentation — DONE

- DONE — README, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, MIT LICENSE, AGENTS, and rotation guide.
- DONE — API reference, baseline/final audit, architecture, decisions, STRIDE threat model, privacy baseline, runbook, and manual QA checklist.

## Milestone 8: final hardening — IN PROGRESS

- DONE — Working-tree high-risk token scan is clean; inherited-history risk remains explicitly subject to rotation and gitleaks CI.
- DONE — Removed old direct-database code, debug output, junk, and known oversized bundle; added safe pagination/limits and route splitting.
- DONE — Re-reviewed consent links, combined-image CSP/geolocation headers, contact re-consent, retry deduplication, and provider degradation.
- DONE — Final root formatting, lint, strict typecheck, coverage tests, builds, production audits, Playwright, diff checks, and working-tree secret checks pass locally.
- IN PROGRESS — Commit logical changes, push only `production-ready`, and inspect the resulting GitHub checks.

## Baseline evidence (2026-10-24)

- Frontend build passed but emitted a 753 kB JavaScript chunk warning.
- Frontend production audit failed with 2 critical, 6 high, and 1 moderate finding.
- Backend production audit failed with 5 critical, 7 high, 10 moderate, and 1 low finding.
- No tests, lint/typecheck gate, CI, security scan, or reliable authorization boundary existed.

## Current local evidence (2026-10-25; refresh after final push)

- Root `npm run verify`: PASS.
- Backend: lint/typecheck/build PASS; 28 tests PASS; 88.75% line coverage; production audit 0 vulnerabilities.
- Frontend: lint/typecheck/build PASS; 8 unit/component tests PASS; production audit 0 vulnerabilities.
- Playwright: 4 tests PASS, covering tracking/acknowledgement, expiry privacy, denied geolocation, contact consent, and logout.
- Largest production JavaScript chunk: 148.60 kB; source maps disabled; 24 PWA precache entries.
- Root production dependency audit: 0 vulnerabilities. `git diff --check` and the working-tree high-risk token scan pass.
- Docker/gitleaks executables are unavailable locally; equivalent CI jobs are configured.
