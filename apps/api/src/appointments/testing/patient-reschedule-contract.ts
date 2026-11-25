import { expect } from 'vitest';

// Bộ kiểm HỢP ĐỒNG phản hồi của hai route đổi lịch Bệnh nhân (reschedule B6, HDL-26, HDL-27, BDL-02): mô phỏng đúng quy tắc "đọc NGHIÊM" của web F1 (`reschedule-preview-api.ts` và `response-readers.ts`
// ở nhánh F1: kiểu từng khoá, id BIGINT dạng chuỗi, ISO 8601, khoá tuỳ chọn thì VẮNG chứ không `null`) cộng "không khoá thừa" (web không chép khoá thừa, nhưng PLAN 5.8 là danh sách trắng). MỘT chỗ cho mapper.spec,
// service.spec và e2e (jscpd quét `testing/`). Dùng `expect` của vitest nên chỉ nạp từ test.

const PUBLIC_ID = /^[1-9][0-9]*$/;
// Cùng `isIsoDateTime` của web: mở đầu `yyyy-MM-ddTHH:mm` và `Date.parse` được
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isIso = (value: unknown): boolean =>
  typeof value === 'string' &&
  ISO_DATE_TIME.test(value) &&
  !Number.isNaN(Date.parse(value));
const isPublicId = (value: unknown): boolean =>
  typeof value === 'string' && PUBLIC_ID.test(value);
const isCount = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** Khoá BẮT BUỘC của preview 200 (hợp đồng F1 điểm 1); `lyDoKhongDoi` là khoá tuỳ chọn duy nhất ở cấp 1. */
export const PREVIEW_REQUIRED_KEYS = [
  'choPhepDoi',
  'loai',
  'soLanDaDoi',
  'soLanToiDa',
  'coYeuCauChoDuyet',
  'lichCu',
  'lichMoi',
  'thoiGianMayChu',
] as const;

const sorted = (value: Record<string, unknown>): string[] =>
  Object.keys(value).sort();

/** Khẳng định `body` là preview 200 hợp lệ theo web F1 và PLAN 5.8; không khoá thừa ở cả ba cấp. */
export function assertPreviewContract(body: unknown): void {
  expect(isRecord(body)).toBe(true);
  const row = body as Record<string, unknown>;
  const allowed = [...PREVIEW_REQUIRED_KEYS, 'lyDoKhongDoi'];
  expect(Object.keys(row).filter((key) => !allowed.includes(key))).toEqual([]);
  for (const key of PREVIEW_REQUIRED_KEYS) expect(key in row).toBe(true);

  expect(typeof row.choPhepDoi).toBe('boolean');
  expect(['TuDoi', 'GuiYeuCau']).toContain(row.loai);
  expect(isCount(row.soLanDaDoi)).toBe(true);
  expect(isCount(row.soLanToiDa)).toBe(true);
  expect(typeof row.coYeuCauChoDuyet).toBe('boolean');
  expect(isIso(row.thoiGianMayChu)).toBe(true);

  // `lyDoKhongDoi`: VẮNG (không `null`) khi đổi được; chuỗi `maLoi` khi không
  if (row.choPhepDoi === true) expect('lyDoKhongDoi' in row).toBe(false);
  else {
    expect(typeof row.lyDoKhongDoi).toBe('string');
    expect(row.lyDoKhongDoi).toMatch(/^[A-Z][A-Z0-9_]*$/);
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
  if (next.hopLe === false)
    expect(next.lyDoKhongHopLe).toMatch(/^[A-Z][A-Z0-9_]*$/);
}

/** Khẳng định thân 201 `DaDoi`: đúng khoá ở cả ba cấp, không id nội bộ. */
export function assertRescheduledContract(body: unknown): void {
  expect(isRecord(body)).toBe(true);
  const row = body as Record<string, unknown>;
  expect(sorted(row)).toEqual([
    'ketQua',
    'lichHenCu',
    'lichHenMoi',
    'thoiGianMayChu',
  ]);
  expect(row.ketQua).toBe('DaDoi');
  const next = row.lichHenMoi as Record<string, unknown>;
  expect(sorted(next)).toEqual(['maLichHen', 'thoiGian', 'trangThai']);
  expect(typeof next.maLichHen).toBe('string');
  expect(isIso(next.thoiGian)).toBe(true);
  expect(next.trangThai).toBe('DaXacNhan');
  expect(sorted(row.lichHenCu as Record<string, unknown>)).toEqual([
    'maLichHen',
  ]);
  expect(isIso(row.thoiGianMayChu)).toBe(true);
}

/** Khẳng định thân 201 `DaGuiYeuCau`: KHÔNG id yêu cầu, đúng khoá ở hai cấp. */
export function assertRequestSentContract(body: unknown): void {
  expect(isRecord(body)).toBe(true);
  const row = body as Record<string, unknown>;
  expect(sorted(row)).toEqual(['ketQua', 'thoiGianMayChu', 'yeuCau']);
  expect(row.ketQua).toBe('DaGuiYeuCau');
  const request = row.yeuCau as Record<string, unknown>;
  expect(sorted(request)).toEqual(['thoiGianMongMuon', 'trangThai']);
  expect(request.trangThai).toBe('ChoDuyet');
  expect(isIso(request.thoiGianMongMuon)).toBe(true);
  expect(isIso(row.thoiGianMayChu)).toBe(true);
}
