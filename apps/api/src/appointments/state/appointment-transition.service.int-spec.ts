import type { DataSource, EntityManager } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { HOLD_EXPIRED_CANCEL_REASON } from '../appointments.constants.js';
import { findLockOrderViolation } from '../locking/lock-order.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { FLOW_NOW } from '../testing/booking-flow.js';
import {
  createExpiryStack,
  expectStatus,
  expiryWorld,
  readAppointment,
} from '../testing/expiry-fixtures.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import {
  firstTableOf,
  interceptQuery,
  isLockingStatement,
} from '../testing/query-spy.js';

// Task B9 — TRX-08, TRX-09 (PLAN booking 7.26; TRACKING 3.19.3) trên MySQL 8.4 THẬT: `AppointmentTransitionService.expire` đi đúng chuỗi khoá của bảng 5.3 và ghi đúng, rồi chạy INV-01…INV-05.
// Phần ĐƠN VỊ (kết quả có kiểu, thử lại, cổng sau commit): appointment-transition.service.spec.ts (TRX-01…TRX-07). `FLOW_NOW` là 09:00 ngày 02/11/2026: sau hạn 08:15 của lịch `ChoThanhToan` trong
// fixture, trước mọi khung giờ của ngày 10/11. Mọi ca truyền `now` tường minh vào `expire` (không giả đồng hồ).
const NOW_TEXT = '2026-11-02 09:00:00';

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

/** `DataSource` bọc quanh kết nối thật: mỗi giao dịch của `withBookingTransaction` được gắn bộ ghi câu SQL vào `em` rồi chạy THẬT (nếp BKR-03). */
function recordingDb(statements: string[]): DataSource {
  return {
    transaction: (
      level: Parameters<DataSource['transaction']>[0],
      work: (em: EntityManager) => Promise<unknown>,
    ) =>
      db.transaction(level as 'READ COMMITTED', (em) => {
        interceptQuery(em, (sql, run) => {
          statements.push(sql);
          return run();
        });
        return work(em);
      }),
  } as unknown as DataSource;
}

/** Chạy `expire` MỘT lần trên kết nối thật; trả kết quả và các câu NGHIỆP VỤ (bỏ hai câu đặt timeout chờ khoá của `withBookingTransaction`, X1b). */
async function expireRecorded(lichHenId: string) {
  const statements: string[] = [];
  const { service } = createExpiryStack(recordingDb(statements));
  const outcome = await service.expire({ lichHenId, now: FLOW_NOW });
  const body = statements.filter(
    (sql) => !/^\s*(SET SESSION|SELECT @@session)/i.test(sql),
  );
  return { outcome, body };
}

describe('TRX-08 chuỗi khoá thật của expire: khung giờ rồi lịch theo khoá chính, không bac_si', () => {
  it('đọc thường lịch (không khoá), khung_gio FOR UPDATE, lich_hen FOR UPDATE theo lich_hen_id, rồi hai UPDATE; không câu nào đụng bac_si; không vi phạm thứ tự 5.3', async () => {
    const w = await expiryWorld(fx);
    const appointment = await w.pending(0);
    const { outcome, body } = await expireRecorded(appointment.lichHenId);
    expect(outcome).toEqual({ kind: 'Expired', khungGioId: w.slotId(0) });
    expect(body).toHaveLength(5);
    const [readKeys, lockSlot, lockLich, cancel, release] = body as [
      string,
      string,
      string,
      string,
      string,
    ];
    expect(firstTableOf(readKeys)).toBe('lich_hen');
    expect(isLockingStatement(readKeys)).toBe(false);
    expect(firstTableOf(lockSlot)).toBe('khung_gio');
    expect(isLockingStatement(lockSlot)).toBe(true);
    expect(firstTableOf(lockLich)).toBe('lich_hen');
    expect(isLockingStatement(lockLich)).toBe(true);
    // khoá `lich_hen` CHỈ theo khoá chính (5.3 quy tắc 7): điều kiện là `lich_hen_id`, không `khung_gio_id` hay `khung_gio_dang_giu`
    expect(lockLich).toMatch(/WHERE lich_hen_id = \?/);
    expect(lockLich).not.toMatch(/khung_gio_id|khung_gio_dang_giu/);
    expect(cancel).toMatch(/^UPDATE lich_hen/);
    expect(release).toMatch(/^UPDATE khung_gio/);
    // hết hạn không phụ thuộc điều kiện nào của bác sĩ: không xin `bac_si` (tầng 4) hay `benh_nhan`, `ho_so_nguoi_than` (tầng 2, 3)
    expect(
      body.some((sql) => /\b(bac_si|benh_nhan|ho_so_nguoi_than)\b/i.test(sql)),
    ).toBe(false);
    const lockedTables = body
      .filter(isLockingStatement)
      .map(firstTableOf)
      .filter((table): table is string => table !== undefined);
    expect(lockedTables).toEqual(['khung_gio', 'lich_hen']);
    expect(findLockOrderViolation(lockedTables)).toBeNull();
    await assertBookingInvariants(db);
  });

  it('lịch chưa tới hạn (NotDue): vẫn khoá khung giờ rồi lịch, KHÔNG có câu UPDATE nào', async () => {
    const w = await expiryWorld(fx);
    const appointment = await w.pending(
      0,
      new Date('2026-11-02T09:00:01+07:00'),
    );
    const { outcome, body } = await expireRecorded(appointment.lichHenId);
    expect(outcome).toEqual({ kind: 'NotDue', reason: 'NotLapsed' });
    expect(body.filter((sql) => /^\s*UPDATE/i.test(sql))).toEqual([]);
    expect(body.filter(isLockingStatement).map(firstTableOf)).toEqual([
      'khung_gio',
      'lich_hen',
    ]);
  });
});

describe('TRX-09 expire trên MySQL thật: ghi đúng, đúng biên nửa mở, NotDue không đụng gì, INV', () => {
  it('lịch hết hạn: DaHuy, thoi_diem_huy = now, ly_do_huy đúng chữ, khung giờ ConTrong; lịch và khung giờ khác không đổi; cổng danh sách chờ đúng một lần', async () => {
    const w = await expiryWorld(fx);
    const target = await w.pending(0); // hạn 08:15, đã quá hạn
    const stillHeld = await w.pending(1, new Date('2026-11-02T09:15:00+07:00')); // còn hạn
    const confirmed = await w.inState('DaXacNhan', 2);
    const { waitlist, service } = createExpiryStack(db);

    await expect(
      service.expire({ lichHenId: target.lichHenId, now: FLOW_NOW }),
    ).resolves.toEqual({ kind: 'Expired', khungGioId: w.slotId(0) });

    expect(await readAppointment(db, target.lichHenId)).toEqual({
      trangThai: 'DaHuy',
      huy: NOW_TEXT,
      lyDo: HOLD_EXPIRED_CANCEL_REASON,
      han: '2026-11-02 08:15:00', // hạn cũ giữ nguyên để truy vết
    });
    expect(HOLD_EXPIRED_CANCEL_REASON).toBe('Hết thời gian giữ chỗ');
    await w.expectSlot(0, 'ConTrong');
    // các lịch và khung giờ khác không đổi
    expect(await readAppointment(db, stillHeld.lichHenId)).toMatchObject({
      trangThai: 'ChoThanhToan',
      huy: null,
      lyDo: null,
    });
    await w.expectSlot(1, 'DangGiuCho', '2026-11-02 09:15:00');
    await expectStatus(db, confirmed.lichHenId, 'DaXacNhan');
    await w.expectSlot(2, 'DaDat');
    expect(waitlist.releasedSlotIds).toEqual([w.slotId(0)]);
    await assertBookingInvariants(db);
  });

  it('biên nửa mở của lịch: hạn = now thì hết (Expired), hạn = now + 1 giây thì chưa (NotDue NotLapsed, không ghi gì)', async () => {
    const w = await expiryWorld(fx);
    const atNow = await w.pending(0, new Date('2026-11-02T09:00:00+07:00'));
    const justAfter = await w.pending(1, new Date('2026-11-02T09:00:01+07:00'));
    const { service } = createExpiryStack(db);

    await expect(
      service.expire({ lichHenId: atNow.lichHenId, now: FLOW_NOW }),
    ).resolves.toMatchObject({ kind: 'Expired' });
    await expect(
      service.expire({ lichHenId: justAfter.lichHenId, now: FLOW_NOW }),
    ).resolves.toEqual({ kind: 'NotDue', reason: 'NotLapsed' });
    await expectStatus(db, justAfter.lichHenId, 'ChoThanhToan');
    await w.expectSlot(1, 'DangGiuCho', '2026-11-02 09:00:01');
    // now có mili giây bị cắt xuống giây: 09:00:00.999 vẫn chưa tới hạn 09:00:01
    await expect(
      service.expire({
        lichHenId: justAfter.lichHenId,
        now: new Date('2026-11-02T09:00:00.999+07:00'),
      }),
    ).resolves.toEqual({ kind: 'NotDue', reason: 'NotLapsed' });
    await assertBookingInvariants(db);
  });

  it('lịch đã DaXacNhan hoặc đã DaHuy giữa chừng: NotDue NotPending, không đổi gì, không báo cổng (lịch DaHuy giữ nguyên lý do và giờ huỷ cũ)', async () => {
    const w = await expiryWorld(fx);
    const confirmed = await w.inState('DaXacNhan', 0);
    const cancelled = await w.inState('DaHuy', 1);
    const { waitlist, service } = createExpiryStack(db);
    const before = await readAppointment(db, cancelled.lichHenId);

    for (const id of [confirmed.lichHenId, cancelled.lichHenId]) {
      await expect(
        service.expire({ lichHenId: id, now: FLOW_NOW }),
      ).resolves.toEqual({
        kind: 'NotDue',
        reason: 'NotPending',
      });
    }
    expect(await readAppointment(db, cancelled.lichHenId)).toEqual(before);
    expect(before.lyDo).toBe('Fixture huỷ lịch'); // không bị ghi đè bằng chữ hết hạn
    await expectStatus(db, confirmed.lichHenId, 'DaXacNhan');
    await w.expectSlot(0, 'DaDat');
    await w.expectSlot(1, 'ConTrong');
    expect(waitlist.onSlotReleasedCall.count).toBe(0);
    await assertBookingInvariants(db);
  });

  it('lịch không tồn tại: NotDue NotFound; gọi lần hai sau khi đã hết hạn: NotDue NotPending (idempotent, không gọi cổng lần hai)', async () => {
    const w = await expiryWorld(fx);
    const target = await w.pending(0);
    const { waitlist, service } = createExpiryStack(db);

    await expect(
      service.expire({ lichHenId: '999999999', now: FLOW_NOW }),
    ).resolves.toEqual({ kind: 'NotDue', reason: 'NotFound' });
    await service.expire({ lichHenId: target.lichHenId, now: FLOW_NOW });
    await expect(
      service.expire({ lichHenId: target.lichHenId, now: FLOW_NOW }),
    ).resolves.toEqual({ kind: 'NotDue', reason: 'NotPending' });
    expect(waitlist.onSlotReleasedCall.count).toBe(1);
    await assertBookingInvariants(db);
  });
});
