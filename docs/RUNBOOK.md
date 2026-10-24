# Operations runbook

## Pre-deploy gate

1. Run `npm run verify`, full gitleaks history scan, CodeQL, container build, and staging Playwright/ZAP/Lighthouse checks.
2. Complete `SECRETS_ROTATION.md`; verify no old key remains accepted.
3. Deploy `firestore.rules` and `firestore.indexes.json` to the correct staging project.
4. Verify `/healthz` and `/readyz`, signup verification, contact opt-in, SOS, provider fallback, share expiry/revoke, duress behavior, export/erase, and retention job.
5. Promote the exact tested image digest to production. Never rebuild between staging and production.
6. Set the repository variable `STAGING_URL` to the HTTPS staging origin and run the `Staging ZAP baseline` workflow; triage every alert before promotion.

## Railway

- Use separate staging and production environments/services with distinct Firebase projects, secrets, origins, and provider accounts.
- Build with the root Dockerfile. Set public `VITE_FIREBASE_*` build arguments and all server values as Railway variables.
- Health path: `/readyz`; port comes from `PORT`; Railway proxy count is `TRUST_PROXY=1`.
- No schema migration is required for Firestore documents, but indexes/rules are versioned and must deploy before code that depends on them.
- Zero downtime: deploy a new replica, wait for readiness, then drain the old replica. Session records live in Firestore and survive rollout.

## Rollback

1. Stop the rollout and select the prior known-good Railway deployment/image digest.
2. Do not roll back Firestore rules to a more permissive version. Forward-fix data compatibility when possible.
3. Verify readiness and one synthetic share/SOS in the provider sandbox.
4. Record timeline, image digests, affected sessions/incidents, and corrective action.

## Incident response

- **Credential leak:** revoke/rotate first, deploy new values, invalidate sessions, then rewrite history. Review IAM/audit logs.
- **Location disclosure/IDOR:** disable affected endpoint/share access, preserve redacted evidence, revoke links/sessions, assess impacted users, notify through an approved private channel.
- **Provider outage:** mark channel degraded, keep other channels active, inspect pending/dead-letter jobs, communicate that delivery is not guaranteed.
- **Cost abuse:** disable provider key/sender, retain redacted event IDs, tighten distributed rate limits/spend cap, do not block genuine local cancellation.
- **Data corruption:** freeze writes if necessary, restore into staging, validate counts/hashes, obtain approval, then restore production.

## Backups and checks

- Enable Firestore scheduled backups/PITR appropriate to the selected plan and region.
- Encrypt backups, restrict restore permissions, alert on IAM changes, and test restoration quarterly in an isolated project.
- Daily: readiness, provider delivery/error ratios, outbox age, rate-limit anomalies, retention failures, certificate/domain health.
- Weekly: dependency/security alerts and failed jobs. Monthly: access review and restore evidence. Quarterly: abuse tabletop and key-rotation drill.

Never paste user data or secrets into tickets, chat, or logs. Use event/request IDs and the minimum necessary redacted evidence.
