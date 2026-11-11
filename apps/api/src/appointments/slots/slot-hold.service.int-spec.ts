import type { DataSource, EntityManager } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { HOLD_EXPIRED_CANCEL_REASON } from '../appointments.constants.js';
import { findLockOrderViolation } from '../locking/lock-order.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import {
  firstTableOf,
  interceptQuery,
  isLockingStatement,
} from '../testing/query-spy.js';
import { holdDeadline, SlotHoldService } from './slot-hold.service.js';
import { lockDoctorShared, lockSlot, type LockedSlot } from './slot-lock.js';

// Task B6b — SLH-01…SLH-06, SLH-08, SLH-09, CG-09 và HG-14 (phần I) (PLAN booking 7.23, 7.13, 7.2; TRACKING 3.14.5) trên MySQL 8.4 THẬT: `SlotHoldService` ghi `khung_gio` có điều kiện, hết hạn lười
// khoá lịch cũ THEO KHOÁ CHÍNH (phương pháp P, đã chốt ở TRACKING 3.14.4) và không đổi gì khi điều kiện không còn đúng. Phần ĐƠN VỊ (SLH-07, SLH-10): slot-hold.service.spec.ts.
// Ô i của thế giới đặt được bắt đầu lúc 08:00 + 30 phút × i giờ Việt Nam ngày 10/11/2026. Lịch `ChoThanhToan` của fixture có hạn 08:15 ngày 02/11/2026; `NOW` (09:00) là sau hạn đó.
const NOW = new Date('2026-11-02T09:00:00+07:00');
const NOW_TEXT = '2026-11-02 09:00:00';
const HAN_TEXT = '2026-11-02 09:15:00';

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const holds = new SlotHoldService();

async function world() {
  const w = await fx.world();
  const patientId = w.patient.account.taiKhoanId;
  /** Chạy `work` trong MỘT giao dịch READ COMMITTED sau khi khoá `khung_gio` (tầng 5): cách người gọi dùng `SlotHoldService`. */
  const withSlot = <T>(
    khungGioId: string,
    work: (em: EntityManager, slot: LockedSlot) => Promise<T>,
  ): Promise<T> =>
    db.transaction('READ COMMITTED', async (em) => {
      const slot = await lockSlot(em, khungGioId);
      if (slot === null) throw new Error('khung giờ phải tồn tại');
      return work(em, slot);
    });
  const appt = (
    trangThai: Parameters<BookingFixtures['appointmentIn']>[0],
    slot: number,
    hanThanhToan?: Date,
  ) =>
    fx.appointmentIn(trangThai, {
      doctor: w.doctor.profile,
      khungGioId: w.slotIds[slot]!,
      patientId,
      ...(hanThanhToan ? { hanThanhToan } : {}),
    });
  return {
    ...w,
    patientId,
    doctorId: w.doctor.account.taiKhoanId,
    withSlot,
    appt,
    slotId: (i: number) => w.slotIds[i]!,
    state: (i: number) => fx.slotState(w.slotIds[i]!),
  };
}

type World = Awaited<ReturnType<typeof world>>;

const lichHen = async (lichHenId: string) =>
  (
    await db.query<
      { trangThai: string; huy: string | null; lyDo: string | null }[]
    >(
      "SELECT trang_thai AS trangThai, DATE_FORMAT(thoi_diem_huy, '%Y-%m-%d %H:%i:%s') AS huy, ly_do_huy AS lyDo FROM lich_hen WHERE lich_hen_id = ?",
      [lichHenId],
    )
  )[0];

/** Đặt khung giờ `i` về `DangGiuCho` với hạn `den` mà KHÔNG có lịch hẹn nào (khung giờ giữ cho lời mời danh sách chờ). */
const holdWithoutAppointment = (w: World, i: number, den: Date) =>
  db.query(
    "UPDATE khung_gio SET trang_thai = 'DangGiuCho', giu_cho_den = ? WHERE khung_gio_id = ?",
    [den, w.slotId(i)],
  );

describe('SLH-01 hold: ConTrong → DangGiuCho, giu_cho_den đã cắt xuống giây (holdDeadline), đúng một hàng', () => {
  it('den có mili giây từ now có mili giây: hạn ghi đúng giây, các khung giờ khác không đổi', async () => {
    const w = await world();
    const now = new Date('2026-11-02T09:00:00.789+07:00');
    const den = holdDeadline(now, 15);
    expect(den.getMilliseconds()).toBe(0);
    expect(den).toEqual(new Date('2026-11-02T09:15:00+07:00'));
    const outcome = await w.withSlot(w.slotId(0), (em, slot) =>
      holds.hold(em, slot, { den }),
    );
    expect(outcome).toEqual({ kind: 'Done' });
    expect(await w.state(0)).toEqual({
      trangThai: 'DangGiuCho',
      giuChoDen: HAN_TEXT,
    });
    expect(await w.state(1)).toEqual({
      trangThai: 'ConTrong',
      giuChoDen: null,
    });
  });

  it('chính `hold` cũng cắt mili giây của den (không tin người gọi)', async () => {
    const w = await world();
    await w.withSlot(w.slotId(2), (em, slot) =>
      holds.hold(em, slot, { den: new Date('2026-11-02T09:15:00.999+07:00') }),
    );
    expect((await w.state(2)).giuChoDen).toBe(HAN_TEXT);
  });
});

describe('SLH-02 hold ca âm: khung giờ không còn ConTrong ⇒ Stale, không đổi gì', () => {
  it('DaDat, DangGiuCho còn hạn, và gọi lần hai sau khi đã giữ', async () => {
    const w = await world();
    await w.appt('DaXacNhan', 1); // khung giờ 1: DaDat
    await w.appt('ChoThanhToan', 2); // khung giờ 2: DangGiuCho, hạn 08:15
    const before = [await w.state(1), await w.state(2)];
    for (const i of [1, 2]) {
      const outcome = await w.withSlot(w.slotId(i), (em, slot) =>
        holds.hold(em, slot, { den: holdDeadline(NOW, 15) }),
      );
      expect(outcome).toEqual({ kind: 'Stale' });
    }
    expect([await w.state(1), await w.state(2)]).toEqual(before);

    const first = await w.withSlot(w.slotId(0), (em, slot) =>
      holds.hold(em, slot, { den: holdDeadline(NOW, 15) }),
    );
    const second = await w.withSlot(w.slotId(0), (em, slot) =>
      holds.hold(em, slot, { den: holdDeadline(NOW, 30) }),
    );
    expect([first, second]).toEqual([{ kind: 'Done' }, { kind: 'Stale' }]);
    expect((await w.state(0)).giuChoDen).toBe(HAN_TEXT); // hạn của lần giữ đầu, không bị ghi đè
  });
});

describe('SLH-03 markBooked: DangGiuCho → DaDat, giu_cho_den NULL (INV-03)', () => {
  it('từ DangGiuCho: DaDat và hạn NULL; INV đúng khi lịch ở DaXacNhan', async () => {
    const w = await world();
    const holder = await w.appt('ChoThanhToan', 0);
    await db.query(
      "UPDATE lich_hen SET trang_thai = 'DaXacNhan' WHERE lich_hen_id = ?",
      [holder.lichHenId],
    );
    const outcome = await w.withSlot(w.slotId(0), (em, slot) =>
      holds.markBooked(em, slot),
    );
    expect(outcome).toEqual({ kind: 'Done' });
    expect(await w.state(0)).toEqual({ trangThai: 'DaDat', giuChoDen: null });
    await assertBookingInvariants(db);
  });

  it('từ ConTrong và từ DaDat ⇒ Stale, không đổi gì', async () => {
    const w = await world();
    await w.appt('DaXacNhan', 1);
    const before = [await w.state(0), await w.state(1)];
    for (const i of [0, 1]) {
      const outcome = await w.withSlot(w.slotId(i), (em, slot) =>
        holds.markBooked(em, slot),
      );
      expect(outcome).toEqual({ kind: 'Stale' });
    }
    expect([await w.state(0), await w.state(1)]).toEqual(before);
  });
});

describe('SLH-04 release: thả có điều kiện trạng thái VÀ hạn (CG-09 phần release, W3)', () => {
  it('DaDat với den = null, và DangGiuCho với den khớp ⇒ ConTrong, hạn NULL', async () => {
    const w = await world();
    await w.appt('DaXacNhan', 0);
    const den = holdDeadline(NOW, 15);
    await w.withSlot(w.slotId(1), (em, slot) => holds.hold(em, slot, { den }));
    const fromBooked = await w.withSlot(w.slotId(0), (em, slot) =>
      holds.release(em, slot, { from: 'DaDat', den: null }),
    );
    const fromHeld = await w.withSlot(w.slotId(1), (em, slot) =>
      holds.release(em, slot, { from: 'DangGiuCho', den }),
    );
    expect([fromBooked, fromHeld]).toEqual([
      { kind: 'Done' },
      { kind: 'Done' },
    ]);
    for (const i of [0, 1])
      expect(await w.state(i)).toEqual({
        trangThai: 'ConTrong',
        giuChoDen: null,
      });
  });

  it('den LỆCH (khung giờ đã bị giữ lại với hạn khác) ⇒ Stale, không thả nhầm', async () => {
    const w = await world();
    await w.withSlot(w.slotId(0), (em, slot) =>
      holds.hold(em, slot, { den: holdDeadline(NOW, 15) }),
    );
    const stale = await w.withSlot(w.slotId(0), (em, slot) =>
      holds.release(em, slot, {
        from: 'DangGiuCho',
        den: holdDeadline(NOW, 5), // hạn cũ của lần giữ trước
      }),
    );
    expect(stale).toEqual({ kind: 'Stale' });
    expect(await w.state(0)).toEqual({
      trangThai: 'DangGiuCho',
      giuChoDen: HAN_TEXT,
    });
  });

  it('from SAI: DangGiuCho thả như DaDat và ngược lại ⇒ Stale; ConTrong ⇒ Stale', async () => {
    const w = await world();
    await w.appt('DaXacNhan', 0);
    await w.withSlot(w.slotId(1), (em, slot) =>
      holds.hold(em, slot, { den: holdDeadline(NOW, 15) }),
    );
    const results = [
      await w.withSlot(w.slotId(1), (em, slot) =>
        holds.release(em, slot, { from: 'DaDat', den: null }),
      ),
      await w.withSlot(w.slotId(0), (em, slot) =>
        holds.release(em, slot, {
          from: 'DangGiuCho',
          den: holdDeadline(NOW, 15),
        }),
      ),
      await w.withSlot(w.slotId(2), (em, slot) =>
        holds.release(em, slot, { from: 'DaDat', den: null }),
      ),
    ];
    expect(results).toEqual([
      { kind: 'Stale' },
      { kind: 'Stale' },
      { kind: 'Stale' },
    ]);
    expect((await w.state(0)).trangThai).toBe('DaDat');
    expect((await w.state(1)).trangThai).toBe('DangGiuCho');
  });
});

describe('SLH-05 expireLapsedHold (DL-05, HG-14 phần I, 5.5): hết hạn lười trong MỘT giao dịch của người gọi', () => {
  it('lịch ChoThanhToan hết hạn ⇒ Expired: lịch DaHuy (thoi_diem_huy = now, ly_do_huy hằng), khung giờ ConTrong, INV đúng', async () => {
    const w = await world();
    const holder = await w.appt('ChoThanhToan', 3); // hạn 08:15 < NOW 09:00
    const outcome = await w.withSlot(w.slotId(3), (em, slot) =>
      holds.expireLapsedHold(em, slot, { now: NOW }),
    );
    expect(outcome).toEqual({ kind: 'Expired', lichHenId: holder.lichHenId });
    expect(await lichHen(holder.lichHenId)).toEqual({
      trangThai: 'DaHuy',
      huy: NOW_TEXT,
      lyDo: HOLD_EXPIRED_CANCEL_REASON,
    });
    expect(await w.state(3)).toEqual({
      trangThai: 'ConTrong',
      giuChoDen: null,
    });
    await assertBookingInvariants(db);
  });

  // Khung giờ được đặt lại sau hết hạn luôn có lịch DaHuy cũ cùng `khung_gio_id` (`khung_gio_dang_giu` của nó là NULL): tìm lịch giữ theo `khung_gio_id` sẽ lấy nhầm lịch cũ (id nhỏ hơn).
  it('khung giờ từng được đặt rồi huỷ (lịch DaHuy cũ id nhỏ hơn, cùng khung_gio_id) và nay có lịch ChoThanhToan quá hạn ⇒ Expired ĐÚNG lịch hiện tại; lịch cũ không bị ghi lại', async () => {
    const w = await world();
    const old = await w.appt('DaHuy', 4); // huỷ trước đó: giữ khung_gio_id, khung_gio_dang_giu NULL, khung giờ ConTrong
    const current = await w.appt('ChoThanhToan', 4); // đặt lại sau đó: id lớn hơn, hạn 08:15 < NOW 09:00
    expect(BigInt(old.lichHenId) < BigInt(current.lichHenId)).toBe(true);
    const oldBefore = await lichHen(old.lichHenId);
    expect(oldBefore?.trangThai).toBe('DaHuy');
    const outcome = await w.withSlot(w.slotId(4), (em, slot) =>
      holds.expireLapsedHold(em, slot, { now: NOW }),
    );
    expect(outcome).toEqual({ kind: 'Expired', lichHenId: current.lichHenId });
    expect(await lichHen(current.lichHenId)).toEqual({
      trangThai: 'DaHuy',
      huy: NOW_TEXT,
      lyDo: HOLD_EXPIRED_CANCEL_REASON,
    });
    expect(await lichHen(old.lichHenId)).toEqual(oldBefore); // thoi_diem_huy, ly_do_huy của lịch cũ giữ nguyên
    expect(await w.state(4)).toEqual({
      trangThai: 'ConTrong',
      giuChoDen: null,
    });
    await assertBookingInvariants(db);
  });

  it('biên nửa mở (HG-14): han_thanh_toan = now ⇒ ĐÃ hết hạn (Expired); now + 1 giây ⇒ NotLapsed và không ghi gì', async () => {
    const w = await world();
    const atNow = await w.appt('ChoThanhToan', 0, NOW);
    const justAfter = await w.appt(
      'ChoThanhToan',
      1,
      new Date(NOW.getTime() + 1000),
    );
    const before = await w.state(1);
    const results = [
      await w.withSlot(w.slotId(0), (em, slot) =>
        holds.expireLapsedHold(em, slot, { now: NOW }),
      ),
      await w.withSlot(w.slotId(1), (em, slot) =>
        holds.expireLapsedHold(em, slot, { now: NOW }),
      ),
    ];
    expect(results).toEqual([
      { kind: 'Expired', lichHenId: atNow.lichHenId },
      { kind: 'NotLapsed' },
    ]);
    expect((await lichHen(justAfter.lichHenId))?.trangThai).toBe(
      'ChoThanhToan',
    );
    expect(await w.state(1)).toEqual(before);
    expect((await w.state(0)).trangThai).toBe('ConTrong');
  });

  it('một giao dịch: lỗi SAU khi hết hạn ⇒ hoàn tác CẢ lịch cũ lẫn khung giờ (lịch cũ vẫn ChoThanhToan, khung giờ vẫn DangGiuCho)', async () => {
    const w = await world();
    const holder = await w.appt('ChoThanhToan', 2);
    const before = await w.state(2);
    await expect(
      w.withSlot(w.slotId(2), async (em, slot) => {
        expect(
          (await holds.expireLapsedHold(em, slot, { now: NOW })).kind,
        ).toBe('Expired');
        throw new Error('lỗi sau hết hạn lười');
      }),
    ).rejects.toThrow('lỗi sau hết hạn lười');
    expect((await lichHen(holder.lichHenId))?.trangThai).toBe('ChoThanhToan');
    expect((await lichHen(holder.lichHenId))?.huy).toBeNull();
    expect(await w.state(2)).toEqual(before);
    await assertBookingInvariants(db);
  });

  it('khung giờ chưa quá hạn (so với now) ⇒ NotLapsed, không ghi gì', async () => {
    const w = await world();
    const holder = await w.appt('ChoThanhToan', 0); // hạn 08:15
    const outcome = await w.withSlot(w.slotId(0), (em, slot) =>
      holds.expireLapsedHold(em, slot, {
        now: new Date('2026-11-02T08:05:00+07:00'),
      }),
    );
    expect(outcome).toEqual({ kind: 'NotLapsed' });
    expect((await lichHen(holder.lichHenId))?.trangThai).toBe('ChoThanhToan');
  });
});

describe('SLH-06 expireLapsedHold ca âm', () => {
  it('không có lịch giữ (lời mời danh sách chờ hết hạn) ⇒ NoHolder, khung giờ về ConTrong', async () => {
    const w = await world();
    await holdWithoutAppointment(w, 0, new Date('2026-11-02T08:30:00+07:00'));
    const outcome = await w.withSlot(w.slotId(0), (em, slot) =>
      holds.expireLapsedHold(em, slot, { now: NOW }),
    );
    expect(outcome).toEqual({ kind: 'NoHolder' });
    expect(await w.state(0)).toEqual({
      trangThai: 'ConTrong',
      giuChoDen: null,
    });
    await assertBookingInvariants(db);
  });

  it('lời mời còn hạn (không có lịch giữ, hạn ở tương lai) ⇒ NotLapsed, khung giờ giữ nguyên: không thả nhầm lời mời chưa hết hạn', async () => {
    const w = await world();
    await holdWithoutAppointment(w, 3, new Date('2026-11-02T09:30:00+07:00'));
    const before = await w.state(3);
    const outcome = await w.withSlot(w.slotId(3), (em, slot) =>
      holds.expireLapsedHold(em, slot, { now: NOW }),
    );
    expect(outcome).toEqual({ kind: 'NotLapsed' });
    expect(await w.state(3)).toEqual(before);
  });

  it('lịch giữ đã DaXacNhan (dữ liệu lệch: khung giờ DangGiuCho quá hạn) ⇒ HolderChanged, không huỷ gì', async () => {
    const w = await world();
    const holder = await w.appt('DaXacNhan', 1);
    await holdWithoutAppointment(w, 1, new Date('2026-11-02T08:30:00+07:00'));
    const outcome = await w.withSlot(w.slotId(1), (em, slot) =>
      holds.expireLapsedHold(em, slot, { now: NOW }),
    );
    expect(outcome).toEqual({ kind: 'HolderChanged' });
    expect((await lichHen(holder.lichHenId))?.trangThai).toBe('DaXacNhan');
    expect((await w.state(1)).trangThai).toBe('DangGiuCho'); // không đổi gì
  });

  it('lịch giữ còn hạn dù khung giờ ghi quá hạn (dữ liệu lệch) ⇒ NotLapsed, không ghi gì', async () => {
    const w = await world();
    const holder = await w.appt(
      'ChoThanhToan',
      2,
      new Date('2026-11-02T09:30:00+07:00'),
    );
    await holdWithoutAppointment(w, 2, new Date('2026-11-02T08:30:00+07:00'));
    const before = await w.state(2);
    const outcome = await w.withSlot(w.slotId(2), (em, slot) =>
      holds.expireLapsedHold(em, slot, { now: NOW }),
    );
    expect(outcome).toEqual({ kind: 'NotLapsed' });
    expect((await lichHen(holder.lichHenId))?.trangThai).toBe('ChoThanhToan');
    expect(await w.state(2)).toEqual(before);
  });
});

describe('SLH-08 thứ tự khoá ở đường hết hạn lười (PLAN 5.3 quy tắc 7, ca đo B6b)', () => {
  it('bac_si → khung_gio → lich_hen THEO KHOÁ CHÍNH; không câu khoá lich_hen theo khung_gio_dang_giu; findLockOrderViolation = null', async () => {
    const w = await world();
    const holder = await w.appt('ChoThanhToan', 0);
    const statements: { sql: string; params: unknown[] }[] = [];
    await db.transaction('READ COMMITTED', async (em) => {
      interceptQuery(em, (sql, run) => {
        statements.push({ sql, params: [] });
        return run();
      });
      await lockDoctorShared(em, w.doctorId);
      const slot = await lockSlot(em, w.slotId(0));
      if (slot === null) throw new Error('khung giờ phải tồn tại');
      const outcome = await holds.expireLapsedHold(em, slot, { now: NOW });
      expect(outcome).toEqual({ kind: 'Expired', lichHenId: holder.lichHenId });
    });
    const locking = statements.map((s) => s.sql).filter(isLockingStatement);
    const tables = locking.map(firstTableOf);
    expect(tables).toEqual(['bac_si', 'khung_gio', 'lich_hen']);
    expect(findLockOrderViolation(tables as string[])).toBeNull();
    // câu khoá lich_hen có điều kiện theo khoá chính, không theo khung giờ
    const lichHenLock = locking[2] ?? '';
    expect(lichHenLock).toMatch(/WHERE\s+lich_hen_id\s*=\s*\?/);
    expect(lichHenLock).not.toMatch(/khung_gio_dang_giu|khung_gio_id/);
    // đọc thường lịch giữ theo khung_gio_dang_giu: HỢP LỆ vì không có mệnh đề khoá
    const plainHolderRead = statements.filter(
      (s) => /khung_gio_dang_giu/.test(s.sql) && !isLockingStatement(s.sql),
    );
    expect(plainHolderRead).toHaveLength(1);
  });
});

describe('SLH-09 holdForInvitation (PLAN 5.10 W3): giữ khung giờ ConTrong cho lời mời, không tạo lịch', () => {
  it('khung giờ ConTrong ⇒ Done (DangGiuCho, giu_cho_den = den, không lịch hẹn); INV-05 chỉ đúng với exceptSlotIds', async () => {
    const w = await world();
    const den = new Date('2026-11-03T08:00:00+07:00');
    const outcome = await db.transaction('READ COMMITTED', (em) =>
      holds.holdForInvitation(em, { khungGioId: w.slotId(0), den }),
    );
    expect(outcome).toEqual({ kind: 'Done' });
    expect(await w.state(0)).toEqual({
      trangThai: 'DangGiuCho',
      giuChoDen: '2026-11-03 08:00:00',
    });
    const [{ n }] = await db.query<{ n: string | number }[]>(
      'SELECT COUNT(*) AS n FROM lich_hen',
    );
    expect(Number(n)).toBe(0);
    await assertBookingInvariants(db, { exceptSlotIds: [w.slotId(0)] });
    await expect(assertBookingInvariants(db)).rejects.toThrow(/INV-05/);
  });

  it('khung giờ khác ConTrong (DaDat, DangGiuCho) ⇒ Stale, không đổi gì; không có khung giờ ⇒ NotFound', async () => {
    const w = await world();
    await w.appt('DaXacNhan', 0);
    await w.appt('ChoThanhToan', 1);
    const before = [await w.state(0), await w.state(1)];
    const den = new Date('2026-11-03T08:00:00+07:00');
    const results = await db.transaction('READ COMMITTED', async (em) => [
      await holds.holdForInvitation(em, { khungGioId: w.slotId(0), den }),
      await holds.holdForInvitation(em, { khungGioId: w.slotId(1), den }),
      await holds.holdForInvitation(em, { khungGioId: '999999999', den }),
    ]);
    expect(results).toEqual([
      { kind: 'Stale' },
      { kind: 'Stale' },
      { kind: 'NotFound' },
    ]);
    expect([await w.state(0), await w.state(1)]).toEqual(before);
  });
});

describe('CG-09 releaseInvitationHold thả CÓ ĐIỀU KIỆN giu_cho_den = den (PLAN 5.10 W3)', () => {
  const den1 = new Date('2026-11-03T08:00:00+07:00');
  const den2 = new Date('2026-11-03T09:00:00+07:00');

  it('den khớp ⇒ Done, khung giờ ConTrong', async () => {
    const w = await world();
    await db.transaction('READ COMMITTED', (em) =>
      holds.holdForInvitation(em, { khungGioId: w.slotId(0), den: den1 }),
    );
    const outcome = await db.transaction('READ COMMITTED', (em) =>
      holds.releaseInvitationHold(em, { khungGioId: w.slotId(0), den: den1 }),
    );
    expect(outcome).toEqual({ kind: 'Done' });
    expect(await w.state(0)).toEqual({
      trangThai: 'ConTrong',
      giuChoDen: null,
    });
  });

  it('lời mời hết hạn, booking đặt lại khung giờ với hạn KHÁC, rồi waitlist thả muộn ⇒ Stale, KHÔNG thả nhầm', async () => {
    const w = await world();
    await db.transaction('READ COMMITTED', (em) =>
      holds.holdForInvitation(em, { khungGioId: w.slotId(0), den: den1 }),
    );
    // booking đặt lại: hết hạn lười không có lịch giữ ⇒ ConTrong rồi giữ cho người đặt với hạn mới
    await w.withSlot(w.slotId(0), async (em, slot) => {
      expect(
        (
          await holds.expireLapsedHold(em, slot, {
            now: new Date('2026-11-03T08:30:00+07:00'),
          })
        ).kind,
      ).toBe('NoHolder');
      const relocked = await lockSlot(em, w.slotId(0));
      if (relocked === null) throw new Error('khung giờ phải tồn tại');
      expect(await holds.hold(em, relocked, { den: den2 })).toEqual({
        kind: 'Done',
      });
    });
    const outcome = await db.transaction('READ COMMITTED', (em) =>
      holds.releaseInvitationHold(em, { khungGioId: w.slotId(0), den: den1 }),
    );
    expect(outcome).toEqual({ kind: 'Stale' });
    expect(await w.state(0)).toEqual({
      trangThai: 'DangGiuCho',
      giuChoDen: '2026-11-03 09:00:00',
    });
  });

  it('khung giờ đã DaDat ⇒ Stale; không có khung giờ ⇒ NotFound', async () => {
    const w = await world();
    await w.appt('DaXacNhan', 1);
    const results = await db.transaction('READ COMMITTED', async (em) => [
      await holds.releaseInvitationHold(em, {
        khungGioId: w.slotId(1),
        den: den1,
      }),
      await holds.releaseInvitationHold(em, {
        khungGioId: '999999999',
        den: den1,
      }),
    ]);
    expect(results).toEqual([{ kind: 'Stale' }, { kind: 'NotFound' }]);
    expect((await w.state(1)).trangThai).toBe('DaDat');
  });
});
