# Private Fastmail backup review

Reviewed upstream AmberChest 2.1.0, commit b0275d3bce241e19cccf0220da40d0da16c5108b, on 2026-10-04. This fork targets one privately hosted Fastmail backup; it is not a general-purpose upstream replacement.

## Conclusion and limits

No intentional telemetry or hidden collector was identified in the reviewed application source. That is not proof of absence, nor an independent audit of every transitive dependency or native binary. The review traced mail credentials and content through IMAP, storage, search, API/UI, integrations, export, packaging and scheduled jobs. Production dependencies passed Socket supply-chain checks. The production advisory scan after the approved fixes returned zero known advisories; this is a point-in-time result.

## Findings and changes

- **Credential destination substitution:** the connection-test path could reuse a stored account password while accepting a different server. The private profile validates every IMAP client construction: only imap.fastmail.com:993, verified TLS and password authentication are accepted. OAuth, transfer and restore endpoints are disabled.
- **External data paths:** notification URLs, MQTT, remote-instance transfer, MCP and OAuth were legitimate optional outbound features. This deployment disables them at the API and configuration layers. The UI cannot connect to other AmberChest instances. Version checks are removed. No upstream image or auto-update workflow is used.
- **Mail-triggered requests during PDF export:** regular-expression sanitizing did not cover CSS URLs, srcset and other HTML features. PDF rendering now consumes escaped MIME plain text with a restrictive policy. The production image deliberately contains no Chromium; use original EML or MBOX export.
- **Browser tracking:** remote message images cannot be enabled. The mail iframe has a restrictive CSP and no script or same-origin privileges; the application also has a same-origin CSP. Explicit user clicks on external links can still open their destination.
- **Authentication:** private startup refuses an absent UI password. Password sessions expire after 12 hours and are capped at 100. Login/setup/unlock attempts are limited to 10 per minute at the proxy source. Cross-origin requests, including websocket handshakes, are rejected. Query tokens are restricted to GET event/download paths. Responses prevent caching and referrer leakage. The OAuth callback escapes untrusted error text even though this deployment blocks OAuth.
- **Backup continuity:** logging out previously locked the config and stopped unattended operation. Private logout now revokes the session without locking the scheduler. The initial scheduler timeout is cancelled on shutdown.
- **Folder coverage:** the new-folder auto-selection setting lacked execution support. Newly discovered selectable folders are now selected and persisted, while existing explicit exclusions remain excluded.
- **Archive retention:** private configuration rejects mirroring and timed deletion of removed mail; destructive DELETE endpoints are disabled. Fastmail reads use read-only folders and BODY.PEEK. Existing archives survive source deletions.
- **Archive parsing:** Office ZIP text extraction now bounds actual inflated output and total bytes, rather than trusting ZIP metadata alone.
- **Dependency advisories:** patched the approved Fastify, nodemailer, fast-uri, ip-address and brace-expansion versions without broad upgrades. The original npm lockfile is retained for upstream provenance; pnpm-lock.yaml is authoritative for this fork.

## Runtime boundaries

The application runs as an unprivileged user, with a read-only root filesystem, no Linux capabilities, no Docker socket, a memory/process limit and only its own archive/configuration mounts. An internal network and host firewall restrict new outbound application connections to a fixed TCP relay. The relay has no credentials or archive mounts and forwards only to Fastmail port 993; TLS stays end-to-end and verifies the Fastmail certificate. Container DNS is disabled for the application. Traefik alone provides inbound HTTPS; no app port is published.

A host startup guard verifies the expected NFS mount and fails closed. The live SQLite index remains on local disk, avoiding SQLite WAL on NFS. Mail lives on the NAS. A daily SQLite online-backup snapshot and encrypted configuration copy use seven rotating NAS slots. Mount guards also protect snapshot execution.

## Recovery and residual risks

Raw email, attachment content, filenames and the search index are sensitive plaintext. The encrypted account configuration does not encrypt the entire archive. Restrict host/NAS access and use independent NAS snapshots/off-device backups for protection against a compromised host, ransomware or accidental filesystem deletion. The app's own retention controls do not make the NAS immutable.

The master password must be preserved separately to recover encrypted account configuration. It is intentionally excluded from the NAS state snapshots. Mail can be read as EML without that password. Restore into Fastmail is intentionally unavailable from this running profile; export locally and use a separately reviewed mail client when needed.

The account password necessarily exists in process memory while connecting. This app cannot defend against root, a compromised reverse proxy, browser extensions or an already-authorized administrator. Its fixed endpoint prevents generic exfiltration destinations; a fully compromised mail process can still abuse its permitted Fastmail connection. Use a dedicated Fastmail app password and revoke it if compromise is suspected.

Native prebuilt SQLite/rollup binaries and the official Node base image are trusted supply-chain components, not locally reproduced builds. Upstream and dependency changes require review before redeployment. A passing health endpoint verifies the web process, not a successful mailbox backup; check last successful sync and counts after initial account setup.

## Validation

Build, TypeScript checks and all 197 tests passed after the approved dependency patches. New regression coverage exercises destination restrictions, retention, folder discovery, PDF content isolation, authentication, cross-origin rejection, integration blocking, logout continuity and expiry/rate limiting. Deployment-specific connectivity, filesystem and restoration checks are recorded separately on the host; do not infer successful Fastmail backup until credentials have been entered and an initial plus incremental run verified.
