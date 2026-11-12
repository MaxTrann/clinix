import type { AppointmentCore } from '../../common/appointment-core';
import type { AppointmentState } from '../../common/appointment-status';

// Kiểu dữ liệu của "Lịch hẹn của tôi" (booking F1; hợp đồng `GET /patient/appointments` ở PLAN 5.9, TRACKING 3.13.2).

// MỘT dòng danh sách: ĐÚNG mười hai khoá của B1 (danh sách trắng; `lich_hen_id`, `benh_nhan_id`, email, SĐT… không bao giờ có): mười khoá chung với Lễ tân
// (`AppointmentCore`, F8 chuyển lên `common/`) cộng `hanThanhToan`, `choPhepHuy`. Bộ đọc giữ đủ mười hai khoá (F2 dùng lại) và bỏ khoá thừa. Figma `411:2`
// chỉ vẽ sáu khoá của danh sách; chi tiết là việc của F2.
export interface PatientAppointment extends AppointmentCore {
  hanThanhToan: string | null;
  choPhepHuy: boolean;
}

// Số lịch theo từng trạng thái: đủ sáu khoá, áp mọi bộ lọc TRỪ `trangThai[]` (B1), không có `DaDoiLich`. KHÔNG tự đếm lại từ `items`.
export type StatusCounts = Record<AppointmentState, number>;

export interface PatientAppointmentPage {
  items: PatientAppointment[];
  total: number;
  page: number;
  pageSize: number;
  demTheoTrangThai: StatusCounts;
}

// Giá trị `hoSoNguoiThanId` cho "bản thân" (B1: `BanThan` đúng chữ ⇒ lịch của chính Bệnh nhân)
export const OWN_PROFILE = 'BanThan';

// Bộ lọc và trang của một lần tải. Mọi bộ lọc tuỳ chọn; giá trị rỗng không được gửi (B1 trả 400 với `q=` rỗng). Ngày là chuỗi `YYYY-MM-DD`
// (ngày Việt Nam, không qua `Date`). Không có `nhom` (không thêm Sắp tới/Lịch sử vào giao diện, Đại duyệt 12/11/2026) và không có `pageSize`
// (dùng mặc định 20 của máy chủ, đếm trang theo `pageSize` trả về).
export interface AppointmentListQuery {
  trangThai?: AppointmentState;
  hoSoNguoiThanId?: string;
  bacSiId?: string;
  chuyenKhoaId?: string;
  tuNgay?: string;
  denNgay?: string;
  q?: string;
  page: number;
}

// Lựa chọn của bộ lọc Người khám. Id là chuỗi (BIGINT). Lựa chọn Bác sĩ, Chuyên khoa dùng chung với Lễ tân nên ở `common/filter-option-types.ts` (F8).
export interface RelativeOption {
  hoSoNguoiThanId: string;
  hoTen: string;
  // false = hồ sơ đã ngừng sử dụng (vẫn có thể có lịch trong lịch sử nên vẫn là một lựa chọn)
  trangThaiHieuLuc: boolean;
}

// ---- Chi tiết và huỷ (booking F2; hợp đồng đọc từ mã backend B2, B10: TRACKING 3.27 F2-D) ----

// Tóm tắt thanh toán của cổng `payment` (B2: hình dạng là [đề xuất], `payment` chốt sau). Chỉ đọc hai khoá hiển thị; chuỗi decimal, không tính toán.
export interface PaymentSummary {
  daThu: string;
  conPhaiThu: string;
}

// Lần hoàn cọc mới nhất của cổng `wallet` (cùng lưu ý). `trangThai` chỉ hai giá trị; giá trị lạ ⇒ phản hồi không dùng được.
export type RefundStatus = 'ThanhCong' | 'ThatBai';
export interface RefundSummary {
  soTien: string;
  trangThai: RefundStatus;
}

// Chi tiết = mười hai khoá của dòng danh sách + `lyDoKham`, `thanhToan`, `hoanTien` (`null` tới khi `payment`, `wallet` có), `thoiGianMayChu`.
// `choPhepHuy` là kết quả của CHÍNH ma trận trạng thái của backend: nút huỷ theo nó, web không có ma trận thứ hai.
export interface PatientAppointmentDetail extends PatientAppointment {
  lyDoKham: string | null;
  thanhToan: PaymentSummary | null;
  hoanTien: RefundSummary | null;
  // ISO 8601 UTC; F2 chưa dùng (không đếm ngược), F6 dùng để bù lệch đồng hồ
  thoiGianMayChu: string;
}

// Số hoàn: `tyLe` nguyên 0 đến 100, `soTien` chuỗi decimal của máy chủ. Client KHÔNG tính ra số này, chỉ hiện.
export interface RefundAmount {
  tyLe: number;
  soTien: string;
}

// `mocApDung` là `so_gio_truoc_toi_thieu` của mốc đã áp dụng, `null` khi không có mốc hay đã quá giờ hẹn
export interface RefundPreview extends RefundAmount {
  mocApDung: number | null;
}

// `GET …/cancel-preview` (200): `choPhepHuy = false` ⇒ có `lyDoKhongHuy` (mã `LICH_HEN_KHONG_CHO_HUY`), `hoanCoc` luôn `null`; `choPhepHuy = true` ⇒
// `hoanCoc` là `null` khi chưa thu đồng nào (cọc 0đ hay chưa thanh toán: "Không hoàn"). Số này chỉ là DỰ KIẾN (Q18).
export type CancelPreview =
  | { choPhepHuy: false; lyDoKhongHuy: string | null }
  | { choPhepHuy: true; hoanCoc: RefundPreview | null };

// `POST …/cancel` (200): số hoàn THỰC TẾ (tính lại lúc xác nhận); `trangThai` luôn `DaHuy` nên không giữ lại
export interface CancelResult {
  maLichHen: string;
  hoanCoc: RefundAmount | null;
}
