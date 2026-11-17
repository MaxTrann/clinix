import { UnexpectedResponseError } from '../../../../shared/api/errors';
import { RATING_MAX_STARS, RATING_MIN_STARS } from './patient-exam-types';
import type {
  AdminReviewCounts,
  AdminReviewDetail,
  AdminReviewItem,
  AdminReviewPage,
  HideResult,
} from './admin-review-types';

// Bộ đọc CHẶT hai phản hồi của Quản trị viên (doctor-exam F7; WKD-11, WKD-12; như F2, F4, F5, F6): chép từng khoá cần dùng, khoá lạ bị BỎ, thiếu khoá hay sai kiểu ở BẤT KỲ chỗ nào ⇒ `UnexpectedResponseError`
// ⇒ hộp lỗi có `Thử lại`, không vẽ dữ liệu dở dang. Hàm thuần, không đụng DOM. Không sửa bộ đọc của Bệnh nhân (`patient-exam-readers.ts`).
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DIGITS = /^\d+$/;

function fail(): never {
  throw new UnexpectedResponseError(200);
}

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail();
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : fail();
}

function readFilled(value: unknown): string {
  const text = readString(value);
  return text === '' ? fail() : text;
}

// BIGINT dạng chuỗi chữ số: giữ NGUYÊN chuỗi, không đổi sang số
function readBigId(value: unknown): string {
  const text = readString(value);
  return DIGITS.test(text) ? text : fail();
}

function readBoolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : fail();
}

// Số đếm: số nguyên không âm (không chuỗi "3", không thập phân, không âm)
function readCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : fail();
}

function readIsoDateTime(value: unknown): string {
  const text = readString(value);
  return ISO_DATE_TIME.test(text) && !Number.isNaN(Date.parse(text))
    ? text
    : fail();
}

// Số sao: nguyên 1 đến 5 (không chuỗi "5", không 3,5, không null)
function readStars(value: unknown): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= RATING_MIN_STARS &&
    value <= RATING_MAX_STARS
    ? value
    : fail();
}

// Tám khoá chung của dòng danh sách và chi tiết. `nguoiDanhGia.hoTen` được phép RỖNG (dữ liệu mẫu hỏng, L9): nơi hiển thị quyết định chữ thay thế.
function readItem(row: Record<string, unknown>): AdminReviewItem {
  const doctor = readObject(row.bacSi);
  const branch = readObject(row.chiNhanh);
  const author = readObject(row.nguoiDanhGia);
  return {
    danhGiaId: readBigId(row.danhGiaId),
    bacSi: {
      bacSiId: readBigId(doctor.bacSiId),
      hoTen: readString(doctor.hoTen),
    },
    chiNhanh: {
      chiNhanhId: readBigId(branch.chiNhanhId),
      ten: readString(branch.ten),
    },
    nguoiDanhGia: { hoTen: readString(author.hoTen) },
    soSao: readStars(row.soSao),
    nhanXet: row.nhanXet === null ? null : readString(row.nhanXet),
    thoiDiemTao: readIsoDateTime(row.thoiDiemTao),
    biAn: readBoolean(row.biAn),
  };
}

// Đủ hai khoá `HienThi` và `DaAn`, mỗi khoá là số đếm hợp lệ
function readCounts(value: unknown): AdminReviewCounts {
  const counts = readObject(value);
  return {
    HienThi: readCount(counts.HienThi),
    DaAn: readCount(counts.DaAn),
  };
}

export function parseAdminReviewPage(body: unknown): AdminReviewPage {
  const page = readObject(body);
  if (!Array.isArray(page.items)) fail();
  return {
    items: (page.items as unknown[]).map((row) => readItem(readObject(row))),
    total: readCount(page.total),
    page: readCount(page.page),
    pageSize: readCount(page.pageSize),
    demTheoTrangThai: readCounts(page.demTheoTrangThai),
  };
}

// 200 của `POST …/hide` (F8; WKD-21): đúng `{ danhGiaId, biAn: true }`. `danhGiaId` là chuỗi chữ số giữ NGUYÊN; `biAn` phải đúng `true`; thiếu khoá hay sai kiểu ⇒ `UnexpectedResponseError` (nơi gọi coi là "chưa rõ", máy chủ có thể đã ẩn); khoá thừa bị BỎ như các bộ đọc khác.
export function parseHideResult(body: unknown): HideResult {
  const result = readObject(body);
  const danhGiaId = readBigId(result.danhGiaId);
  if (result.biAn !== true) fail();
  return { danhGiaId, biAn: true };
}

// `lyDoAn` là khoá TUỲ CHỌN: vắng khi chưa ẩn (và khi đã ẩn mà không có lý do lưu). Có mặt khi chưa ẩn, hay không phải chuỗi (kể cả `null`), là hình dạng LẠ ⇒ lỗi, không đoán.
export function parseAdminReviewDetail(body: unknown): AdminReviewDetail {
  const row = readObject(body);
  const item = readItem(row);
  const lyDoAn = row.lyDoAn === undefined ? null : readString(row.lyDoAn);
  if (!item.biAn && lyDoAn !== null) fail();
  return {
    ...item,
    maLichHen: readFilled(row.maLichHen),
    thoiGianKham: readIsoDateTime(row.thoiGianKham),
    lyDoAn,
  };
}
