import type { EntityManager } from 'typeorm';
import type { DateTimeBounds } from '../filter/date-range.rules.js';

// Số lịch ĐẶT MỚI theo ngày đặt (PLAN dashboard 5.6 (6); Q5). Chỉ đọc; chạy trong `runReadOnly` của service. Điểm ngày và tuần do `buildTrend` gom.
//  - `lich_hen_truoc_id IS NULL`: bỏ dòng sinh ra do đổi lịch (đổi lịch tạo dòng mới với `thoi_diem_tao` là lúc đổi, không phải một lượt đăng ký mới).
//  - MỌI trạng thái, gồm lịch đã huỷ và lịch quá hạn thanh toán (bị huỷ tự động): đếm nhu cầu đăng ký, không đếm lịch còn hiệu lực.
//  - Lọc nửa mở trên cột (dùng được chỉ mục); `DATE_FORMAT` chỉ ở phần GOM NHÓM, không ở `WHERE`. `thoi_diem_tao` lưu giờ Việt Nam nên ngày gom ra là
//    ngày Việt Nam, không phụ thuộc múi giờ của máy chạy API (DXH-04).
const TREND_SQL = `
  SELECT DATE_FORMAT(lh.thoi_diem_tao, '%Y-%m-%d') AS ngay, COUNT(*) AS soLuong
  FROM lich_hen lh
  WHERE lh.lich_hen_truoc_id IS NULL
    AND lh.thoi_diem_tao >= ? AND lh.thoi_diem_tao < ?
    AND (? IS NULL OR lh.chi_nhanh_id = ?)
  GROUP BY ngay`;

/** Số lịch đặt mới của từng ngày có lịch (ngày không có lịch thì không có khoá). */
export async function countBookingsPerDay(
  manager: EntityManager,
  bounds: DateTimeBounds,
  chiNhanhId: string | null,
): Promise<Map<string, number>> {
  const rows: { ngay: string; soLuong: number | string }[] =
    await manager.query(TREND_SQL, [
      bounds.tu,
      bounds.denKe,
      chiNhanhId,
      chiNhanhId,
    ]);
  return new Map(rows.map((row) => [row.ngay, Number(row.soLuong)]));
}
