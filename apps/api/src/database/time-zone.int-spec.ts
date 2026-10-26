import type { DataSource } from 'typeorm';
import { TaiKhoan } from '../auth/entities/tai-khoan.entity.js';
import { insertTaiKhoan } from '../auth/entities/testing/auth-fixtures.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from './testing/test-database.js';

// Task P3 — không có mã test case riêng trong plan auth. Múi giờ +07:00 (Q43 của plan admin) phải đúng ở CẢ driver
// lẫn session MySQL, nếu không các cột DEFAULT CURRENT_TIMESTAMP lệch giờ so với mốc thời gian do ứng dụng ghi.
let db: DataSource;

beforeAll(async () => {
  db = await createTestDataSource(readTestDbSettings());
});

beforeEach(async () => {
  await resetTables(db);
});

afterAll(async () => {
  await db?.destroy();
});

describe('múi giờ +07:00', () => {
  it('MỌI kết nối của pool đều có time_zone +07:00 (kể cả kết nối mở sau khi pool đã chạy)', async () => {
    // SLEEP giữ kết nối đủ lâu để pool buộc phải mở nhiều kết nối song song
    const rows = await Promise.all(
      Array.from({ length: 8 }, () =>
        db.query(
          'SELECT SLEEP(0.3) AS ngu, @@session.time_zone AS tz, CONNECTION_ID() AS ket_noi',
        ),
      ),
    );
    expect(new Set(rows.map(([row]) => row.ket_noi)).size).toBeGreaterThan(1);
    for (const [row] of rows) expect(row.tz).toBe('+07:00');
  });

  it('DB_TIMEZONE lấy từ cấu hình, không cố định trong mã: đặt +00:00 thì session là +00:00', async () => {
    const utc = await createTestDataSource({
      ...readTestDbSettings(),
      timezone: '+00:00',
    });
    try {
      const [row] = await utc.query('SELECT @@session.time_zone AS tz');
      expect(row.tz).toBe('+00:00');
    } finally {
      await utc.destroy();
    }
  });

  it('ghi một mốc thời gian rồi đọc lại đúng cả ở tầng entity lẫn trong DB (giờ Việt Nam)', async () => {
    const instant = new Date('2026-10-26T01:30:00.000Z'); // = 08:30 giờ Việt Nam
    const saved = await insertTaiKhoan(db, {
      thoiDiemTao: instant,
      khoaDangNhapDen: instant,
    });

    const found = await db
      .getRepository(TaiKhoan)
      .findOneByOrFail({ taiKhoanId: saved.taiKhoanId });
    expect(found.thoiDiemTao.toISOString()).toBe(instant.toISOString());
    expect(found.khoaDangNhapDen?.toISOString()).toBe(instant.toISOString());

    const [raw] = await db.query(
      "SELECT DATE_FORMAT(thoi_diem_tao, '%Y-%m-%d %H:%i:%s') AS gio FROM tai_khoan WHERE tai_khoan_id = ?",
      [saved.taiKhoanId],
    );
    expect(raw.gio).toBe('2026-10-26 08:30:00');
  });

  it('đồng hồ DB (DEFAULT CURRENT_TIMESTAMP, NOW()) khớp đồng hồ ứng dụng, không lệch múi giờ', async () => {
    const before = Date.now();
    const saved = await insertTaiKhoan(db); // không đặt thoiDiemTao: để DB tự điền
    const after = Date.now();

    const found = await db
      .getRepository(TaiKhoan)
      .findOneByOrFail({ taiKhoanId: saved.taiKhoanId });
    const lech = found.thoiDiemTao.getTime();
    // DATETIME chỉ có độ chính xác giây nên cho phép sai số vài giây, nhưng tuyệt đối không được lệch 7 giờ
    expect(lech).toBeGreaterThan(before - 5000);
    expect(lech).toBeLessThan(after + 5000);

    const [row] = await db.query('SELECT NOW() AS bay_gio');
    expect(
      Math.abs(new Date(row.bay_gio as string | Date).getTime() - Date.now()),
    ).toBeLessThan(5000);
  });
});
