import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../auth/testing/int-hooks.js';

// notification P2 (#657) — MTB-10 phần EXPLAIN trên MySQL 8.4 THẬT: danh sách thông báo của MỘT tài khoản nhiều hơn 1.000 dòng (ngưỡng của tiêu chí X1 M1)
// không còn `Using filesort` ở cả ba bộ lọc. Câu danh sách là câu đã chốt ở PLAN notification 5.4 (B2 sẽ dùng đúng câu này).
let db: DataSource;
useIntegrationHooks((d) => {
  db = d;
});

const ACCOUNT = 900_001;
const LIST = (filter: string) =>
  `SELECT t.thong_bao_id, t.loai_su_kien, t.noi_dung, t.trang_thai_doc, t.thoi_diem_tao, lh.ma_lich_hen
     FROM thong_bao t LEFT JOIN lich_hen lh ON lh.lich_hen_id = t.lich_hen_id
    WHERE t.tai_khoan_id = ?${filter}
    ORDER BY t.thoi_diem_tao DESC, t.thong_bao_id DESC LIMIT 20 OFFSET 0`;

/** 2.000 thông báo của tài khoản đo (nửa chưa đọc) và 3.000 của 300 tài khoản khác; khoá ngoại tắt khi nạp (không cần tài khoản thật để xem kế hoạch truy vấn). */
async function seed(): Promise<void> {
  const qr = db.createQueryRunner();
  await qr.connect();
  try {
    await qr.query('SET FOREIGN_KEY_CHECKS = 0');
    await qr.query('SET SESSION cte_max_recursion_depth = 10000');
    await qr.query(
      `INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, trang_thai_doc, thoi_diem_tao)
       WITH RECURSIVE s(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM s WHERE n < 5000)
       SELECT IF(n <= 2000, ?, 1000 + (n % 300)), CONCAT('Thông báo ', n), 'NapViThanhCong', n % 2,
              TIMESTAMP('2026-12-01 08:00:00') - INTERVAL (n * 97) SECOND
         FROM s`,
      [ACCOUNT],
    );
    await qr.query('ANALYZE TABLE thong_bao');
  } finally {
    await qr.query('SET FOREIGN_KEY_CHECKS = 1');
    await qr.release();
  }
}

async function planOf(filter: string) {
  const rows = (await db.query(`EXPLAIN ${LIST(filter)}`, [ACCOUNT])) as {
    table: string;
    key: string | null;
    Extra: string | null;
  }[];
  return rows.find((row) => row.table === 't');
}

describe('MTB-10 EXPLAIN danh sách thông báo theo tài khoản', () => {
  it('"Tất cả": dùng thong_bao_index_tai_khoan_thoi_diem, đọc ngược chỉ mục, KHÔNG filesort', async () => {
    await seed();
    const plan = await planOf('');
    expect(plan?.key).toBe('thong_bao_index_tai_khoan_thoi_diem');
    expect(plan?.Extra ?? '').not.toContain('filesort');
  });

  it.each([
    ['Chưa đọc', ' AND t.trang_thai_doc = 0'],
    ['Đã đọc', ' AND t.trang_thai_doc = 1'],
  ])(
    '"%s": vẫn không filesort (chỉ mục mới không làm hỏng hai bộ lọc)',
    async (_name, filter) => {
      await seed();
      const plan = await planOf(filter);
      expect(plan?.key).not.toBeNull();
      expect(plan?.Extra ?? '').not.toContain('filesort');
    },
  );
});
