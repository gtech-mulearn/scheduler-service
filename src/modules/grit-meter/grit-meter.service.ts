import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as cron from 'node-cron';

@Injectable()
export class GritMeterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GritMeterService.name);
  private cronJob?: cron.ScheduledTask;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
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

    const isEnabled = await this.checkFeatureFlag();
    if (!isEnabled) {
      this.logger.warn('Grit Meter processing skipped: Feature flag "grit_meter_enabled" is OFF');
      return { processed: 0, levelDowns: 0 };
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    let processedCount = 0;
    let levelDownCount = 0;

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
      const levels: Array<{ id: string; level_order: number }> = await queryRunner.query(
        `SELECT id, level_order FROM level`,
      );
      const levelOrderToIdMap = new Map<number, string>(
        levels.map((lvl) => [Number(lvl.level_order), lvl.id]),
      );

      for (const link of levelDownCandidates) {
        const targetLevelOrder = link.level_order - 1;
        const lowerLevelId = levelOrderToIdMap.get(targetLevelOrder);

        if (lowerLevelId) {
          await queryRunner.query(
            `
            UPDATE user_lvl_link
            SET level_id = ?,
                grit = 100,
                last_level_down_at = NOW(),
                updated_at = NOW()
            WHERE id = ?
            `,
            [lowerLevelId, link.id],
          );

          levelDownCount++;
          this.logger.log(
            `User ${link.user_id} leveled down: Level ${link.level_order} -> Level ${targetLevelOrder}. Grit reset to 100%.`,
          );

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
    } catch (err) {
      this.logger.error('Failed processing daily grit meter', err);
      throw err;
    } finally {
      await queryRunner.release();
    }

    return { processed: processedCount, levelDowns: levelDownCount };
  }

  private async checkFeatureFlag(): Promise<boolean> {
    try {
      const result: Array<{ value: string }> = await this.dataSource.query(
        `SELECT value FROM system_setting WHERE key = 'grit_meter_enabled' LIMIT 1`,
      );
      if (!result || result.length === 0) {
        return true;
      }
      return result[0].value.toLowerCase() === 'true';
    } catch (err) {
      this.logger.warn('Failed to query feature flag, defaulting to true', err);
      return true;
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
