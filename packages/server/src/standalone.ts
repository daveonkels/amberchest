import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  AmberChestApp,
  Scheduler,
  applyLegacyEnv,
  isValidCron,
  logger,
  migrateLegacyConfigDir,
} from '@amberchest/core';
import { applyAddonOptions } from './addon.js';
import { AuthGuard } from './auth.js';
import { startServer } from './index.js';

/**
 * Headless entry point: the container, and frontend development.
 *
 * Everything is configured through environment variables, because that is how
 * a container is configured. The master password unlocks the encrypted
 * configuration without anyone at the keyboard.
 */
async function main(): Promise<void> {
  // Both of these run before anything reads a variable or opens a file.
  process.umask(0o077);
  for (const key of ['AMBERCHEST_MASTER_PASSWORD', 'AMBERCHEST_UI_PASSWORD']) {
    const file = process.env[`${key}_FILE`];
    if (file) process.env[key] = readFileSync(file, 'utf8').trim();
  }
  if (process.env.AMBERCHEST_PRIVATE_BACKUP === 'true' && !process.env.AMBERCHEST_UI_PASSWORD) {
    throw new Error('Private backup requires a UI password');
  }
  applyLegacyEnv();
  migrateLegacyConfigDir();

  // As a Home Assistant add-on the settings arrive as a file, not as an
  // environment; this turns them into one before anything else reads it.
  const addon = applyAddonOptions();

  // In a container the log belongs on stdout, that is what `docker logs` reads.
  logger.setLevel((process.env.AMBERCHEST_LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') ?? 'info');
  logger.on('entry', (entry) => {
    const line = `${entry.ts} [${entry.level}] ${entry.message}`;
    if (entry.level === 'error' || entry.level === 'warn') process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  });

  const app = new AmberChestApp();
  const auth = AuthGuard.fromEnvironment();

  const masterPassword = process.env.AMBERCHEST_MASTER_PASSWORD;
  if (masterPassword) {
    if (!app.isInitialized) {
      await app.initialize(masterPassword);
      logger.info('Created a new configuration from AMBERCHEST_MASTER_PASSWORD');
    }
    await app.unlock(masterPassword);
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const webRoot = process.env.AMBERCHEST_WEB_ROOT ?? resolve(here, '../../web/dist');

  const running = await startServer({
    app,
    auth,
    webRoot,
    host: process.env.AMBERCHEST_HOST ?? '0.0.0.0',
    port: Number(process.env.AMBERCHEST_PORT ?? 8484),
  });

  logger.info(`AmberChest listening on ${running.url} (auth: ${auth.mode})`);
  if (addon) {
    logger.info(
      process.env.AMBERCHEST_INGRESS_ONLY === 'true'
        ? 'Running as a Home Assistant add-on: reachable through the sidebar, and only from the supervisor'
        : 'Running as a Home Assistant add-on with an interface password of its own',
    );
  }

  if (auth.mode === 'none' && process.env.AMBERCHEST_INGRESS_ONLY !== 'true') {
    logger.warn(
      'No AMBERCHEST_UI_PASSWORD is set: anyone who can reach this port can use the interface.',
    );
  }

  // ---------------------------------------------------------------- schedule
  let scheduler: Scheduler | null = null;
  const expression = process.env.AMBERCHEST_CRON;

  if (expression) {
    if (!masterPassword) {
      logger.error('AMBERCHEST_CRON needs AMBERCHEST_MASTER_PASSWORD, otherwise nothing can run unattended.');
    } else if (!isValidCron(expression)) {
      logger.error(`AMBERCHEST_CRON is not a valid cron expression: ${expression}`);
    } else {
      scheduler = new Scheduler({
        app,
        expression,
        exportAttachments: process.env.AMBERCHEST_CRON_EXPORT_ATTACHMENTS === 'true',
      });
      scheduler.start();
      // MQTT and the Home Assistant integration both report the next run.
      app.setSchedule(expression, () => scheduler?.nextRun ?? null);
      // Catch up after a host/container restart instead of waiting up to an
      // hour. Uses the same application path and stored account configuration
      // as scheduled jobs; no credential handling is exposed to an operator.
      if (process.env.AMBERCHEST_RUN_ON_STARTUP === 'true') {
        void (async () => {
          for (const entry of app.overview()) {
            if (entry.running || (entry.account.selectedFolders.length === 0 && !entry.account.settings.autoSelectNewFolders)) continue;
            logger.info(`Startup backup for ${entry.account.name}`);
            await app.startSyncAndIndex(entry.account.id);
          }
        })().catch((error: Error) => logger.error(`Startup backup failed: ${error.message}`));
      }
    }
  }

  const shutdown = async (): Promise<void> => {
    scheduler?.stop();
    await running.close();
    app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
