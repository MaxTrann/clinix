import { expect } from 'vitest';

// Bộ kiểm HỢP ĐỒNG preview của Lễ tân đổi hộ (reschedule B7, HDL-28, BDL-07): mô phỏng quy tắc "đọc NGHIÊM" mà web F3 sẽ dùng (kiểu từng khoá, id BIGINT dạng chuỗi, ISO 8601, khoá tuỳ chọn thì VẮNG chứ không
// `null`) cộng "không khoá thừa" (PLAN 5.8 là danh sách trắng) và KHÔNG có ba khoá của Bệnh nhân (`loai`, `soLanDaDoi`, `soLanToiDa`). MỘT chỗ cho mapper.spec, service.spec, int-spec và e2e (jscpd quét `testing/`).
// Thân 201 `DaDoi` của POST là CHÍNH `RescheduledResult` của B6: dùng `assertRescheduledContract` ở `patient-reschedule-contract.ts`. Dùng `expect` của vitest nên chỉ nạp từ test.

const PUBLIC_ID = /^[1-9][0-9]*$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ERROR_CODE = /^[A-Z][A-Z0-9_]*$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isIso = (value: unknown): boolean =>
  typeof value === 'string' &&
  ISO_DATE_TIME.test(value) &&
  !Number.isNaN(Date.parse(value));
const isPublicId = (value: unknown): boolean =>
  typeof value === 'string' && PUBLIC_ID.test(value);
const sorted = (value: Record<string, unknown>): string[] =>
  Object.keys(value).sort();

/** Khoá BẮT BUỘC của preview 200 của Lễ tân; `lyDoKhongDoi` là khoá tuỳ chọn duy nhất ở cấp 1. */
export const RECEPTION_PREVIEW_REQUIRED_KEYS = [
  'choPhepDoi',
  'coYeuCauChoDuyet',
  'lichCu',
  'lichMoi',
  'thoiGianMayChu',
] as const;
/** Ba khoá của preview Bệnh nhân KHÔNG được có ở Lễ tân (đổi hộ không có hạn mức tự đổi). */
export const RECEPTION_PREVIEW_FORBIDDEN_KEYS = [
  'loai',
  'soLanDaDoi',
  'soLanToiDa',
] as const;

/** Khẳng định `body` là preview 200 hợp lệ của Lễ tân; không khoá thừa ở cả ba cấp. */
export function assertReceptionPreviewContract(body: unknown): void {
  expect(isRecord(body)).toBe(true);
  const row = body as Record<string, unknown>;
  const allowed = [...RECEPTION_PREVIEW_REQUIRED_KEYS, 'lyDoKhongDoi'];
  expect(Object.keys(row).filter((key) => !allowed.includes(key))).toEqual([]);
  for (const key of RECEPTION_PREVIEW_REQUIRED_KEYS)
    expect(key in row).toBe(true);
  for (const key of RECEPTION_PREVIEW_FORBIDDEN_KEYS)
    expect(key in row).toBe(false);

  expect(typeof row.choPhepDoi).toBe('boolean');
  expect(typeof row.coYeuCauChoDuyet).toBe('boolean');
  expect(isIso(row.thoiGianMayChu)).toBe(true);

  // `lyDoKhongDoi`: VẮNG (không `null`) khi đổi được; chuỗi `maLoi` khi không
  if (row.choPhepDoi === true) expect('lyDoKhongDoi' in row).toBe(false);
  else {
    expect(typeof row.lyDoKhongDoi).toBe('string');
    expect(row.lyDoKhongDoi).toMatch(ERROR_CODE);
  }

  expect(isRecord(row.lichCu)).toBe(true);
  const current = row.lichCu as Record<string, unknown>;
  expect(sorted(current)).toEqual(['bacSiId', 'thoiGian']);
  expect(isIso(current.thoiGian)).toBe(true);
  expect(isPublicId(current.bacSiId)).toBe(true);

  if (row.lichMoi === null) return;
  expect(isRecord(row.lichMoi)).toBe(true);
  const next = row.lichMoi as Record<string, unknown>;
  expect(typeof next.hopLe).toBe('boolean');
  expect(sorted(next)).toEqual(
    next.hopLe === true
      ? ['hopLe', 'khungGioId', 'thoiGian']
      : ['hopLe', 'khungGioId', 'lyDoKhongHopLe', 'thoiGian'],
  );
  expect(isPublicId(next.khungGioId)).toBe(true);
  expect(isIso(next.thoiGian)).toBe(true);
  if (next.hopLe === false) expect(next.lyDoKhongHopLe).toMatch(ERROR_CODE);
}
