import {
  BOOKING_NOTIFICATION_EVENTS,
  NO_SHOW_CRON,
  NO_SHOW_JOB_NAME,
} from '../appointments.constants.js';
import { withRowLock } from '../testing/concurrency-harness.js';
import { bulkSlots, readAppointment } from '../testing/expiry-fixtures.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import {
  createNoShowStack,
  freshConfirmed,
  noShowWorld,
  setDayHours,
} from '../testing/no-show-world.js';
import { notificationRows } from '../testing/payment-doctor-fakes.js';
import {
  failAfterStatement,
  interceptStatements,
} from '../testing/statement-recorder.js';
import {
  db,
  expectNoChange,
  fx,
  logs,
  useStatusWorldHooks,
} from '../testing/status-int-kit.js';
import {
  AFTER_ALL_WINDOWS,
  readNoShow,
  setNoShow,
  type NoShowState,
} from '../testing/status-world.js';
import { NoShowJob } from './no-show.job.js';
import { emptyNoShowSummary } from './no-show-sweep.service.js';

// Task B13 — VM-01…VM-04, VM-09 (job hai lần), VM-11, VM-12, VM-13, VM-16 (phần tích hợp), chạy lại VM-05…VM-08, VM-14, VM-15 với job thật, NSJ-07 và NSJ-08 (PLAN booking 7.6, 7.35 `[đề xuất]`; TRACKING 3.29 B13-H) trên MySQL 8.4 THẬT:
// `NoShowJob.run(now)` quét `lich_hen` thật, đánh Vắng mặt từng lịch bằng `markNoShow` THẬT (mỗi lịch một `withBookingTransaction` thật), rồi chạy INV-01…INV-05. Thông báo GHI THẬT dòng `thong_bao` (khoá ngoại tới `lich_hen`
// và `tai_khoan`); cổng danh sách chờ và hoàn tiền là bản `Fake` đếm lời gọi. Phần đơn vị: no-show*.spec.ts; mệnh đề SQL và ma trận ca biên: no-show-due.query.int-spec.ts; các ca ĐỒNG THỜI (VM-09 hai bản, VM-10, DT-06…):
// no-show.job.concurrency.int-spec.ts. Mọi ca truyền `now` tường minh vào `run(now)`; `AFTER_ALL_WINDOWS` là 12:00 ngày 10/11/2026 (thứ Ba), ĐÚNG giờ kết thúc ca sáng của chi nhánh thế giới.
const { NO_SHOW, NO_SHOW_LOCK } = BOOKING_NOTIFICATION_EVENTS;
const ZERO = emptyNoShowSummary();
const SLOW = 120_000;

useStatusWorldHooks();

const at = (text: string): Date => new Date(`${text}+07:00`);
const events = async (): Promise<string[]> =>
  (await notificationRows(db)).map((row) => row.loai).sort();
/** Lời cảnh báo 1213/1205 của `withBookingTransaction` (MỘT cảnh báo mỗi lần thử lại) */
const contentionWarnings = () => logs.filter((l) => /MySQL 12(13|05)/.test(l));
const unattendedWarnings = () =>
  logs.filter((l) => l.includes('ca không có giờ kết thúc'));

describe('VM-01 lịch DaXacNhan có ca đã kết thúc (CaSang hay CaChieu): VangMat, +1, khung giờ DaDat, thông báo LichHenVangMat', () => {
  it('ca sáng (kết thúc 12:00) rồi ca chiều (kết thúc 17:00): mỗi lượt đánh đúng lịch của ca vừa kết thúc, không mời chờ, không hoàn tiền', async () => {
    const w = await noShowWorld(db, fx);
    const stack = createNoShowStack(db);
    const sang = await w.booked('DaXacNhan', 0);
    const chieu = await w.lichAt({
      ngay: '2026-11-10',
      ca: 'CaChieu',
      gio: '13:00:00',
    });

    await expect(stack.job.run(AFTER_ALL_WINDOWS)).resolves.toEqual({
      ...ZERO,
      noShowed: 1,
    });
    expect((await readAppointment(db, sang.lichHenId)).trangThai).toBe(
      'VangMat',
    );
    expect((await readAppointment(db, chieu.lichHenId)).trangThai).toBe(
      'DaXacNhan',
    );
    expect(await readNoShow(db, w.patientId)).toEqual({
      soLan: 1,
      khoa: false,
    });
    await w.expectSlot(0, 'DaDat');
    expect(await notificationRows(db)).toEqual([
      { taiKhoanId: w.patientId, lichHenId: sang.lichHenId, loai: NO_SHOW },
    ]);

    await expect(stack.job.run(at('2026-11-10T17:00:00'))).resolves.toEqual({
      ...ZERO,
      noShowed: 1,
    });
    expect((await readAppointment(db, chieu.lichHenId)).trangThai).toBe(
      'VangMat',
    );
    expect(await readNoShow(db, w.patientId)).toEqual({
      soLan: 2,
      khoa: false,
    });
    expect(stack.ports.waitlist.onSlotReleasedCall.count).toBe(0);
    expect(stack.ports.refund.refundCall.count).toBe(0);
    await assertBookingInvariants(db);
  });
});

describe('VM-02 biên nửa mở: đúng giờ kết thúc là đã kết thúc; ca chưa kết thúc không bị đụng', () => {
  it('sáng: 11:59:59.999 (cắt giây thành 11:59:59) chưa, 12:00:00 rồi; chiều: 16:59:59 chưa, 17:00:00 rồi, 17:00:01 không ghi gì thêm', async () => {
    const w = await noShowWorld(db, fx);
    const stack = createNoShowStack(db);
    const sang = await w.booked('DaXacNhan', 0);
    const chieu = await w.lichAt({
      ngay: '2026-11-10',
      ca: 'CaChieu',
      gio: '13:00:00',
    });
    const before = await w.snapshot(sang, 0);

    await expect(stack.job.run(at('2026-11-10T11:59:59.999'))).resolves.toEqual(
      ZERO,
    );
    await expectNoChange(w, sang, before, { soLan: 0, khoa: false });
    await expect(stack.job.run(AFTER_ALL_WINDOWS)).resolves.toEqual({
      ...ZERO,
      noShowed: 1,
    });
    await expect(stack.job.run(at('2026-11-10T16:59:59'))).resolves.toEqual(
      ZERO,
    );
    expect((await readAppointment(db, chieu.lichHenId)).trangThai).toBe(
      'DaXacNhan',
    );
    await expect(stack.job.run(at('2026-11-10T17:00:00'))).resolves.toEqual({
      ...ZERO,
      noShowed: 1,
    });
    await expect(stack.job.run(at('2026-11-10T17:00:01'))).resolves.toEqual(
      ZERO,
    );
    expect(await readNoShow(db, w.patientId)).toEqual({
      soLan: 2,
      khoa: false,
    });
  });

  it('kiểm LẠI dưới khoá: lịch đã là ứng viên nhưng chi nhánh dời giờ kết thúc ca muộn hơn giữa lúc quét và lúc khoá ⇒ notDue, không đánh, không đổi một byte', async () => {
    const w = await noShowWorld(db, fx);
    const stack = createNoShowStack(db);
    const lich = await w.booked('DaXacNhan', 0);
    const before = await w.snapshot(lich, 0);
    let moved = false;
    interceptStatements(db, async (call, run) => {
      const result = await run();
      // ngay SAU câu chọn ứng viên: giờ kết thúc ca sáng thứ Ba dời từ 12:00 sang 13:00 (ca chiều bắt đầu 13:00: chạm nhau là hợp lệ)
      if (!moved && call.sql.startsWith('SELECT CAST(lh.lich_hen_id')) {
        moved = true;
        await setDayHours(db, w.branch.chiNhanhId, 2, {
          sang: ['08:00:00', '13:00:00'],
          chieu: ['13:00:00', '17:00:00'],
        });
      }
      return result;
    });
    await expect(stack.job.run(AFTER_ALL_WINDOWS)).resolves.toEqual({
      ...ZERO,
      notDue: 1,
    });
    expect(moved).toBe(true);
    await expectNoChange(w, lich, before, { soLan: 0, khoa: false });
    expect(await notificationRows(db)).toEqual([]);
  });
});

describe('VM-03 thứ ISO và giờ nhận khám khác nhau theo thứ (mức job; ma trận đầy đủ ở NSQ-02)', () => {
  it('thứ Ba kết thúc sáng 11:00, thứ Bảy không buổi sáng, Chủ nhật nghỉ: chỉ lịch có giờ kết thúc và đã qua mới bị đánh; ca không khoảng đếm vào số ca không có khoảng', async () => {
    const w = await noShowWorld(db, fx);
    const stack = createNoShowStack(db);
    const branch = w.branch.chiNhanhId;
    await setDayHours(db, branch, 2, {
      sang: ['08:00:00', '11:00:00'],
      chieu: ['13:00:00', '17:00:00'],
    });
    await setDayHours(db, branch, 6, {
      sang: null,
      chieu: ['13:00:00', '17:00:00'],
    });
    await setDayHours(db, branch, 7, { off: true });
    const mon = await w.lichAt({
      ngay: '2026-11-09',
      ca: 'CaSang',
      gio: '08:00:00',
    });
    const tue = await w.booked('DaXacNhan', 0); // thứ Ba 08:00
    const satSang = await w.lichAt({
      ngay: '2026-11-14',
      ca: 'CaSang',
      gio: '08:00:00',
    });
    const satChieu = await w.lichAt({
      ngay: '2026-11-14',
      ca: 'CaChieu',
      gio: '13:00:00',
    });
    const sunSang = await w.lichAt({
      ngay: '2026-11-15',
      ca: 'CaSang',
      gio: '08:00:00',
    });
    const state = async (lich: { lichHenId: string }) =>
      (await readAppointment(db, lich.lichHenId)).trangThai;

    // thứ Bảy 12:00: thứ Hai (kết thúc 12:00) và thứ Ba (kết thúc 11:00) đã hết ca; thứ Bảy sáng KHÔNG có giờ kết thúc; thứ Bảy chiều (17:00) chưa; Chủ nhật còn ở tương lai
    await expect(stack.job.run(at('2026-11-14T12:00:00'))).resolves.toEqual({
      ...ZERO,
      noShowed: 2,
      unattended: 1,
    });
    expect([
      await state(mon),
      await state(tue),
      await state(satSang),
      await state(satChieu),
      await state(sunSang),
    ]).toEqual(['VangMat', 'VangMat', 'DaXacNhan', 'DaXacNhan', 'DaXacNhan']);

    // đúng 17:00 thứ Bảy: buổi chiều đã kết thúc
    await expect(stack.job.run(at('2026-11-14T17:00:00'))).resolves.toEqual({
      ...ZERO,
      noShowed: 1,
      unattended: 1,
    });
    expect(await state(satChieu)).toBe('VangMat');

    // Chủ nhật nghỉ: ca sáng không bao giờ có giờ kết thúc, lịch ở lại DaXacNhan và được đếm
    await expect(stack.job.run(at('2026-11-15T12:00:00'))).resolves.toEqual({
      ...ZERO,
      unattended: 2,
    });
    expect(await state(sunSang)).toBe('DaXacNhan');
    expect(await readNoShow(db, w.patientId)).toEqual({ soLan: 3, khoa: true });
    await assertBookingInvariants(db);
  });
});

describe('VM-04 lịch ở trạng thái khác DaXacNhan không bị đụng', () => {
  it('ChoThanhToan, DaTiepDon, HoanThanh, DaHuy, VangMat, DaDoiLich: không ứng viên, không đổi một byte, không thông báo', async () => {
    const w = await noShowWorld(db, fx);
    const stack = createNoShowStack(db);
    const states = [
      'ChoThanhToan',
      'DaTiepDon',
      'HoanThanh',
      'DaHuy',
      'VangMat',
      'DaDoiLich',
    ] as const;
    const lich = [];
    for (const [slot, trangThai] of states.entries())
      lich.push(await w.booked(trangThai, slot));
    const before = [];
    for (const [slot, l] of lich.entries())
      before.push(await w.snapshot(l, slot));
    await setNoShow(db, w.patientId, { soLan: 4, khoa: true });

    await expect(stack.job.run(AFTER_ALL_WINDOWS)).resolves.toEqual(ZERO);
    for (const [slot, l] of lich.entries())
      expect(await w.snapshot(l, slot)).toEqual(before[slot]);
    expect(await readNoShow(db, w.patientId)).toEqual({ soLan: 4, khoa: true });
    expect(await notificationRows(db)).toEqual([]);
    await assertBookingInvariants(db);
  });
});

describe('VM-05, VM-06, VM-07 ngưỡng no-show và cờ khoá qua JOB thật (đã Pass ở B12 với Lễ tân, chạy lại với actor HeThong)', () => {
  it.each<[string, NoShowState, number, NoShowState, string[]]>([
    [
      'VM-05 chưa đạt ngưỡng (3): hai lịch ⇒ 2, không khoá, không thông báo khoá',
      { soLan: 0, khoa: false },
      2,
      { soLan: 2, khoa: false },
      [NO_SHOW, NO_SHOW],
    ],
    [
      'VM-05 đạt ngưỡng: ba lịch ⇒ 3, khoá MỘT lần, đúng MỘT thông báo khoá',
      { soLan: 0, khoa: false },
      3,
      { soLan: 3, khoa: true },
      [NO_SHOW, NO_SHOW, NO_SHOW, NO_SHOW_LOCK],
    ],
    [
      'VM-06 cờ đã bật từ trước: chỉ tăng số lần, không cảnh báo lặp',
      { soLan: 3, khoa: true },
      1,
      { soLan: 4, khoa: true },
      [NO_SHOW],
    ],
    [
      'VM-07 sau khi Quản trị viên mở khoá (cờ false, số ≥ ngưỡng): thêm một lần ⇒ khoá lại ngay',
      { soLan: 5, khoa: false },
      1,
      { soLan: 6, khoa: true },
      [NO_SHOW, NO_SHOW_LOCK],
    ],
  ])('%s', async (_name, before, count, after, expectedEvents) => {
    const w = await noShowWorld(db, fx);
    const stack = createNoShowStack(db);
    await freshConfirmed(db, w, {
      counter: before,
      slots: Array.from({ length: count }, (_, i) => i),
    });
    await expect(stack.job.run(AFTER_ALL_WINDOWS)).resolves.toEqual({
      ...ZERO,
      noShowed: count,
    });
    expect(await readNoShow(db, w.patientId)).toEqual(after);
    expect(await events()).toEqual([...expectedEvents].sort());
    await assertBookingInvariants(db);
  });
});

describe('VM-08 không giải phóng khung giờ, không gọi WaitlistPort', () => {
  it('ba lịch bị đánh Vắng mặt: khung giờ vẫn DaDat, cổng danh sách chờ và hoàn tiền không được gọi lần nào', async () => {
    const w = await noShowWorld(db, fx);
    const stack = createNoShowStack(db);
    await freshConfirmed(db, w, { slots: [0, 1, 2] });
    await expect(stack.job.run(AFTER_ALL_WINDOWS)).resolves.toEqual({
      ...ZERO,
      noShowed: 3,
    });
    for (const slot of [0, 1, 2]) await w.expectSlot(slot, 'DaDat');
    expect(stack.ports.waitlist.onSlotReleasedCall.count).toBe(0);
    expect(stack.ports.refund.refundCall.count).toBe(0);
    await assertBookingInvariants(db);
  });
});

describe('VM-09 (phần job hai lần) chạy job hai lần liên tiếp: lần hai không ghi gì', () => {
  it('lượt hai trả toàn 0; số lần no-show, trạng thái và thông báo không đổi', async () => {
    const w = await noShowWorld(db, fx);
    const stack = createNoShowStack(db);
    await freshConfirmed(db, w, { slots: [0, 1] });
    await stack.job.run(AFTER_ALL_WINDOWS);
    const counter = await readNoShow(db, w.patientId);
    const notifications = await notificationRows(db);
    await expect(stack.job.run(AFTER_ALL_WINDOWS)).resolves.toEqual(ZERO);
    expect(await readNoShow(db, w.patientId)).toEqual(counter);
    expect(await notificationRows(db)).toEqual(notifications);
    expect(contentionWarnings()).toEqual([]);
  });
});

describe('VM-14 lịch của hồ sơ người thân cộng vào TÀI KHOẢN ĐẶT', () => {
  it('lịch của hồ sơ người thân bị đánh Vắng mặt: so_lan_no_show của Bệnh nhân đặt +1 và thông báo gửi cho tài khoản đặt', async () => {
    const w = await noShowWorld(db, fx);
    const stack = createNoShowStack(db);
    const lich = await w.booked('DaXacNhan', 0, {
      hoSoNguoiThanId: w.relativeId,
    });
    await stack.job.run(AFTER_ALL_WINDOWS);
    expect(await readNoShow(db, w.patientId)).toEqual({
      soLan: 1,
      khoa: false,
    });
    expect(await notificationRows(db)).toEqual([
      { taiKhoanId: w.patientId, lichHenId: lich.lichHenId, loai: NO_SHOW },
    ]);
  });
});

describe('VM-15 hai lịch của CÙNG một tài khoản trong một lượt: +2, cờ đúng (khoá benh_nhan)', () => {
  it('số bắt đầu 1, hai lịch ⇒ 3, khoá đúng MỘT lần; thông báo: hai LichHenVangMat và một KhoaDatLichNoShow', async () => {
    const w = await noShowWorld(db, fx);
    const stack = createNoShowStack(db);
    await freshConfirmed(db, w, {
      counter: { soLan: 1, khoa: false },
      slots: [0, 1],
    });
    await expect(stack.job.run(AFTER_ALL_WINDOWS)).resolves.toEqual({
      ...ZERO,
      noShowed: 2,
    });
    expect(await readNoShow(db, w.patientId)).toEqual({ soLan: 3, khoa: true });
    expect(await events()).toEqual([NO_SHOW, NO_SHOW, NO_SHOW_LOCK].sort());
  });
});

describe('VM-11 ca không có khoảng (CaToi): không tự đánh; cảnh báo MỘT con số cho cả lượt, không nội dung riêng tư', () => {
  it('hai lịch CaToi đã qua giờ hẹn: không bị đánh; đúng MỘT cảnh báo (2 lịch); lượt sau cùng số thì không cảnh báo lại; thêm một lịch thì cảnh báo số mới (3 lịch)', async () => {
    const w = await noShowWorld(db, fx);
    const stack = createNoShowStack(db);
    const input = { ngay: '2026-11-10', ca: 'CaToi' } as const;
    const a = await w.lichAt({ ...input, gio: '19:00:00' });
    const b = await w.lichAt({ ...input, gio: '19:30:00' });
    const now = at('2026-11-10T23:00:00');

    await expect(stack.job.run(now)).resolves.toEqual({
      ...ZERO,
      unattended: 2,
    });
    for (const lich of [a, b])
      expect((await readAppointment(db, lich.lichHenId)).trangThai).toBe(
        'DaXacNhan',
      );
    expect(await readNoShow(db, w.patientId)).toEqual({
      soLan: 0,
      khoa: false,
    });
    expect(unattendedWarnings()).toHaveLength(1);
    expect(unattendedWarnings()[0]).toContain('2 lịch');
    // không ghi từng lịch: không dòng log nào chứa mã lịch hẹn
    for (const line of logs) {
      expect(line).not.toContain(a.maLichHen);
      expect(line).not.toContain(b.maLichHen);
    }

    await stack.job.run(now);
    expect(unattendedWarnings()).toHaveLength(1);

    await w.lichAt({ ...input, gio: '20:00:00' });
    await stack.job.run(now);
    expect(unattendedWarnings()).toHaveLength(2);
    expect(unattendedWarnings()[1]).toContain('3 lịch');
  });
});

describe('VM-12 thiếu cấu hình hệ thống: bỏ lượt, cảnh báo, không đoán ngưỡng', () => {
  it('không có dòng cau_hinh_he_thong: không đánh lịch nào, MỘT cảnh báo; có cấu hình lại thì lượt sau đánh được', async () => {
    const w = await noShowWorld(db, fx);
    const stack = createNoShowStack(db);
    const lich = await w.booked('DaXacNhan', 0);
    const before = await w.snapshot(lich, 0);
    await db.query('DELETE FROM cau_hinh_he_thong');

    await expect(stack.job.run(AFTER_ALL_WINDOWS)).resolves.toEqual({
      ...ZERO,
      configMissing: true,
    });
    await expectNoChange(w, lich, before, { soLan: 0, khoa: false });
    expect(await notificationRows(db)).toEqual([]);
    expect(
      logs.filter((l) => l.includes('chưa có cấu hình hệ thống')),
    ).toHaveLength(1);

    await fx.systemConfig();
    await expect(stack.job.run(AFTER_ALL_WINDOWS)).resolves.toEqual({
      ...ZERO,
      noShowed: 1,
    });
  });
});

describe('VM-13 nhiều lịch hơn một lô; một lịch lỗi (HG-05, HG-06 mức tích hợp; trần lô ở NSJ-01)', () => {
  it(
    '150 lịch (hai lô 100 và 50): đánh hết trong MỘT lượt, more = false, số lần đúng 150, cờ khoá đúng MỘT lần; lượt sau không ghi gì',
    async () => {
      const w = await noShowWorld(db, fx);
      const stack = createNoShowStack(db);
      const doctor = w.doctor.profile;
      const slots = await bulkSlots(db, fx, doctor, '2026-11-11', 150);
      for (const khungGioId of slots)
        await fx.appointmentIn('DaXacNhan', {
          doctor,
          khungGioId,
          patientId: w.patientId,
        });
      const now = at('2026-11-11T12:00:00'); // đúng giờ kết thúc ca sáng thứ Tư

      await expect(stack.job.run(now)).resolves.toEqual({
        ...ZERO,
        noShowed: 150,
      });
      expect(await readNoShow(db, w.patientId)).toEqual({
        soLan: 150,
        khoa: true,
      });
      expect(
        (await events()).filter((loai) => loai === NO_SHOW_LOCK),
      ).toHaveLength(1);
      expect(await notificationRows(db)).toHaveLength(151);
      const left: { n: string }[] = await db.query(
        "SELECT COUNT(*) AS n FROM lich_hen WHERE trang_thai = 'DaXacNhan'",
      );
      expect(Number(left[0]?.n)).toBe(0);
      await expect(stack.job.run(now)).resolves.toEqual(ZERO);
      await assertBookingInvariants(db);
    },
    SLOW,
  );

  it('một lịch lỗi (câu cộng so_lan_no_show ném): chỉ lịch đó hoàn tác (Failed Error), hai lịch kia vẫn đánh, job không ném; lượt sau lịch lỗi được đánh nốt, không cộng đôi', async () => {
    const w = await noShowWorld(db, fx);
    const stack = createNoShowStack(db);
    const lich = await freshConfirmed(db, w, { slots: [0, 1, 2] });
    const first = lich[0];
    if (first === undefined) throw new Error('thiếu lịch');
    const before = await w.snapshot(first, 0);
    const error = new Error('lỗi giả sau câu ghi');
    const matched = failAfterStatement(
      db,
      /^\s*UPDATE benh_nhan SET so_lan_no_show/i,
      error,
    );

    await expect(stack.job.run(AFTER_ALL_WINDOWS)).resolves.toEqual({
      ...ZERO,
      noShowed: 2,
      failedError: 1,
    });
    expect(matched).toHaveLength(3); // lịch đầu ném; hai lịch sau chạy bình thường
    await expectNoChange(w, first, before);
    expect(await readNoShow(db, w.patientId)).toEqual({
      soLan: 2,
      khoa: false,
    });
    expect(
      logs.filter(
        (l) =>
          l ===
          `Không đánh Vắng mặt được lịch ${first.lichHenId}: Error (Error)`,
      ),
    ).toHaveLength(1);

    await expect(stack.job.run(AFTER_ALL_WINDOWS)).resolves.toEqual({
      ...ZERO,
      noShowed: 1,
    });
    expect(await readNoShow(db, w.patientId)).toEqual({ soLan: 3, khoa: true });
    expect(await events()).toEqual(
      [NO_SHOW, NO_SHOW, NO_SHOW, NO_SHOW_LOCK].sort(),
    );
    await assertBookingInvariants(db);
  });
});

describe('NSJ-07 tranh chấp khoá thật: hết lượt thử lại ⇒ Failed Busy, lịch khác vẫn đánh, lượt sau đánh nốt, không cộng đôi', () => {
  it(
    'một giao dịch khác giữ khoá hàng lịch (1205 sau ba lần chạy): lịch đó còn DaXacNhan, lịch kia VangMat; thả khoá thì lượt sau đánh nốt',
    async () => {
      const w = await noShowWorld(db, fx);
      const stack = createNoShowStack(db);
      const [locked, other] = await freshConfirmed(db, w, { slots: [0, 1] });
      if (locked === undefined || other === undefined)
        throw new Error('thiếu lịch');

      const summary = await withRowLock(
        db,
        {
          sql: 'SELECT lich_hen_id FROM lich_hen WHERE lich_hen_id = ? FOR UPDATE',
          params: [locked.lichHenId],
        },
        () => stack.job.run(AFTER_ALL_WINDOWS),
      );

      expect(summary).toEqual({ ...ZERO, noShowed: 1, failedBusy: 1 });
      expect((await readAppointment(db, locked.lichHenId)).trangThai).toBe(
        'DaXacNhan',
      );
      expect((await readAppointment(db, other.lichHenId)).trangThai).toBe(
        'VangMat',
      );
      expect(await readNoShow(db, w.patientId)).toEqual({
        soLan: 1,
        khoa: false,
      });
      expect(
        logs.some(
          (l) => l.includes(`lịch ${locked.lichHenId}`) && l.includes('Busy'),
        ),
      ).toBe(true);
      expect(contentionWarnings()).toHaveLength(3); // ba lần chạy: hai lần thử lại rồi hết lượt

      await expect(stack.job.run(AFTER_ALL_WINDOWS)).resolves.toEqual({
        ...ZERO,
        noShowed: 1,
      });
      expect(await readNoShow(db, w.patientId)).toEqual({
        soLan: 2,
        khoa: false,
      });
      await assertBookingInvariants(db);
    },
    SLOW,
  );
});

describe('NSJ-08 hoàn tác trọn (failAfterStatement) ở mức JOB: lỗi ở BẤT KỲ bước ghi nào sau lần ghi đầu hoàn tác cả lịch, bộ đếm, cờ và thông báo; lượt sau đánh đúng', () => {
  it.each<[string, RegExp, NoShowState]>([
    [
      'sau UPDATE lich_hen',
      /^\s*UPDATE lich_hen SET trang_thai/i,
      { soLan: 0, khoa: false },
    ],
    [
      'sau UPDATE bộ đếm so_lan_no_show',
      /^\s*UPDATE benh_nhan SET so_lan_no_show/i,
      { soLan: 0, khoa: false },
    ],
    [
      'sau UPDATE cờ khoá (số mới đạt ngưỡng)',
      /^\s*UPDATE benh_nhan SET khoa_dat_lich_do_no_show/i,
      { soLan: 2, khoa: false },
    ],
    [
      'sau INSERT thong_bao đầu (LichHenVangMat)',
      /^\s*INSERT INTO thong_bao/i,
      { soLan: 2, khoa: false },
    ],
  ])('%s', async (_name, pattern, before) => {
    const w = await noShowWorld(db, fx);
    const stack = createNoShowStack(db);
    const [lich] = await freshConfirmed(db, w, { counter: before });
    if (lich === undefined) throw new Error('thiếu lịch');
    const snapshot = await w.snapshot(lich, 0);
    const matched = failAfterStatement(
      db,
      pattern,
      new Error('lỗi giả sau câu ghi'),
    );

    await expect(stack.job.run(AFTER_ALL_WINDOWS)).resolves.toEqual({
      ...ZERO,
      failedError: 1,
    });
    expect(matched).toHaveLength(1);
    await expectNoChange(w, lich, snapshot, before);
    expect(await notificationRows(db)).toEqual([]);
    await assertBookingInvariants(db);

    // lượt sau: câu giả đã dùng hết, lịch vẫn DaXacNhan nên được chọn lại và đánh đúng một lần
    await expect(stack.job.run(AFTER_ALL_WINDOWS)).resolves.toEqual({
      ...ZERO,
      noShowed: 1,
    });
    expect(await readNoShow(db, w.patientId)).toMatchObject({
      soLan: before.soLan + 1,
    });
    await assertBookingInvariants(db);
  });
});

describe('VM-16 NODE_ENV=test: job không tự chạy; test gọi run(now) (phần tích hợp; phần nạp lại module theo NODE_ENV ở no-show.job.spec.ts)', () => {
  it('lớp đang nạp có @Cron tắt đúng tên và biểu thức; run(now) chạy tay trên DB thật', async () => {
    expect(process.env.NODE_ENV).toBe('test');
    const run: unknown = Reflect.get(NoShowJob.prototype, 'run');
    const options = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      run as object,
    ) as { name: string; cronTime: string; disabled: boolean };
    expect(options).toMatchObject({
      name: NO_SHOW_JOB_NAME,
      cronTime: NO_SHOW_CRON,
      disabled: true,
    });
    const w = await noShowWorld(db, fx);
    await w.booked('DaXacNhan', 0);
    await expect(
      createNoShowStack(db).job.run(AFTER_ALL_WINDOWS),
    ).resolves.toEqual({ ...ZERO, noShowed: 1 });
  });
});
