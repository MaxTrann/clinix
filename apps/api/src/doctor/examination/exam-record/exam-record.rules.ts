import { FOLLOW_UP_MAX_DAYS } from '../examination.constants.js';

// Quy tắc hồ sơ khám, HÀM THUẦN (doctor-exam B2; PLAN 5.2; Q2): chuẩn hoá chữ và kiểm ngày. Không đọc đồng hồ, không DB. Kiểm cả bốn trường ở `exam-record.input.ts`;
// so sánh, nhật ký và quyền theo trạng thái ở `exam-record.diff.ts`.

/** Bốn trường của hồ sơ. Chữ có thể `null` khi đọc từ dòng cũ (cột cho NULL); luôn là chuỗi sau `validateRecordInput`. */
export interface ExamRecordFields {
  trieuChung: string | null;
  chanDoanSoBo: string | null;
  huongXuLy: string | null;
  ngayTaiKhamDuKien: string | null;
}

/** Hồ sơ đã chuẩn hoá và đã kiểm (ba trường chữ không rỗng). */
export interface ValidExamRecord extends ExamRecordFields {
  trieuChung: string;
  chanDoanSoBo: string;
  huongXuLy: string;
}

// `\p{Cc}` = điều khiển (C0, DEL, C1) trừ LF và TAB (viết bằng lớp Unicode để khỏi vướng quy tắc no-control-regex); `\p{Cs}` với cờ `u` chỉ khớp surrogate LẺ (cặp hợp lệ là một điểm mã).
const LINE_BREAKS = /\r\n?/g;
const CONTROL = /(?![\n\t])\p{Cc}/gu;
const LONE_SURROGATE = /\p{Cs}/gu;
const REPLACEMENT = '�';

/**
 * Chuẩn hoá một trường chữ: `CRLF`/`CR` ⇒ `LF`, bỏ ký tự điều khiển trừ `LF` và `TAB`, thay surrogate lẻ bằng `U+FFFD`, `trim`. Thay surrogate lẻ là ĐỔI NỘI DUNG CÓ CHỦ Ý: khớp cách MySQL `text` đổi
 * (X1 M10) và tránh `AUDIT_WRITE_FAILED` ở lần sửa sau Hoàn thành. Không dùng `toWellFormed` (ES2024; `target` là ES2023).
 */
export function normalizeText(raw: string): string {
  return raw
    .replace(LINE_BREAKS, '\n')
    .replace(CONTROL, '')
    .replace(LONE_SURROGATE, REPLACEMENT)
    .trim();
}

const DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `[năm, tháng, ngày]` của chuỗi `YYYY-MM-DD` (đã đúng dạng). */
function partsOf(value: string): [number, number, number] {
  const match = DATE_SHAPE.exec(value);
  return [Number(match?.[1]), Number(match?.[2]), Number(match?.[3])];
}

/** Ngày `YYYY-MM-DD` có thật (so thành phần UTC, nên `2026-02-30` bị loại và không phụ thuộc múi giờ máy). */
export function isCalendarDate(value: string): boolean {
  if (!DATE_SHAPE.test(value)) return false;
  const [year, month, day] = partsOf(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const dayNumber = (value: string): number => {
  const [year, month, day] = partsOf(value);
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

/** Ngày tái khám (đã là ngày có thật) phải trong `[ngày khám, ngày khám + 365 ngày]`; `null` luôn hợp lệ. `ngayKham` là `DATE(lich_hen.thoi_gian)` theo giờ VN. */
export function checkFollowUpDate(
  ngay: string | null,
  ngayKham: string,
): boolean {
  if (ngay === null) return true;
  const days = dayNumber(ngay) - dayNumber(ngayKham);
  return days >= 0 && days <= FOLLOW_UP_MAX_DAYS;
}
