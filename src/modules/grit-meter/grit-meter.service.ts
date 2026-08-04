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
    this.logger.log('Starting Daily Grit Meter / HP Processing');

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
      const userLinks: Array<{
        id: string;
        user_id: string;
        level_id: string;
        grit: number;
        level_order: number;
      }> = await queryRunner.query(`
        SELECT 
          ull.id,
          ull.user_id,
          ull.level_id,
          COALESCE(ull.grit, 50) AS grit,
          l.level_order
        FROM user_lvl_link ull
        JOIN level l ON ull.level_id = l.id
      `);

      this.logger.log(`Found ${userLinks.length} user level records to process`);

      const webhookUrl = this.configService.get<string>('DISCORD_WEBHOOK_LINK');

      for (const link of userLinks) {
        const activityResult: Array<{ activity_count: number }> = await queryRunner.query(
          `
          SELECT COUNT(*) AS activity_count
          FROM karma_activity_log
          WHERE user_id = ?
            AND created_at >= DATE_SUB(CURDATE(), INTERVAL 1 DAY)
            AND created_at < CURDATE()
          `,
          [link.user_id],
        );

        const hasActivity = (activityResult[0]?.activity_count ?? 0) > 0;
        let newGrit = hasActivity ? Math.min(100, link.grit + 1) : link.grit - 1;

        if (newGrit <= 0) {
          if (link.level_order >= 5) {
            const targetLevelOrder = link.level_order - 1;
            const targetLevel: Array<{ id: string }> = await queryRunner.query(
              `SELECT id FROM level WHERE level_order = ? LIMIT 1`,
              [targetLevelOrder],
            );

            if (targetLevel.length > 0) {
              const lowerLevelId = targetLevel[0].id;
              newGrit = 100;

              await queryRunner.query(
                `
                UPDATE user_lvl_link
                SET level_id = ?,
                    grit = ?,
                    last_level_down_at = NOW(),
                    updated_at = NOW()
                WHERE id = ?
                `,
                [lowerLevelId, newGrit, link.id],
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
          } else {
            await queryRunner.query(
              `UPDATE user_lvl_link SET grit = 0, updated_at = NOW() WHERE id = ?`,
              [link.id],
            );
          }
        } else {
          await queryRunner.query(
            `UPDATE user_lvl_link SET grit = ?, updated_at = NOW() WHERE id = ?`,
            [newGrit, link.id],
          );
        }

        processedCount++;
      }

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
