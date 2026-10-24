# Guardify agent guide

## Product and safety boundary

Guardify processes precise location, emergency status, contact details, and account data. Treat every endpoint and UI flow as safety-critical. Never log coordinates, credentials, tokens, OTPs, contact details, tracking tokens, or raw provider payloads. Never weaken authorization to make a demo pass.

## Structure

- `backend/`: Express API, Firebase Admin integration, domain services, persistence adapters, tests.
- `frontend/`: Vue 3 mobile-first PWA. Firebase Auth is used only to establish identity; sensitive application data goes through the API.
- `docs/`: architecture, security, privacy, operations, API, and QA evidence.
- `.github/`: CI, dependency updates, and security scanning.

## Commands

From the repository root:

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run audit
```

Use `docker compose up --build` for the production-like local stack. Copy each `.env.example` to `.env` and replace placeholders. Never commit an `.env` file or service-account JSON.

## Engineering rules

- Use ES modules, strict validation, explicit return shapes, and small domain services.
- Validate body, params, and query inputs; reject unknown fields.
- Scope every data lookup to the authenticated user unless the route is explicitly public-token or admin-only.
- Store only hashes of refresh, opt-in, and share tokens. Encrypt precise coordinates and contact destinations before persistence.
- Require idempotency keys for emergency actions.
- Keep error responses generic; attach a request ID for support.
- Add negative authorization tests for each owned resource.
- Use conventional commits on `production-ready`; never commit or push directly to `main`.

## Required verification

Before a commit, run lint, typecheck, tests, build, and `npm audit --omit=dev`. Critical and high findings block release. Update `PROGRESS.md` and relevant docs whenever scope or evidence changes.
