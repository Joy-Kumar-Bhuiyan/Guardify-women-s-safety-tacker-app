# Required credential rotation

Assume every credential ever used by this repository is compromised. Complete rotation in a staging environment before production deployment; deleting a file or rewriting Git history does not revoke a credential.

## Firebase and Google Cloud

1. Create a new Firebase service account key only if workload identity is unavailable. Prefer Railway/GCP workload identity; otherwise store the complete JSON value only in Railway's secret variables.
2. Disable and delete every old service-account key in Google Cloud IAM after the new deployment passes `/readyz`.
3. Rotate/restrict the Firebase web API key in Google Cloud Credentials. Restrict it to the exact production/staging domains and only required Firebase APIs.
4. Review Firebase Auth authorized domains and remove unknown/stale domains.
5. Deploy the repository's deny-by-default Firestore/Realtime Database rules before exposing the new app.
6. Review Firebase audit logs, Auth users, and IAM principals for unauthorized activity.

## Guardify application secrets

1. Generate `SESSION_SECRET` with at least 32 random bytes and set separate values for staging and production.
2. Generate a 32-byte encryption key for `DATA_ENCRYPTION_KEYS` and assign a key ID. Never reuse the session secret.
3. Generate independent admin/bootstrap and scheduled-job secrets if those optional flows are enabled.
4. Redeploy, invalidate all existing sessions, and verify old refresh credentials no longer work.

## Database and infrastructure

1. Rotate any Firebase/Database URL credentials and Railway shared variables.
2. Rotate Railway project/service tokens and remove unknown collaborators.
3. Use separate Railway projects/environments for staging and production. Do not copy production data to development.
4. Verify automated backups and perform a staging restore test before launch.

## Notification and maps providers

1. Rotate SMS API credentials, sender IDs, and webhook signing secrets. Set spend caps and destination/region restrictions.
2. Rotate email API/SMTP credentials and webhook secrets; verify the sender domain with SPF, DKIM, and DMARC.
3. Rotate VAPID keys if previously deployed; update public and private halves together.
4. Rotate/restrict maps keys by production/staging domain and API.

## GitHub

1. Enable secret scanning, push protection, Dependabot alerts, and branch protection.
2. Revoke any personal access token, deploy key, or Actions secret ever stored in the repository.
3. Run gitleaks against all refs. Coordinate a BFG or `git filter-repo` history rewrite only after rotations; force-pushing rewrites clones and requires contributor coordination.
4. Re-run gitleaks after the rewrite and invalidate cached CI artifacts.

## Verification record

Record rotation date, credential owner, key ID (never the value), affected environments, verification result, and revocation confirmation in the organization's private operations system—not in this public repository.
