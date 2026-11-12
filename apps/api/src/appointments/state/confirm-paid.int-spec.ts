import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BOOKING_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { FLOW_NOW } from '../testing/booking-flow.js';
import { expiryWorld, readAppointment } from '../testing/expiry-fixtures.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import {
  expectNoHigherTierTables,
  expectSlotThenLichLock,
  expectSlotThenLichOrder,
  lockedTablesOf,
} from '../testing/lock-chain.js';
import {
  createTransitionStack,
  FAKE_PAYMENT_EVENT,
  notificationRows,
  recordTransaction,
  snapshotState,
} from '../testing/payment-doctor-fakes.js';
import { failAfterStatement } from '../testing/statement-recorder.js';

// Task B11 — HG-11, HG-12, HG-13, CG-02, CFP-06, CFP-07 (PLAN booking 7.2, 7.13, 7.30; TRACKING 3.24.3) trên MySQL 8.4 THẬT: `AppointmentTransitionService.confirmPaid` gọi từ một `payment` GIẢ (`fakePayment`: giao dịch
// `withBookingTransaction` thật). Phần ĐƠN VỊ: confirm-paid.spec.ts (CFP-01…CFP-05); ca ĐỒNG THỜI (DT-03, DT-04, CFP-08): confirm-paid.concurrency.int-spec.ts. `FLOW_NOW` (09:00 ngày 02/11/2026) là sau hạn 08:15 của lịch
// `ChoThanhToan` trong fixture. `confirmPaid` KHÔNG đọc đồng hồ (Q4): đồng hồ ứng dụng chỉ ảnh hưởng `thoi_diem_tao` của dòng `thong_bao` do notifier ghi.
const CONFIRMED_EVENT = BOOKING_NOTIFICATION_EVENTS.CONFIRMED;

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

describe('HG-11 confirmPaid khi lịch còn ChoThanhToan nhưng đã quá han_thanh_toan (job chưa quét, khung giờ chưa ai giữ lại): Confirmed (Q4)', () => {
  it('lịch DaXacNhan và han_thanh_toan NULL, khung giờ DaDat và giu_cho_den NULL, đúng MỘT thông báo LichHenDaXacNhan cho tài khoản đặt (kèm số đã thu), dòng ghi của payment giả; INV', async () => {
    vi.setSystemTime(FLOW_NOW); // 09:00: sau hạn 08:15 (confirmPaid không nhận now và không đọc đồng hồ)
    const w = await expiryWorld(fx);
    const target = await w.pending(0);
    expect(await readAppointment(db, target.lichHenId)).toMatchObject({
      trangThai: 'ChoThanhToan',
      han: '2026-11-02 08:15:00',
    });
    const { notifier, pay } = createTransitionStack(db, w.patientId);

    await expect(pay(target.lichHenId)).resolves.toEqual({ kind: 'Confirmed' });

    expect(await readAppointment(db, target.lichHenId)).toEqual({
      trangThai: 'DaXacNhan',
      huy: null,
      lyDo: null,
      han: null,
    });
    await w.expectSlot(0, 'DaDat', null);
    expect(await notificationRows(db)).toEqual([
      {
        taiKhoanId: w.patientId,
        lichHenId: target.lichHenId,
        loai: CONFIRMED_EVENT,
      },
      {
        taiKhoanId: w.patientId,
        lichHenId: target.lichHenId,
        loai: FAKE_PAYMENT_EVENT,
      },
    ]);
    expect(notifier.events).toEqual([
      {
        loaiSuKien: CONFIRMED_EVENT,
        lichHenId: target.lichHenId,
        taiKhoanId: w.patientId,
        daThu: '150000.00',
      },
    ]);
    await assertBookingInvariants(db);
  });

  it('lịch khác và khung giờ khác không đổi', async () => {
    const w = await expiryWorld(fx);
    const target = await w.pending(0);
    const other = await w.pending(1);
    const before = await snapshotState(db, other);
    const { pay } = createTransitionStack(db, w.patientId);
    await pay(target.lichHenId);
    const after = await snapshotState(db, other);
    expect(after.appointment).toEqual(before.appointment);
    expect(after.slot).toEqual(before.slot);
  });
});

describe('HG-12 confirmPaid khi lịch đã DaHuy do hết hạn: HetHanGiuCho, không đổi gì', () => {
  it('hết hạn bằng expire thật: lịch DaHuy giữ nguyên, khung giờ ConTrong giữ nguyên, 0 thông báo, 0 dòng ghi của payment giả', async () => {
    const w = await expiryWorld(fx);
    const target = await w.pending(0);
    const { service, pay } = createTransitionStack(db, w.patientId);
    await expect(
      service.expire({ lichHenId: target.lichHenId, now: FLOW_NOW }),
    ).resolves.toMatchObject({ kind: 'Expired' });
    const before = await snapshotState(db, target);
    expect(before.appointment.trangThai).toBe('DaHuy');

    await expect(pay(target.lichHenId)).resolves.toEqual({
      kind: 'HetHanGiuCho',
    });

    expect(await snapshotState(db, target)).toEqual(before);
    expect(await notificationRows(db)).toEqual([]);
    await assertBookingInvariants(db);
  });

  it('hết hạn bằng HoldExpiryJob.run(now) (đường thật của job): cùng kết quả', async () => {
    const w = await expiryWorld(fx);
    const target = await w.pending(0);
    const { job, pay } = createTransitionStack(db, w.patientId);
    await expect(job.run(FLOW_NOW)).resolves.toMatchObject({ expired: 1 });
    const before = await snapshotState(db, target);

    await expect(pay(target.lichHenId)).resolves.toEqual({
      kind: 'HetHanGiuCho',
    });

    expect(await snapshotState(db, target)).toEqual(before);
  });
});

describe('HG-13 confirmPaid hai lần và các trạng thái khác', () => {
  it('lần hai: AlreadyConfirmed, không ghi gì, đúng MỘT thông báo LichHenDaXacNhan (không thông báo lần hai)', async () => {
    const w = await expiryWorld(fx);
    const target = await w.pending(0);
    const { pay } = createTransitionStack(db, w.patientId);

    await expect(pay(target.lichHenId)).resolves.toEqual({ kind: 'Confirmed' });
    const afterFirst = await snapshotState(db, target);
    await expect(pay(target.lichHenId)).resolves.toEqual({
      kind: 'AlreadyConfirmed',
    });

    expect(await snapshotState(db, target)).toEqual(afterFirst);
    expect(await notificationRows(db, CONFIRMED_EVENT)).toHaveLength(1);
    // lần hai không ghi dòng của payment giả (`confirmFirst` chỉ ghi khi Confirmed)
    expect(await notificationRows(db, FAKE_PAYMENT_EVENT)).toHaveLength(1);
    await assertBookingInvariants(db);
  });

  it.each([
    ['DaTiepDon', 1],
    ['HoanThanh', 2],
    ['VangMat', 3],
    ['DaDoiLich', 4],
    ['DaHuy', 5], // do người dùng: fixture ghi `ly_do_huy` khác chữ hằng của hết hạn
  ] as const)(
    'lịch %s: InvalidState kèm đúng trạng thái; lịch, khung giờ và thông báo không đổi',
    async (trangThai, slot) => {
      const w = await expiryWorld(fx);
      const target = await w.inState(trangThai, slot);
      const before = await snapshotState(db, target);
      const { pay } = createTransitionStack(db, w.patientId);

      await expect(pay(target.lichHenId)).resolves.toEqual({
        kind: 'InvalidState',
        trangThai,
      });

      expect(await snapshotState(db, target)).toEqual(before);
      expect(await notificationRows(db)).toEqual([]);
      await assertBookingInvariants(db);
    },
  );
});

describe('CG-02 payment giả gọi confirmPaid trong giao dịch của nó rồi LỖI sau đó: hoàn tác cả hai (H16)', () => {
  it('lịch còn ChoThanhToan, khung giờ còn DangGiuCho cùng hạn, 0 thông báo, 0 dòng ghi của payment giả; INV', async () => {
    const w = await expiryWorld(fx);
    const target = await w.pending(0);
    const before = await snapshotState(db, target);
    const { pay } = createTransitionStack(db, w.patientId);

    await expect(
      pay(target.lichHenId, { failAfter: new Error('lỗi sau đó') }),
    ).rejects.toThrow('lỗi sau đó');

    expect(await snapshotState(db, target)).toEqual(before);
    expect(before.appointment.trangThai).toBe('ChoThanhToan');
    expect(await notificationRows(db)).toEqual([]);
    await w.expectSlot(0, 'DangGiuCho', '2026-11-02 08:15:00');
    await assertBookingInvariants(db);
  });

  it('đối chứng (bộ test không vô nghĩa): cùng kịch bản KHÔNG lỗi thì thông báo và dòng ghi của payment giả đều được commit', async () => {
    const w = await expiryWorld(fx);
    const target = await w.pending(0);
    const { pay } = createTransitionStack(db, w.patientId);
    await pay(target.lichHenId);
    expect(await notificationRows(db)).toHaveLength(2);
  });
});

/** `confirmPaid` một lần trong `withBookingTransaction`, ghi lại các câu SQL của thân. */
function confirmRecorded(lichHenId: string, patientId: string) {
  const { service } = createTransitionStack(db, patientId);
  return recordTransaction(db, 'confirm-recorded', (em) =>
    service.confirmPaid(em, { lichHenId, soTienDaThu: '150000.00' }),
  );
}

describe('CFP-06 chuỗi khoá thật của confirmPaid: khung giờ rồi lịch theo khoá chính, không bac_si', () => {
  it('đọc thường lịch, khung_gio FOR UPDATE, lich_hen FOR UPDATE theo lich_hen_id, UPDATE lịch, UPDATE khung giờ, INSERT thông báo; không câu nào đụng bac_si, benh_nhan; không vi phạm thứ tự 5.3', async () => {
    const w = await expiryWorld(fx);
    const target = await w.pending(0);
    const recorded = confirmRecorded(target.lichHenId, w.patientId);

    await expect(recorded.run()).resolves.toEqual({ kind: 'Confirmed' });

    const body = recorded.body();
    expect(body).toHaveLength(6);
    const [updateLich, updateSlot, insertNote] = expectSlotThenLichLock(
      body,
    ) as [string, string, string];
    expect(updateLich).toMatch(/^UPDATE lich_hen/);
    expect(updateSlot).toMatch(/^UPDATE khung_gio/);
    expect(insertNote).toMatch(/^INSERT INTO thong_bao/);
    expectNoHigherTierTables(body);
    // `thong_bao` là bảng chỉ-thêm ở tầng 7 (sau lich_hen)
    expectSlotThenLichOrder(body, ['thong_bao']);
    await assertBookingInvariants(db);
  });

  it.each([
    ['AlreadyConfirmed', 'DaXacNhan'],
    ['InvalidState', 'DaTiepDon'],
  ] as const)(
    'nhánh %s (lịch %s): vẫn khoá khung giờ rồi lịch, KHÔNG có câu UPDATE hay INSERT nào',
    async (_kind, trangThai) => {
      const w = await expiryWorld(fx);
      const target = await w.inState(trangThai, 0);
      const recorded = confirmRecorded(target.lichHenId, w.patientId);
      await recorded.run();
      const body = recorded.body();
      expect(body.filter((sql) => /^\s*(UPDATE|INSERT)/i.test(sql))).toEqual(
        [],
      );
      expect(lockedTablesOf(body)).toEqual(['khung_gio', 'lich_hen']);
    },
  );
});

describe('CFP-07 hoàn tác trọn: ném SAU từng câu ghi đã chạy THẬT (failAfterStatement của B8)', () => {
  it.each([
    ['UPDATE lich_hen', /^UPDATE lich_hen/],
    ['UPDATE khung_gio', /^UPDATE khung_gio/],
    ['INSERT thông báo', /^INSERT INTO thong_bao/],
  ])(
    'ném sau %s: lịch còn ChoThanhToan, khung giờ còn DangGiuCho cùng hạn, 0 thông báo; INV',
    async (_ten, after) => {
      const w = await expiryWorld(fx);
      const target = await w.pending(0);
      const before = await snapshotState(db, target);
      const matched = failAfterStatement(
        db,
        after,
        new Error('lỗi ném sau câu ghi'),
      );
      const { pay } = createTransitionStack(db, w.patientId);

      await expect(pay(target.lichHenId)).rejects.toThrow(
        'lỗi ném sau câu ghi',
      );

      // câu đã chạy thật (có trong danh sách khớp) rồi mới ném: hoàn tác phải gỡ cả nó
      expect(matched).toHaveLength(1);
      expect(await snapshotState(db, target)).toEqual(before);
      expect(await notificationRows(db)).toEqual([]);
      await assertBookingInvariants(db);
    },
  );
});
