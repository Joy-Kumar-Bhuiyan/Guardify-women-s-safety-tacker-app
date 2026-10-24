# API reference

Base path: `/api/v1`. JSON endpoints reject unknown fields. Protected routes use HttpOnly application cookies; mutation requests from browsers must have an allowed `Origin`. Errors use `{ "error": { "code", "message", "requestId" } }`.

## Public and health

| Method | Path                                      | Purpose                                                                                           |
| ------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| GET    | `/healthz`                                | Process liveness.                                                                                 |
| GET    | `/readyz`                                 | Persistence readiness.                                                                            |
| POST   | `/api/v1/public/contacts/confirm/:token`  | Single-use contact opt-in after an explicit confirmation action.                                  |
| POST   | `/api/v1/public/contacts/opt-out/:token`  | Contact opt-out.                                                                                  |
| GET    | `/api/v1/public/track/:token`             | Minimal active share state and latest encrypted-at-rest location. Returns `noindex`/`no-store`.   |
| GET    | `/api/v1/public/track/:token/events`      | SSE location updates authorized by the expiring share capability; heartbeat and revocation-aware. |
| POST   | `/api/v1/public/track/:token/acknowledge` | Acknowledge the share.                                                                            |

## Authentication

| Method | Path                 | Purpose                                                      |
| ------ | -------------------- | ------------------------------------------------------------ |
| POST   | `/auth/session`      | Exchange verified Firebase ID token for application cookies. |
| POST   | `/auth/refresh`      | Rotate refresh credential; reuse revokes the whole family.   |
| POST   | `/auth/logout`       | Revoke current session.                                      |
| POST   | `/auth/logout-all`   | Revoke every user session.                                   |
| GET    | `/auth/sessions`     | List device sessions without token material.                 |
| DELETE | `/auth/sessions/:id` | Revoke an owned device session.                              |

## Safety resources

| Method       | Path                         | Notes                                                                                           |
| ------------ | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| GET          | `/me`                        | Current profile.                                                                                |
| PUT          | `/settings/safety-pin`       | Set distinct 4–8 digit safety and duress PINs; stored as scrypt hashes.                         |
| GET/POST     | `/contacts`                  | List/create up to 10 contacts. Phone defaults to Bangladesh parsing and is normalized to E.164. |
| PATCH/DELETE | `/contacts/:id`              | Update/delete owned contact. Destination change requires new opt-in before alerts.              |
| POST/GET     | `/shares`                    | Start/list explicit, expiring, consent-bound shares.                                            |
| PUT          | `/shares/:id/location`       | Update encrypted location for an active owned share.                                            |
| POST         | `/shares/:id/stop`           | Revoke one share and erase its live location.                                                   |
| POST         | `/shares/kill-switch`        | Stop every active owned share.                                                                  |
| POST         | `/sos`                       | Create emergency incident. Requires 16–128 character `Idempotency-Key`.                         |
| POST         | `/sos/:id/resolve`           | Safety PIN resolves; duress PIN appears to resolve but alert remains active.                    |
| GET/DELETE   | `/incidents[/:id]`           | Paginated history and owner deletion.                                                           |
| POST/GET     | `/journeys`                  | Start/list safe journeys.                                                                       |
| POST         | `/journeys/:id/arrive`       | Mark owned journey arrived.                                                                     |
| POST/GET     | `/checkins`                  | Schedule/list safety check-ins.                                                                 |
| POST         | `/checkins/:id/complete`     | Complete owned check-in.                                                                        |
| GET          | `/privacy/export`            | JSON export with decrypted owner data but no link/session hashes.                               |
| DELETE       | `/privacy/account`           | Erase Guardify data and Firebase identity.                                                      |
| GET          | `/safety/emergency-numbers`  | Country safety numbers (Bangladesh included).                                                   |
| POST         | `/safety/nearby-help`        | Ephemeral OpenStreetMap/Overpass police and hospital lookup with a degraded map-link fallback.  |
| POST         | `/abuse-reports`             | File a private abuse report.                                                                    |
| GET/PATCH    | `/admin/abuse-reports[/:id]` | Server-role-protected review.                                                                   |

## Example SOS

```http
POST /api/v1/sos
Idempotency-Key: example-request-id
Content-Type: application/json

{
  "location": {
    "latitude": 23.8103,
    "longitude": 90.4125,
    "accuracy": 18,
    "capturedAt": "2026-10-24T12:00:00.000Z"
  },
  "contactIds": ["00000000-0000-4000-8000-000000000001"]
}
```

A `202` means the incident was accepted and delivery attempts were recorded. It does not mean every provider delivered the message. Reusing the same key returns the existing incident.
