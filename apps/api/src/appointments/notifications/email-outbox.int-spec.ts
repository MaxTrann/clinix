import type { MailSendErrorKind } from '../../mail/mail-send.error.js';
import { BOOKING_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import { cancelInput, DEPOSIT } from '../testing/cancel-world.js';
import {
  createOutbox,
  createRealNotifierStack,
  emailOf,
  insertQueuedEmail,
  readOutbox,
  readThongBao,
  runConfirmPaid,
} from '../testing/notification-world.js';
import {
  db,
  logs,
  useStatusWorldHooks,
  world,
} from '../testing/status-int-kit.js';
import { noShowInput, runNoShow, setNoShow } from '../testing/status-world.js';
import { selectDueEmails } from './email-outbox.query.js';
import {
  emptyEmailOutboxSummary,
  type EmailOutboxSummary,
} from './email-outbox.service.js';

// Task B15 — hộp thư đi và worker gửi thư trên MySQL 8.4 THẬT với `FakeMailService` (PLAN booking 5.12, 7.14, 7.43; TRACKING 3.37 B15-H, B15-L): OBX-01 (chọn lô), OBX-02 (gửi MỘT lần, đủ bốn mẫu), OBX-03 (lỗi gửi: lịch hẹn không đổi,
// log không dữ liệu cá nhân; TB-05), OBX-04 (trần 3 lần và nhịp 5 phút), OBX-05 (chưa cấu hình SMTP không đốt lượt), OBX-06 (chỉ thư của booking), OBX-08 (thư đã nhận việc mà tiến trình chết). Đồng thời (OBX-07):
// email-outbox.concurrency.int-spec.ts. Phần đơn vị (OBX-09): email-outbox.job.spec.ts, email-outbox.query.spec.ts. KHÔNG có thư thật nào (TB-08): `FakeMailService` ghi lại mọi lần gọi.
// Đồng hồ ứng dụng giả T0 = 08:00 ngày 02/11/2026; `NOW` (08:30) là mốc đưa thẳng vào `sweep(now)`.
useStatusWorldHooks();
const { CONFIRMED, CANCELLED, NO_SHOW, NO_SHOW_LOCK } =
  BOOKING_NOTIFICATION_EVENTS;
const NOW = new Date('2026-11-02T08:30:00+07:00');
const NOW_TEXT = '2026-11-02 08:30:00';
const minutesAfterNow = (m: number) => new Date(NOW.getTime() + m * 60_000);

const sweepAt = async (
  service: ReturnType<typeof createOutbox>['service'],
  now: Date = NOW,
): Promise<EmailOutboxSummary> => {
  const summary = emptyEmailOutboxSummary();
  await service.sweep(now, summary);
  return summary;
};

/** Một lịch bị huỷ bằng dịch vụ THẬT (notifier thật ghi dòng `thong_bao` và `email_thong_bao` ChoGui). */
async function cancelledLich(w: Awaited<ReturnType<typeof world>>) {
  const lich = await w.booked('DaXacNhan', 0, {
    hoSoNguoiThanId: w.relativeId,
  });
  await createRealNotifierStack(db).cancellation.cancel(
    cancelInput(w, 'BenhNhan', lich.maLichHen),
  );
  return lich;
}

describe('OBX-01 chọn lô: ChoGui hoặc ThatBai chưa hết lượt và đã quá nhịp, chỉ bốn loại của booking, theo khoá chính', () => {
  it('bảy dòng đủ trạng thái: chỉ dòng ChoGui mới, ThatBai quá nhịp và ChoGui đã nhận việc quá nhịp được chọn, theo thứ tự id', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const patient = w.patientId;
    const second = w.secondPatientId;
    const base = { lichHenId: lich.lichHenId };
    const ids = {
      moi: await insertQueuedEmail(db, {
        ...base,
        taiKhoanId: patient,
        loai: CONFIRMED,
      }),
      daGui: await insertQueuedEmail(db, {
        ...base,
        taiKhoanId: patient,
        loai: CANCELLED,
        trangThai: 'DaGui',
        soLanThu: 1,
        daGuiLuc: '2026-11-02 08:10:00',
      }),
      thatBaiCu: await insertQueuedEmail(db, {
        ...base,
        taiKhoanId: patient,
        loai: NO_SHOW,
        trangThai: 'ThatBai',
        soLanThu: 1,
        lanThuCuoiLuc: '2026-11-02 07:00:00',
        loiCuoi: 'CONNECTION',
      }),
      thatBaiMoi: await insertQueuedEmail(db, {
        ...base,
        taiKhoanId: patient,
        loai: NO_SHOW_LOCK,
        trangThai: 'ThatBai',
        soLanThu: 1,
        lanThuCuoiLuc: '2026-11-02 08:28:00',
        loiCuoi: 'CONNECTION',
      }),
      hetLuot: await insertQueuedEmail(db, {
        ...base,
        taiKhoanId: second,
        loai: CONFIRMED,
        trangThai: 'ThatBai',
        soLanThu: 3,
        lanThuCuoiLuc: '2026-11-02 07:00:00',
        loiCuoi: 'CONNECTION',
      }),
      boQua: await insertQueuedEmail(db, {
        ...base,
        taiKhoanId: second,
        loai: CANCELLED,
        trangThai: 'BoQua',
        soLanThu: 0,
      }),
      daNhanViec: await insertQueuedEmail(db, {
        ...base,
        taiKhoanId: second,
        loai: NO_SHOW,
        trangThai: 'ChoGui',
        soLanThu: 1,
        lanThuCuoiLuc: '2026-11-02 08:00:00',
      }),
    };
    const due = await selectDueEmails(db.manager, {
      now: NOW,
      afterId: '0',
      limit: 100,
    });
    expect(due.map((row) => row.id)).toEqual([
      ids.moi.emailId,
      ids.thatBaiCu.emailId,
      ids.daNhanViec.emailId,
    ]);
    expect(due[1]).toMatchObject({
      trangThai: 'ThatBai',
      soLanThu: 1,
      lanThuCuoiLuc: '2026-11-02 07:00:00',
      loiCuoi: 'CONNECTION',
    });
  });

  it('con trỏ afterId và cỡ lô: lô sau không lặp hàng của lô trước', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const rows = [];
    for (const taiKhoanId of [w.patientId, w.secondPatientId])
      for (const loai of [CONFIRMED, CANCELLED, NO_SHOW])
        rows.push(
          await insertQueuedEmail(db, {
            taiKhoanId,
            lichHenId: lich.lichHenId,
            loai,
          }),
        );
    const first = await selectDueEmails(db.manager, {
      now: NOW,
      afterId: '0',
      limit: 4,
    });
    const second = await selectDueEmails(db.manager, {
      now: NOW,
      afterId: first.at(-1)!.id,
      limit: 4,
    });
    expect(first).toHaveLength(4);
    expect(second).toHaveLength(2);
    expect([...first, ...second].map((r) => r.id)).toEqual(
      rows.map((r) => r.emailId),
    );
  });
});

describe('OBX-02 gửi MỘT lần: đúng người nhận, đủ bốn mẫu, DaGui kèm giờ và số lần (CHECK)', () => {
  it('lịch bị huỷ: MỘT thư tới email của Bệnh nhân ĐẶT, tiêu đề và thân đúng; dòng DaGui, so_lan_thu 1; lượt sau KHÔNG gửi lại', async () => {
    const w = await world();
    const lich = await cancelledLich(w);
    const { mail, service } = createOutbox(db);

    expect(await sweepAt(service)).toEqual({
      sent: 1,
      failed: 0,
      lostClaim: 0,
      notConfigured: false,
      more: false,
    });

    expect(mail.sent).toHaveLength(1);
    const message = mail.sent[0]!;
    expect(message.to).toBe(await emailOf(db, w.patientId));
    expect(message.subject).toBe('[CLINIX] Lịch hẹn đã bị hủy');
    expect(message.text).toContain(lich.maLichHen);
    const [thongBao] = await readThongBao(db);
    expect(message.text).toContain(thongBao!.noiDung);
    expect(message.html).toContain('đã được hủy theo yêu cầu của bạn.');
    expect(await readOutbox(db)).toEqual([
      {
        id: expect.any(String),
        thongBaoId: thongBao!.thongBaoId,
        trangThai: 'DaGui',
        soLanThu: 1,
        lanThuCuoiLuc: NOW_TEXT,
        daGuiLuc: NOW_TEXT,
        loiCuoi: null,
      },
    ]);

    expect(await sweepAt(service, minutesAfterNow(30))).toMatchObject({
      sent: 0,
      failed: 0,
    });
    expect(mail.attempts).toHaveLength(1);
  });

  it('cả bốn sự kiện: bốn thư với bốn tiêu đề Figma, cùng tới Bệnh nhân đặt; vắng mặt và hạn chế mang số lần HIỆN TẠI và ngưỡng của cấu hình', async () => {
    const w = await world();
    const stack = createRealNotifierStack(db);
    const toConfirm = await w.booked('ChoThanhToan', 0, { coc: DEPOSIT });
    await runConfirmPaid(db, stack.transition, toConfirm.lichHenId);
    const toCancel = await w.booked('DaXacNhan', 1);
    await stack.cancellation.cancel(
      cancelInput(w, 'LeTan', toCancel.maLichHen),
    );
    await setNoShow(db, w.patientId, { soLan: 2, khoa: false });
    const toNoShow = await w.booked('DaXacNhan', 2);
    await runNoShow(
      db,
      stack.transition,
      noShowInput(w, toNoShow.lichHenId, 'LeTan'),
    );
    const { mail, service } = createOutbox(db);

    expect(await sweepAt(service)).toMatchObject({ sent: 4, failed: 0 });

    expect(mail.sent.map((m) => m.subject)).toEqual([
      '[CLINIX] Lịch hẹn của bạn đã được xác nhận',
      '[CLINIX] Lịch hẹn đã bị hủy',
      '[CLINIX] Ghi nhận vắng mặt tại lịch hẹn',
      '[CLINIX] Tài khoản bị hạn chế đặt lịch',
    ]);
    const patientEmail = await emailOf(db, w.patientId);
    for (const message of mail.sent) expect(message.to).toBe(patientEmail);
    expect(mail.sent[1]!.text).toContain(
      'đã được phòng khám điều chỉnh và hủy.',
    );
    expect(mail.sent[2]!.text).toContain('Số lần vắng mặt (hiện tại): 3 lần');
    expect(mail.sent[3]!.text).toContain('Ngưỡng áp dụng: 3 lần');
    expect((await readOutbox(db)).map((r) => r.trangThai)).toEqual([
      'DaGui',
      'DaGui',
      'DaGui',
      'DaGui',
    ]);
  });
});

describe('OBX-03 lỗi gửi KHÔNG hoàn tác lịch hẹn; ThatBai kèm loại lỗi; log KHÔNG có địa chỉ, tiêu đề hay nội dung (TB-05, H12)', () => {
  it.each<MailSendErrorKind>([
    'CONNECTION',
    'TIMEOUT',
    'REJECTED',
    'AUTH',
    'INVALID_MESSAGE',
  ])(
    'MailService lỗi %s: dòng ThatBai, loi_cuoi đúng loại, lịch vẫn DaHuy, thong_bao còn nguyên',
    async (kind) => {
      const w = await world();
      const lich = await cancelledLich(w);
      const before = await readThongBao(db);
      const { mail, service } = createOutbox(db);
      mail.failAllWith(kind);

      expect(await sweepAt(service)).toMatchObject({ sent: 0, failed: 1 });

      expect(await readOutbox(db)).toEqual([
        expect.objectContaining({
          trangThai: 'ThatBai',
          soLanThu: 1,
          lanThuCuoiLuc: NOW_TEXT,
          daGuiLuc: null,
          loiCuoi: kind,
        }),
      ]);
      const [row] = await db.query<{ trangThai: string }[]>(
        'SELECT trang_thai AS trangThai FROM lich_hen WHERE lich_hen_id = ?',
        [lich.lichHenId],
      );
      expect(row!.trangThai).toBe('DaHuy');
      expect(await readThongBao(db)).toEqual(before);
    },
  );

  it('log chỉ có id dòng, lần thử và loại lỗi: KHÔNG địa chỉ email, KHÔNG tiêu đề, KHÔNG mã lịch hay chữ của thông báo', async () => {
    const w = await world();
    const lich = await cancelledLich(w);
    const { mail, service } = createOutbox(db);
    mail.failAllWith('REJECTED');
    await sweepAt(service);

    const text = logs.join('\n');
    expect(text).toMatch(/Gửi thư \d+ lỗi ở lần 1\/3: REJECTED/);
    expect(text).not.toContain(await emailOf(db, w.patientId));
    expect(text).not.toContain('[CLINIX]');
    expect(text).not.toContain(lich.maLichHen);
    expect(text).not.toContain('Lịch hẹn');
    expect(text).not.toContain((await readThongBao(db))[0]!.noiDung);
  });

  it('một thư lỗi không chặn thư khác: thư đầu REJECTED, thư sau vẫn gửi', async () => {
    const w = await world();
    const stack = createRealNotifierStack(db);
    const lich = await w.booked('DaXacNhan', 0);
    await stack.cancellation.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen));
    await setNoShow(db, w.patientId, { soLan: 0, khoa: false });
    const noShow = await w.booked('DaXacNhan', 1);
    await runNoShow(
      db,
      stack.transition,
      noShowInput(w, noShow.lichHenId, 'LeTan'),
    );
    const { mail, service } = createOutbox(db);
    mail.failNextWith('REJECTED');

    expect(await sweepAt(service)).toMatchObject({ sent: 1, failed: 1 });
    expect((await readOutbox(db)).map((r) => r.trangThai)).toEqual([
      'ThatBai',
      'DaGui',
    ]);
  });
});

describe('OBX-04 trần 3 lần và nhịp 5 phút', () => {
  it('lần 1 lúc 08:30, chưa quá nhịp lúc 08:34 thì KHÔNG thử, lần 2 lúc 08:35, lần 3 lúc 08:40 thành ThatBai cuối; sau đó không bao giờ chọn lại', async () => {
    const w = await world();
    await cancelledLich(w);
    const { mail, service } = createOutbox(db);
    mail.failAllWith('CONNECTION');

    await sweepAt(service, NOW);
    expect(mail.attempts).toHaveLength(1);
    await sweepAt(service, minutesAfterNow(4));
    expect(mail.attempts).toHaveLength(1);
    await sweepAt(service, minutesAfterNow(5));
    expect(mail.attempts).toHaveLength(2);
    await sweepAt(service, minutesAfterNow(10));
    expect(mail.attempts).toHaveLength(3);
    expect(await readOutbox(db)).toEqual([
      expect.objectContaining({
        trangThai: 'ThatBai',
        soLanThu: 3,
        loiCuoi: 'CONNECTION',
      }),
    ]);
    await sweepAt(service, minutesAfterNow(600));
    expect(mail.attempts).toHaveLength(3);
  });

  it('thất bại rồi gửi được ở lần sau: DaGui, so_lan_thu 2, loi_cuoi xoá', async () => {
    const w = await world();
    await cancelledLich(w);
    const { mail, service } = createOutbox(db);
    mail.failNextWith('TIMEOUT');
    await sweepAt(service, NOW);
    await sweepAt(service, minutesAfterNow(5));
    expect(await readOutbox(db)).toEqual([
      expect.objectContaining({
        trangThai: 'DaGui',
        soLanThu: 2,
        loiCuoi: null,
        daGuiLuc: '2026-11-02 08:35:00',
      }),
    ]);
  });
});

describe('OBX-05 chưa cấu hình SMTP (NOT_CONFIGURED) KHÔNG đốt lượt: hàng về đúng như cũ, dừng cả lượt', () => {
  it('thư ThatBai cũ và thư ChoGui mới: sau lượt NOT_CONFIGURED cả hai đúng như trước, chỉ MỘT lần gọi; khi có SMTP lượt sau gửi cả hai', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    await insertQueuedEmail(db, {
      taiKhoanId: w.patientId,
      lichHenId: lich.lichHenId,
      loai: CONFIRMED,
      trangThai: 'ThatBai',
      soLanThu: 1,
      lanThuCuoiLuc: '2026-11-02 07:00:00',
      loiCuoi: 'CONNECTION',
    });
    await insertQueuedEmail(db, {
      taiKhoanId: w.patientId,
      lichHenId: lich.lichHenId,
      loai: CANCELLED,
    });
    const before = await readOutbox(db);
    const { mail, service } = createOutbox(db);
    mail.failAllWith('NOT_CONFIGURED');

    expect(await sweepAt(service)).toEqual({
      sent: 0,
      failed: 0,
      lostClaim: 0,
      notConfigured: true,
      more: false,
    });

    expect(mail.attempts).toHaveLength(1);
    expect(await readOutbox(db)).toEqual(before);

    mail.reset();
    expect(await sweepAt(service, minutesAfterNow(1))).toMatchObject({
      sent: 2,
      failed: 0,
    });
    expect(await readOutbox(db)).toEqual([
      expect.objectContaining({
        trangThai: 'DaGui',
        soLanThu: 2,
        loiCuoi: null,
      }),
      expect.objectContaining({
        trangThai: 'DaGui',
        soLanThu: 1,
        loiCuoi: null,
      }),
    ]);
  });
});

describe('OBX-06 chỉ thư của booking: hàng của nguồn khác trong cùng bảng không bị chọn, gửi hay đổi', () => {
  it('thông báo không gắn lịch và loại lạ gắn lịch: nguyên vẹn; thư của booking vẫn gửi', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    await insertQueuedEmail(db, {
      taiKhoanId: w.patientId,
      lichHenId: null,
      loai: 'KetQuaYeuCauThayDoiChiNhanh',
    });
    await insertQueuedEmail(db, {
      taiKhoanId: w.patientId,
      lichHenId: lich.lichHenId,
      loai: 'FakeThanhToan',
    });
    await insertQueuedEmail(db, {
      taiKhoanId: w.patientId,
      lichHenId: lich.lichHenId,
      loai: CONFIRMED,
    });
    const before = await readOutbox(db);
    const { mail, service } = createOutbox(db);

    expect(await sweepAt(service)).toMatchObject({ sent: 1, failed: 0 });

    expect(mail.attempts).toHaveLength(1);
    const after = await readOutbox(db);
    expect(after.slice(0, 2)).toEqual(before.slice(0, 2));
    expect(after[2]).toMatchObject({ trangThai: 'DaGui' });
  });
});

describe('OBX-08 tiến trình chết sau khi nhận việc: thư được chọn lại sau nhịp (gửi ít nhất một lần)', () => {
  it('ChoGui đã nhận việc 2 phút trước KHÔNG bị đụng; quá 5 phút thì được gửi, so_lan_thu 2', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    await insertQueuedEmail(db, {
      taiKhoanId: w.patientId,
      lichHenId: lich.lichHenId,
      loai: CONFIRMED,
      trangThai: 'ChoGui',
      soLanThu: 1,
      lanThuCuoiLuc: '2026-11-02 08:28:00',
    });
    const { mail, service } = createOutbox(db);

    await sweepAt(service, NOW);
    expect(mail.attempts).toHaveLength(0);
    await sweepAt(service, minutesAfterNow(3));
    expect(mail.sent).toHaveLength(1);
    expect(await readOutbox(db)).toEqual([
      expect.objectContaining({ trangThai: 'DaGui', soLanThu: 2 }),
    ]);
  });
});
