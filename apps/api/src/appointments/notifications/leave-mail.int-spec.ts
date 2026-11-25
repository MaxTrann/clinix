import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import {
  LEAVE_EVENTS,
  LeaveNotifier,
} from '../../doctor/notifications/leave-notifier.js';
import {
  countRows,
  createLeaveServices,
  LEAVE_DAY,
  leaveSetup,
  SYSTEM,
} from '../../doctor/testing/leave-approval-world.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import {
  createOutbox,
  emailOf,
  readOutbox,
} from '../testing/notification-world.js';
import { emptyEmailOutboxSummary } from './email-outbox.service.js';

// notification B5 — thư nghỉ phép gửi Bác sĩ qua worker THẬT trên MySQL 8.4 với `FakeMailService` (không thư thật, EMT-11): EMT-05 (không lý do xin nghỉ của Bác sĩ trong thư), EMT-06 (người nhận là
// Bác sĩ, không phải Admin), EMT-07 (thông báo cũ không có dòng thư thì không sinh thư), EMT-08 (lỗi gửi, nhịp 5 phút, chưa cấu hình SMTP). Dòng thư do `LeaveNotifier` THẬT ghi qua dịch vụ duyệt
// và từ chối THẬT (EMT-04 ở leave-notifier.int-spec.ts và admin-leave-approve.service.int-spec.ts). Đồng hồ giả T0 = 08:00 ngày 02/11/2026 (`useIntegrationHooks`).
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});
const NOW = new Date('2026-11-02T08:01:00+07:00');
const minutesAfterNow = (m: number) => new Date(NOW.getTime() + m * 60_000);
/** Lý do xin nghỉ của Bác sĩ: KHÔNG được có trong bất kỳ thư nào (doctor Q33). */
const SECRET_REASON = 'Điều trị bệnh riêng bí mật';

async function sweep(
  service: ReturnType<typeof createOutbox>['service'],
  now: Date = NOW,
) {
  const summary = emptyEmailOutboxSummary();
  await service.sweep(now, summary);
  return summary;
}

/** Bác sĩ có một yêu cầu nghỉ `ChoDuyet` ngày `LEAVE_DAY` ca sáng, lý do là `SECRET_REASON`. */
async function pendingLeave() {
  const s = await leaveSetup(db, fx);
  const id = await fx.doctor.leaveRequest({
    bacSiId: s.doctorId,
    batDau: LEAVE_DAY,
    hinhThuc: 'TheoCa',
    ca: 'CaSang',
    lyDo: SECRET_REASON,
  });
  return { ...s, id };
}

describe('EMT-05, EMT-06 thư nghỉ phép qua luồng duyệt và từ chối THẬT', () => {
  it('Duyệt: đúng MỘT thư tới email BÁC SĨ (không tới Admin); có trạng thái, khoảng nghỉ; không lý do xin nghỉ; dòng DaGui, so_lan_thu 1', async () => {
    const { doctorId, adminId, id } = await pendingLeave();
    await createLeaveServices(db).approval.approve(SYSTEM, adminId, id);
    const { mail, service } = createOutbox(db);

    await expect(sweep(service)).resolves.toMatchObject({
      sent: 1,
      failed: 0,
    });

    expect(mail.sent).toHaveLength(1);
    const [sent] = mail.sent;
    expect(sent?.to).toBe(await emailOf(db, doctorId));
    expect(sent?.to).not.toBe(await emailOf(db, adminId));
    expect(sent?.subject).toBe('[CLINIX] Cập nhật yêu cầu nghỉ phép');
    for (const part of [
      'Yêu cầu nghỉ phép đã được duyệt',
      'Trạng thái: Đã duyệt',
      'Thời gian duyệt: 02/11/2026 — 08:00',
      'ca sáng ngày 10/11/2026',
    ])
      expect(sent?.text).toContain(part);
    for (const body of [sent?.text ?? '', sent?.html ?? '']) {
      expect(body).not.toContain(SECRET_REASON);
      expect(body).not.toMatch(/href=/i);
    }
    expect(await readOutbox(db)).toMatchObject([
      { trangThai: 'DaGui', soLanThu: 1, daGuiLuc: '2026-11-02 08:01:00' },
    ]);
  });

  it('Từ chối: thư có lý do TỪ CHỐI của Admin, không có lý do xin nghỉ của Bác sĩ', async () => {
    const { doctorId, adminId, id } = await pendingLeave();
    await createLeaveServices(db).rejection.reject(
      SYSTEM,
      adminId,
      id,
      'Thiếu người trực',
    );
    const { mail, service } = createOutbox(db);

    await expect(sweep(service)).resolves.toMatchObject({ sent: 1 });

    const [sent] = mail.sent;
    expect(sent?.to).toBe(await emailOf(db, doctorId));
    expect(sent?.text).toContain('Trạng thái: Bị từ chối');
    expect(sent?.text).toContain('Lý do: Thiếu người trực');
    for (const body of [sent?.text ?? '', sent?.html ?? ''])
      expect(body).not.toContain(SECRET_REASON);
  });

  it('Đã gửi và Chờ duyệt cùng lúc: chỉ Bác sĩ nhận thư "đã được gửi"; hai Admin có thông báo nhưng KHÔNG có thư', async () => {
    const { w, doctorId } = await pendingLeave();
    const input = {
      bacSiId: doctorId,
      chiNhanhId: w.branch.chiNhanhId,
      tenBacSi: 'Bác sĩ Mẫu',
      ngayBatDau: LEAVE_DAY,
      ngayKetThuc: LEAVE_DAY,
      ca: 'CaSang' as const,
    };
    const notifier = new LeaveNotifier();
    await db.transaction(async (em) => {
      await notifier.notify(em, {
        loaiSuKien: LEAVE_EVENTS.Submitted,
        ...input,
      });
      await notifier.notify(em, { loaiSuKien: LEAVE_EVENTS.Pending, ...input });
    });
    expect(await countRows(db, 'FROM thong_bao')).toBe(3);
    const { mail, service } = createOutbox(db);

    await expect(sweep(service)).resolves.toMatchObject({ sent: 1 });

    expect(mail.sent.map((m) => m.to)).toEqual([await emailOf(db, doctorId)]);
    expect(mail.sent[0]?.text).toContain('Trạng thái: Chờ duyệt');
    expect(await readOutbox(db)).toHaveLength(1);
  });
});

describe('EMT-07 không tạo thư cho thông báo nghỉ phép ghi trước B5', () => {
  it('thông báo NghiPhepDaDuyet có sẵn nhưng không có dòng thư: worker không gửi, email_thong_bao vẫn 0 dòng; thông báo mới sau đó có thư', async () => {
    const { doctorId, adminId, id } = await pendingLeave();
    await db.query(
      "INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, thoi_diem_tao) VALUES (?, 'Yêu cầu nghỉ phép ngày 01/11/2026 đã được duyệt.', 'NghiPhepDaDuyet', '2026-11-01 09:00:00')",
      [doctorId],
    );
    const { mail, service } = createOutbox(db);

    await expect(sweep(service)).resolves.toMatchObject({ sent: 0 });
    expect(mail.attempts).toHaveLength(0);
    expect(await countRows(db, 'FROM email_thong_bao')).toBe(0);

    await createLeaveServices(db).approval.approve(SYSTEM, adminId, id);
    await expect(sweep(service)).resolves.toMatchObject({ sent: 1 });
    expect(await countRows(db, 'FROM email_thong_bao')).toBe(1);
  });
});

describe('EMT-08 lỗi gửi và chưa cấu hình SMTP cho thư nghỉ phép', () => {
  it('lần 1 lỗi: ThatBai, loi_cuoi là loại cố định; +4:59 không thử; +5:00 gửi lại, DaGui, so_lan_thu 2; log không có địa chỉ Bác sĩ', async () => {
    const { doctorId, adminId, id } = await pendingLeave();
    await createLeaveServices(db).approval.approve(SYSTEM, adminId, id);
    const warn = vi.spyOn(Logger.prototype, 'warn');
    const { mail, service } = createOutbox(db);
    mail.failNextWith('CONNECTION');

    await expect(sweep(service)).resolves.toMatchObject({ failed: 1 });
    expect(await readOutbox(db)).toMatchObject([
      { trangThai: 'ThatBai', soLanThu: 1, loiCuoi: 'CONNECTION' },
    ]);
    await sweep(service, new Date(minutesAfterNow(5).getTime() - 1000));
    expect(mail.attempts).toHaveLength(1);
    await expect(sweep(service, minutesAfterNow(5))).resolves.toMatchObject({
      sent: 1,
    });
    expect(await readOutbox(db)).toMatchObject([
      { trangThai: 'DaGui', soLanThu: 2, loiCuoi: null },
    ]);
    const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('lỗi ở lần 1/3: CONNECTION');
    expect(logged).not.toContain(await emailOf(db, doctorId));
  });

  it('NOT_CONFIGURED: dòng về đúng giá trị cũ, cả lượt dừng (thư thứ hai không bị thử), không tính lần thử', async () => {
    const { adminId, id, doctorId } = await pendingLeave();
    const second = await fx.doctor.leaveRequest({
      bacSiId: doctorId,
      batDau: '2026-11-11',
    });
    const services = createLeaveServices(db);
    await services.approval.approve(SYSTEM, adminId, id);
    await services.rejection.reject(SYSTEM, adminId, second, 'Trùng lịch');
    const before = await readOutbox(db);
    expect(before).toHaveLength(2);
    const { mail, service } = createOutbox(db);
    mail.failAllWith('NOT_CONFIGURED');

    await expect(sweep(service)).resolves.toMatchObject({
      notConfigured: true,
      failed: 0,
    });
    expect(mail.attempts).toHaveLength(1);
    expect(await readOutbox(db)).toEqual(before);
  });
});
