import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import {
  atRemaining,
  cancelInput,
  cancelWorld,
  createCancelStack,
  DEPOSIT,
  HOUR_MS,
  REFUND_POLICY,
  T0_TEXT,
  type CancelWorld,
} from '../testing/cancel-world.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import {
  failAfterStatement,
  interceptStatements,
} from '../testing/statement-recorder.js';

// Task B10 — chèn lỗi GIỮA CHỪNG vào huỷ lịch hẹn trên MySQL 8.4 THẬT: HL-16 (hoàn tác trọn khi lỗi ở từng bước ghi), CNL-08 (thân chạy lại với 1213, hết lượt ⇒ 503) và CNL-05 (kiểm LẠI dưới khoá)
// (PLAN booking 5.3, 7.3, 7.29; TRACKING 3.23 B10-I). Dùng `failAfterStatement` và `interceptStatements` của B8 (`testing/statement-recorder.ts`): câu SQL chạy THẬT rồi mới ném, hoặc có việc xen vào GIỮA hai câu.
// (B8 vào `main` ngày 12/11/2026, PR #359; bản đầu của file này dùng hai hàm tạm cùng ý, đã bỏ.)
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});
const world = () => cancelWorld(db, fx);

const BOOM = new Error('BOOM: lỗi giả sau khi câu SQL đã chạy');
// Deadlock giả đúng hình lỗi mà `isDeadlockError` nhận ra (errno 1213), để ép `withBookingTransaction` rollback rồi chạy lại thân
const deadlock = () =>
  Object.assign(new Error('deadlock giả'), {
    errno: 1213,
    code: 'ER_LOCK_DEADLOCK',
  });

/** Lịch DaXacNhan đã thu cọc, còn 5 giờ (mốc 2 giờ ⇒ hoàn 50%) với chính sách minh hoạ. */
async function paidAppointment(w: CancelWorld) {
  const lich = await w.booked('DaXacNhan', 0, {
    coc: DEPOSIT,
    policy: REFUND_POLICY,
  });
  atRemaining(5 * HOUR_MS);
  return lich;
}

describe('HL-16 hoàn tác trọn khi lỗi ở từng bước ghi: lịch và khung giờ giữ nguyên, KHÔNG gọi RefundPort và WaitlistPort', () => {
  it.each([
    [
      'sau UPDATE lich_hen',
      (_ports: ReturnType<typeof createCancelStack>['ports']) =>
        failAfterStatement(db, /^\s*UPDATE lich_hen/i, BOOM),
    ],
    [
      'sau UPDATE khung_gio (khung giờ đã ConTrong trong giao dịch)',
      (_ports: ReturnType<typeof createCancelStack>['ports']) =>
        failAfterStatement(db, /^\s*UPDATE khung_gio/i, BOOM),
    ],
    [
      'cổng đọc tiền đã thu lỗi (sau cả hai UPDATE)',
      (ports: ReturnType<typeof createCancelStack>['ports']) => {
        ports.paymentSummary.amountPaidCall.throwsOnce(BOOM);
        return [];
      },
    ],
    [
      'bước ghi thông báo lỗi (sau cả hai UPDATE)',
      (ports: ReturnType<typeof createCancelStack>['ports']) => {
        ports.notifier.notifyCall.throwsOnce(BOOM);
        return [];
      },
    ],
  ])('%s', async (_name, inject) => {
    const w = await world();
    const lich = await paidAppointment(w);
    const before = await w.snapshot(lich, 0);
    const { service, ports } = createCancelStack(db);
    ports.paymentSummary.paid({ [lich.lichHenId]: DEPOSIT });
    inject(ports);

    // lỗi đi nguyên ra ngoài (không thành kết quả nghiệp vụ, không thử lại)
    await expect(
      service.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen)),
    ).rejects.toBe(BOOM);

    expect(await w.snapshot(lich, 0)).toEqual(before);
    expect(before.row.trangThai).toBe('DaXacNhan');
    expect(before.slot).toEqual({ trangThai: 'DaDat', giuChoDen: null });
    expect(ports.refund.refundCall.count).toBe(0);
    expect(ports.waitlist.onSlotReleasedCall.count).toBe(0);
    await assertBookingInvariants(db);
  });

  it('câu ghi chạy THẬT rồi mới ném (đối chứng dương): ngay trước khi hoàn tác, lịch đã DaHuy trong giao dịch; sau khi hoàn tác thì không còn', async () => {
    const w = await world();
    const lich = await paidAppointment(w);
    const { service, ports } = createCancelStack(db);
    ports.paymentSummary.paid({ [lich.lichHenId]: DEPOSIT });
    const matched = failAfterStatement(db, /^\s*UPDATE khung_gio/i, BOOM);

    await expect(
      service.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen)),
    ).rejects.toBe(BOOM);

    // câu UPDATE khung_gio đã được gửi đúng MỘT lần (chạy rồi mới ném), nên UPDATE lich_hen trước nó cũng đã chạy
    expect(matched).toHaveLength(1);
    // ba tham số của RELEASE_SQL (`khung_gio_id = ? AND trang_thai = ? AND giu_cho_den <=> ?`); lịch DaXacNhan giữ khung giờ DaDat không hạn
    expect(matched[0]?.params).toEqual([w.slotId(0), 'DaDat', null]);
    expect((await w.snapshot(lich, 0)).row.trangThai).toBe('DaXacNhan');
  });
});

describe('CNL-08 thân chạy lại khi 1213: kết quả như chạy một lần; hết lượt thử lại ⇒ 503 HE_THONG_DANG_BAN', () => {
  it('1213 một lần SAU khi đã ghi cả hai bảng: giao dịch hoàn tác rồi thân chạy lại từ đầu, kết quả Cancelled; hoàn tiền, mời chờ đúng MỘT lần; lịch và khung giờ đúng', async () => {
    const w = await world();
    const lich = await paidAppointment(w);
    const { service, ports } = createCancelStack(db);
    ports.paymentSummary.paid({ [lich.lichHenId]: DEPOSIT });
    const matched = failAfterStatement(db, /^\s*UPDATE khung_gio/i, deadlock());

    await expect(
      service.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen)),
    ).resolves.toStrictEqual({
      kind: 'Cancelled',
      maLichHen: lich.maLichHen,
      hoanCoc: { tyLe: 50, soTien: '50000.00' },
    });

    // hai lần chạy thân (cùng một câu UPDATE khung_gio, cùng tham số), chỉ lần hai commit
    expect(matched).toHaveLength(2);
    expect(matched[0]).toEqual(matched[1]);
    expect(await w.snapshot(lich, 0)).toEqual({
      row: {
        trangThai: 'DaHuy',
        huy: expect.any(String) as string,
        lyDo: 'Bệnh nhân hủy lịch hẹn',
        han: null,
      },
      slot: { trangThai: 'ConTrong', giuChoDen: null },
    });
    expect(ports.refund.refundCall.count).toBe(1);
    expect(ports.waitlist.releasedSlotIds).toEqual([w.slotId(0)]);
    await assertBookingInvariants(db);
  });

  it('1213 ở bước ghi thông báo lần 1 (sau cả hai UPDATE và sau khi đã gọi notify): lần chạy lại gọi notify với CÙNG sự kiện; cổng sau commit vẫn một lần', async () => {
    const w = await world();
    const lich = await paidAppointment(w);
    const { service, ports } = createCancelStack(db);
    ports.paymentSummary.paid({ [lich.lichHenId]: DEPOSIT });
    ports.notifier.notifyCall.throwsOnce(deadlock());

    await expect(
      service.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen)),
    ).resolves.toMatchObject({ kind: 'Cancelled' });

    expect(ports.notifier.notifyCall.count).toBe(2);
    expect(ports.notifier.events[0]).toEqual(ports.notifier.events[1]);
    expect(ports.refund.refundCall.count).toBe(1);
    expect(ports.waitlist.onSlotReleasedCall.count).toBe(1);
    await assertBookingInvariants(db);
  });

  it('1213 ở CẢ BA lần chạy: NÉM 503 HE_THONG_DANG_BAN (không phải kết quả nghiệp vụ), hoàn tác trọn, không cổng', async () => {
    const w = await world();
    const lich = await paidAppointment(w);
    const before = await w.snapshot(lich, 0);
    const { service, ports } = createCancelStack(db);
    ports.paymentSummary.paid({ [lich.lichHenId]: DEPOSIT });
    const matched = failAfterStatement(
      db,
      /^\s*UPDATE khung_gio/i,
      deadlock(),
      3,
    );

    const error = await service
      .cancel(cancelInput(w, 'BenhNhan', lich.maLichHen))
      .catch((caught: unknown) => caught);

    expect(error).toMatchObject({ maLoi: BOOKING_ERROR_CODES.SYSTEM_BUSY });
    expect((error as { getStatus: () => number }).getStatus()).toBe(503);
    expect(matched).toHaveLength(3);
    expect(await w.snapshot(lich, 0)).toEqual(before);
    expect(ports.refund.refundCall.count).toBe(0);
    expect(ports.waitlist.onSlotReleasedCall.count).toBe(0);
    await assertBookingInvariants(db);
  });
});

describe('CNL-05 kiểm LẠI dưới khoá: người khác đổi lịch giữa lần đọc thường và lần khoá', () => {
  /**
   * Chạy `effect` bằng một kết nối KHÁC (pool, tự commit) NGAY SAU câu đọc thường theo `ma_lich_hen` của lần huỷ, tức là trước khi `cancel` xin khoá khung giờ: mô phỏng một giao dịch khác đã xong
   * trong khe hở giữa đọc thường và khoá. Chỉ chạy một lần: cờ `done` đặt TRƯỚC khi chạy `effect`, để câu của chính `effect` (cũng đi qua bộ chen này) không kích hoạt lại.
   */
  function afterPlainRead(effect: () => Promise<unknown>): void {
    let done = false;
    interceptStatements(db, async (call, run) => {
      const result = await run();
      if (!done && /FROM lich_hen WHERE ma_lich_hen = \?/.test(call.sql)) {
        done = true;
        await effect();
      }
      return result;
    });
  }

  it.each([
    [
      'người khác đã huỷ xong (DaHuy, khung giờ ConTrong) ⇒ AlreadyCancelled',
      async (w: CancelWorld, lichHenId: string) => {
        await db.query(
          "UPDATE lich_hen SET trang_thai = 'DaHuy', thoi_diem_huy = ?, ly_do_huy = 'Huỷ bởi bên khác' WHERE lich_hen_id = ?",
          [T0_TEXT, lichHenId],
        );
        await db.query(
          "UPDATE khung_gio SET trang_thai = 'ConTrong', giu_cho_den = NULL WHERE khung_gio_id = ?",
          [w.slotId(0)],
        );
      },
      { kind: 'AlreadyCancelled' },
      { trangThai: 'DaHuy', lyDo: 'Huỷ bởi bên khác', slot: 'ConTrong' },
    ],
    [
      'tiếp đón vừa chuyển DaTiepDon (không còn huỷ được với Bệnh nhân) ⇒ NotCancellable DaTiepDon, khung giờ vẫn DaDat',
      async (_w: CancelWorld, lichHenId: string) => {
        await db.query(
          "UPDATE lich_hen SET trang_thai = 'DaTiepDon' WHERE lich_hen_id = ?",
          [lichHenId],
        );
      },
      { kind: 'NotCancellable', trangThai: 'DaTiepDon' },
      { trangThai: 'DaTiepDon', lyDo: null, slot: 'DaDat' },
    ],
    [
      'lịch vừa thành DaDoiLich (Bệnh nhân không thấy) ⇒ NotFound',
      async (w: CancelWorld, lichHenId: string) => {
        await db.query(
          "UPDATE lich_hen SET trang_thai = 'DaDoiLich' WHERE lich_hen_id = ?",
          [lichHenId],
        );
        await db.query(
          "UPDATE khung_gio SET trang_thai = 'ConTrong', giu_cho_den = NULL WHERE khung_gio_id = ?",
          [w.slotId(0)],
        );
      },
      { kind: 'NotFound' },
      { trangThai: 'DaDoiLich', lyDo: null, slot: 'ConTrong' },
    ],
  ])('%s', async (_name, effect, expectedOutcome, expectedAfter) => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0, {
      coc: DEPOSIT,
      policy: REFUND_POLICY,
    });
    const { service, ports } = createCancelStack(db);
    ports.paymentSummary.paid({ [lich.lichHenId]: DEPOSIT });
    afterPlainRead(() => effect(w, lich.lichHenId));

    await expect(
      service.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen)),
    ).resolves.toStrictEqual(expectedOutcome);

    const after = await w.snapshot(lich, 0);
    expect(after.row.trangThai).toBe(expectedAfter.trangThai);
    expect(after.row.lyDo).toBe(expectedAfter.lyDo);
    expect(after.slot.trangThai).toBe(expectedAfter.slot);
    // lần huỷ này không ghi gì, nên không hoàn, không mời chờ, không thông báo
    expect(ports.refund.refundCall.count).toBe(0);
    expect(ports.waitlist.onSlotReleasedCall.count).toBe(0);
    expect(ports.notifier.notifyCall.count).toBe(0);
    await assertBookingInvariants(db);
  });

  it('đổi CHỦ lịch giữa lần đọc thường và lần khoá (benh_nhan_id sang người khác): phạm vi kiểm lại dưới khoá ⇒ NotFound, lịch không bị huỷ', async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const other = await fx.admin.patient();
    const { service, ports } = createCancelStack(db);
    afterPlainRead(() =>
      db.query('UPDATE lich_hen SET benh_nhan_id = ? WHERE lich_hen_id = ?', [
        other.account.taiKhoanId,
        lich.lichHenId,
      ]),
    );

    await expect(
      service.cancel(cancelInput(w, 'BenhNhan', lich.maLichHen)),
    ).resolves.toStrictEqual({ kind: 'NotFound' });

    expect((await w.snapshot(lich, 0)).row.trangThai).toBe('DaXacNhan');
    expect(ports.waitlist.onSlotReleasedCall.count).toBe(0);
    expect(ports.notifier.notifyCall.count).toBe(0);
    await assertBookingInvariants(db);
  });
});
