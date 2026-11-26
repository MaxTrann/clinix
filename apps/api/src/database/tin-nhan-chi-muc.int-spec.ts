import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../auth/testing/int-hooks.js';

// chat P2 (#707) — MCH-12 phần EXPLAIN trên MySQL 8.4 THẬT: câu đếm giới hạn tốc độ gửi tin (PLAN chat 5.5; B1 sẽ dùng đúng câu này) của một người gửi
// có nhiều tin dùng chỉ mục mới `tin_nhan_index_nguoi_gui_thoi_diem` và chỉ đọc chỉ mục (không đọc từng hàng như khi chỉ có UNIQUE theo người gửi, số đo X1 M4).
let db: DataSource;
useIntegrationHooks((d) => {
  db = d;
});

const SENDER = 900_001;
// Đúng câu của PLAN chat 5.5: đếm tối đa 20 tin của người gửi trong cửa sổ, `LIMIT 20` để dừng sớm
const RATE_SQL =
  'SELECT COUNT(*) AS n FROM (SELECT 1 FROM tin_nhan WHERE nguoi_gui_id = ? AND thoi_diem_gui > ? LIMIT 20) t';
// Tin cuối của người đo lúc 2026-12-01 08:00:00; tin cách nhau 30 giây (khoảng 25 tin trong 12 phút 30 giây cuối)
const LAST_MESSAGE = '2026-12-01 08:00:00';

/** 3.000 tin của người đo (mỗi tin cách 30 giây) và 3.000 tin của 300 người khác; khoá ngoại tắt khi nạp (không cần tài khoản, hội thoại thật để xem kế hoạch truy vấn). */
async function seed(): Promise<void> {
  const qr = db.createQueryRunner();
  await qr.connect();
  try {
    await qr.query('SET FOREIGN_KEY_CHECKS = 0');
    await qr.query('SET SESSION cte_max_recursion_depth = 10000');
    await qr.query(
      `INSERT INTO tin_nhan (hoi_thoai_id, nguoi_gui_id, ma_gui, noi_dung, thoi_diem_gui)
       WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM s WHERE n < 6000)
       SELECT 1 + (n % 50), IF(n <= 3000, ?, 1000 + (n % 300)), UUID(), CONCAT('Tin ', n),
              TIMESTAMP(?) - INTERVAL ((n - 1) * 30) SECOND
         FROM s`,
      [SENDER, LAST_MESSAGE],
    );
    await qr.query('ANALYZE TABLE tin_nhan');
  } finally {
    await qr.query('SET FOREIGN_KEY_CHECKS = 1');
    await qr.release();
  }
}

async function planOf(since: string) {
  const rows = (await db.query(`EXPLAIN ${RATE_SQL}`, [SENDER, since])) as {
    table: string;
    type: string | null;
    key: string | null;
    Extra: string | null;
  }[];
  return rows.find((row) => row.table === 'tin_nhan');
}

async function countSince(since: string): Promise<number> {
  const [row] = (await db.query(RATE_SQL, [SENDER, since])) as { n: string }[];
  return Number(row?.n);
}

describe('MCH-12 EXPLAIN câu đếm giới hạn tốc độ theo người gửi', () => {
  it.each([
    ['không có tin trong 60 giây', '2026-12-01 09:00:00'],
    ['có hơn 20 tin trong cửa sổ', '2026-12-01 07:47:00'],
  ])(
    '%s: dùng tin_nhan_index_nguoi_gui_thoi_diem, range, chỉ đọc chỉ mục',
    async (_name, since) => {
      await seed();
      const plan = await planOf(since);
      expect(plan?.key).toBe('tin_nhan_index_nguoi_gui_thoi_diem');
      expect(plan?.type).toBe('range');
      expect(plan?.Extra ?? '').toContain('Using index');
    },
  );

  it('kết quả đếm đúng ở biên: 0 khi không có tin mới, trần 20 khi nhiều hơn, đúng số khi ít hơn; mốc là "lớn hơn" (tin đúng mốc không tính)', async () => {
    await seed();
    expect(await countSince('2026-12-01 09:00:00')).toBe(0);
    expect(await countSince('2026-12-01 07:47:00')).toBe(20);
    // Tin lúc 08:00:00, 07:59:30, 07:59:00 sau mốc 07:58:30; tin đúng 07:58:30 không tính
    expect(await countSince('2026-12-01 07:58:30')).toBe(3);
  });
});
