import { ExamNotifier } from '../../doctor/examination/notifications/exam-notifier.js';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import {
  createOutbox,
  emailOf,
  insertQueuedEmail,
  readOutbox,
} from '../testing/notification-world.js';
import {
  db,
  logs,
  useStatusWorldHooks,
  world,
} from '../testing/status-int-kit.js';
import { emptyEmailOutboxSummary } from './email-outbox.service.js';

// notification B4 — thư "Lịch khám đã hoàn thành" qua worker THẬT trên MySQL 8.4 với `FakeMailService` (không thư thật, EMT-11): EMT-02 (gửi đúng một thư tới tài khoản đặt, nội dung, không dữ liệu nhạy cảm),
// EMT-08 (lỗi gửi, nhịp 5 phút, chưa cấu hình SMTP) và EMT-12 (loại chỉ trong ứng dụng không bị chọn). Dòng thư do `ExamNotifier` THẬT ghi (EMT-01 ở exam-notifier.int-spec.ts và exam-completion.int-spec.ts).
useStatusWorldHooks();
const AT = new Date('2026-11-10T09:00:00+07:00');
const NOW = new Date('2026-11-10T09:01:00+07:00');
const notifier = new ExamNotifier();
const minutesAfterNow = (m: number) => new Date(NOW.getTime() + m * 60_000);

async function sweep(
  service: ReturnType<typeof createOutbox>['service'],
  now: Date = NOW,
) {
  const summary = emptyEmailOutboxSummary();
  await service.sweep(now, summary);
  return summary;
}

/** Ghi thông báo hoàn thành và dòng thư của lịch `lich` bằng `ExamNotifier` THẬT, trong một giao dịch như người gọi thật. */
async function completed(lich: LichHen, taiKhoanId: string) {
  await db.transaction((em) =>
    notifier.notifyCompleted(em, {
      lichHenId: lich.lichHenId,
      taiKhoanId,
      maLichHen: lich.maLichHen,
      now: AT,
    }),
  );
}

describe('EMT-02 worker gửi thư hoàn thành', () => {
  it('đúng MỘT thư tới email tài khoản ĐẶT (lịch của người thân); dòng DaGui, so_lan_thu 1; đủ chi tiết, câu nhắc đánh giá; không lý do khám, SĐT, liên kết', async () => {
    const w = await world();
    const lich = await w.booked('HoanThanh', 0, {
      hoSoNguoiThanId: w.relativeId,
    });
    const BI_MAT = 'Đau ngực bí mật';
    await db.query('UPDATE lich_hen SET ly_do_kham = ? WHERE lich_hen_id = ?', [
      BI_MAT,
      lich.lichHenId,
    ]);
    const [{ phone }] = (await db.query(
      'SELECT so_dien_thoai AS phone FROM tai_khoan WHERE tai_khoan_id = ?',
      [w.patientId],
    )) as { phone: string }[];
    await completed(lich, w.patientId);
    const { mail, service } = createOutbox(db);

    await expect(sweep(service)).resolves.toMatchObject({
      sent: 1,
      failed: 0,
    });

    expect(mail.sent).toHaveLength(1);
    const [sent] = mail.sent;
    expect(sent?.to).toBe(await emailOf(db, w.patientId));
    expect(sent?.subject).toBe('[CLINIX] Lịch khám đã hoàn thành');
    for (const part of [
      `Mã lịch hẹn: ${lich.maLichHen}`,
      '(đặt hộ)',
      'Bác sĩ: ',
      'Ngày giờ: Thứ Ba, 10/11/2026 — 08:00',
      'Chi nhánh: ',
      'đánh giá bác sĩ',
    ])
      expect(sent?.text).toContain(part);
    for (const body of [sent?.text ?? '', sent?.html ?? '']) {
      expect(body).not.toContain(BI_MAT);
      expect(body).not.toContain(phone);
      expect(body).not.toMatch(/href=/i);
    }
    expect(await readOutbox(db)).toMatchObject([
      { trangThai: 'DaGui', soLanThu: 1, daGuiLuc: '2026-11-10 09:01:00' },
    ]);
  });
});

describe('EMT-08 lỗi gửi và chưa cấu hình SMTP cho loại hoàn thành', () => {
  it('lần 1 lỗi: ThatBai, loi_cuoi là loại cố định; +4:59 không thử; +5:00 gửi lại, DaGui, so_lan_thu 2', async () => {
    const w = await world();
    await completed(await w.booked('HoanThanh', 0), w.patientId);
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
    expect(logs.join('\n')).not.toContain(await emailOf(db, w.patientId));
  });

  it('NOT_CONFIGURED: dòng về đúng giá trị cũ, cả lượt dừng (thư thứ hai không bị thử), không tính lần thử', async () => {
    const w = await world();
    await completed(await w.booked('HoanThanh', 0), w.patientId);
    await completed(await w.booked('HoanThanh', 1), w.patientId);
    const before = await readOutbox(db);
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

describe('EMT-12 loại chỉ trong ứng dụng không bị worker chọn', () => {
  it('NghiPhepChoDuyet, LichHenDaTiepDon, NapViThanhCong, RutTienDaGui có dòng thư ChoGui: không chọn, không gửi, không đổi; thư hoàn thành bên cạnh vẫn gửi', async () => {
    const w = await world();
    const lich = await w.booked('HoanThanh', 0);
    for (const loai of [
      'NghiPhepChoDuyet',
      'LichHenDaTiepDon',
      'NapViThanhCong',
      'RutTienDaGui',
    ])
      await insertQueuedEmail(db, {
        taiKhoanId: w.patientId,
        lichHenId: loai === 'LichHenDaTiepDon' ? lich.lichHenId : null,
        loai,
      });
    await completed(lich, w.patientId);
    const before = await readOutbox(db);
    const { mail, service } = createOutbox(db);

    await expect(sweep(service)).resolves.toMatchObject({ sent: 1 });

    expect(mail.sent.map((m) => m.subject)).toEqual([
      '[CLINIX] Lịch khám đã hoàn thành',
    ]);
    const after = await readOutbox(db);
    expect(after.slice(0, 4)).toEqual(before.slice(0, 4));
    expect(after[4]).toMatchObject({ trangThai: 'DaGui' });
  });
});
