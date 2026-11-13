import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import type { OperationsAppointmentDetail } from './operations-appointments.dto.js';

// Kiểu đầu ra riêng của QUẢN TRỊ VIÊN (task B4; PLAN booking 5.8, 5.9, Q28, Q32; TRACKING 3.33.1). Query dùng lại `OperationsAppointmentsQueryDto`, dòng danh sách dùng lại
// `OperationsAppointmentItem` (mười một khoá): chỉ chi tiết và panel "Lịch sử trạng thái" là của Quản trị viên.

/**
 * Một mục của panel "Lịch sử trạng thái" (Figma `512:2`, L26). `thoiDiem` là ISO 8601 UTC. Mỗi loại có ĐÚNG các khoá dưới đây, không khoá nào khác (không người thực hiện, không id nhật ký):
 *  - `TaoLich`: từ `lich_hen.thoi_diem_tao`. Không nói trạng thái đầu vì DB không lưu (cọc 0đ hay đổi lịch có thể không bắt đầu ở `ChoThanhToan`).
 *  - `HuyLich`: từ `thoi_diem_huy` và `ly_do_huy` (huỷ của Bệnh nhân, Lễ tân, hết hạn giữ chỗ, hệ thống); `lyDo` là `null` khi lịch không có lý do.
 *  - `OverrideLichHen`: từ dòng nhật ký hành động `OverrideLichHen` của lịch; `lyDo` do Quản trị viên nhập (chữ tự do, giữ nguyên từng ký tự).
 * Tiếp đón, Vắng mặt và xác nhận thanh toán KHÔNG có mục: không có cột thời điểm và không ghi nhật ký (TECH_DEBT dòng 111).
 */
export type StatusHistoryEntry =
  | { thoiDiem: string; loai: 'TaoLich' }
  | {
      thoiDiem: string;
      loai: 'HuyLich';
      denTrangThai: 'DaHuy';
      lyDo: string | null;
    }
  | {
      thoiDiem: string;
      loai: 'OverrideLichHen';
      tuTrangThai: TrangThaiLichHen;
      denTrangThai: TrangThaiLichHen;
      lyDo: string;
    };

/**
 * Chi tiết cho Quản trị viên: ĐÚNG 17 khoá = mười sáu khoá của chi tiết Lễ tân (mười một khoá của dòng, `lyDoKham`, `lyDoHuy`, `hanThanhToan`, `chuyenDuoc`, `conPhaiThu`) cộng `lichSuTrangThai`.
 * `chuyenDuoc` là các đích mà QUẢN TRỊ VIÊN được chuyển tới (ma trận Q24); `conPhaiThu` chỉ ở `DaXacNhan`, trạng thái khác là `null`. Không `thanhToan`: ẩn tới khi có `payment` (câu (b) của B4).
 */
export interface AdminAppointmentDetail extends OperationsAppointmentDetail {
  chuyenDuoc: TrangThaiLichHen[];
  conPhaiThu: string | null;
  lichSuTrangThai: StatusHistoryEntry[];
}
