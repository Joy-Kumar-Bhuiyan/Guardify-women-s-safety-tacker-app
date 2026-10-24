# Production-readiness report

Date: 2026-10-25

## Outcome

Guardify has been converted from an insecure prototype into a typed, tested, consent-first Vue PWA and Express/Firebase service while preserving the existing product purpose and repository history. The `production-ready` branch is the only delivery target; `main` is untouched.

This is a release candidate, not an unconditional production launch approval. The application must not be launched until the owner completes the blocked controls below and the pushed GitHub checks pass.

## Verified locally

- Root formatting, lint, strict typecheck, coverage tests, and production builds pass.
- Backend: 28 tests pass, 88.75% line coverage, and 100% line coverage for authentication plus security crypto/PIN paths.
- Frontend: 8 unit/component tests pass; the API client has 100% statement/line/function coverage.
- Playwright: 4 release tests pass for public tracking and acknowledgement, expiration privacy, denied geolocation, contact opt-in, and logout.
- Root, backend, and frontend production dependency audits report zero vulnerabilities.
- The production PWA contains 24 precache entries, disables source maps, and keeps its largest JavaScript chunk at 148.60 kB.
- Working-tree high-risk token scanning and `git diff --check` pass.

Docker and gitleaks executables are unavailable on the verification host, so the container build and complete Git-history secret scan are delegated to GitHub Actions and must be reviewed after push.

## Launch blockers and owner actions

1. Implement and device-test a Web Push/VAPID subscription and delivery path, or formally remove push from the launch requirements. The current UI reports it as unavailable and never claims delivery.
2. Rotate every credential named in `SECRETS_ROTATION.md`, verify the old values fail, and decide whether the repository history requires a coordinated rewrite.
3. Configure Firebase Authentication policies, authorized domains, email verification, abuse protection, optional MFA, and account recovery.
4. Provision Firestore, deploy the deny-all browser rules and indexes, configure backup/retention, and complete an isolated restore drill.
5. Configure verified Twilio and Resend senders, spending/abuse controls, and sandbox failure/retry/dead-letter drills.
6. Deploy staging, set the GitHub `STAGING_URL` variable, run ZAP and guarded k6 tests, and complete the manual security/IDOR matrix.
7. Validate the PWA on current Android Chrome and iOS Safari, including installation, offline replay, location denial, 200% zoom, keyboard/screen-reader behavior, and Lighthouse targets.
8. Use a distributed rate limiter before operating multiple API replicas.

## Security posture

The release candidate uses server-verified Firebase identities, short-lived HttpOnly sessions, rotating hashed refresh tokens with reuse-family revocation, centralized owner/admin authorization, strict schemas, origin-based CSRF protection, hardened headers, scoped rate limits, structured redacted logs, and encrypted sensitive fields. Contact consent is explicit and revocable. SOS attempts are idempotent and provider results are independent and honest.

The residual High risk is missing Web Push where it remains a stated requirement. Historical-secret exposure remains unresolved until rotation and the full-history gitleaks result are complete. Provider, staging, device, accessibility, performance, recovery, and deployment claims remain unverified until the owner-controlled exercises above are recorded.

See `AUDIT.md`, `THREAT_MODEL.md`, `RUNBOOK.md`, `QA_CHECKLIST.md`, and `SECRETS_ROTATION.md` for evidence and procedures.
