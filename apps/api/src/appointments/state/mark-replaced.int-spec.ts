import type { DataSource } from 'typeorm';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { SlotHoldService } from '../slots/slot-hold.service.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import {
  FakeAppointmentNotifier,
  FakeWaitlistPort,
} from '../testing/fake-ports.js';
import { AppointmentTransitionService } from './appointment-transition.service.js';
import { lockAppointment } from './cancel-appointment.query.js';

// reschedule B1 — HDL-01 (phần I; PLAN reschedule 5.3, 7.9) trên MySQL 8.4 THẬT: `markReplaced` chỉ đổi `DaXacNhan` thành `DaDoiLich`, đúng 1 hàng, KHÔNG đổi cột nào khác (kể cả các mốc B19, trừ
// `cap_nhat_lan_cuoi` do chính DB tự đổi bằng `ON UPDATE CURRENT_TIMESTAMP`), và không đụng khung giờ. Phần đơn vị (chữ SQL, đối số, kết quả): mark-replaced.spec.ts.
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const service = () =>
  new AppointmentTransitionService(
    db,
    new SlotHoldService(),
    new FakeWaitlistPort(),
    new FakeAppointmentNotifier(),
  );

async function world() {
  const w = await fx.world();
  const patientId = w.patient.account.taiKhoanId;
  return {
    ...w,
    appt: (trangThai: TrangThaiLichHen, slot: number) =>
      fx.appointmentIn(trangThai, {
        doctor: w.doctor.profile,
        khungGioId: w.slotIds[slot]!,
        patientId,
      }),
  };
}

/** Một hàng `lich_hen` đủ MỌI cột, trừ `cap_nhat_lan_cuoi` (DB tự đổi mỗi khi hàng thay đổi). */
async function snapshot(lichHenId: string): Promise<Record<string, unknown>> {
  const rows: Record<string, unknown>[] = await db.query(
    'SELECT * FROM lich_hen WHERE lich_hen_id = ?',
    [lichHenId],
  );
  const row = rows[0];
  if (row === undefined) throw new Error(`không có lịch ${lichHenId}`);
  delete row['cap_nhat_lan_cuoi'];
  return row;
}

/** Điền mọi mốc và cột phụ để chứng minh `markReplaced` không chạm vào chúng (nếu để NULL thì đổi nhầm sang NULL không lộ ra). */
async function fillOptionalColumns(lichHenId: string): Promise<void> {
  await db.query(
    `UPDATE lich_hen SET thoi_diem_xac_nhan = '2026-11-01 10:00:00', thoi_diem_tiep_don = '2026-11-01 11:00:00',
       thoi_diem_hoan_thanh = '2026-11-01 12:00:00', ly_do_kham = 'Đau đầu', so_lan_tu_doi_lich = 2,
       tien_coc_snapshot = '50000.00', chinh_sach_hoan_snapshot = '[{"so_gio_truoc_toi_thieu":24,"ty_le_hoan":100}]'
     WHERE lich_hen_id = ?`,
    [lichHenId],
  );
}

const markReplaced = (lichHenId: string) =>
  db.transaction('READ COMMITTED', async (em) => {
    // đúng điều kiện người gọi phải giữ: lịch đã khoá theo khoá chính
    await lockAppointment(em, lichHenId);
    return service().markReplaced(em, { lichHenId });
  });

describe('HDL-01 markReplaced trên MySQL thật', () => {
  it('DaXacNhan ⇒ DaDoiLich đúng 1 hàng; MỌI cột khác y nguyên (kể cả thoi_diem_xac_nhan, thoi_diem_tiep_don, thoi_diem_hoan_thanh, ly_do_kham, ba bản chụp, so_lan_tu_doi_lich); khung giờ vẫn DaDat', async () => {
    const w = await world();
    const target = await w.appt('DaXacNhan', 0);
    await fillOptionalColumns(target.lichHenId);
    const before = await snapshot(target.lichHenId);

    const outcome = await markReplaced(target.lichHenId);

    expect(outcome).toEqual({ kind: 'Replaced' });
    const after = await snapshot(target.lichHenId);
    expect(after['trang_thai']).toBe('DaDoiLich');
    // `khung_gio_dang_giu` là cột SINH từ trang_thai (đang giữ khung giờ ⇒ bằng khung_gio_id, DaDoiLich ⇒ NULL): lịch bị thay không còn giữ khung giờ, nên UNIQUE của cột này nhả khung giờ cũ cho lịch mới
    expect(before['khung_gio_dang_giu']).toBe(before['khung_gio_id']);
    expect(after['khung_gio_dang_giu']).toBeNull();
    // MỌI cột còn lại (kể cả mọi mốc) y nguyên
    expect({
      ...after,
      trang_thai: before['trang_thai'],
      khung_gio_dang_giu: before['khung_gio_dang_giu'],
    }).toEqual(before);
    expect(await fx.slotState(w.slotIds[0]!)).toEqual({
      trangThai: 'DaDat',
      giuChoDen: null,
    });
  });

  it('chỉ đổi ĐÚNG lịch được chỉ định: lịch DaXacNhan khác của cùng Bệnh nhân giữ nguyên', async () => {
    const w = await world();
    const target = await w.appt('DaXacNhan', 0);
    const other = await w.appt('DaXacNhan', 3);
    const otherBefore = await snapshot(other.lichHenId);

    await markReplaced(target.lichHenId);

    expect(await snapshot(other.lichHenId)).toEqual(otherBefore);
  });

  it.each([
    'ChoThanhToan',
    'DaTiepDon',
    'HoanThanh',
    'DaHuy',
    'DaDoiLich',
    'VangMat',
  ] as const)(
    'lịch %s ⇒ InvalidState, hàng và khung giờ KHÔNG đổi',
    async (trangThai) => {
      const w = await world();
      const target = await w.appt(trangThai, 0);
      await fillOptionalColumns(target.lichHenId);
      const before = await snapshot(target.lichHenId);
      const slotBefore = await fx.slotState(w.slotIds[0]!);

      const outcome = await markReplaced(target.lichHenId);

      expect(outcome).toEqual({ kind: 'InvalidState' });
      expect(await snapshot(target.lichHenId)).toEqual(before);
      expect(await fx.slotState(w.slotIds[0]!)).toEqual(slotBefore);
    },
  );

  it('id không có lịch ⇒ InvalidState (không ném)', async () => {
    await world();

    expect(await markReplaced('999999')).toEqual({ kind: 'InvalidState' });
  });

  it('gọi lần hai trên lịch đã DaDoiLich ⇒ InvalidState (không ghi lại, không đổi mốc)', async () => {
    const w = await world();
    const target = await w.appt('DaXacNhan', 0);

    expect(await markReplaced(target.lichHenId)).toEqual({ kind: 'Replaced' });
    const once = await snapshot(target.lichHenId);
    expect(await markReplaced(target.lichHenId)).toEqual({
      kind: 'InvalidState',
    });
    expect(await snapshot(target.lichHenId)).toEqual(once);
  });

  it('giao dịch của người gọi hoàn tác ⇒ lịch vẫn DaXacNhan (markReplaced không tự commit)', async () => {
    const w = await world();
    const target = await w.appt('DaXacNhan', 0);
    const before = await snapshot(target.lichHenId);

    await expect(
      db.transaction('READ COMMITTED', async (em) => {
        await lockAppointment(em, target.lichHenId);
        expect(
          await service().markReplaced(em, { lichHenId: target.lichHenId }),
        ).toEqual({ kind: 'Replaced' });
        throw new Error('hoàn tác giả');
      }),
    ).rejects.toThrow('hoàn tác giả');

    expect(await snapshot(target.lichHenId)).toEqual(before);
  });
});
