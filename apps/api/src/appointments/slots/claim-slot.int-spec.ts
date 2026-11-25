import type { DataSource, EntityManager } from 'typeorm';
import { KhungGio } from '../../admin/entities/khung-gio.entity.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { insertLichHen } from '../create/lich-hen-insert.query.js';
import { HOLD_EXPIRED_CANCEL_REASON } from '../appointments.constants.js';
import {
  BookingFixtures,
  nextAppointmentCode,
} from '../testing/booking-fixtures.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import { claimSlot, freeLapsedHold } from './claim-slot.js';
import { SlotHoldService } from './slot-hold.service.js';
import { lockSlot, type LockedSlot } from './slot-lock.js';

// reschedule B1 — HDL-12 (phần I; PLAN reschedule 3.5 R8, 5.5 bước 5 và 6) trên MySQL 8.4 THẬT: `freeLapsedHold` (hết hạn lười) và `claimSlot` (hold rồi markBooked) ghép với `insertLichHen` đúng thứ tự
// của `create`: hết hạn lười → INSERT → giữ. Phần đơn vị (đối số, thông điệp lỗi): claim-slot.spec.ts. Lịch `ChoThanhToan` của fixture có hạn 08:15 ngày 02/11/2026; NOW (09:00) là sau hạn đó.
const NOW = new Date('2026-11-02T09:00:00+07:00');
const BEFORE_EXPIRY = new Date('2026-11-02T08:05:00+07:00');
const NEW_HOLD_UNTIL = new Date('2026-11-02T09:15:00+07:00');

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
  const doctor = w.doctor.profile;
  const [other] = await fx.patients(1);
  return {
    ...w,
    patientId,
    /** Chạy `work` trong MỘT giao dịch READ COMMITTED SAU khi khoá `khung_gio` (tầng 5): cách người gọi dùng hai hàm */
    withSlot: <T>(
      khungGioId: string,
      work: (em: EntityManager, slot: LockedSlot) => Promise<T>,
    ): Promise<T> =>
      db.transaction('READ COMMITTED', async (em) => {
        const slot = await lockSlot(em, khungGioId);
        if (slot === null) throw new Error('khung giờ phải tồn tại');
        return work(em, slot);
      }),
    /** Lịch mới của người đặt `patientId` ở khung giờ thứ `slot`, chèn bằng `insertLichHen` thật */
    insertNew: async (
      em: EntityManager,
      slot: number,
      extra: { trangThai: 'ChoThanhToan' | 'DaXacNhan'; han: Date | null },
    ) => {
      const entity = await db
        .getRepository(KhungGio)
        .findOneByOrFail({ khungGioId: w.slotIds[slot]! });
      return insertLichHen(em, {
        maLichHen: nextAppointmentCode(),
        khungGioId: w.slotIds[slot]!,
        benhNhanId: other!.account.taiKhoanId,
        hoSoNguoiThanId: null,
        bacSiId: doctor.taiKhoanId,
        chiNhanhId: doctor.chiNhanhId,
        dichVuKhamId: doctor.dichVuKhamId,
        thoiGian: entity.ngayGio,
        giaSnapshot: '100000.00',
        tienCocSnapshot: '0.00',
        chinhSachHoanSnapshot: null,
        trangThai: extra.trangThai,
        hanThanhToan: extra.han,
        lyDoKham: null,
        thoiDiemTao: NOW,
      });
    },
    /** Lịch cũ `ChoThanhToan` giữ khung giờ thứ `slot` (hạn 08:15, đã quá hạn lúc NOW) */
    lapsed: (slot: number) =>
      fx.appointmentIn('ChoThanhToan', {
        doctor,
        khungGioId: w.slotIds[slot]!,
        patientId,
      }),
  };
}

const statusOf = async (lichHenId: string) => {
  const rows: { trangThai: string; lyDoHuy: string | null }[] = await db.query(
    'SELECT trang_thai AS trangThai, ly_do_huy AS lyDoHuy FROM lich_hen WHERE lich_hen_id = ?',
    [lichHenId],
  );
  return rows[0];
};

describe('HDL-12 freeLapsedHold + claimSlot trên MySQL thật (đúng thứ tự của create: hết hạn lười → INSERT → giữ)', () => {
  it('khung giờ DangGiuCho quá hạn: lịch cũ DaHuy (lý do hằng), khung giờ ConTrong rồi DaDat sau claimSlot book = true; lịch mới DaXacNhan giữ nó; INV-1 đến INV-6 xanh', async () => {
    const w = await world();
    const old = await w.lapsed(0);

    await w.withSlot(w.slotIds[0]!, async (em, slot) => {
      expect(await freeLapsedHold(holds, em, slot, NOW)).toBe('Free');
      const inserted = await w.insertNew(em, 0, {
        trangThai: 'DaXacNhan',
        han: null,
      });
      expect(inserted.kind).toBe('Inserted');
      await claimSlot(holds, em, slot, { den: NEW_HOLD_UNTIL, book: true });
    });

    expect(await statusOf(old.lichHenId)).toEqual({
      trangThai: 'DaHuy',
      lyDoHuy: HOLD_EXPIRED_CANCEL_REASON,
    });
    expect(await fx.slotState(w.slotIds[0]!)).toEqual({
      trangThai: 'DaDat',
      giuChoDen: null,
    });
    await assertBookingInvariants(db);
  });

  it('book = false (cọc > 0 của create): khung giờ dừng ở DangGiuCho với giu_cho_den = hạn; lịch mới ChoThanhToan có han_thanh_toan bằng đúng hạn đó (INV-2)', async () => {
    const w = await world();

    await w.withSlot(w.slotIds[1]!, async (em, slot) => {
      const inserted = await w.insertNew(em, 1, {
        trangThai: 'ChoThanhToan',
        han: NEW_HOLD_UNTIL,
      });
      expect(inserted.kind).toBe('Inserted');
      await claimSlot(holds, em, slot, { den: NEW_HOLD_UNTIL, book: false });
    });

    expect(await fx.slotState(w.slotIds[1]!)).toEqual({
      trangThai: 'DangGiuCho',
      giuChoDen: '2026-11-02 09:15:00',
    });
    await assertBookingInvariants(db);
  });

  it('khung giờ DangGiuCho CHƯA quá hạn ⇒ StillHeld và KHÔNG ghi gì (lịch cũ vẫn ChoThanhToan, khung giờ vẫn DangGiuCho)', async () => {
    const w = await world();
    const old = await w.lapsed(0);

    const outcome = await w.withSlot(w.slotIds[0]!, (em, slot) =>
      freeLapsedHold(holds, em, slot, BEFORE_EXPIRY),
    );

    expect(outcome).toBe('StillHeld');
    expect((await statusOf(old.lichHenId))?.trangThai).toBe('ChoThanhToan');
    expect((await fx.slotState(w.slotIds[0]!)).trangThai).toBe('DangGiuCho');
  });

  it('lời mời danh sách chờ hết hạn (khung giờ DangGiuCho quá hạn, KHÔNG có lịch giữ) ⇒ Free và khung giờ ConTrong', async () => {
    const w = await world();
    await db.query(
      "UPDATE khung_gio SET trang_thai = 'DangGiuCho', giu_cho_den = '2026-11-02 08:15:00' WHERE khung_gio_id = ?",
      [w.slotIds[2]],
    );

    const outcome = await w.withSlot(w.slotIds[2]!, (em, slot) =>
      freeLapsedHold(holds, em, slot, NOW),
    );

    expect(outcome).toBe('Free');
    expect(await fx.slotState(w.slotIds[2]!)).toEqual({
      trangThai: 'ConTrong',
      giuChoDen: null,
    });
  });

  it('claimSlot trên khung giờ ĐÃ DaDat (người khác vừa đặt) ⇒ NÉM Error và hoàn tác trọn: lịch vừa chèn biến mất, khung giờ không đổi', async () => {
    const w = await world();
    const holder = await fx.appointmentIn('DaXacNhan', {
      doctor: w.doctor.profile,
      khungGioId: w.slotIds[3]!,
      patientId: w.patientId,
    });

    await expect(
      w.withSlot(w.slotIds[3]!, (em, slot) =>
        claimSlot(holds, em, slot, { den: NEW_HOLD_UNTIL, book: true }),
      ),
    ).rejects.toThrow('hold không ghi được dưới khoá sau khi INSERT lich_hen');

    expect(await fx.slotState(w.slotIds[3]!)).toEqual({
      trangThai: 'DaDat',
      giuChoDen: null,
    });
    expect((await statusOf(holder.lichHenId))?.trangThai).toBe('DaXacNhan');
    await assertBookingInvariants(db);
  });

  it('claimSlot ném SAU INSERT ⇒ hoàn tác cả INSERT (không commit lịch mồ côi): khung giờ ConTrong, không hàng lịch mới', async () => {
    const w = await world();
    const before: { n: number | string }[] = await db.query(
      'SELECT COUNT(*) AS n FROM lich_hen',
    );

    await expect(
      w.withSlot(w.slotIds[4]!, async (em, slot) => {
        await w.insertNew(em, 4, { trangThai: 'DaXacNhan', han: null });
        await claimSlot(holds, em, slot, { den: NEW_HOLD_UNTIL, book: true });
        throw new Error('hoàn tác giả sau claimSlot');
      }),
    ).rejects.toThrow('hoàn tác giả sau claimSlot');

    const after: { n: number | string }[] = await db.query(
      'SELECT COUNT(*) AS n FROM lich_hen',
    );
    expect(Number(after[0]?.n)).toBe(Number(before[0]?.n));
    expect(await fx.slotState(w.slotIds[4]!)).toEqual({
      trangThai: 'ConTrong',
      giuChoDen: null,
    });
  });
});
