import type { DataSource } from 'typeorm';
import { BOOKING_NOTIFICATION_EVENTS } from '../../../appointments/appointments.constants.js';
import { selectDueEmails } from '../../../appointments/notifications/email-outbox.query.js';
import { insertThongBao } from '../../../appointments/notifications/thong-bao-insert.query.js';
import { BookingFixtures } from '../../../appointments/testing/booking-fixtures.js';
import { useIntegrationHooks } from '../../../auth/testing/int-hooks.js';
import { EXAM_NOTIFICATION_EVENTS } from '../examination.constants.js';
import { countRows, thongBaoRows } from '../testing/exam-completion-stack.js';
import { examWorld } from '../testing/exam-world.js';
import { buildCompletedText, ExamNotifier } from './exam-notifier.js';

// doctor-exam B1 — ExamNotifier trên MySQL 8.4 THẬT: TDK-01, TDK-02 (PLAN 7.11), cộng HDK-06 `[đề xuất]` (7.10; chưa task nào nhận ở TRACKING mục 2). Phần chữ của thông báo: exam-notifier.spec.ts.
// Toàn bộ qua `db.transaction` (như người gọi thật: `em` của giao dịch hoàn thành). Dữ liệu giả.
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const COMPLETED = EXAM_NOTIFICATION_EVENTS.COMPLETED;
const AT = new Date('2026-11-10T09:00:00+07:00');
const notifier = new ExamNotifier();

async function world() {
  const w = await examWorld(db, fx);
  const lich = await w.inVisit(0);
  const notify = (taiKhoanId = w.patientId, now = AT) =>
    db.transaction((em) =>
      notifier.notifyCompleted(em, {
        lichHenId: lich.lichHenId,
        taiKhoanId,
        maLichHen: lich.maLichHen,
        now,
      }),
    );
  return { w, lich, notify };
}

describe('TDK-01 thong_bao LichHenHoanThanh: người nhận, lịch, loại, chưa đọc, giờ', () => {
  it('đúng MỘT dòng cho tài khoản ĐẶT (không cho bác sĩ): lich_hen_id, loai_su_kien, trang_thai_doc = 0, nội dung dựng từ mã lịch, thoi_diem_tao đúng giây; không dòng email', async () => {
    const { w, lich, notify } = await world();
    await expect(notify()).resolves.toMatchObject({ kind: 'Inserted' });
    expect(await thongBaoRows(db)).toEqual([
      {
        taiKhoanId: w.patientId,
        lichHenId: lich.lichHenId,
        loai: 'LichHenHoanThanh',
        daDoc: 0,
        noiDung: buildCompletedText(lich.maLichHen),
        thoiDiemTao: '2026-11-10 09:00:00',
      },
    ]);
    expect(w.patientId).not.toBe(w.doctorId);
    expect(await countRows(db, 'email_thong_bao')).toBe(0);
  });

  it('lỗi khác 1062 (khoá ngoại: tài khoản không tồn tại) NỔI LÊN, không bị nuốt, và không để lại dòng nào', async () => {
    const { notify } = await world();
    await expect(notify('999999999')).rejects.toThrow();
    expect(await countRows(db, 'thong_bao')).toBe(0);
  });
});

describe('TDK-02 ghi hai lần cùng (lịch, tài khoản, loại): "đã có", không lỗi, một dòng', () => {
  it('lần hai ở giao dịch khác ⇒ AlreadyExists; vẫn MỘT dòng, nội dung lần đầu giữ nguyên', async () => {
    const { notify } = await world();
    await notify();
    const before = await thongBaoRows(db);
    await expect(
      notify(undefined, new Date(AT.getTime() + 60_000)),
    ).resolves.toEqual({ kind: 'AlreadyExists' });
    expect(await thongBaoRows(db)).toEqual(before);
  });

  it('lần hai NGAY TRONG CÙNG giao dịch ⇒ AlreadyExists và giao dịch dùng tiếp được: một câu khác vẫn chạy, một thông báo loại khác vẫn ghi, commit còn hai dòng (1062 chỉ ở cấp câu lệnh, X1 M12)', async () => {
    const { w, lich } = await world();
    await db.transaction(async (em) => {
      const input = {
        lichHenId: lich.lichHenId,
        taiKhoanId: w.patientId,
        maLichHen: lich.maLichHen,
        now: AT,
      };
      expect((await notifier.notifyCompleted(em, input)).kind).toBe('Inserted');
      expect(await notifier.notifyCompleted(em, input)).toEqual({
        kind: 'AlreadyExists',
      });
      await expect(em.query('SELECT 1 AS mot')).resolves.toBeDefined();
      await insertThongBao(em, {
        taiKhoanId: w.patientId,
        noiDung: 'loại khác',
        loaiSuKien: 'LoaiKhac',
        lichHenId: lich.lichHenId,
        thoiDiemTao: AT,
      });
    });
    expect((await thongBaoRows(db)).map((row) => row.loai)).toEqual([
      COMPLETED,
      'LoaiKhac',
    ]);
  });
});

describe('HDK-06 [đề xuất] hộp thư đi của booking BỎ QUA loại LichHenHoanThanh', () => {
  it('dòng email_thong_bao ChoGui gắn một thong_bao LichHenHoanThanh KHÔNG được chọn vào lô thư đến lượt; đối chứng: cùng dòng nhưng loại của booking thì được chọn; không lỗi', async () => {
    const { w, lich, notify } = await world();
    await notify();
    const queue = async (thongBaoId: string) =>
      db.query('INSERT INTO email_thong_bao (thong_bao_id) VALUES (?)', [
        thongBaoId,
      ]);
    // B1 KHÔNG ghi dòng email; ở đây gài tay một dòng ChoGui cho thông báo hoàn thành, rồi một dòng cho thông báo loại của booking làm đối chứng dương
    const completed: { id: string }[] = await db.query(
      'SELECT CAST(thong_bao_id AS CHAR) AS id FROM thong_bao WHERE loai_su_kien = ?',
      [COMPLETED],
    );
    await queue(completed[0]?.id ?? '');
    const control: { insertId: string } = await db.query(
      'INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, lich_hen_id, thoi_diem_tao) VALUES (?, ?, ?, ?, ?)',
      [
        w.patientId,
        'đối chứng',
        BOOKING_NOTIFICATION_EVENTS.CONFIRMED,
        lich.lichHenId,
        AT,
      ],
    );
    const controlId = String(control.insertId);
    await queue(controlId);

    const due = await selectDueEmails(db.manager, {
      now: AT,
      afterId: '0',
      limit: 100,
    });
    expect(due.map((email) => email.thongBaoId)).toEqual([controlId]);
  });
});
