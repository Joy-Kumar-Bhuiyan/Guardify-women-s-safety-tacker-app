# Release QA checklist

Record environment, commit SHA, tester, date, device/browser, evidence link, and result for every manual run.

## Automated gate

- [x] Backend lint and strict typecheck.
- [x] Backend unit/integration/security tests and coverage threshold.
- [x] Frontend lint and Vue typecheck.
- [x] Frontend unit/component tests and coverage threshold.
- [x] Frontend production PWA build with source maps disabled.
- [x] Backend production build.
- [x] Backend and frontend production dependency audit: zero high/critical.
- [x] Local Playwright release suite: 4/4 passed on 2026-10-25.
- [x] Working-tree high-risk token scan and `git diff --check`.
- [ ] CI results green on GitHub (requires push).
- [ ] CodeQL and gitleaks history scan green on GitHub (requires push; inherited findings may require rotation/history rewrite).

## Account and session

- [ ] Sign up; verify generic response and email verification.
- [ ] Unverified account cannot create application session.
- [ ] Login, refresh after 15 minutes, list devices, revoke another device, logout, logout-all.
- [ ] Password reset is single-user-neutral and does not enumerate accounts.
- [ ] Test Firebase lockout/progressive protection and optional MFA policy in staging.

## Safety flows

- [ ] Add contact; malformed phone/email rejected; contact receives opt-in; expired/reused link rejected; opt-out stops alerts.
- [ ] SOS online creates one incident, attempts every available channel independently, and exposes honest delivery states.
- [ ] Repeat SOS with same idempotency key returns the same incident.
- [ ] SOS offline clearly says not delivered; reconnect replays once; server deduplicates.
- [ ] Provider sandbox: SMS down still allows email/push attempts; retries/dead-letter alerts observed.
- [ ] Safety PIN resolves and removes live location. Duress PIN appears resolved while incident continues.
- [ ] Start sharing only with confirmed contacts; visible indicator remains; update; acknowledge; expiry; revoke; kill switch.
- [ ] Link reveals no identity/contact details and returns `noindex`, `no-store`, and no analytics.
- [ ] Journey arrival prevents escalation. ETA + grace creates escalation when missed.
- [ ] Check-in completion prevents escalation. Missed grace creates escalation.
- [ ] Export includes owner data without token hashes. Erasure removes Guardify/Firebase identity data.

## Authorization/security

- [x] Automated user A cannot access/delete user B contact.
- [ ] Repeat negative IDOR matrix in staging for sessions, contacts, shares, incidents, journeys, check-ins, export, and abuse reports.
- [ ] Forged/expired/reused tokens, prototype keys, injection strings, oversized JSON, bad CORS, rate limit, and replay attempts rejected.
- [ ] Verify production cookies are `Secure`, `HttpOnly`, `SameSite=Strict`; HSTS/CSP/permissions/referrer headers present.
- [ ] OWASP ZAP baseline against staging; triage every finding.

## Mobile/PWA/accessibility

- [ ] Install on current Chrome Android and Safari iOS; offline shell works.
- [ ] Geolocation/notification allow and deny paths are understandable.
- [ ] SOS reachable one-handed at 320 px width; 200% zoom has no lost content.
- [ ] Keyboard-only flow, visible focus, screen-reader labels/status announcements, dark mode, reduced motion, English/Bangla.
- [ ] Lighthouse Performance, Accessibility, Best Practices, SEO, and installability at 90+ on representative mobile hardware.

## Deployment/recovery

- [ ] Fresh clone follows README with no undocumented step.
- [ ] Combined non-root read-only container starts and health/readiness pass.
- [ ] Railway staging variables, custom domain, TLS, health gate, rollout, and rollback verified.
- [ ] Firestore deny rules/indexes deployed; backup configured; restore tested in isolated staging.
- [ ] Rotate all inherited credentials and verify old credentials fail.
