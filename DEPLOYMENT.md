# Private Fastmail deployment

This fork runs the reviewed server and web UI only. The original desktop and add-on sources are retained for provenance; their upstream npm/image release workflows are disabled. See [SECURITY-REVIEW.md](SECURITY-REVIEW.md) for the changed privacy boundaries and limits.

## Rebuild from any clone

Use the exact pnpm version in packageManager and the workstation's Socket launcher. Dependency changes, lockfile imports and native build approvals need human approval. Stop on a Socket warning or unavailable verdict.

```sh
sfw pnpm install --frozen-lockfile --ignore-scripts
sfw pnpm run build
sfw pnpm run test
sfw pnpm run typecheck
sfw pnpm audit --prod
./deploy/build-context.sh /tmp/amberchest-reviewed-build
```

The lockfile includes Linux x64 native prebuilds. No dependency installer runs on the production server. Commit and push reviewed source before production deployment. Copy the generated build context to the Docker host and build using an explicitly pinned official Node image:

```sh
docker build --network=none --build-arg NODE_IMAGE=node@sha256:REVIEWED_DIGEST \
  -t amberchest-private:REVIEWED_COMMIT /path/to/build-context
```

The image has no Chromium. EML/MBOX export remains available. UI PDF controls should not be used.

## Host layout and configuration

Keep a source checkout and app-local compose directory, plus a local configuration directory and a NAS-only archive directory. Never recursively chown an existing parent NAS archive. UID/GID 3000 owns only the newly created application directories. Do not expose the container port or mount any unrelated mail archive.

`deploy/compose.yaml` takes these non-secret variables from an operator-owned deployment.env: AMBERCHEST_IMAGE, NODE_IMAGE, AMBERCHEST_DATA, AMBERCHEST_ARCHIVE_PATH, AMBERCHEST_SECRETS, AMBERCHEST_ORIGIN and AMBERCHEST_HOSTNAME. The mount guard additionally takes AMBERCHEST_MOUNT and AMBERCHEST_MOUNT_SOURCE. Never put passwords in that file or in git.

Generate distinct strong master/UI passwords directly on the host, owner 3000 and mode 0600 inside a restricted secrets directory. Files are named master-password and ui-password. The user obtains the UI password directly and enters a dedicated Fastmail app password in the private interface. Agents do not need to retrieve either credential. Preserve the master password separately in the user's password manager or approved vault.

Before starting containers, run check-mount.sh and network-guard.sh as root. The latter creates only its dedicated firewall chain and two narrow source-IP hooks. Do not flush existing host rules. The internal network reserves 172.30.84.2 for the app, .3 for the relay and .4 for Traefik. Check for overlaps first. Persist Traefik's attachment to this external network in its existing compose file, with a timestamped backup; a live network connect avoids a proxy restart.

Use a systemd unit with RequiresMountsFor for the NAS mount, After/Requires docker.service and the mount/network guards in ExecStartPre. Containers use on-failure restart rather than unconditional daemon-start restart, so host startup goes through the mount guard. Start only this compose project. A daily systemd timer runs node /app/snapshot.mjs in the app container after the mount guard.

## Access and verification

Create a Cloudflare DNS-only A record to the Docker host's Tailscale IP, with Traefik DNS-01 TLS using the existing resolver. This follows a private DNS/Tailscale pattern; no Cloudflare proxy/tunnel is needed. Add the verified URL to the existing Homepage dashboard.

Check container logs and health, anonymous API rejection, HTTPS via the host route, genuine Fastmail certificate validation through the relay, blocked other destinations and DNS, UID/mount permissions, SQLite snapshot integrity and scheduler startup. After account setup, select all desired folders (auto-select new folders is on), run the initial backup, run it again and verify no repeat downloads. Inspect an isolated EML copy and its digest without uploading mail back to Fastmail.

Backups run hourly at minute 17, America/Chicago. Logging out leaves jobs active. Disabled integrations mean there are no outbound email/webhook alerts; consult the app's last-run status and host timer status. The daily seven-slot state snapshot supplements the EML archive, not independent NAS backups.

## Rollback

Stop only this compose project/systemd unit. Restore its previous image tag and matching configuration snapshot if needed. Keep mail files. Preserve timestamped proxy/dashboard configuration backups. Remove only the two AMBERCHEST_PRIVATE hooks and their dedicated chain if uninstalling; never flush host firewall tables. Remove this application's DNS/dashboard record only when deliberately uninstalling.
