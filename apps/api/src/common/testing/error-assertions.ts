import { expect } from 'vitest';
import type { ErrorBody } from '../errors/app.exception.js';

/** Phần của phản hồi supertest mà hàm kiểm cần. */
export interface HttpResponseLike {
  status: number;
  headers: Record<string, unknown>;
  body: unknown;
}

// Các khoá duy nhất được có trong thân lỗi (PLAN auth mục 5.5). Khoá lạ (stack, statusCode, error, message…) là lỗi.
const ALLOWED_KEYS = new Set([
  'maLoi',
  'thongBao',
  'loi',
  'chiTiet',
  'requestId',
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Kiểm phản hồi lỗi HTTP theo dạng chuẩn của P5: đúng trạng thái và `maLoi`, JSON, có `thongBao`, không khoá lạ;
 * `requestId` có ở lỗi 5xx và KHÔNG có ở lỗi 4xx (để mọi 404 cùng thân phản hồi, plan admin PQ-13).
 * Trả thân lỗi để test kiểm tiếp `loi`, `chiTiet`. Mọi test e2e kiểm mã lỗi nên đi qua hàm này, để đổi dạng lỗi chỉ sửa một chỗ.
 */
export function expectErrorResponse(
  res: HttpResponseLike,
  status: number,
  maLoi: string,
): ErrorBody {
  expect(res.status).toBe(status);
  expect(String(res.headers['content-type'])).toContain('application/json');
  const body = res.body as ErrorBody;
  expect(Object.keys(body).filter((key) => !ALLOWED_KEYS.has(key))).toEqual([]);
  expect(body.maLoi).toBe(maLoi);
  expect(typeof body.thongBao).toBe('string');
  expect(body.thongBao).not.toBe('');
  if (status >= 500) expect(body.requestId).toMatch(UUID_PATTERN);
  else expect(body.requestId).toBeUndefined();
  return body;
}
