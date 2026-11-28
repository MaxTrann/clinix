import type { EntityManager } from 'typeorm';
import type { DateTimeBounds } from '../filter/date-range.rules.js';

// Số lịch hẹn theo NGÀY KHÁM `lich_hen.thoi_gian` (PLAN dashboard 5.6 (1), (3); Q1, Q4). Chỉ đọc; chạy trong `runReadOnly` của service.
//  - "Lịch khám" = bốn trạng thái đã chốt lịch: `DaXacNhan`, `DaTiepDon`, `HoanThanh`, `VangMat` (không `ChoThanhToan`, `DaHuy`, `DaDoiLich`).
//  - Mẫu số vắng mặt = lịch ĐÃ CÓ KẾT QUẢ: `VangMat`, `DaTiepDon`, `HoanThanh` (lịch `DaXacNhan` chưa tới giờ thì chưa biết có đến hay không).
//  - Lọc nửa mở `thoi_gian >= ? AND thoi_gian < ?` (không bọc cột bằng `DATE(...)`, luật AR-05 của booking), mốc là chuỗi giờ Việt Nam.
//  - Chi nhánh: `? IS NULL OR chi_nhanh_id = ?` (NULL = xem tất cả). Câu là HẰNG, giá trị luôn đi qua tham số. X1 được đổi hình dạng câu để dùng chỉ mục.
const APPOINTMENT_METRICS_SQL = `
  SELECT
    COUNT(*) AS lichKham,
    COALESCE(SUM(lh.trang_thai = 'HoanThanh'), 0) AS hoanThanh,
    COALESCE(SUM(lh.trang_thai = 'VangMat'), 0) AS vangMat,
    COALESCE(SUM(lh.trang_thai IN ('VangMat', 'DaTiepDon', 'HoanThanh')), 0) AS coKetQua
  FROM lich_hen lh
  WHERE lh.thoi_gian >= ? AND lh.thoi_gian < ?
    AND lh.trang_thai IN ('DaXacNhan', 'DaTiepDon', 'HoanThanh', 'VangMat')
    AND (? IS NULL OR lh.chi_nhanh_id = ?)`;

export interface AppointmentMetrics {
  /** Lịch ở bốn trạng thái đã chốt */
  lichKham: number;
  hoanThanh: number;
  /** Tử số của tỉ lệ vắng mặt */
  vangMat: number;
  /** Mẫu số của tỉ lệ vắng mặt: vắng mặt + đã tiếp đón + hoàn thành */
  coKetQua: number;
}

interface MetricsRow {
  lichKham: number | string;
  hoanThanh: number | string;
  vangMat: number | string;
  coKetQua: number | string;
}

/** Đếm lịch có `thoi_gian` trong `[tu, denKe)`; `chiNhanhId` NULL là mọi chi nhánh. `SUM` của MySQL trả DECIMAL (chuỗi) nên đổi sang số. */
export async function countAppointments(
  manager: EntityManager,
  bounds: DateTimeBounds,
  chiNhanhId: string | null,
): Promise<AppointmentMetrics> {
  const rows: MetricsRow[] = await manager.query(APPOINTMENT_METRICS_SQL, [
    bounds.tu,
    bounds.denKe,
    chiNhanhId,
    chiNhanhId,
  ]);
  const row = rows[0];
  return {
    lichKham: Number(row?.lichKham ?? 0),
    hoanThanh: Number(row?.hoanThanh ?? 0),
    vangMat: Number(row?.vangMat ?? 0),
    coKetQua: Number(row?.coKetQua ?? 0),
  };
}
