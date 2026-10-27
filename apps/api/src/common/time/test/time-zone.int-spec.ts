import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestDataSource,
  readTestDbSettings,
} from '../../../database/testing/test-database.js';
import { todayVN, weekdayVN } from '../time.js';

let db: DataSource;

beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
});

afterAll(async () => {
  await db?.destroy();
});

describe('đồng bộ ngày Việt Nam giữa ứng dụng và MySQL', () => {
  it.each([
    {
      instant: new Date('2026-10-27T16:59:59.000Z'),
      today: '2026-10-27',
      weekday: 2,
    },
    {
      instant: new Date('2026-10-27T17:00:00.000Z'),
      today: '2026-10-28',
      weekday: 3,
    },
  ])(
    '(BS-37, SE-A14) NOW() khớp helper ở mốc $today, thứ $weekday',
    async ({ instant, today, weekday }) => {
      const queryRunner = db.createQueryRunner();
      await queryRunner.connect();
      try {
        // SET timestamp chỉ ảnh hưởng NOW() của session này; app clock dùng cùng instant UTC.
        await queryRunner.query('SET timestamp = ?', [
          Math.floor(instant.getTime() / 1000),
        ]);
        const [row] = (await queryRunner.query(
          "SELECT DATE_FORMAT(NOW(), '%Y-%m-%d') AS ngay_vn, WEEKDAY(NOW()) + 1 AS thu_vn, @@session.time_zone AS timezone",
        )) as { ngay_vn: string; thu_vn: number | string; timezone: string }[];

        expect(row.timezone).toBe('+07:00');
        expect(row.ngay_vn).toBe(todayVN(instant));
        expect(row.ngay_vn).toBe(today);
        expect(Number(row.thu_vn)).toBe(weekdayVN(instant));
        expect(Number(row.thu_vn)).toBe(weekday);
      } finally {
        try {
          // Trả session về trạng thái thật trước khi connection được đưa lại vào pool.
          await queryRunner.query('SET timestamp = DEFAULT');
        } finally {
          await queryRunner.release();
        }
      }
    },
  );
});
