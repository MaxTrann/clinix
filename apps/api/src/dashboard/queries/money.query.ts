import type { EntityManager } from 'typeorm';
import type { DateTimeBounds } from '../filter/date-range.rules.js';

// Số liệu cọc và hoàn tiền (PLAN dashboard 5.6 (4), (5); Q3, T7, MH6). Chỉ đọc; chạy trong `runReadOnly` của service.
//  - Tiền cộng Ở SQL và trả CHUỖI decimal (`CAST … AS DECIMAL(20,2)` cố định hai số lẻ, kể cả tổng 0 là "0.00"): không đi qua `number` của
//    JavaScript nên tổng lớn không mất chữ số (R6, DCH-05).
//  - Chi nhánh của khoản cọc và khoản hoàn là chi nhánh của LỊCH GỐC (`giao_dich_thanh_toan.lich_hen_id` luôn trỏ lịch gốc; đổi lịch giữ bác sĩ nên
//    cùng chi nhánh). `? IS NULL OR …` là xem mọi chi nhánh.
//  - Lọc thời gian nửa mở `[tu, denKe)` theo NGÀY GIAO DỊCH (`thoi_diem_tao` của giao dịch, `thoi_diem` của dòng hoàn).

/** Cọc: thanh toán lịch hẹn QUA VÍ, thành công, số tiền > 0. Loại dòng 0đ, tiền mặt tại quầy, nạp ví. Lịch bị huỷ sau đó vẫn tính (tiền đã thu, hoàn đếm riêng). */
const DEPOSIT_SQL = `
  SELECT COUNT(*) AS soKhoan, CAST(COALESCE(SUM(gd.so_tien), 0) AS DECIMAL(20, 2)) AS tongTien
  FROM giao_dich_thanh_toan gd
  JOIN lich_hen lh ON lh.lich_hen_id = gd.lich_hen_id
  WHERE gd.loai = 'ThanhToanLichHen' AND gd.phuong_thuc = 'Vi'
    AND gd.trang_thai = 'ThanhCong' AND gd.so_tien > 0
    AND gd.thoi_diem_tao >= ? AND gd.thoi_diem_tao < ?
    AND (? IS NULL OR lh.chi_nhanh_id = ?)`;

/** Đã hoàn: mọi dòng hoàn THÀNH CÔNG (tự động và đặc biệt), tức tiền đã vào ví. Dòng thất bại không cộng. */
const REFUNDED_SQL = `
  SELECT COUNT(*) AS soKhoan, CAST(COALESCE(SUM(h.so_tien), 0) AS DECIMAL(20, 2)) AS tongTien
  FROM lich_su_hoan_tien h
  JOIN giao_dich_thanh_toan gd ON gd.giao_dich_thanh_toan_id = h.giao_dich_thanh_toan_id
  JOIN lich_hen lh ON lh.lich_hen_id = gd.lich_hen_id
  WHERE h.trang_thai = 'ThanhCong'
    AND h.thoi_diem >= ? AND h.thoi_diem < ?
    AND (? IS NULL OR lh.chi_nhanh_id = ?)`;

/**
 * Khoản hoàn ĐANG LỖI (T7): khoản thanh toán có dòng hoàn MỚI NHẤT, tính trên MỌI loại (`so_lan_thu` lớn nhất, đếm chung tự động và đặc biệt), là
 * `ThatBai`. Tại thời điểm xem, KHÔNG theo bộ lọc ngày. Cố ý không dùng câu chọn ứng viên của job thử lại (`findRetryCandidates` chỉ xét `TuDong`):
 * khoản đã được hoàn đặc biệt thành công sau lần tự động thất bại thì đã hết lỗi (DCH-04).
 */
const FAILING_REFUNDS_SQL = `
  SELECT COUNT(*) AS soKhoan
  FROM lich_su_hoan_tien h
  JOIN giao_dich_thanh_toan gd ON gd.giao_dich_thanh_toan_id = h.giao_dich_thanh_toan_id
  JOIN lich_hen lh ON lh.lich_hen_id = gd.lich_hen_id
  WHERE h.trang_thai = 'ThatBai'
    AND NOT EXISTS (
      SELECT 1 FROM lich_su_hoan_tien s
      WHERE s.giao_dich_thanh_toan_id = h.giao_dich_thanh_toan_id AND s.so_lan_thu > h.so_lan_thu)
    AND (? IS NULL OR lh.chi_nhanh_id = ?)`;

export interface MoneyTotal {
  soKhoan: number;
  /** Chuỗi decimal hai số lẻ, ví dụ "710000.00" */
  tongTien: string;
}

interface MoneyRow {
  soKhoan: number | string;
  tongTien: string;
}

function toMoneyTotal(rows: MoneyRow[]): MoneyTotal {
  return {
    soKhoan: Number(rows[0]?.soKhoan ?? 0),
    tongTien: String(rows[0]?.tongTien ?? '0.00'),
  };
}

export async function sumDeposits(
  manager: EntityManager,
  bounds: DateTimeBounds,
  chiNhanhId: string | null,
): Promise<MoneyTotal> {
  return toMoneyTotal(
    await manager.query(DEPOSIT_SQL, [
      bounds.tu,
      bounds.denKe,
      chiNhanhId,
      chiNhanhId,
    ]),
  );
}

export async function sumRefunds(
  manager: EntityManager,
  bounds: DateTimeBounds,
  chiNhanhId: string | null,
): Promise<MoneyTotal> {
  return toMoneyTotal(
    await manager.query(REFUNDED_SQL, [
      bounds.tu,
      bounds.denKe,
      chiNhanhId,
      chiNhanhId,
    ]),
  );
}

export async function countFailingRefunds(
  manager: EntityManager,
  chiNhanhId: string | null,
): Promise<number> {
  const rows: { soKhoan: number | string }[] = await manager.query(
    FAILING_REFUNDS_SQL,
    [chiNhanhId, chiNhanhId],
  );
  return Number(rows[0]?.soKhoan ?? 0);
}
