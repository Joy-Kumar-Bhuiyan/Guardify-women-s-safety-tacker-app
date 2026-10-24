# Contributing

1. Read `AGENTS.md`, `SECURITY.md`, and `docs/THREAT_MODEL.md`.
2. Branch from the protected default branch. Never commit secrets, real location data, contact details, or production exports.
3. Add tests before changing authentication, authorization, encryption, retention, or emergency behavior.
4. Run `npm run verify` and `git diff --check`.
5. Use conventional commits and explain privacy/safety impact in the pull request.

Changes to an owned resource require a negative cross-user test. Provider changes require webhook-signature validation, cost-abuse limits, retry/idempotency behavior, and redacted logs.
