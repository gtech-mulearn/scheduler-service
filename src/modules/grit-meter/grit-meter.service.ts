import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import axios from 'axios';
import * as cron from 'node-cron';
import { MailerService } from '../mailer/mailer.service';
import {
  getGritWarningTemplate,
  getLevelDownTemplate,
} from './grit-meter-email.templates';

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** A UTC instant as MySQL DATETIME text: 'YYYY-MM-DD HH:MM:SS'. */
function toSqlUtc(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/** The IST calendar date of an instant, 'YYYY-MM-DD'. */
export function istDay(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The start of the IST day containing `now`, in UTC as MySQL DATETIME text. The backend stores
 * DATETIMEs in UTC (TIME_ZONE = "UTC", USE_TZ = True), so last_level_down_at compares against it.
 */
export function istDayStartUtc(now: Date): string {
  const startIst = new Date(`${istDay(now)}T00:00:00Z`).getTime();
  return toSqlUtc(new Date(startIst - IST_OFFSET_MS));
}

interface LevelDownUserRecord {
  userId: string;
  previousLevelOrder: number;
  newLevelOrder: number;
  newLevelName: string;
  /** Read inside the level-down transaction; null when the user has no email. */
  email: string | null;
  fullName: string;
  /** The notification_log row reserved for this level-down's email. */
  dedupeKey: string;
}

/** Rows changed by an UPDATE (mysql2's result header, which TypeORM returns as-is). */
function affectedRows(result: unknown): number {
  const rows = (result as { affectedRows?: unknown } | null)?.affectedRows;
  return typeof rows === 'number' ? rows : 0;
}

@Injectable()
export class GritMeterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GritMeterService.name);
  private cronJob?: cron.ScheduledTask;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly mailerService: MailerService,
  ) {}

  onModuleInit() {
    this.logger.log('Initializing GritMeterService cron job (00:00 UTC daily)');
    this.cronJob = cron.schedule(
      '0 0 * * *',
      () => {
        this.processDailyGritMeter().catch((err) =>
          this.logger.error('Error processing daily grit meter', err),
        );
      },
      { timezone: 'UTC' },
    );
  }

  onModuleDestroy() {
    if (this.cronJob) {
      this.cronJob.stop();
    }
  }

  async processDailyGritMeter(): Promise<{ processed: number; levelDowns: number }> {
    this.logger.log('Starting Daily Grit Meter');

    // Fails closed: a missing or unreadable switch skips the run (isEnabled logs why).
    if (!(await this.isEnabled())) {
      return { processed: 0, levelDowns: 0 };
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    let processedCount = 0;
    let levelDownCount = 0;
    const demotedUsers: LevelDownUserRecord[] = [];

    try {
      const webhookUrl = this.configService.get<string>('DISCORD_WEBHOOK_LINK');

      // 1. Bulk increment grit (+1, max 100) for active Level 5+ users
      const activeUpdateResult = await queryRunner.query(`
        UPDATE user_lvl_link ull
        JOIN level l ON ull.level_id = l.id
        JOIN (
          SELECT DISTINCT user_id
          FROM karma_activity_log
          WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
            AND created_at < CURDATE()
        ) active ON ull.user_id = active.user_id
        SET ull.grit = LEAST(100, COALESCE(ull.grit, 50) + 1),
            ull.updated_at = NOW()
        WHERE l.level_order >= 5
      `);

      // 2. Identify Level 5+ inactive users whose grit is <= 1 (they hit 0 after today's -1 decrement)
      const levelDownCandidates: Array<{
        id: string;
        user_id: string;
        level_order: number;
      }> = await queryRunner.query(`
        SELECT ull.id, ull.user_id, l.level_order
        FROM user_lvl_link ull
        JOIN level l ON ull.level_id = l.id
        LEFT JOIN (
          SELECT DISTINCT user_id
          FROM karma_activity_log
          WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
            AND created_at < CURDATE()
        ) active ON ull.user_id = active.user_id
        WHERE l.level_order >= 5
          AND active.user_id IS NULL
          AND COALESCE(ull.grit, 50) <= 1
      `);

      // 3. Bulk decrement grit (-1) for remaining inactive Level 5+ users (whose grit > 1)
      const inactiveUpdateResult = await queryRunner.query(`
        UPDATE user_lvl_link ull
        JOIN level l ON ull.level_id = l.id
        LEFT JOIN (
          SELECT DISTINCT user_id
          FROM karma_activity_log
          WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
            AND created_at < CURDATE()
        ) active ON ull.user_id = active.user_id
        SET ull.grit = ull.grit - 1,
            ull.updated_at = NOW()
        WHERE l.level_order >= 5
          AND active.user_id IS NULL
          AND COALESCE(ull.grit, 50) > 1
      `);

      // Cache all levels to avoid querying level table per user
      const levels: Array<{ id: string; level_order: number; name: string }> = await queryRunner.query(
        `SELECT id, level_order, name FROM level`,
      );
      const levelOrderToIdMap = new Map<number, string>(
        levels.map((lvl) => [Number(lvl.level_order), lvl.id]),
      );
      const levelOrderToNameMap = new Map<number, string>(
        levels.map((lvl) => [Number(lvl.level_order), lvl.name]),
      );

      const now = new Date();
      for (const link of levelDownCandidates) {
        const targetLevelOrder = link.level_order - 1;
        const lowerLevelId = levelOrderToIdMap.get(targetLevelOrder);
        const lowerLevelName = levelOrderToNameMap.get(targetLevelOrder) || `Level ${targetLevelOrder}`;

        if (lowerLevelId) {
          const demoted = await this.lowerLearner(queryRunner, link, {
            lowerLevelId,
            targetLevelOrder,
            lowerLevelName,
            now,
          });
          if (!demoted) continue;

          levelDownCount++;
          demotedUsers.push(demoted);

          this.logger.log(
            `User ${link.user_id} leveled down: Level ${link.level_order} -> Level ${targetLevelOrder}. Grit reset to 100%.`,
          );

          // Side effects only after the commit.
          if (webhookUrl) {
            await this.sendDiscordWebhook(webhookUrl, link.user_id);
          }
        } else {
          await queryRunner.query(
            `UPDATE user_lvl_link SET grit = 0, updated_at = NOW() WHERE id = ?`,
            [link.id],
          );
        }
      }

      const activeCount = activeUpdateResult?.affectedRows ?? activeUpdateResult?.info ?? 0;
      const inactiveCount = inactiveUpdateResult?.affectedRows ?? inactiveUpdateResult?.info ?? 0;
      processedCount = (typeof activeCount === 'number' ? activeCount : 0) +
                       (typeof inactiveCount === 'number' ? inactiveCount : 0) +
                       levelDownCandidates.length;

      this.logger.log(
        `Daily Grit Meter processing complete. Processed: ${processedCount}, Level Downs: ${levelDownCount}`,
      );

      // 4. Send Email Notifications (Level Downs & Milestone Warnings)
      await this.processGritNotifications(queryRunner, demotedUsers);
    } catch (err) {
      this.logger.error('Failed processing daily grit meter', err);
      throw err;
    } finally {
      await queryRunner.release();
    }

    return { processed: processedCount, levelDowns: levelDownCount };
  }

  /**
   * Dispatches Level-Down notices and Grit Warning Milestone emails (50, 20, 5, 1).
   * Prevents duplicates using notification_log dedupe keys.
   */
  private async processGritNotifications(
    queryRunner: QueryRunner,
    demotedUsers: LevelDownUserRecord[],
  ): Promise<void> {
    try {
      // 1. Dispatch Level Down emails
      for (const demoted of demotedUsers) {
        await this.sendDemotionNotification(queryRunner, demoted);
      }

      // 2. Dispatch Milestone Warning emails (1, 5, 20, 50)
      const milestones = [
        { milestone: 1, type: 'GRIT_1', min: 1, max: 1 },
        { milestone: 5, type: 'GRIT_5', min: 2, max: 5 },
        { milestone: 20, type: 'GRIT_20', min: 6, max: 20 },
        { milestone: 50, type: 'GRIT_50', min: 21, max: 50 },
      ];

      for (const m of milestones) {
        await this.sendMilestoneWarnings(queryRunner, m);
      }
    } catch (err: any) {
      this.logger.error(`Error processing grit email notifications: ${err.message}`, err.stack);
    }
  }

  /**
   * Lowers one learner in its own transaction: the level update, guarded so a learner is lowered
   * at most once per IST day, and the notification_log row reserved for the email. Returns null,
   * with nothing changed, when the learner was already lowered today or the transaction fails.
   */
  private async lowerLearner(
    queryRunner: QueryRunner,
    link: { id: string; user_id: string; level_order: number },
    target: { lowerLevelId: string; targetLevelOrder: number; lowerLevelName: string; now: Date },
  ): Promise<LevelDownUserRecord | null> {
    await queryRunner.startTransaction();
    try {
      const result = await queryRunner.query(
        `
        UPDATE user_lvl_link
        SET level_id = ?,
            grit = 100,
            last_level_down_at = ?,
            updated_at = NOW()
        WHERE id = ?
          AND (last_level_down_at IS NULL OR last_level_down_at < ?)
        `,
        [target.lowerLevelId, toSqlUtc(target.now), link.id, istDayStartUtc(target.now)],
      );
      if (affectedRows(result) === 0) {
        await queryRunner.rollbackTransaction();
        this.logger.log(`User ${link.user_id} was already leveled down today (IST); skipped.`);
        return null;
      }

      const users: Array<{ email: string; full_name: string }> = await queryRunner.query(
        `SELECT email, full_name FROM user WHERE id = ? LIMIT 1`,
        [link.user_id],
      );
      const user = users?.[0];
      const record: LevelDownUserRecord = {
        userId: link.user_id,
        previousLevelOrder: link.level_order,
        newLevelOrder: target.targetLevelOrder,
        newLevelName: target.lowerLevelName,
        email: user?.email || null,
        fullName: user?.full_name || 'Learner',
        dedupeKey: `LEVEL_DOWN:${link.user_id}:${istDay(target.now)}`,
      };

      if (record.email) {
        await queryRunner.query(
          `
          INSERT INTO notification_log
            (id, user_id, type, channel, dedupe_key, recipient, status, metadata, error_message, sent_at)
          VALUES (?, ?, 'LEVEL_DOWN', 'EMAIL', ?, ?, 'pending', ?, NULL, NOW())
          ON DUPLICATE KEY UPDATE status = 'pending', error_message = NULL, sent_at = NOW()
          `,
          [
            randomUUID(),
            record.userId,
            record.dedupeKey,
            record.email,
            JSON.stringify({ previousLevel: record.previousLevelOrder, newLevel: record.newLevelOrder }),
          ],
        );
      }

      await queryRunner.commitTransaction();
      return record;
    } catch (err: any) {
      await queryRunner.rollbackTransaction().catch(() => undefined);
      this.logger.error(`Failed leveling down user ${link.user_id}; rolled back: ${err?.message}`);
      return null;
    }
  }

  /** Sends a committed level-down's email and records the outcome on its reserved log row. */
  private async sendDemotionNotification(
    queryRunner: QueryRunner,
    record: LevelDownUserRecord,
  ): Promise<void> {
    if (!record.email) return;
    try {
      const template = getLevelDownTemplate({
        firstName: record.fullName,
        previousLevelOrder: record.previousLevelOrder,
        newLevelOrder: record.newLevelOrder,
        newLevelName: record.newLevelName,
      });

      const sendResult = await this.mailerService.sendMail({
        to: record.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });
      if (!sendResult.success) {
        this.logger.error(`Level-down email to user ${record.userId} failed: ${sendResult.error}`);
      }

      await queryRunner.query(
        `UPDATE notification_log SET status = ?, error_message = ?, sent_at = NOW() WHERE user_id = ? AND dedupe_key = ?`,
        [sendResult.success ? 'sent' : 'failed', sendResult.error || null, record.userId, record.dedupeKey],
      );
    } catch (err: any) {
      this.logger.error(`Failed sending demotion email to user ${record.userId}: ${err.message}`);
    }
  }

  private async sendMilestoneWarnings(
    queryRunner: QueryRunner,
    m: { milestone: number; type: string; min: number; max: number },
  ): Promise<void> {
    try {
      const candidates: Array<{
        user_id: string;
        email: string;
        full_name: string;
        level_order: number;
        level_name: string;
        grit: number;
        cycle_id: string;
      }> = await queryRunner.query(
        `
        SELECT 
          ull.user_id,
          u.email,
          u.full_name,
          l.level_order,
          l.name AS level_name,
          ull.grit,
          COALESCE(DATE_FORMAT(ull.last_level_down_at, '%Y%m%d%H%i%s'), 'initial') AS cycle_id
        FROM user_lvl_link ull
        JOIN user u ON ull.user_id = u.id
        JOIN level l ON ull.level_id = l.id
        LEFT JOIN (
          SELECT DISTINCT user_id
          FROM karma_activity_log
          WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
            AND created_at < CURDATE()
        ) active ON ull.user_id = active.user_id
        LEFT JOIN notification_log nl
          ON nl.user_id = ull.user_id
         AND nl.dedupe_key = CONCAT(?, ':', ull.user_id, ':', COALESCE(DATE_FORMAT(ull.last_level_down_at, '%Y%m%d%H%i%s'), 'initial'))
        WHERE l.level_order >= 5
          AND active.user_id IS NULL
          AND ull.grit >= ? AND ull.grit <= ?
          AND nl.id IS NULL
          AND u.email IS NOT NULL AND u.email != ''
        LIMIT 500
        `,
        [m.type, m.min, m.max],
      );

      if (!candidates || candidates.length === 0) {
        return;
      }

      this.logger.log(`Found ${candidates.length} candidate(s) for milestone ${m.type}`);

      for (const candidate of candidates) {
        const template = getGritWarningTemplate({
          firstName: candidate.full_name || 'Learner',
          grit: candidate.grit,
          levelOrder: candidate.level_order,
          levelName: candidate.level_name,
        });

        const dedupeKey = `${m.type}:${candidate.user_id}:${candidate.cycle_id}`;

        const sendResult = await this.mailerService.sendMail({
          to: candidate.email,
          subject: template.subject,
          html: template.html,
          text: template.text,
        });
        if (!sendResult.success) {
          this.logger.error(`${m.type} email to user ${candidate.user_id} failed: ${sendResult.error}`);
        }

        await queryRunner.query(
          `
          INSERT INTO notification_log 
            (id, user_id, type, channel, dedupe_key, recipient, status, metadata, error_message, sent_at)
          VALUES (?, ?, ?, 'EMAIL', ?, ?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE status = VALUES(status), sent_at = NOW()
          `,
          [
            randomUUID(),
            candidate.user_id,
            m.type,
            dedupeKey,
            candidate.email,
            sendResult.success ? 'sent' : 'failed',
            JSON.stringify({ grit: candidate.grit, level: candidate.level_order }),
            sendResult.error || null,
          ],
        );
      }
    } catch (err: any) {
      this.logger.error(`Error sending milestone warnings for ${m.type}: ${err.message}`);
    }
  }

  /**
   * Reads the grit_meter_enabled switch and fails closed: a missing row or a failed read means
   * the run is skipped, with an error logged. Only an explicit 'true' turns it on.
   */
  private async isEnabled(): Promise<boolean> {
    try {
      const result: Array<{ value: string }> = await this.dataSource.query(
        `SELECT value FROM system_setting WHERE \`key\` = 'grit_meter_enabled' LIMIT 1`,
      );
      if (!result || result.length === 0) {
        this.logger.error('Grit Meter skipped: the "grit_meter_enabled" setting is missing (failing closed)');
        return false;
      }
      const enabled = String(result[0].value).toLowerCase() === 'true';
      if (!enabled) {
        this.logger.warn('Grit Meter processing skipped: Feature flag "grit_meter_enabled" is OFF');
      }
      return enabled;
    } catch (err) {
      this.logger.error('Grit Meter skipped: could not read "grit_meter_enabled" (failing closed)', err);
      return false;
    }
  }

  private async sendDiscordWebhook(webhookUrl: string, userId: string): Promise<void> {
    try {
      const content = `user_role<|=|>update<|=|>${userId}`;
      await axios.post(webhookUrl, { content }, { timeout: 10000 });
      this.logger.log(`Discord role sync webhook sent for user ${userId}`);
    } catch (err) {
      this.logger.error(`Failed sending Discord webhook for user ${userId}`, err);
    }
  }
}
