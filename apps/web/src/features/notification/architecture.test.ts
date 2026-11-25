import { describe, expect, it } from 'vitest';

// notification F1, WTB-16 (PLAN 5.10): `features/patient`, `features/doctor`, `features/admin` KHÔNG import `features/notification` ngoài `index.ts` (số chưa đọc đi qua prop,
// router thăm dò rồi truyền xuống); `features/notification` không import feature nào khác (chỉ `shared/` và thư viện). Đọc mã bằng `import.meta.glob`, bỏ file test;
// `testing/` vẫn được quét. Nếp `features/wallet/architecture.test.ts`.
const NOTIFICATION = import.meta.glob(
  ['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const CONSUMERS = {
  patient: import.meta.glob(
    ['../patient/**/*.{ts,tsx}', '!../patient/**/*.test.{ts,tsx}'],
    { query: '?raw', import: 'default', eager: true },
  ) as Record<string, string>,
  doctor: import.meta.glob(
    ['../doctor/**/*.{ts,tsx}', '!../doctor/**/*.test.{ts,tsx}'],
    { query: '?raw', import: 'default', eager: true },
  ) as Record<string, string>,
  admin: import.meta.glob(
    ['../admin/**/*.{ts,tsx}', '!../admin/**/*.test.{ts,tsx}'],
    { query: '?raw', import: 'default', eager: true },
  ) as Record<string, string>,
};

const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
const ROOT = 'http://web.invalid/features/notification/';

/** Feature mà import tương đối của `file` (khoá của glob, tính từ `features/notification/`) trỏ vào, kèm phần đường dẫn còn lại; `null` nếu không vào `features/`. */
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

/** Luật của feature dùng số chưa đọc: chỉ được chạm `notification` qua `index.ts` (dừng ở tên thư mục). */
function consumerAllowed(
  target: { feature: string; rest: string[] } | null,
): boolean {
  return (
    target === null ||
    target.feature !== 'notification' ||
    target.rest.length === 0
  );
}

/** Luật của `notification`: không import feature nào khác. */
function notificationAllowed(
  target: { feature: string; rest: string[] } | null,
): boolean {
  return target === null || target.feature === 'notification';
}

function violations(
  sources: Record<string, string>,
  allowed: (target: { feature: string; rest: string[] } | null) => boolean,
) {
  const found: string[] = [];
  for (const [file, source] of Object.entries(sources))
    for (const match of source.matchAll(IMPORT_PATTERN))
      if (!allowed(featureTarget(file, match[1] ?? '')))
        found.push(`${file} → ${match[1]}`);
  return found;
}

describe('notification F1 — ranh giới import (WTB-16)', () => {
  it('WTB-16 patient, doctor, admin không đi sâu vào features/notification; notification không import feature khác', () => {
    expect(Object.keys(NOTIFICATION).length).toBeGreaterThan(4);
    for (const [name, sources] of Object.entries(CONSUMERS)) {
      expect(Object.keys(sources).length, name).toBeGreaterThan(5);
      expect(violations(sources, consumerAllowed), name).toEqual([]);
    }
    expect(violations(NOTIFICATION, notificationAllowed)).toEqual([]);
  });

  it('WTB-16 luật nhận đúng và cấm đúng (đối chứng)', () => {
    const fromPatient = (spec: string) =>
      consumerAllowed(featureTarget('../patient/shell/x.tsx', spec));
    const fromNotification = (spec: string) =>
      notificationAllowed(featureTarget('./unread/x.ts', spec));
    expect(fromPatient('../../notification')).toBe(true);
    expect(fromPatient('../../notification/unread/use-unread-count')).toBe(
      false,
    );
    expect(fromPatient('../../../shared/ui/role-shell')).toBe(true);
    expect(fromPatient('../../auth')).toBe(true);
    expect(fromNotification('./unread-store')).toBe(true);
    expect(fromNotification('../api/notification-api')).toBe(true);
    expect(fromNotification('../../../shared/api/client')).toBe(true);
    expect(fromNotification('react')).toBe(true);
    expect(fromNotification('../../auth')).toBe(false);
    expect(fromNotification('../../patient/shell/role-layout')).toBe(false);
  });
});
