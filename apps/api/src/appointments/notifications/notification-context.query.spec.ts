import { isLockingStatement } from '../testing/query-spy.js';
import { ScriptedEntityManager } from '../testing/scripted-entity-manager.js';
import {
  READ_CONTEXT_SQL,
  READ_NO_SHOW_COUNT_SQL,
  READ_NO_SHOW_THRESHOLD_SQL,
  readNoShowFacts,
  readNotificationContext,
} from './notification-context.query.js';

// Task B15 — bộ đọc dữ kiện cho `thong_bao` (PLAN booking 5.12; TRACKING 3.37 B15-G): NTF-08 phần CÂU SQL (không chọn lý do khám, lý do huỷ, SĐT, mật khẩu) và "chỉ đọc, không khoá" (không thêm chu trình khoá, B15-G
// (i)). Đơn vị, không DB; câu chạy thật trên MySQL ở `booking-notifier.int-spec.ts`.
const ROW = {
  maLichHen: 'CLX-20261110-0042',
  ngay: '10/11/2026',
  gio: '09:30',
  thu: '3',
  giaSnapshot: '350000.00',
  tienCocSnapshot: '100000.00',
  datHo: 1,
  nguoiDuocKham: 'Trần Thị Bình',
  chucDanh: 'TS_BS',
  tenBacSi: 'Nguyễn Thị Hương',
  chuyenKhoa: 'Nội tổng quát',
  dichVu: 'Khám nội tổng quát',
  chiNhanh: 'CLINIX Clinic Q.3',
  diaChiChiNhanh: '123 Nguyễn Thị Minh Khai, Q.3, TP.HCM',
  tenNguoiDat: 'Nguyễn Văn An',
  emailNguoiDat: 'nguoi.dat@example.test',
};

describe('NTF-08 câu SQL đọc dữ kiện: không dữ liệu riêng tư, chỉ đọc', () => {
  const all = [
    READ_CONTEXT_SQL,
    READ_NO_SHOW_COUNT_SQL,
    READ_NO_SHOW_THRESHOLD_SQL,
  ];

  it('không chọn lý do khám, lý do huỷ, số điện thoại, mật khẩu, ngày sinh, địa chỉ cá nhân', () => {
    for (const sql of all)
      expect(sql).not.toMatch(
        /ly_do_kham|ly_do_huy|so_dien_thoai|mat_khau|ngay_sinh|(?:nguoi_dat|hs|tai_khoan_bs)\.dia_chi/i,
      );
    // địa chỉ DUY NHẤT được chọn là của chi nhánh (`cn.dia_chi`), không phải của người dùng
    expect(READ_CONTEXT_SQL).toContain('cn.dia_chi AS diaChiChiNhanh');
  });

  it('chỉ đọc và KHÔNG khoá: không FOR UPDATE, FOR SHARE, INSERT, UPDATE, DELETE', () => {
    for (const sql of all) {
      expect(isLockingStatement(sql), sql).toBe(false);
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|REPLACE)\b/i);
    }
  });

  it('đúng MỘT tham số `?` (lich_hen_id) ở câu chính: không nối chuỗi dữ liệu vào SQL', () => {
    expect(READ_CONTEXT_SQL.match(/\?/g)).toHaveLength(1);
  });
});

describe('NTF-08 readNotificationContext', () => {
  it('ánh xạ đúng kiểu: thứ và cờ đặt hộ thành số và boolean, chữ giữ nguyên', async () => {
    const em = new ScriptedEntityManager(() => [ROW]);
    const context = await readNotificationContext(em.em, '41');
    expect(context).toEqual({ ...ROW, thu: 3, datHo: true });
    expect(em.queries).toEqual([{ sql: READ_CONTEXT_SQL, params: ['41'] }]);
  });

  it('không có hàng (lịch không tồn tại hay thiếu một hàng nối): trả null, người gọi quyết định', async () => {
    const em = new ScriptedEntityManager(() => []);
    expect(await readNotificationContext(em.em, '41')).toBeNull();
  });

  it('lịch của bản thân: cờ đặt hộ 0 ⇒ false', async () => {
    const em = new ScriptedEntityManager(() => [{ ...ROW, datHo: 0 }]);
    expect((await readNotificationContext(em.em, '41'))?.datHo).toBe(false);
  });
});

describe('NTF-08 readNoShowFacts', () => {
  const answer = (sql: string): unknown => {
    if (sql === READ_NO_SHOW_COUNT_SQL) return [{ soLan: '2' }];
    if (sql === READ_NO_SHOW_THRESHOLD_SQL) return [{ nguong: 3 }];
    return [];
  };

  it('đọc số lần và ngưỡng bằng em (đổi chuỗi sang số), theo đúng tài khoản', async () => {
    const em = new ScriptedEntityManager(answer);
    expect(await readNoShowFacts(em.em, '77')).toEqual({ soLan: 2, nguong: 3 });
    expect(em.queries[0]).toEqual({
      sql: READ_NO_SHOW_COUNT_SQL,
      params: ['77'],
    });
  });

  it('thiếu hàng benh_nhan: NÉM lỗi (dữ liệu lệch), không đoán số lần', async () => {
    const em = new ScriptedEntityManager((sql) =>
      sql === READ_NO_SHOW_COUNT_SQL ? [] : answer(sql),
    );
    await expect(readNoShowFacts(em.em, '77')).rejects.toThrow(/benh_nhan/);
  });

  it('thiếu cấu hình: NÉM lỗi, không đoán ngưỡng (quy tắc 35)', async () => {
    const em = new ScriptedEntityManager((sql) =>
      sql === READ_NO_SHOW_THRESHOLD_SQL ? [] : answer(sql),
    );
    await expect(readNoShowFacts(em.em, '77')).rejects.toThrow(
      /cau_hinh_he_thong/,
    );
  });
});
