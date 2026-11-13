import { parseAppointmentCore, type AppointmentCore } from './appointment-core';
import {
  readAmount,
  readCount,
  readIsoDateTime,
  readList,
  readRecord,
  readText,
} from './response-readers';

// Dòng, trang và chi tiết lịch hẹn của hai route ĐỌC của vận hành: Lễ tân (B3, booking F8) và Quản trị viên (B4, F10). Hình dạng GIỐNG HỆT nhau nên chỉ có MỘT bộ đọc: F8 viết ở
// `reception/api/`, chuyển lên `common/` ở F10 (Lễ tân và Quản trị viên cùng dùng; Quản trị viên cộng thêm `lichSuTrangThai` ở chi tiết). Thiếu một khoá hay sai kiểu ⇒
// `UnexpectedResponseError` (phản hồi không dùng được); khoá thừa của API không được chép theo, nên không bao giờ lọt ra màn hình.

// MỘT dòng danh sách: ĐÚNG mười một khoá (danh sách trắng; không email, ngày sinh, địa chỉ, `lich_hen_id`): mười khoá chung (`AppointmentCore`) cộng `nguoiDat` (tài khoản đặt lịch,
// kèm SĐT: Q32). `nguoiKham` là người được khám, `nguoiDat` là người đặt: hai người KHÔNG được lẫn (DSV-13). Dòng KHÔNG có `chuyenDuoc`, `conPhaiThu`, `hanThanhToan`, `lyDoKham`:
// mỗi dòng sẽ là một lần gọi cổng nên chỉ chi tiết có (quyết định B3).
export interface OperationsAppointment extends AppointmentCore {
  nguoiDat: { hoTen: string; soDienThoai: string };
}

// `{ items, total, page, pageSize }`: không có `demTheoTrangThai` (B3, câu (b)), nên giao diện KHÔNG có thẻ lọc trạng thái kèm số đếm và không tự đếm
export interface OperationsAppointmentPage {
  items: OperationsAppointment[];
  total: number;
  page: number;
  pageSize: number;
}

// Chi tiết: mười một khoá của dòng cộng năm khoá dưới (mười sáu khoá). `chuyenDuoc` là các trạng thái người xem ĐANG chuyển tới được (backend tính bằng `allowedTargets` theo vai
// trò): web KHÔNG có ma trận thứ hai, nút hiện theo mảng này. Giữ mã thô (chuỗi); mã ngoài tập đích của vai trò bị bỏ qua ở nơi dựng nút. `conPhaiThu` chỉ ở `DaXacNhan` (còn lại
// `null`); chuỗi decimal, không tính toán.
export interface OperationsAppointmentDetail extends OperationsAppointment {
  lyDoKham: string | null;
  // Chữ tự do của người huỷ hay của nhân sự
  lyDoHuy: string | null;
  // ISO 8601 UTC
  hanThanhToan: string | null;
  chuyenDuoc: string[];
  conPhaiThu: string | null;
}

export function parseOperationsAppointment(
  raw: unknown,
): OperationsAppointment {
  const row = readRecord(raw);
  const booker = readRecord(row.nguoiDat);
  return {
    ...parseAppointmentCore(row),
    nguoiDat: {
      hoTen: readText(booker.hoTen),
      soDienThoai: readText(booker.soDienThoai),
    },
  };
}

export function parseOperationsAppointmentPage(
  raw: unknown,
): OperationsAppointmentPage {
  const body = readRecord(raw);
  return {
    items: readList(body.items).map(parseOperationsAppointment),
    total: readCount(body.total),
    page: readCount(body.page, 1),
    pageSize: readCount(body.pageSize, 1),
  };
}

// Đủ mười sáu khoá: mười một của dòng cộng `lyDoKham`, `lyDoHuy`, `hanThanhToan`, `chuyenDuoc`, `conPhaiThu`. Khoá vốn có thể `null` nhưng luôn có mặt: thiếu ⇒ không dùng được.
export function parseOperationsDetail(
  raw: unknown,
): OperationsAppointmentDetail {
  const body = readRecord(raw);
  return {
    ...parseOperationsAppointment(body),
    lyDoKham: body.lyDoKham === null ? null : readText(body.lyDoKham),
    lyDoHuy: body.lyDoHuy === null ? null : readText(body.lyDoHuy),
    hanThanhToan:
      body.hanThanhToan === null ? null : readIsoDateTime(body.hanThanhToan),
    chuyenDuoc: readList(body.chuyenDuoc).map((target) => readText(target)),
    conPhaiThu: body.conPhaiThu === null ? null : readAmount(body.conPhaiThu),
  };
}
