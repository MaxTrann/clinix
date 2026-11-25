import type { EntityManager } from 'typeorm';
import { insertLichHen } from '../create/lich-hen-insert.query.js';
import type { RefundTierSnapshot } from '../create/refund-policy.js';
import { lockRescheduleChain } from '../reschedule/reschedule-locks.js';
import type { RescheduleLocated } from '../reschedule/reschedule.reader.js';
import { claimSlot, freeLapsedHold } from '../slots/claim-slot.js';
import type { SlotHoldService } from '../slots/slot-hold.service.js';
import type { AppointmentTransitionService } from '../state/appointment-transition.service.js';
import { nextAppointmentCode } from './booking-fixtures.js';

// THÂN GHI MÔ PHỎNG của đổi lịch, CHỈ DÙNG TRONG TEST (reschedule B1; PLAN reschedule 5.5 bước 1, 5, 6, 7): ghép đúng các hàm nền của B1 theo đúng thứ tự để chứng minh chúng chạy trọn trong MỘT giao dịch,
// sinh ra chuỗi hợp lệ cho INV-7 đến INV-10, và hoàn tác trọn khi ném giữa chừng. KHÔNG phải dịch vụ: không có bộ luật `evaluateReschedulability`, hạn mức, cấu hình, thông báo, Audit, cổng sau commit
// (đó là `AppointmentRescheduleService` của B4, sẽ thay file này; B4 xoá file này khi có dịch vụ thật). Chỉ kiểm tối thiểu để thân không ghi bậy: lịch còn `DaXacNhan` dưới khoá, khung giờ mới trống.
// Sao chép ba bản chụp, bác sĩ, chi nhánh, dịch vụ, lý do khám từ lịch cũ (không tính lại giá); `thoi_gian` = giờ khung giờ mới; `thoi_diem_tao` = `now`.

export interface RescheduleWriteDeps {
  slotHolds: SlotHoldService;
  transition: AppointmentTransitionService;
}

export interface RescheduleWriteInput {
  /** Các khoá bất biến của lịch cũ (như `RescheduleReader.locate`) */
  located: RescheduleLocated;
  khungGioMoiId: string;
  /** `toSecond(nowVN())` */
  now: Date;
  /** `true` (Bệnh nhân tự đổi): bộ đếm của lịch mới = cũ + 1; `false` (đổi hộ, duyệt): bằng cũ */
  tuDoi: boolean;
  /** Giữ ở khung giờ mới tới mốc này rồi `markBooked` ngay; chỉ cần khác `null` cho `hold` */
  holdUntil: Date;
  /** Ném ngay SAU bước này để chứng minh hoàn tác trọn; mặc định không ném */
  throwAfter?: 'insert' | 'claim' | 'release' | 'markReplaced';
}

export type RescheduleWriteResult =
  | { kind: 'Rescheduled'; lichHenMoiId: string; maLichHenMoi: string }
  /** Từ chối TRƯỚC lần ghi đầu tiên (giao dịch commit rỗng) */
  | { kind: 'Rejected'; reason: 'Missing' | 'NotConfirmed' | 'SlotNotFree' };

interface OldRow {
  hoSoNguoiThanId: string | null;
  chiNhanhId: string;
  dichVuKhamId: string;
  giaSnapshot: string;
  tienCocSnapshot: string;
  chinhSachHoan: readonly RefundTierSnapshot[] | null;
  lyDoKham: string | null;
  soLan: number | string;
}

const READ_OLD_SQL = `SELECT CAST(ho_so_nguoi_than_id AS CHAR) AS hoSoNguoiThanId, CAST(chi_nhanh_id AS CHAR) AS chiNhanhId, CAST(dich_vu_kham_id AS CHAR) AS dichVuKhamId,
  gia_snapshot AS giaSnapshot, tien_coc_snapshot AS tienCocSnapshot, chinh_sach_hoan_snapshot AS chinhSachHoan, ly_do_kham AS lyDoKham, so_lan_tu_doi_lich AS soLan
FROM lich_hen WHERE lich_hen_id = ?`;

export async function simulateRescheduleWrite(
  em: EntityManager,
  deps: RescheduleWriteDeps,
  input: RescheduleWriteInput,
): Promise<RescheduleWriteResult> {
  const { located } = input;
  // Bước 1: chuỗi khoá THẬT của B1
  const locks = await lockRescheduleChain(em, {
    benhNhanId: located.benhNhanId,
    hoSoNguoiThanId: located.hoSoNguoiThanId,
    bacSiId: located.bacSiId,
    lichHenId: located.lichHenId,
    khungGioCuId: located.khungGioCuId,
    khungGioMoiId: input.khungGioMoiId,
  });
  if (locks.kind === 'Missing') return { kind: 'Rejected', reason: 'Missing' };
  if (locks.appointment.trangThai !== 'DaXacNhan')
    return { kind: 'Rejected', reason: 'NotConfirmed' };

  // Bước 5a: khung giờ mới đã đặt thì từ chối; đang giữ thì hết hạn lười nếu đã quá hạn (dùng chung `claim-slot.ts` với `create`), chưa quá hạn thì từ chối
  if (locks.slotMoi.trangThai === 'DaDat')
    return { kind: 'Rejected', reason: 'SlotNotFree' };
  if (
    locks.slotMoi.trangThai === 'DangGiuCho' &&
    (await freeLapsedHold(deps.slotHolds, em, locks.slotMoi, input.now)) ===
      'StillHeld'
  )
    return { kind: 'Rejected', reason: 'SlotNotFree' };

  const old = (await em.query<OldRow[]>(READ_OLD_SQL, [located.lichHenId]))[0];
  if (old === undefined) return { kind: 'Rejected', reason: 'Missing' };

  // Bước 5b: INSERT lịch mới nối chuỗi qua ĐÚNG `insertLichHen` (nơi DUY NHẤT chèn `lich_hen`)
  const maLichHenMoi = nextAppointmentCode();
  const inserted = await insertLichHen(em, {
    maLichHen: maLichHenMoi,
    khungGioId: input.khungGioMoiId,
    benhNhanId: located.benhNhanId,
    hoSoNguoiThanId: old.hoSoNguoiThanId,
    bacSiId: located.bacSiId,
    chiNhanhId: old.chiNhanhId,
    dichVuKhamId: old.dichVuKhamId,
    thoiGian: locks.slotMoi.ngayGio,
    giaSnapshot: old.giaSnapshot,
    tienCocSnapshot: old.tienCocSnapshot,
    chinhSachHoanSnapshot: old.chinhSachHoan,
    trangThai: 'DaXacNhan',
    hanThanhToan: null,
    lyDoKham: old.lyDoKham,
    thoiDiemTao: input.now,
    lichHenTruocId: located.lichHenId,
    soLanTuDoiLich: Number(old.soLan) + (input.tuDoi ? 1 : 0),
  });
  if (inserted.kind !== 'Inserted')
    throw new Error(`không chèn được lịch mới: ${inserted.kind}`);
  failAfter(input, 'insert');

  // Bước 6: giữ rồi đặt khung giờ mới, thả khung giờ cũ
  await claimSlot(deps.slotHolds, em, locks.slotMoi, {
    den: input.holdUntil,
    book: true,
  });
  failAfter(input, 'claim');
  const released = await deps.slotHolds.release(em, locks.slotCu, {
    from: 'DaDat',
    den: null,
  });
  if (released.kind !== 'Done')
    throw new Error('không thả được khung giờ cũ dưới khoá');
  failAfter(input, 'release');

  // Bước 7: lịch cũ thành DaDoiLich, SAU mọi lần ghi có khoá ngoại
  const replaced = await deps.transition.markReplaced(em, {
    lichHenId: located.lichHenId,
  });
  if (replaced.kind !== 'Replaced')
    throw new Error('lịch cũ không còn DaXacNhan dưới khoá');
  failAfter(input, 'markReplaced');

  return {
    kind: 'Rescheduled',
    lichHenMoiId: inserted.lichHenId,
    maLichHenMoi,
  };
}

function failAfter(
  input: RescheduleWriteInput,
  step: NonNullable<RescheduleWriteInput['throwAfter']>,
): void {
  if (input.throwAfter === step)
    throw new Error(`hoàn tác giả sau bước ${step}`);
}
