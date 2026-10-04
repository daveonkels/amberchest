/** Deployment-enforced restrictions, independent of editable UI settings. */
export const privateBackup = (): boolean => process.env.AMBERCHEST_PRIVATE_BACKUP === 'true';

export function assertFastmail(options: {host: string; port: number; security: string; rejectUnauthorized: boolean; accessToken?: string | undefined}): void {
  if (!privateBackup()) return;
  if (options.host !== 'imap.fastmail.com' || options.port !== 993 ||
      options.security !== 'tls' || options.rejectUnauthorized !== true || options.accessToken) {
    throw new Error('This installation permits only verified TLS to imap.fastmail.com:993 using an app password');
  }
}

export function assertPrivateSettings(settings: {archivePath: string; mcp: {enabled: boolean; httpEnabled: boolean}; mqtt: {enabled: boolean}; notifications: {enabled: boolean}}): void {
  if (!privateBackup()) return;
  if (settings.archivePath !== process.env.AMBERCHEST_ARCHIVE_DIR ||
      settings.mcp.enabled || settings.mcp.httpEnabled || settings.mqtt.enabled || settings.notifications.enabled) {
    throw new Error('Archive location and disabled external integrations are fixed for this private backup');
  }
}

export function assertPrivateAccount(account: {host: string; port: number; security: string; rejectUnauthorized: boolean; authType?: string; archivePath?: string | null; settings?: {deletedHandling?: string; deletedRetentionDays?: number | null}}): void {
  if (!privateBackup()) return;
  assertFastmail(account);
  if (account.authType === 'oauth' || (account.archivePath && account.archivePath !== process.env.AMBERCHEST_ARCHIVE_DIR) ||
      account.settings?.deletedHandling === 'mirror' || account.settings?.deletedRetentionDays != null) {
    throw new Error('This private backup requires password authentication, the fixed archive path, and indefinite retention');
  }
}
