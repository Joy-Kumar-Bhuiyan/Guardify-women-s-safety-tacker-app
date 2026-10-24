# Architecture and product decisions

## D-001: Retain Firebase identity and persistence, move sensitive writes behind the API

**Decision:** Keep Firebase Authentication and Firestore because they are the existing stack and Railway can run the API without introducing a separate database migration. The browser may use Firebase Auth only to obtain an identity token. It must not directly read or write sensitive application collections.

**Why:** The prototype mixes Firestore in the browser with Realtime Database in the API and relies on client-side admin checks. Moving all sensitive access behind a centrally authorized API fixes the trust-boundary problem while avoiding a risky full platform rewrite.

## D-002: Add application sessions after Firebase identity exchange

**Decision:** Exchange a freshly verified Firebase ID token for short-lived application access credentials and a rotating opaque refresh credential. Store only refresh hashes and device metadata. Cookies are `HttpOnly`, `Secure` in production, `SameSite=Strict`, path-scoped where possible, and protected by trusted-origin checks.

## D-003: Encrypt safety data at the application layer

**Decision:** Encrypt contact destinations and precise coordinates with AES-256-GCM before persistence. Keys come only from environment variables and include a key identifier for rotation.

## D-004: Notification providers are adapters

**Decision:** SMS, email, and web push use provider interfaces. Local/test mode uses a no-delivery provider that records redacted delivery state. Production readiness requires owner-supplied provider credentials and verified sender identities.

## D-005: License

The original package declared ISC but had no license file. The requested default is MIT when the owner does not specify otherwise, so the production-ready branch will add MIT and record this choice here for owner review.

## D-006: Safety claims

Guardify is an assistive safety tool, not a guaranteed emergency service. The UI and documentation must tell users to contact local emergency services directly when possible. Provider delivery, GPS, connectivity, and browser background execution can fail.

## D-007: Firestore-native operations

Firestore remains the database, so SQL migrations and a local database container would add a second, misleading persistence path. Schema compatibility is additive, indexes/rules are versioned, and backup/restore is an owner cloud operation. Process rate limiting is adequate for a single instance; a managed distributed limiter is required before horizontal scaling.

## D-008: Explicit consent links

Email/SMS links open a neutral frontend page and require a deliberate POST action. GET requests never grant or revoke contact consent, preventing common mail-link scanners and browser prefetch from changing safety state.

## D-009: Notification scope

Twilio SMS and Resend email are implemented behind adapters. Provider credentials, verified senders, spend limits, and sandbox drills are owner actions. Web Push is intentionally reported as unavailable until a VAPID subscription lifecycle is implemented and tested on real devices.
