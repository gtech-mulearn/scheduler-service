import { Logger } from '@nestjs/common';
import axios from 'axios';
import { GritMeterService, istDay, istDayStartUtc } from './grit-meter.service';

jest.mock('axios');

// A fake database: it answers the grit meter's queries from a small in-memory state and records
// every query, transaction step, email and webhook in one ordered event list.

type Candidate = { id: string; user_id: string; level_order: number };

interface FakeOptions {
  switchRows?: Array<{ value: string }> | Error;
  candidates?: Candidate[];
  failLogInsert?: boolean;
  sendResult?: { success: boolean; error?: string };
  webhook?: string;
}

function setUp(options: FakeOptions = {}) {
  const events: string[] = [];
  const levelDownAt = new Map<string, string>(); // link id -> UTC 'YYYY-MM-DD HH:MM:SS'
  const notificationLog: Array<{
    dedupe: string;
    status: string;
    error: unknown;
  }> = [];

  const respond = (sql: string, params: unknown[] = []): unknown => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (/FROM system_setting/.test(s)) {
      if (options.switchRows instanceof Error) throw options.switchRows;
      return options.switchRows ?? [{ value: 'true' }];
    }
    if (/^SELECT ull\.id, ull\.user_id, l\.level_order/.test(s))
      return options.candidates ?? [];
    if (/^UPDATE user_lvl_link ull JOIN level l/.test(s))
      return { affectedRows: 0 };
    if (/^SELECT id, level_order, name FROM level/.test(s)) {
      return [5, 6, 7].map((order) => ({
        id: `lvl-${order}`,
        level_order: order,
        name: `Level ${order}`,
      }));
    }
    if (/^UPDATE user_lvl_link SET level_id/.test(s)) {
      // Emulates the guard: lower the learner unless already lowered on this IST day.
      const [, , linkId, dayStart] = params as [string, string, string, string];
      const last = levelDownAt.get(linkId);
      if (last && last >= dayStart) return { affectedRows: 0 };
      levelDownAt.set(linkId, String(params[1]));
      return { affectedRows: 1 };
    }
    if (/^SELECT email, full_name FROM user/.test(s)) {
      return [
        { email: `${params[0]}@example.test`, full_name: 'Test Learner' },
      ];
    }
    if (/^INSERT INTO notification_log/.test(s)) {
      if (options.failLogInsert) throw new Error('insert failed');
      notificationLog.push({
        dedupe: String(params[2]),
        status: 'pending',
        error: null,
      });
      return { affectedRows: 1 };
    }
    if (/^UPDATE notification_log SET status/.test(s)) {
      const row = notificationLog.find((r) => r.dedupe === params[3]);
      if (row) {
        row.status = String(params[0]);
        row.error = params[1];
      }
      return { affectedRows: row ? 1 : 0 };
    }
    return [];
  };

  const queryRunner = {
    connect: jest.fn(async () => undefined),
    release: jest.fn(async () => undefined),
    startTransaction: jest.fn(async () => void events.push('START')),
    commitTransaction: jest.fn(async () => void events.push('COMMIT')),
    rollbackTransaction: jest.fn(async () => void events.push('ROLLBACK')),
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      const s = sql.replace(/\s+/g, ' ').trim();
      events.push(`Q ${s.slice(0, 40)}`);
      return respond(sql, params);
    }),
  };
  const dataSource = {
    query: jest.fn(async (sql: string, params?: unknown[]) =>
      respond(sql, params),
    ),
    createQueryRunner: jest.fn(() => queryRunner),
  };
  const configService = {
    get: jest.fn((key: string) =>
      key === 'DISCORD_WEBHOOK_LINK' ? options.webhook : undefined,
    ),
  };
  const mailerService = {
    sendMail: jest.fn(async (mail: { to: string }) => {
      events.push(`MAIL ${mail.to}`);
      return options.sendResult ?? { success: true };
    }),
  };
  (axios.post as jest.Mock).mockImplementation(
    async () => void events.push('WEBHOOK'),
  );

  const service = new GritMeterService(
    dataSource as never,
    configService as never,
    mailerService as never,
  );
  return {
    service,
    events,
    dataSource,
    queryRunner,
    mailerService,
    notificationLog,
    levelDownAt,
  };
}

const NOW = new Date('2026-11-23T00:00:00Z'); // 05:30 IST on 23 Nov, when the job runs
const learner: Candidate = { id: 'link-1', user_id: 'user-1', level_order: 6 };

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: ['nextTick', 'setImmediate', 'setTimeout'],
  });
  errorSpy = jest
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  (axios.post as jest.Mock).mockReset();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('the IST day', () => {
  it('starts at 18:30 UTC the day before', () => {
    expect(istDayStartUtc(new Date('2026-11-23T00:00:00Z'))).toBe(
      '2026-11-22 18:30:00',
    );
    expect(istDayStartUtc(new Date('2026-11-22T18:30:00Z'))).toBe(
      '2026-11-22 18:30:00',
    );
    expect(istDayStartUtc(new Date('2026-11-22T18:29:59Z'))).toBe(
      '2026-11-21 18:30:00',
    );
  });

  it('names the IST date', () => {
    expect(istDay(new Date('2026-11-22T18:29:59Z'))).toBe('2026-11-22');
    expect(istDay(new Date('2026-11-22T18:30:00Z'))).toBe('2026-11-23');
  });
});

describe('the kill switch fails closed', () => {
  it('makes no changes when reading the switch fails', async () => {
    const { service, dataSource } = setUp({
      switchRows: new Error('connection lost'),
      candidates: [learner],
    });

    await expect(service.processDailyGritMeter()).resolves.toEqual({
      processed: 0,
      levelDowns: 0,
    });

    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('makes no changes when the switch row is missing', async () => {
    const { service, dataSource } = setUp({
      switchRows: [],
      candidates: [learner],
    });

    await expect(service.processDailyGritMeter()).resolves.toEqual({
      processed: 0,
      levelDowns: 0,
    });

    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('makes no changes when the switch is off', async () => {
    const { service, dataSource } = setUp({
      switchRows: [{ value: 'false' }],
      candidates: [learner],
    });

    await service.processDailyGritMeter();

    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });
});

describe('lowering a learner', () => {
  it('updates the level and reserves the email log row in one transaction, and emails after the commit', async () => {
    const { service, events, notificationLog } = setUp({
      candidates: [learner],
    });

    const result = await service.processDailyGritMeter();

    expect(result.levelDowns).toBe(1);
    const learnerEvents = events.slice(events.indexOf('START'));
    expect(learnerEvents.slice(0, 5)).toEqual([
      'START',
      expect.stringMatching(/^Q UPDATE user_lvl_link SET level_id/),
      expect.stringMatching(/^Q SELECT email, full_name FROM user/),
      expect.stringMatching(/^Q INSERT INTO notification_log/),
      'COMMIT',
    ]);
    expect(events.indexOf('MAIL user-1@example.test')).toBeGreaterThan(
      events.indexOf('COMMIT'),
    );
    expect(notificationLog).toEqual([
      { dedupe: 'LEVEL_DOWN:user-1:2026-11-23', status: 'sent', error: null },
    ]);
  });

  it('guards the update with the start of the IST day', async () => {
    const { service, queryRunner } = setUp({ candidates: [learner] });

    await service.processDailyGritMeter();

    const update = queryRunner.query.mock.calls.find(([sql]) =>
      /SET level_id/.test(sql as string),
    );
    expect(update?.[0]).toMatch(
      /last_level_down_at IS NULL OR last_level_down_at < \?/,
    );
    expect(update?.[1]).toEqual([
      'lvl-5',
      '2026-11-23 00:00:00',
      'link-1',
      '2026-11-22 18:30:00',
    ]);
  });

  it('lowers each learner at most once when the job runs twice on one IST day', async () => {
    const { service, mailerService } = setUp({ candidates: [learner] });

    const first = await service.processDailyGritMeter();
    const second = await service.processDailyGritMeter();

    expect(first.levelDowns + second.levelDowns).toBe(1);
    expect(mailerService.sendMail).toHaveBeenCalledTimes(1);
  });

  it('sends no email or webhook when the transaction rolls back', async () => {
    const { service, events, mailerService } = setUp({
      candidates: [learner],
      failLogInsert: true,
      webhook: 'https://discord.example.test/hook',
    });

    const result = await service.processDailyGritMeter();

    expect(result.levelDowns).toBe(0);
    expect(events).toContain('ROLLBACK');
    expect(events).not.toContain('COMMIT');
    expect(mailerService.sendMail).not.toHaveBeenCalled();
    expect(axios.post).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('sends the Discord webhook only after the commit', async () => {
    const { service, events } = setUp({
      candidates: [learner],
      webhook: 'https://discord.example.test/hook',
    });

    await service.processDailyGritMeter();

    expect(events).toContain('COMMIT');
    expect(events).toContain('WEBHOOK');
    expect(events.indexOf('WEBHOOK')).toBeGreaterThan(events.indexOf('COMMIT'));
  });

  it('records and logs a failed send', async () => {
    const { service, notificationLog } = setUp({
      candidates: [learner],
      sendResult: { success: false, error: 'smtp down' },
    });

    await service.processDailyGritMeter();

    expect(notificationLog).toEqual([
      {
        dedupe: 'LEVEL_DOWN:user-1:2026-11-23',
        status: 'failed',
        error: 'smtp down',
      },
    ]);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('user-1'));
  });
});
