import type { EntityManager } from 'typeorm';
import type { DateRange } from '../filter/date-range.rules.js';

// Tỉ lệ sử dụng khung giờ (PLAN dashboard 5.6 (2); Q2). Chỉ đọc; chạy trong `runReadOnly` của service.
//  - Mẫu số: mọi khung của ca có `lich_lam_viec.ngay` trong khoảng (đã qua và sắp tới), TRỪ ca bị yêu cầu nghỉ phép `DaDuyet` phủ.
//    Nghỉ chờ duyệt hay bị từ chối KHÔNG trừ (MH5). Điều kiện phủ ca khớp `leaveCoversShift` của scheduling: nghỉ cả ngày, hoặc đúng ca,
//    ở mọi ngày trong `[ngay_bat_dau, ngay_ket_thuc]`.
//  - Tử số: khung `DaDat` (gồm khung của lịch vắng mặt vì lịch vẫn giữ khung). `DangGiuCho` (đang chờ thanh toán) chưa tính là đã đặt.
//  - `ngay` là cột DATE nên lọc hai đầu đóng `>= tuNgay AND <= denNgay` (PLAN 5.5). Chi nhánh theo `lich_lam_viec.chi_nhanh_id` (chi nhánh lúc phân ca).
//  - HÌNH DẠNG CÂU chọn ở dashboard X1 (đo thật 100.000 lịch, ~303.000 khung, 2.000 nghỉ phép; TRACKING mục 6): bản đầu dùng `NOT EXISTS` tương quan trên
//    từng KHUNG nối ca, MySQL tra `yeu_cau_nghi_phep` theo `bac_si_id` cho MỖI ca (khoảng 33 dòng mỗi lần) ⇒ 366 ngày, mọi chi nhánh p95 1.293 ms (tiêu chí
//    700 ms). Bản này (a) gom khung theo CA trước (`t`), (b) dựng MỘT LẦN tập ca bị nghỉ đã duyệt phủ (nhỏ: khoảng 1.300 ca), (c) loại `t` theo tập đó
//    (MySQL vật chất hoá tập con, tra bằng khoá duy nhất). Cùng nghĩa với bản đầu: số đếm khớp ở bốn trường hợp đo (30 và 366 ngày, mọi và một chi nhánh).
//    `lich_lam_viec_id` là khoá chính (NOT NULL) nên `NOT IN` không vướng bẫy NULL. Lọc trước nghỉ chạm khoảng chỉ để tập con nhỏ, không đổi kết quả.
const SLOT_USAGE_SQL = `
  SELECT COALESCE(SUM(t.phatRa), 0) AS phatRa, COALESCE(SUM(t.daDat), 0) AS daDat
  FROM (
    SELECT llv.lich_lam_viec_id, COUNT(*) AS phatRa, SUM(kg.trang_thai = 'DaDat') AS daDat
    FROM lich_lam_viec llv
    JOIN khung_gio kg ON kg.lich_lam_viec_id = llv.lich_lam_viec_id
    WHERE llv.ngay >= ? AND llv.ngay <= ?
      AND (? IS NULL OR llv.chi_nhanh_id = ?)
    GROUP BY llv.lich_lam_viec_id) t
  WHERE t.lich_lam_viec_id NOT IN (
    SELECT phu.lich_lam_viec_id
    FROM yeu_cau_nghi_phep y
    JOIN lich_lam_viec phu ON phu.bac_si_id = y.bac_si_id
      AND phu.ngay >= y.ngay_bat_dau AND phu.ngay <= y.ngay_ket_thuc
    WHERE y.trang_thai = 'DaDuyet'
      AND y.ngay_bat_dau <= ? AND y.ngay_ket_thuc >= ?
      AND (y.hinh_thuc_nghi = 'CaNgay' OR y.ca = phu.ca))`;

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
      range.denNgay,
      range.tuNgay,
    ]);
  return {
    phatRa: Number(rows[0]?.phatRa ?? 0),
    daDat: Number(rows[0]?.daDat ?? 0),
  };
}
