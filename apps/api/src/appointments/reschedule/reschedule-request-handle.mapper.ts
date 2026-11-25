import type {
  ApproveRescheduleRequestResult,
  RejectRescheduleRequestResult,
} from './reschedule-request-handle.dto.js';
import type { RescheduleOutcome } from './reschedule.types.js';

// Dựng JSON phản hồi của hai route duyệt và từ chối (reschedule B9; PLAN reschedule 5.8; TRACKING reschedule 1.13). Hàm THUẦN: MỘT chỗ liệt kê khoá (danh sách trắng: BDL-12), nên test và đột biến chỉ cần nhìn
// một file. Không có `lich_hen_id`, id yêu cầu, tên, SĐT, email, ghi chú. `thoiGianMayChu` do người gọi truyền: lấy SAU commit.

/** 200 `DaDuyet`: mã lịch MỚI (không id nội bộ), giờ của lịch mới. `trangThai` của lịch mới luôn `DaXacNhan` (B4 chèn thẳng `DaXacNhan`; kết quả của B4 không mang trạng thái). */
export function toApprovedResult(
  outcome: Extract<RescheduleOutcome, { kind: 'Rescheduled' }>,
  serverTime: Date,
): ApproveRescheduleRequestResult {
  return {
    yeuCau: { trangThai: 'DaDuyet' },
    lichHenMoi: {
      maLichHen: outcome.maLichHenMoi,
      thoiGian: outcome.thoiGianMoi.toISOString(),
      trangThai: 'DaXacNhan',
    },
    thoiGianMayChu: serverTime.toISOString(),
  };
}

/** 200 `TuChoi`: chỉ trạng thái và giờ máy chủ. */
export function toRejectedResult(
  serverTime: Date,
): RejectRescheduleRequestResult {
  return {
    yeuCau: { trangThai: 'TuChoi' },
    thoiGianMayChu: serverTime.toISOString(),
  };
}
