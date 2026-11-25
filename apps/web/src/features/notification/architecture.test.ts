import { describe, expect, it } from 'vitest';

// notification F1, WTB-16 (PLAN 5.10): `features/patient`, `features/doctor`, `features/admin` KHÔNG import `features/notification` ngoài `index.ts` (số chưa đọc đi qua prop,
// router thăm dò rồi truyền xuống); `features/notification` chỉ import `auth` (vai trò người xem) và `doctor` (đường dẫn nghỉ phép, Duyệt yêu cầu cho nút liên kết)
// và CHỈ qua `index.ts` (notification F2, nếp `wallet` → `payment`), ngoài ra chỉ `shared/` và thư viện. Đọc mã bằng `import.meta.glob`, bỏ file test;
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

const NOTIFICATION_MAY_IMPORT: readonly string[] = ['auth', 'doctor'];

/** Luật của `notification`: feature khác chỉ khi có trong `NOTIFICATION_MAY_IMPORT` và chỉ qua `index.ts`. */
function notificationAllowed(
  target: { feature: string; rest: string[] } | null,
): boolean {
  if (target === null || target.feature === 'notification') return true;
  return (
    NOTIFICATION_MAY_IMPORT.includes(target.feature) && target.rest.length === 0
  );
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
  it('WTB-16 patient, doctor, admin không đi sâu vào features/notification; notification chỉ import auth, doctor qua index.ts', () => {
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
    expect(fromNotification('../../auth')).toBe(true);
    expect(fromNotification('../../doctor')).toBe(true);
    expect(fromNotification('../../doctor/shell/doctor-paths')).toBe(false);
    expect(fromNotification('../../booking')).toBe(false);
    expect(fromNotification('../../patient/shell/role-layout')).toBe(false);
  });
});

describe('notification F2 — quét mã nguồn (WTB-12, WTB-17)', () => {
  // Bỏ `testing/` (API giả thay `fetch` có chủ ý)
  const product = Object.entries(NOTIFICATION).filter(
    ([file]) => !file.startsWith('./testing/'),
  );

  it('WTB-12 không gọi `fetch` ngoài lớp client, không `dangerouslySetInnerHTML`, không viết cứng đường dẫn trang theo vai trò', () => {
    expect(product.length).toBeGreaterThan(8);
    for (const [file, source] of product) {
      // `fetch(` gọi thẳng (không tính tên hàm như `getNotifications`); chỉ bắt CÁCH DÙNG, không bắt chữ trong comment
      expect(source, file).not.toMatch(/(?<![\w.])fetch\s*\(/);
      expect(source, file).not.toMatch(
        /dangerouslySetInnerHTML\s*=|\.innerHTML\b/,
      );
      expect(source, file).not.toMatch(
        /['`]\/(benh-nhan|le-tan|bac-si-portal|admin)\//,
      );
    }
  });

  it('WTB-17 không giữ thông báo ở kho trình duyệt (`localStorage`, `sessionStorage`, `indexedDB`, cookie)', () => {
    for (const [file, source] of product)
      expect(source, file).not.toMatch(
        /localStorage|sessionStorage|indexedDB|document\.cookie/,
      );
  });
});
