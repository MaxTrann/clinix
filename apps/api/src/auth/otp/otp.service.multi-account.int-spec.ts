import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import {
  createTestDataSource,
  readTestDbSettings,
} from '../../database/testing/test-database.js';
import { T0, captureNestLogger } from '../testing/otp-int-helpers.js';
import {
  MULTI_OPS,
  describeTally,
  runMultiAccountScenario,
} from '../testing/otp-multi-account.js';

// Task A5 — lỗi của A2 do A5 phát hiện: test đồng thời cũ của A2 chỉ thử cùng MỘT tài khoản (được khoá tài khoản xếp hàng sẵn) nên không thấy
// deadlock chéo tài khoản. Ở đây mỗi thao tác của OtpService chạy đồng thời trên NHIỀU tài khoản khác nhau, nhiều vòng, MySQL 8.4 thật,
// và đo bằng số lỗi MySQL thật: deadlock (1213) và hết thời gian chờ khoá (1205) phải bằng 0. Mã OTP-X-nn là [đề xuất].
const ROUNDS = Number(process.env['OTP_MULTI_ROUNDS'] ?? 12);

let db: DataSource;

beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  captureNestLogger();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await db?.destroy();
});

describe('nhiều tài khoản đồng thời không deadlock, không chờ khoá của nhau', () => {
  it.each(MULTI_OPS)(
    `OTP-X %s: ${String(ROUNDS)} vòng × 6 yêu cầu trên 6 tài khoản khác nhau, 0 lỗi 1213 và 1205`,
    async (op) => {
      const tally = await runMultiAccountScenario(db, op, { rounds: ROUNDS });

      expect(describeTally(op, tally)).toContain('deadlock 1213 = 0');
      expect(tally, describeTally(op, tally)).toMatchObject({
        deadlock1213: 0,
        lockTimeout1205: 0,
        other: {},
      });
      expect(tally.ok).toBe(tally.requests);
    },
    600_000,
  );
});
