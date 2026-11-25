import {
  createOutbox,
  emailOf,
  insertQueuedEmail,
  readOutbox,
  readThongBao,
  worldState,
} from '../testing/notification-world.js';
import {
  insertRescheduleRequest,
  MARKER_LY_DO_KHAM,
  MARKER_LY_DO_YEU_CAU,
  REQUEST_LOAI,
  requestEvent,
  rescheduledEvent,
} from '../testing/reschedule-notification-world.js';
import {
  db,
  fx,
  useStatusWorldHooks,
  world,
} from '../testing/status-int-kit.js';
import { BookingNotifier } from './booking-notifier.js';
import { emptyEmailOutboxSummary } from './email-outbox.service.js';

// reschedule B3 — thư của đổi lịch và yêu cầu đổi lịch trên MySQL 8.4 THẬT với `FakeMailService` (PLAN reschedule 5.10, 7.8, 7.10): NDL-02 (worker gửi đủ bốn loại mới, mẫu thư qua `renderMailShell`, không `ly_do_kham`, không
// `ly_do_yeu_cau`, lỗi gửi không đụng thông báo và lịch), BDL-04 (chữ người nhập chứa `<script>` ⇒ lưu nguyên, thư thoát HTML), NDL-11 (loại chỉ có trong ứng dụng và loại lạ vẫn bị bỏ qua khi đã thêm bốn loại). Mẫu thư (đơn vị):
// `reschedule-mail.templates.spec.ts`. KHÔNG có thư thật nào (SMTP giả). Dữ liệu giả.
useStatusWorldHooks();
const notifier = new BookingNotifier();
const NOW = new Date('2026-11-02T08:30:00+07:00');
const HOSTILE = `<script>alert('x')</script> "q" & 'a'`;

async function sweep(
  service: ReturnType<typeof createOutbox>['service'],
  now: Date = NOW,
) {
  const summary = emptyEmailOutboxSummary();
  await service.sweep(now, summary);
  return summary;
}

/** Ghi bốn thông báo qua `BookingNotifier` thật (như B4, B7, B9 sẽ làm) trong MỘT giao dịch; trả lịch cũ, lịch mới và id yêu cầu. */
async function queueFour(
  w: Awaited<ReturnType<typeof world>>,
  options: { lyDo?: string; ghiChu?: string; lyDoKham?: string } = {},
) {
  const cu = await fx.appointmentIn('DaXacNhan', {
    doctor: w.doctor.profile,
    khungGioId: w.slotId(0),
    patientId: w.patientId,
    ...(options.lyDoKham === undefined ? {} : { lyDoKham: options.lyDoKham }),
  });
  const moi = await w.booked('DaXacNhan', 3);
  const yeuCauId = await insertRescheduleRequest(db, {
    lichHenId: cu.lichHenId,
    khungGioMongMuonId: w.slotId(3),
    lyDoYeuCau: MARKER_LY_DO_YEU_CAU,
  });
  await db.transaction(async (em) => {
    await notifier.notify(
      em,
      rescheduledEvent({
        lichHenMoiId: moi.lichHenId,
        taiKhoanId: w.patientId,
        maLichHenCu: cu.maLichHen,
        via: 'DoiHo',
        lyDo: options.lyDo ?? 'Bác sĩ có việc đột xuất',
      }),
    );
    for (const loai of REQUEST_LOAI)
      await notifier.notify(
        em,
        requestEvent(loai, {
          lichHenCuId: cu.lichHenId,
          taiKhoanId: w.patientId,
          yeuCauId,
          ghiChu: options.ghiChu ?? 'Ghi chú của nhân sự',
          maLichHenMoi: moi.maLichHen,
        }),
      );
  });
  return { cu, moi, yeuCauId };
}

describe('NDL-02 worker gửi thư cho đủ bốn loại mới: đúng người nhận, đúng tiêu đề, mang chữ của thông báo; gửi MỘT lần', () => {
  it('bốn thư tới email của tài khoản ĐẶT theo thứ tự ghi; dòng email DaGui; lượt sau không gửi lại', async () => {
    const w = await world();
    const { moi } = await queueFour(w);
    const { mail, service } = createOutbox(db);

    expect(await sweep(service)).toMatchObject({ sent: 4, failed: 0 });

    const to = await emailOf(db, w.patientId);
    expect(mail.sent.map((m) => [m.to, m.subject])).toEqual([
      [to, '[CLINIX] Lịch hẹn đã được đổi'],
      [to, '[CLINIX] Đã nhận yêu cầu đổi lịch hẹn'],
      [to, '[CLINIX] Yêu cầu đổi lịch hẹn đã được duyệt'],
      [to, '[CLINIX] Yêu cầu đổi lịch hẹn bị từ chối'],
    ]);
    const notes = await readThongBao(db);
    for (const [index, sent] of mail.sent.entries())
      expect(sent.text, `thư ${String(index)}`).toContain(
        notes[index]!.noiDung,
      );
    // thư LichHenDaDoiLich có bảng thông tin lịch MỚI đọc từ DB lúc gửi
    expect(mail.sent[0]!.text).toContain(`Mã lịch hẹn mới: ${moi.maLichHen}`);
    expect(mail.sent[0]!.text).toContain('Chi nhánh:');
    // thư của yêu cầu có thời điểm ghi thông báo theo giờ Việt Nam
    expect(mail.sent[1]!.text).toContain('Trạng thái: Đang chờ duyệt');
    expect(mail.sent[1]!.text).toMatch(
      /Thời gian gửi: \d{2}\/\d{2}\/\d{4} — \d{2}:\d{2}/,
    );
    expect(
      (await readOutbox(db)).map((r) => [r.trangThai, r.soLanThu]),
    ).toEqual(Array(4).fill(['DaGui', 1]));

    mail.reset();
    expect(await sweep(service)).toMatchObject({ sent: 0, failed: 0 });
    expect(mail.attempts).toEqual([]);
  });

  it('thư KHÔNG chứa lý do khám của lịch và lý do của yêu cầu (hàng DB có "mồi" ở cả hai chỗ): tiêu đề, text và html', async () => {
    const w = await world();
    await queueFour(w, { lyDoKham: MARKER_LY_DO_KHAM });
    const { mail, service } = createOutbox(db);

    expect(await sweep(service)).toMatchObject({ sent: 4, failed: 0 });

    for (const sent of mail.sent)
      for (const part of [sent.subject, sent.text, sent.html ?? '']) {
        expect(part).not.toContain(MARKER_LY_DO_KHAM);
        expect(part).not.toContain(MARKER_LY_DO_YEU_CAU);
      }
  });

  it('lỗi gửi (SMTP giả lỗi): ThatBai kèm loại lỗi cố định; thông báo và lịch hẹn KHÔNG đổi một byte (H12); chưa cấu hình SMTP không đốt lượt', async () => {
    const w = await world();
    await queueFour(w);
    const before = await worldState(db);
    const { mail, service } = createOutbox(db);
    mail.failAllWith('CONNECTION');

    expect(await sweep(service)).toMatchObject({ sent: 0, failed: 4 });

    expect(
      (await readOutbox(db)).map((r) => [r.trangThai, r.soLanThu, r.loiCuoi]),
    ).toEqual(Array(4).fill(['ThatBai', 1, 'CONNECTION']));
    const after = await worldState(db);
    expect(after.lich).toEqual(before.lich);
    expect(after.khungGio).toEqual(before.khungGio);
    expect(after.thongBao).toEqual(before.thongBao);

    // Sau nhịp 5 phút SMTP chưa cấu hình: hàng về đúng như cũ, dừng cả lượt, không tính một lần thử
    mail.reset();
    mail.failAllWith('NOT_CONFIGURED');
    const mid = await readOutbox(db);
    const later = new Date(NOW.getTime() + 6 * 60_000);
    expect(await sweep(service, later)).toMatchObject({ notConfigured: true });
    expect(await readOutbox(db)).toEqual(mid);
  });

  it('thông báo của yêu cầu thiếu `yeu_cau_…_id` (dữ liệu lệch): ThatBai THIEU_YEU_CAU, không sang nhánh khác và không gọi SMTP; thư hợp lệ ngay sau vẫn gửi', async () => {
    const w = await world();
    const cu = await w.booked('DaXacNhan', 0);
    const yeuCauId = await insertRescheduleRequest(db, {
      lichHenId: cu.lichHenId,
      khungGioMongMuonId: w.slotId(3),
    });
    await insertQueuedEmail(db, {
      taiKhoanId: w.patientId,
      lichHenId: null,
      loai: 'YeuCauDoiLichDaDuyet',
    });
    await db.transaction((em) =>
      notifier.notify(
        em,
        requestEvent('YeuCauDoiLichBiTuChoi', {
          lichHenCuId: cu.lichHenId,
          taiKhoanId: w.patientId,
          yeuCauId,
          ghiChu: 'Hết chỗ',
        }),
      ),
    );
    const { mail, service } = createOutbox(db);

    expect(await sweep(service)).toMatchObject({ sent: 1, failed: 1 });

    expect(mail.attempts).toHaveLength(1);
    expect((await readOutbox(db)).map((r) => [r.trangThai, r.loiCuoi])).toEqual(
      [
        ['ThatBai', 'THIEU_YEU_CAU'],
        ['DaGui', null],
      ],
    );
  });
});

describe('BDL-04 chữ người nhập chứa `<script>`, `&`, dấu nháy: `noi_dung` lưu nguyên; thư thoát HTML', () => {
  it('lý do đổi hộ và ghi chú của nhân sự: dòng thong_bao còn nguyên ký tự; html của thư KHÔNG có `<script`, có phần đã thoát; bản text giữ nguyên chữ', async () => {
    const w = await world();
    await queueFour(w, { lyDo: HOSTILE, ghiChu: HOSTILE });
    const stored = await readThongBao(db);
    expect(stored[0]!.noiDung).toContain(HOSTILE);
    expect(stored[2]!.noiDung).toContain(HOSTILE);
    expect(stored[3]!.noiDung).toContain(HOSTILE);

    const { mail, service } = createOutbox(db);
    expect(await sweep(service)).toMatchObject({ sent: 4, failed: 0 });

    expect(mail.sent).toHaveLength(4);
    for (const [index, sent] of mail.sent.entries()) {
      expect(sent.html, `thư ${String(index)}`).not.toContain('<script');
      expect(sent.subject).not.toMatch(/[<>&"]/);
      // thư "đang chờ" (số 1) không mang chữ người nhập; ba thư còn lại có lý do hoặc ghi chú
      if (index === 1) continue;
      expect(sent.html, `thư ${String(index)}`).toContain('&lt;script&gt;');
      expect(sent.html).toContain('&amp;');
      expect(sent.html).toContain('&#39;a&#39;');
      expect(sent.text).toContain(HOSTILE);
    }
  });
});

describe('NDL-11 loại chỉ có trong ứng dụng và loại lạ vẫn bị bỏ qua khi worker đã quét thêm bốn loại', () => {
  it('thông báo chỉ trong ứng dụng (nạp ví thành công), nghỉ phép, loại lạ: không chọn, không gửi, không đổi; thư đổi lịch vẫn gửi (hoàn thành ca khám CÓ thư từ notification B4 nên không còn ở đây)', async () => {
    const w = await world();
    const cu = await w.booked('DaXacNhan', 0);
    const yeuCauId = await insertRescheduleRequest(db, {
      lichHenId: cu.lichHenId,
      khungGioMongMuonId: w.slotId(3),
    });
    for (const loai of ['NapViThanhCong', 'NghiPhepDaDuyet', 'DoiLichLa'])
      await insertQueuedEmail(db, {
        taiKhoanId: w.patientId,
        lichHenId: null,
        loai,
      });
    await db.transaction((em) =>
      notifier.notify(
        em,
        requestEvent('YeuCauDoiLichDangCho', {
          lichHenCuId: cu.lichHenId,
          taiKhoanId: w.patientId,
          yeuCauId,
        }),
      ),
    );
    const before = await readOutbox(db);
    const { mail, service } = createOutbox(db);

    expect(await sweep(service)).toMatchObject({ sent: 1, failed: 0 });

    expect(mail.sent.map((m) => m.subject)).toEqual([
      '[CLINIX] Đã nhận yêu cầu đổi lịch hẹn',
    ]);
    const after = await readOutbox(db);
    expect(after.slice(0, 3)).toEqual(before.slice(0, 3));
    expect(after[3]).toMatchObject({ trangThai: 'DaGui' });
  });
});
