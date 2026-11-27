import type { FieldError } from '../../common/errors/app.exception.js';
import { FIELD_ERROR_CODES } from '../../common/errors/error-codes.js';
import type { SendTarget } from '../core/send-message.service.js';

// Đọc gói `chat:gui` (chat B5; PLAN chat 5.7). Socket không đi qua ValidationPipe nên ở đây làm ĐÚNG phần việc DTO của REST làm: chặn trường lạ
// (`TRUONG_KHONG_DUOC_PHEP`, như `forbidNonWhitelisted`) và lấy đích. Kiểu, độ dài, ký tự của `noiDung`, dạng UUID của `maGui` do LÕI GỬI kiểm (HCH-04: không chép luật).
//  - Đích: đúng MỘT trong `hoiThoaiId`, `bacSiId`, `chiNhanhId`, là chuỗi (REST lấy từ đường dẫn nên luôn là chuỗi). Chuỗi sai dạng ⇒ lõi trả 404 như REST.
//  - Mã của trường `dich` và `goiTin` là `[đề xuất]` của chat B5.

const TARGET_KEYS = ['hoiThoaiId', 'bacSiId', 'chiNhanhId'] as const;
const ALLOWED_KEYS = new Set<string>([...TARGET_KEYS, 'noiDung', 'maGui']);

export const SOCKET_PAYLOAD_ERRORS = {
  NOT_OBJECT: 'GOI_TIN_KHONG_HOP_LE',
  BAD_TARGET: 'DICH_KHONG_HOP_LE',
} as const;

export type ParsedSend =
  | { ok: true; target: SendTarget; noiDung: unknown; maGui: unknown }
  | { ok: false; loi: FieldError[] };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

export function parseSendPayload(payload: unknown): ParsedSend {
  if (!isPlainObject(payload))
    return {
      ok: false,
      loi: [{ truong: 'goiTin', ma: SOCKET_PAYLOAD_ERRORS.NOT_OBJECT }],
    };
  const unknownKeys = Object.keys(payload).filter((k) => !ALLOWED_KEYS.has(k));
  if (unknownKeys.length > 0)
    return {
      ok: false,
      loi: unknownKeys.map((truong) => ({
        truong,
        ma: FIELD_ERROR_CODES.NOT_ALLOWED,
      })),
    };
  const given = TARGET_KEYS.filter((k) => payload[k] !== undefined);
  const key = given[0];
  const value = key === undefined ? undefined : payload[key];
  if (given.length !== 1 || key === undefined || typeof value !== 'string')
    return {
      ok: false,
      loi: [{ truong: 'dich', ma: SOCKET_PAYLOAD_ERRORS.BAD_TARGET }],
    };
  const target: SendTarget =
    key === 'hoiThoaiId'
      ? { hoiThoaiId: value }
      : key === 'bacSiId'
        ? { bacSiId: value }
        : { chiNhanhId: value };
  return {
    ok: true,
    target,
    noiDung: payload.noiDung,
    maGui: payload.maGui,
  };
}
