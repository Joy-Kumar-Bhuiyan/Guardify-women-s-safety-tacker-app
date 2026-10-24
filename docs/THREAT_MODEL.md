# Threat model

## Assets and safety goals

Assets: account identity, active sessions, precise/current location, contact destinations and consent, tracking tokens, incident/check-in/journey status, provider credentials, encryption keys, and abuse reports. Safety goals are confidentiality, owner control, timely best-effort notification, link revocation/expiry, and honest delivery state.

## Actors

- Legitimate user and opted-in trusted contact.
- Opportunistic web attacker and credential thief.
- Intimate partner/stalker with device access or a coerced user.
- Malicious user attempting provider spam/cost abuse.
- Insider or compromised provider/infrastructure account.
- Automated scanner or denial-of-service actor.

## STRIDE analysis

| Category               | Threat                                                          | Mitigation                                                                                                                                                  | Residual risk                                                                                                                   |
| ---------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Spoofing               | Stolen Firebase/password/session credential                     | Verified Firebase tokens, verified email/phone, HttpOnly cookies, 15-minute access token, rotating refresh hash, reuse-family revocation, device revocation | Compromised unlocked devices and email accounts remain powerful; optional TOTP is not yet implemented.                          |
| Tampering              | Forge owner IDs, coordinates, admin role, or duplicate SOS      | Server-derived user ID/role, strict schemas, owner-scoped repository, AES-GCM integrity, SOS idempotency                                                    | A compromised authenticated device can submit false information as its owner.                                                   |
| Repudiation            | Deny consent, share start, or alert action                      | Consent log, timestamps, request IDs, incident/delivery IDs, no sensitive log body                                                                          | No cryptographic non-repudiation; logs intentionally minimize personal data.                                                    |
| Information disclosure | IDOR, leaked tracking link, logs/backups/source maps            | Negative IDOR tests, high-entropy hashed links, expiry/revocation, `noindex`/`no-store`, field encryption, log redaction, no production source maps         | Link recipients can forward links; tile loading reveals approximate viewed location to OpenStreetMap only after explicit click. |
| Denial of service      | Login/SOS spam, oversized bodies, slow clients, provider outage | 32 kB bodies, route/global limits, server timeouts, retries/outbox state, independent channels, health gates                                                | In-memory rate limits are per-instance; launch should add Redis-backed distributed limits.                                      |
| Elevation of privilege | Client sets `isAdmin`, manipulates Firestore                    | All sensitive client Firestore access denied; role comes from verified claim/existing server record; admin middleware                                       | Firebase/IAM compromise bypasses application controls.                                                                          |

## Abuse and stalking cases

- Sharing requires an explicit confirmed audience, purpose, expiry, visible indicator, and kill switch.
- Contact destinations are encrypted; opt-in is mandatory and opt-out is permanent until reinvited.
- Share tokens contain no PII and only their hashes are stored.
- A duress PIN makes cancellation appear successful while the incident remains active.
- The quick-exit control navigates away, but browser history and device telemetry may still reveal app use.
- Admin abuse reports are role-protected; production needs a trained response policy and restricted staffing.

## Security assumptions

Firebase rules are deployed deny-by-default; service credentials and data keys are stored only in platform secret stores; staging and production are separate; clocks are reasonably synchronized; TLS terminates at Railway; provider webhooks will be signature-verified before they are enabled.
