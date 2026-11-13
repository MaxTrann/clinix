import type { AppointmentCore } from '../../common/appointment-core';
import type { AppointmentState } from '../../common/appointment-status';
import type { RefundAmount } from '../../common/refund-types';

// Kiểu dữ liệu của "Quản lý lịch hẹn" của Lễ tân (booking F8; hợp đồng đọc từ mã backend B3: TRACKING 3.17.1 và 3.28 F8-D).

// MỘT dòng danh sách: ĐÚNG mười một khoá của B3 (danh sách trắng; không email, ngày sinh, địa chỉ, `lich_hen_id`): mười khoá chung (`AppointmentCore`) cộng
// `nguoiDat` (tài khoản đặt lịch, kèm SĐT: Q32). `nguoiKham` là người được khám, `nguoiDat` là người đặt: hai người KHÔNG được lẫn (DSV-13). Dòng KHÔNG có
// `chuyenDuoc`, `conPhaiThu`, `hanThanhToan`, `lyDoKham`: mỗi dòng sẽ là một lần gọi cổng nên chỉ chi tiết có (quyết định B3).
export interface ReceptionAppointment extends AppointmentCore {
  nguoiDat: { hoTen: string; soDienThoai: string };
}

// `GET /reception/appointments` (200): không có `demTheoTrangThai` (B3, câu (b)), nên giao diện KHÔNG có thẻ lọc trạng thái kèm số đếm và không tự đếm
export interface ReceptionAppointmentPage {
  items: ReceptionAppointment[];
  total: number;
  page: number;
  pageSize: number;
}

// Chi tiết: ĐÚNG mười sáu khoá = mười một khoá của dòng cộng bốn khoá dưới (và `lyDoKham`). `chuyenDuoc` là các trạng thái Lễ tân ĐANG chuyển tới được
// (`allowedTargets('LeTan', …)` của backend, đã tính cả cửa sổ tiếp đón và còn phải thu): web KHÔNG có ma trận thứ hai, nút hiện theo mảng này. Giữ mã thô (chuỗi):
// mã không phải một trong ba đích của Lễ tân bị bỏ qua ở `reception-actions.tsx`. `conPhaiThu` chỉ ở `DaXacNhan` (còn lại `null`); chuỗi decimal, không tính toán.
export interface ReceptionAppointmentDetail extends ReceptionAppointment {
  lyDoKham: string | null;
  // Lễ tân được thấy (Q27: Bệnh nhân thì không); chữ tự do của người huỷ
  lyDoHuy: string | null;
  // ISO 8601 UTC
  hanThanhToan: string | null;
  chuyenDuoc: string[];
  conPhaiThu: string | null;
}

// Bộ lọc và trang của một lần tải. Mọi bộ lọc tuỳ chọn; giá trị rỗng không được gửi (B3 trả 400 với `q=` rỗng). Ngày là chuỗi `YYYY-MM-DD` (ngày Việt Nam, không qua
// `Date`). KHÔNG có `dichVuKhamId` (Figma không có ô lọc dịch vụ), `chiNhanhId` (Lễ tân bị ép theo chi nhánh của mình ở backend, tham số bị bỏ qua) và `pageSize`
// (dùng mặc định 20 của máy chủ, đếm trang theo `pageSize` trả về).
export interface ReceptionListQuery {
  trangThai?: AppointmentState;
  chuyenKhoaId?: string;
  bacSiId?: string;
  tuNgay?: string;
  denNgay?: string;
  q?: string;
  page: number;
}

// ---- Route ghi `POST /reception/appointments/:maLichHen/status` (booking F9; hợp đồng B12: TRACKING 3.26 B12-E, 3.30 F9-D) ----

// Ba đích mà Lễ tân làm được (`allowedTargets('LeTan', …)` của backend); giao diện CHỈ gửi ba giá trị này (backend nhận đủ bảy để trả 409 đúng mã).
export type ReceptionTarget = 'DaTiepDon' | 'VangMat' | 'DaHuy';

// Thân gửi đi: `lyDo` CHỈ có ở `DaHuy` (bắt buộc, đã cắt khoảng trắng, 1 đến 255 đơn vị UTF-16); `VangMat` và `DaTiepDon` KHÔNG có `lyDo` (Q27).
export type StatusChangeBody =
  { trangThai: 'DaHuy'; lyDo: string } | { trangThai: 'VangMat' | 'DaTiepDon' };

// 200: `DaHuy` thêm `hoanCoc` = số hoàn THỰC TẾ (chuỗi decimal, KHÔNG tính ở client; `null` khi chưa thu đồng nào). Không có số lần no-show hay cờ khoá (Figma `489:2` không có).
export type StatusChangeResult =
  | { maLichHen: string; trangThai: 'DaHuy'; hoanCoc: RefundAmount | null }
  | { maLichHen: string; trangThai: 'VangMat' | 'DaTiepDon' };
