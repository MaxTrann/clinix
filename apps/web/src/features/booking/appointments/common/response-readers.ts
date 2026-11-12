import { UnexpectedResponseError } from '../../../../shared/api/errors';
import { isDecimalAmount, isIsoDateTime } from './appointment-format';

// Bộ đọc phản hồi JSON cho các danh sách lịch hẹn của booking (F1; F2, F8, F10, F11 dùng lại). Mỗi hàm trả đúng kiểu hoặc ném
// `UnexpectedResponseError`: phản hồi 200 mà sai hình dạng cùng loại với HTML 502 (không dùng được), vì vẽ dữ liệu sai là trang trắng.
// Chỉ đọc đúng các khoá cần: khoá thừa của API không được chép theo, nên không bao giờ lọt ra màn hình.

export function unusableResponse(): never {
  throw new UnexpectedResponseError(200);
}

export function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return unusableResponse();
  }
  return value as Record<string, unknown>;
}

export function readList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : unusableResponse();
}

export function readText(value: unknown): string {
  return typeof value === 'string' ? value : unusableResponse();
}

// Chuỗi khác rỗng (mã lịch hẹn)
export function readCode(value: unknown): string {
  const text = readText(value);
  return text === '' ? unusableResponse() : text;
}

export function readFlag(value: unknown): boolean {
  return typeof value === 'boolean' ? value : unusableResponse();
}

// Số nguyên không nhỏ hơn `min` (số đếm, trang)
export function readCount(value: unknown, min = 0): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min
    ? value
    : unusableResponse();
}

// Id BIGINT dạng chuỗi số dương không có số 0 đứng đầu (API `CAST AS CHAR`): giữ chuỗi, KHÔNG bao giờ `Number` (id lớn hơn 2^53 sẽ sai chữ số)
const PUBLIC_ID = /^[1-9][0-9]*$/;

export function readId(value: unknown): string {
  const text = readText(value);
  return PUBLIC_ID.test(text) ? text : unusableResponse();
}

export function readIsoDateTime(value: unknown): string {
  const text = readText(value);
  return isIsoDateTime(text) ? text : unusableResponse();
}

export function readAmount(value: unknown): string {
  const text = readText(value);
  return isDecimalAmount(text) ? text : unusableResponse();
}
