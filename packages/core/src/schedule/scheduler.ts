import { EventEmitter } from 'node:events';
import type { AmberChestApp } from '../app.js';
import { logger } from '../util/logger.js';
import { matches, nextRun, parseCron, type CronFields } from './cron.js';

export interface SchedulerOptions {
  app: AmberChestApp;
  expression: string;
  /** Also export attachments after each scheduled backup. */
  exportAttachments?: boolean;
}

/**
 * Runs the backup on a schedule, for the container.
 *
 * Ticks once a minute and compares the wall clock against the expression, so a
 * suspended machine simply misses that minute instead of firing a burst of
 * catch-up runs.
 */
export class Scheduler extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private readonly fields: CronFields;
  private lastFired: string | null = null;
  private running = false;
  private initialTimer: NodeJS.Timeout | null = null;

  constructor(private readonly options: SchedulerOptions) {
    super();
    this.fields = parseCron(options.expression);
  }

  get nextRun(): Date | null {
    return nextRun(this.fields);
  }

  start(): void {
    if (this.timer || this.initialTimer) return;
    const next = this.nextRun;
    logger.info(
      `Scheduler active: ${this.options.expression}${next ? `, next run ${next.toISOString()}` : ''}`,
    );

    // Align to the start of the next minute, then tick every minute.
    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    this.initialTimer = setTimeout(() => {
      this.initialTimer = null;
      void this.tick();
      this.timer = setInterval(() => void this.tick(), 60_000);
    }, msToNextMinute);
  }

  stop(): void {
    if (this.initialTimer) clearTimeout(this.initialTimer);
    this.initialTimer = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    const now = new Date();
    const stamp = now.toISOString().slice(0, 16);
    if (this.lastFired === stamp) return;
    if (!matches(this.fields, now)) return;

    this.lastFired = stamp;
    if (this.running) {
      logger.warn('Scheduled run skipped: the previous one is still going');
      return;
    }

    this.running = true;
    this.emit('run', now);

    try {
      for (const overview of this.options.app.overview()) {
        if (overview.running) {
          logger.info('Scheduled run skipped for an account already backing up');
          continue;
        }
        const account = overview.account;
        if (account.selectedFolders.length === 0 && !account.settings.autoSelectNewFolders) {
          logger.info(`Skipping ${account.name}: no folders selected`);
          continue;
        }

        logger.info(`Scheduled backup for ${account.name}`);
        await this.options.app.startSyncAndIndex(account.id);

        if (this.options.exportAttachments) {
          await this.options.app.startAttachmentExport(account.id);
        }
      }
    } catch (error) {
      logger.error(`Scheduled run failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
      const next = this.nextRun;
      if (next) logger.info(`Next scheduled run: ${next.toISOString()}`);
    }
  }
}
