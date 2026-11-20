import { UnexpectedResponseError } from '../../../shared/api/errors';
import { isDecimalAmount } from '../../../shared/money/format-vnd';

// Bộ đọc JSON phản hồi dùng chung của API payment ở web (tách ở F4 cho thanh toán cọc F3 và thu tiền F4, không chép). Sai hình dạng ⇒ `UnexpectedResponseError`
// (giao diện hiện câu lỗi chung), không để chuỗi lạ hay `undefined` lọt ra màn hình.

export const invalid = (): never => {
  throw new UnexpectedResponseError(200);
};

export function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return invalid();
  return value as Record<string, unknown>;
}

export const readText = (value: unknown): string =>
  typeof value === 'string' && value !== '' ? value : invalid();

// Tiền: chỉ nhận chuỗi decimal, KHÔNG nhận `number` (số qua JSON có thể đã mất chính xác)
export const readAmount = (value: unknown): string =>
  typeof value === 'string' && isDecimalAmount(value) ? value : invalid();

export const readBoolean = (value: unknown): boolean =>
  typeof value === 'boolean' ? value : invalid();

export const readIso = (value: unknown): string =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? value
    : invalid();
