import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { withRowLock } from '../testing/concurrency-harness.js';
import { statusWorld } from '../testing/status-world.js';

// Task B12 — NSH-11 `[đề xuất]` (PLAN booking 7.32; TRACKING 3.26 B12-Q): CƠ CHẾ khoá ngầm trên MySQL 8.4 THẬT. `UPDATE lich_hen SET trang_thai` xin khoá S trên hàng cha `benh_nhan` của chủ lịch NGAY SAU khi đã giữ X trên `lich_hen`, vì
// chỉ mục khoá ngoại `lich_hen_index_9 (benh_nhan_id, trang_thai, thoi_gian)` có cột `trang_thai`: ghi lại mục chỉ mục thì InnoDB kiểm khoá ngoại. Thứ tự ngầm của MỌI lần đổi trạng thái là `lich_hen` rồi `benh_nhan` (tầng 6 rồi tầng 2),
// ngược chiều `markNoShow` (khoá `benh_nhan` TRƯỚC): đó là chu trình đã đo ở CT-13 (deadlock 1213 thật, bằng chứng `SHOW ENGINE INNODB STATUS`). Ca này BẢO VỆ lập luận trong PLAN 5.3 và TECH_DEBT dòng 113: nếu sau này tách chỉ mục khoá
// ngoại khỏi `trang_thai` (một hướng sửa của nợ đó) thì ca ĐỎ, nhắc cập nhật PLAN 5.3, mã `markNoShow` và các ca đồng thời `HIDDEN_FK_LOCK`. Đọc `performance_schema.data_locks` lọc theo schema của DB test (như `lock-wait.ts`); KHÔNG `SET GLOBAL`.
const LOCKS_ON_PATIENT_SQL = `SELECT LOCK_MODE AS modo, LOCK_STATUS AS trangThai, LOCK_DATA AS khoa
FROM performance_schema.data_locks
WHERE OBJECT_SCHEMA = DATABASE() AND OBJECT_NAME = 'benh_nhan' AND LOCK_TYPE = 'RECORD'
ORDER BY LOCK_MODE, LOCK_DATA`;

interface LockRow {
  modo: string;
  trangThai: string;
  khoa: string;
}

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

/** Các khoá hàng trên bảng `benh_nhan` đang bị giữ (từ MỌI kết nối) trong lúc `sql` đã chạy và CHƯA commit trên một kết nối riêng. */
const locksWhileHolding = (sql: string, params: unknown[]) =>
  withRowLock(db, { sql, params }, () =>
    db.query<LockRow[]>(LOCKS_ON_PATIENT_SQL),
  );

describe('NSH-11 khoá S ngầm trên benh_nhan của chủ lịch khi UPDATE lich_hen SET trang_thai (B12-Q)', () => {
  it.each(['DaHuy', 'DaTiepDon', 'VangMat'] as const)(
    'đổi trang_thai sang %s: giao dịch giữ khoá S (S,REC_NOT_GAP, đã cấp) trên hàng benh_nhan của CHỦ lịch (kể cả lịch của hồ sơ người thân) và KHÔNG khoá X',
    async (to) => {
      const w = await statusWorld(db, fx);
      const lich = await w.booked('DaXacNhan', 0, {
        hoSoNguoiThanId: w.relativeId,
      });
      const locks = await locksWhileHolding(
        'UPDATE lich_hen SET trang_thai = ? WHERE lich_hen_id = ? AND trang_thai = ?',
        [to, lich.lichHenId, 'DaXacNhan'],
      );
      expect(locks).toContainEqual({
        modo: 'S,REC_NOT_GAP',
        trangThai: 'GRANTED',
        khoa: w.patientId,
      });
      // chỉ MỘT hàng cha bị khoá và chỉ ở chế độ S: không ai khác ngoài chủ lịch, không X
      expect(locks.filter((lock) => lock.modo.startsWith('X'))).toEqual([]);
      expect(new Set(locks.map((lock) => lock.khoa))).toEqual(
        new Set([w.patientId]),
      );
    },
  );

  it('đối chứng ÂM: UPDATE không đổi cột nào của chỉ mục khoá ngoại (ly_do_kham) KHÔNG xin khoá nào trên benh_nhan: khoá ngầm là do cột trang_thai nằm trong lich_hen_index_9', async () => {
    const w = await statusWorld(db, fx);
    const lich = await w.booked('DaXacNhan', 0);
    const locks = await locksWhileHolding(
      'UPDATE lich_hen SET ly_do_kham = ? WHERE lich_hen_id = ?',
      ['Ghi chú không thuộc chỉ mục', lich.lichHenId],
    );
    expect(locks).toEqual([]);
  });

  it('chỉ mục khoá ngoại thật: lich_hen_index_9 có benh_nhan_id đứng đầu và trang_thai đứng thứ hai (nếu tách chỉ mục thì ca này đỏ và PLAN 5.3, TECH_DEBT dòng 113 phải đổi)', async () => {
    const rows = await db.query<{ ten: string; vi_tri: number; cot: string }[]>(
      `SELECT INDEX_NAME AS ten, SEQ_IN_INDEX AS vi_tri, COLUMN_NAME AS cot
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lich_hen' AND INDEX_NAME = 'lich_hen_index_9'
ORDER BY SEQ_IN_INDEX`,
    );
    expect(rows.map((row) => row.cot)).toEqual([
      'benh_nhan_id',
      'trang_thai',
      'thoi_gian',
    ]);
  });
});
