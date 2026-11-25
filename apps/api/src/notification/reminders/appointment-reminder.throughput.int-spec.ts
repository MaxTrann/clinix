import type { DataSource } from 'typeorm';
import { SLOT0_TIME } from '../../appointments/testing/cancel-world.js';
import {
  db,
  useStatusWorldHooks,
  world,
} from '../../appointments/testing/status-int-kit.js';
import {
  createReminderService,
  HOUR_MS,
  readReminders,
  shift,
  sweepAt,
} from '../testing/reminder-fixtures.js';

// notification B3 — NLH-21 (số đo M7 bằng MÃ THẬT): 1.010 lịch cùng mốc 2 giờ, lô 100, tối đa 10 lô mỗi lượt. Lượt 1 xử lý đủ 1.000 và báo `more`; lượt 2 nhặt 10 còn lại; không mốc nào gửi hai lần.
// Dữ liệu nạp bằng `INSERT … SELECT` từ MỘT lịch mẫu với khoá ngoại tắt trong MỘT phiên (nếp X1): mỗi lịch một `khung_gio_id` giả riêng để không đụng UNIQUE `khung_gio_dang_giu`.
// `readNotificationContext` không đọc `khung_gio` nên khung giờ giả không ảnh hưởng thư. Chạy MỘT mình; ghi thời gian thật.
useStatusWorldHooks();
const TOTAL = 1010;
const MOC2 = shift(SLOT0_TIME, -2 * HOUR_MS);

async function cloneAppointments(
  source: DataSource,
  lichHenId: string,
  count: number,
): Promise<void> {
  const runner = source.createQueryRunner();
  try {
    await runner.query('SET FOREIGN_KEY_CHECKS = 0');
    await runner.query('SET SESSION cte_max_recursion_depth = 5000');
    await runner.query(
      `INSERT INTO lich_hen (ma_lich_hen, khung_gio_id, benh_nhan_id, bac_si_id, chi_nhanh_id, dich_vu_kham_id, thoi_gian, gia_snapshot, tien_coc_snapshot, trang_thai)
       WITH RECURSIVE seq (n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < ?)
       SELECT CONCAT('CLX-M7-', LPAD(seq.n, 6, '0')), 900000 + seq.n, l.benh_nhan_id, l.bac_si_id, l.chi_nhanh_id, l.dich_vu_kham_id, l.thoi_gian, l.gia_snapshot, l.tien_coc_snapshot, 'DaXacNhan'
         FROM seq JOIN lich_hen l ON l.lich_hen_id = ?`,
      [count, lichHenId],
    );
  } finally {
    await runner.query('SET FOREIGN_KEY_CHECKS = 1');
    await runner.release();
  }
}

describe('NLH-21 1.010 lịch cùng mốc', () => {
  it('lượt 1: đủ 1.000 (10 lô) và more; lượt 2: 10 còn lại; không mốc nào gửi hai lần', async () => {
    const w = await world();
    const mau = await w.booked('DaXacNhan', 0);
    await cloneAppointments(db, mau.lichHenId, TOTAL - 1);
    const { mail, service } = createReminderService(db);
    const started = performance.now();
    const first = await sweepAt(service, MOC2);
    const firstMs = performance.now() - started;
    expect(first).toMatchObject({ created: 1000, sent: 1000, more: true });
    const second = await sweepAt(service, shift(MOC2, 60_000));
    expect(second).toMatchObject({ created: 10, sent: 10, more: false });
    const rows = await readReminders(db);
    expect(rows).toHaveLength(TOTAL);
    expect(rows.every((r) => r.trangThai === 'DaGui' && r.soLanThu === 1)).toBe(
      true,
    );
    expect(mail.attempts).toHaveLength(TOTAL);
    process.stderr.write(
      `NLH-21 lượt 1: ${String(first.sent)} thư trong ${(firstMs / 1000).toFixed(1)} giây (FakeMailService 0 ms)\n`,
    );
  }, 300_000);
});
