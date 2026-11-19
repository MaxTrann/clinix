import { UnexpectedResponseError } from '../../../shared/api/errors';
import { isDecimalAmount } from '../../../shared/money/format-vnd';

// Bộ đọc JSON phản hồi của API ví (payment F1, tách ra ở F7 để API Bệnh nhân và API Quản trị viên dùng chung, không chép). Sai hình dạng ⇒ `UnexpectedResponseError`
// (giao diện hiện câu lỗi chung), không để chuỗi lạ hay `undefined` lọt ra màn hình.

export const invalid = (): never => {
  throw new UnexpectedResponseError(200);
};

export function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return invalid();
  return value as Record<string, unknown>;
}

export function readString(value: unknown): string {
  return typeof value === 'string' ? value : invalid();
}

// Tiền: chuỗi decimal (có thể âm). KHÔNG nhận `number` dù máy chủ có lỡ trả: số đã qua JSON có thể đã mất chính xác (WVI-04).
export function readAmount(value: unknown): string {
  return typeof value === 'string' && isDecimalAmount(value)
    ? value
    : invalid();
}

export function readIso(value: unknown): string {
  const text = readString(value);
  return Number.isNaN(Date.parse(text)) ? invalid() : text;
}

export function readCount(value: unknown, min = 0): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min
    ? value
    : invalid();
}

export function readOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T {
  return allowed.find((item) => item === value) ?? invalid();
}
