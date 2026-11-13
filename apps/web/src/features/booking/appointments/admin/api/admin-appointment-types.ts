import type { AppointmentState } from '../../common/appointment-status';
import type { OperationsAppointmentDetail } from '../../common/operations-appointment';
import type { RefundAmount } from '../../common/refund-types';

// Kiểu dữ liệu của "Lịch hẹn" của Quản trị viên (booking F10; hợp đồng đọc từ mã backend B4 và B14: TRACKING 3.33.1, 3.31, 3.35). Dòng danh sách, trang và chi tiết 16 khoá có CÙNG
// hình dạng với Lễ tân nên dùng chung `common/operations-appointment.ts`; ở đây chỉ có phần riêng của Quản trị viên.

// ---- Panel "Lịch sử trạng thái" (B4-E) ----
// Ba loại mục máy chủ dựng từ `thoi_diem_tao`, `thoi_diem_huy` và nhật ký `OverrideLichHen`. `tuTrangThai` chỉ có ở `OverrideLichHen`; `denTrangThai` ở `HuyLich` (luôn `DaHuy`) và
// `OverrideLichHen`; `lyDo` ở `HuyLich` (có thể `null`) và `OverrideLichHen`. Chữ `lyDo` là chữ tự do của nhân sự: chỉ hiện dưới dạng văn bản đã thoát. KHÔNG có người thực hiện
// (B4 không trả) và KHÔNG có mốc tiếp đón, Vắng mặt, xác nhận thanh toán (TECH_DEBT 111).
export type HistoryKind = 'TaoLich' | 'HuyLich' | 'OverrideLichHen';

export interface HistoryEntry {
  // ISO 8601 UTC
  thoiDiem: string;
  loai: HistoryKind;
  tuTrangThai: string | null;
  denTrangThai: string | null;
  lyDo: string | null;
}

// Chi tiết: mười sáu khoá của Lễ tân cộng `lichSuTrangThai` (đúng mười bảy khoá). Thứ tự mục do máy chủ quyết (`TaoLich` đầu, phần còn lại theo thời điểm tăng dần): web không sắp lại.
export interface AdminAppointmentDetail extends OperationsAppointmentDetail {
  lichSuTrangThai: HistoryEntry[];
}

// Bộ lọc và trang của một lần tải danh sách. Mọi bộ lọc tuỳ chọn; giá trị rỗng không được gửi (B4 trả 400 với `q=` rỗng). Ngày là chuỗi `YYYY-MM-DD` (ngày Việt Nam, không qua
// `Date`). `chiNhanhId` CHỈ do Quản trị viên Toàn hệ thống gửi (Chi nhánh bị ép theo chi nhánh được gán ở backend, nhưng web cũng KHÔNG gửi). KHÔNG có `pageSize` (mặc định 20 của
// máy chủ) và KHÔNG có `thanhToan` (400 `TRUONG_KHONG_DUOC_PHEP`).
export interface AdminListQuery {
  trangThai?: AppointmentState;
  chiNhanhId?: string;
  chuyenKhoaId?: string;
  bacSiId?: string;
  dichVuKhamId?: string;
  tuNgay?: string;
  denNgay?: string;
  q?: string;
  page: number;
}

// ---- Route ghi `POST /admin/appointments/:maLichHen/override-status` (B14) ----
// Bốn đích Quản trị viên làm được (`allowedTargets('QuanTriVien', …)` của backend, trừ `HoanThanh`, `ChoThanhToan`, `DaDoiLich` không bao giờ là đích): giao diện CHỈ gửi bốn giá trị này.
export type OverrideTarget = 'DaTiepDon' | 'DaXacNhan' | 'VangMat' | 'DaHuy';

// Thân gửi đi: `lyDo` bắt buộc ở MỌI đích (đã cắt khoảng trắng, 1 đến 255 đơn vị UTF-16)
export interface OverrideBody {
  trangThai: OverrideTarget;
  lyDo: string;
}

// 200: `DaHuy` thêm `hoanCoc` = số hoàn THỰC TẾ (100% số đã thu; chuỗi decimal, KHÔNG tính ở client; `null` khi chưa thu đồng nào)
export type OverrideResult =
  | { maLichHen: string; trangThai: 'DaHuy'; hoanCoc: RefundAmount | null }
  | { maLichHen: string; trangThai: 'DaTiepDon' | 'DaXacNhan' | 'VangMat' };
