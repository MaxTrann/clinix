import { describe, expect, it } from 'vitest';

// payment F2: khoá luật import giữa hai thư mục của scope payment ở web (CODING_CONVENTION: "`features/` không import chéo nhau"; nếp BWZ-08 của booking).
// Ngoại lệ có kiểm soát (Trung chọn 18/11/2026): `features/wallet` được import `features/payment` CHỈ qua `index.ts` (tab Nạp tiền, trang kết quả nạp);
// `features/payment` KHÔNG import `features/wallet` (một chiều, không vòng). Cả hai còn được dùng `auth` và `admin` qua `index.ts` (CODING_CONVENTION; payment F5 bọc route bằng
// `AdminScopeGuard`, PLAN 5.13), `shared/` và thư viện. Đọc mã bằng `import.meta.glob`, bỏ file test.
// `testing/` vẫn được quét: hạ tầng test cũng không được đi tắt sang feature khác.
const WALLET = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const PAYMENT = import.meta.glob(
  ['../payment/**/*.{ts,tsx}', '!../payment/**/*.test.{ts,tsx}'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
const ROOT = 'http://web.invalid/features/wallet/';

/** Feature mà import tương đối của `file` (khoá của glob, tính từ `features/wallet/`) trỏ vào, kèm phần đường dẫn còn lại; `null` nếu không vào `features/`. */
function featureTarget(
  file: string,
  specifier: string,
): { feature: string; rest: string[] } | null {
  if (!specifier.startsWith('.')) return null;
  const resolved = new URL(specifier, new URL(file, ROOT));
  const [, root, feature, ...rest] = resolved.pathname.split('/');
  if (root !== 'features' || feature === undefined) return null;
  return { feature, rest: rest.filter(Boolean) };
}

/** Feature ngoài được import, CHỈ qua `index.ts` (dừng ở tên thư mục, không đi sâu vào file). */
const THROUGH_INDEX_ONLY = {
  wallet: ['auth', 'admin', 'payment'],
  payment: ['auth', 'admin'],
} as const;

/** Luật: mỗi feature import chính nó tự do; feature khác chỉ khi có trong `THROUGH_INDEX_ONLY` và chỉ qua `index.ts`. */
function isAllowed(
  from: 'wallet' | 'payment',
  target: { feature: string; rest: string[] } | null,
): boolean {
  if (target === null || target.feature === from) return true;
  const allowed: readonly string[] = THROUGH_INDEX_ONLY[from];
  return allowed.includes(target.feature) && target.rest.length === 0;
}

function violations(
  from: 'wallet' | 'payment',
  sources: Record<string, string>,
) {
  const found: string[] = [];
  for (const [file, source] of Object.entries(sources))
    for (const match of source.matchAll(IMPORT_PATTERN))
      if (!isAllowed(from, featureTarget(file, match[1] ?? '')))
        found.push(`${file} → ${match[1]}`);
  return found;
}

describe('payment F2 — wallet và payment không import chéo (trừ wallet → payment qua index.ts)', () => {
  it('wallet chỉ import payment qua index.ts; payment không import wallet hay feature khác', () => {
    expect(Object.keys(WALLET).length).toBeGreaterThan(5);
    expect(Object.keys(PAYMENT).length).toBeGreaterThan(5);
    expect(violations('wallet', WALLET)).toEqual([]);
    expect(violations('payment', PAYMENT)).toEqual([]);
  });

  it('luật nhận đúng và cấm đúng (đối chứng)', () => {
    const wallet = (spec: string) =>
      isAllowed('wallet', featureTarget('./patient/x.tsx', spec));
    const payment = (spec: string) =>
      isAllowed('payment', featureTarget('../payment/topup/x.tsx', spec));
    expect(wallet('./wallet-page')).toBe(true);
    expect(wallet('../../../shared/api/client')).toBe(true);
    expect(wallet('react')).toBe(true);
    expect(wallet('../../payment')).toBe(true);
    expect(wallet('../../payment/topup/topup-panel')).toBe(false);
    expect(wallet('../../booking')).toBe(false);
    expect(payment('./topup-form')).toBe(true);
    expect(payment('../../wallet')).toBe(false);
    expect(payment('../../wallet/api/wallet-types')).toBe(false);
    expect(payment('../../admin')).toBe(true);
    expect(payment('../../admin/admin-layout')).toBe(false);
    expect(payment('../../booking')).toBe(false);
  });
});
