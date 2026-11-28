import type { EntityManager } from 'typeorm';
import type { DateRange } from '../filter/date-range.rules.js';

// Tỉ lệ sử dụng khung giờ (PLAN dashboard 5.6 (2); Q2). Chỉ đọc; chạy trong `runReadOnly` của service.
//  - Mẫu số: mọi khung của ca có `lich_lam_viec.ngay` trong khoảng (đã qua và sắp tới), TRỪ ca bị yêu cầu nghỉ phép `DaDuyet` phủ.
//    Nghỉ chờ duyệt hay bị từ chối KHÔNG trừ (MH5). Điều kiện phủ ca khớp `leaveCoversShift` của scheduling: nghỉ cả ngày, hoặc đúng ca,
//    ở mọi ngày trong `[ngay_bat_dau, ngay_ket_thuc]`.
//  - Tử số: khung `DaDat` (gồm khung của lịch vắng mặt vì lịch vẫn giữ khung). `DangGiuCho` (đang chờ thanh toán) chưa tính là đã đặt.
//  - `ngay` là cột DATE nên lọc hai đầu đóng `>= tuNgay AND <= denNgay` (PLAN 5.5). Chi nhánh theo `lich_lam_viec.chi_nhanh_id` (chi nhánh lúc phân ca).
const SLOT_USAGE_SQL = `
  SELECT COUNT(*) AS phatRa, COALESCE(SUM(kg.trang_thai = 'DaDat'), 0) AS daDat
  FROM lich_lam_viec llv
  JOIN khung_gio kg ON kg.lich_lam_viec_id = llv.lich_lam_viec_id
  WHERE llv.ngay >= ? AND llv.ngay <= ?
    AND (? IS NULL OR llv.chi_nhanh_id = ?)
    AND NOT EXISTS (
      SELECT 1 FROM yeu_cau_nghi_phep y
      WHERE y.bac_si_id = llv.bac_si_id
        AND y.trang_thai = 'DaDuyet'
        AND y.ngay_bat_dau <= llv.ngay AND y.ngay_ket_thuc >= llv.ngay
        AND (y.hinh_thuc_nghi = 'CaNgay' OR y.ca = llv.ca))`;

export interface SlotUsage {
  /** Mẫu số: khung đã phát ra, trừ ca nghỉ đã duyệt */
  phatRa: number;
  /** Tử số: khung đã đặt */
  daDat: number;
}

/** Đếm khung giờ của các ca trong khoảng ngày; `chiNhanhId` NULL là mọi chi nhánh. */
export async function countSlotUsage(
  manager: EntityManager,
  range: DateRange,
  chiNhanhId: string | null,
): Promise<SlotUsage> {
  const rows: { phatRa: number | string; daDat: number | string }[] =
    await manager.query(SLOT_USAGE_SQL, [
      range.tuNgay,
      range.denNgay,
      chiNhanhId,
      chiNhanhId,
    ]);
  return {
    phatRa: Number(rows[0]?.phatRa ?? 0),
    daDat: Number(rows[0]?.daDat ?? 0),
  };
}
