# Privacy and retention

Guardify collects the minimum data needed for selected safety flows: Firebase identity, chosen display name, opted-in contact destinations/channels, explicit share audience/purpose, precise location supplied during SOS/sharing/journey, check-in/journey times, incidents, consent records, and minimal session device labels.

Precise coordinates and contact destinations are encrypted with AES-256-GCM before Firestore. Refresh, share, opt-in, and opt-out credentials are stored only as hashes. Passwords remain with Firebase Auth. Logs must never contain tokens, OTPs, coordinates, passwords, contact details, or raw provider payloads.

Default location retention is 30 days and is configurable from 1–365 days. Stopping a share immediately removes its current location. Users can export their data and erase the account. Operational backups may persist temporarily according to the cloud backup lifecycle; record that duration before launch.

Trusted contacts receive only user-initiated/automatically escalated safety notifications after opt-in. Public share pages contain no ad or analytics script. Opening map tiles is explicit because it contacts OpenStreetMap.

This is an engineering privacy baseline, not jurisdiction-specific legal advice. Before launch, the owner must publish organization identity, legal basis, contact/DPO route if applicable, exact subprocessors/regions, backup deletion window, age policy, complaint process, and final Terms of Service.
