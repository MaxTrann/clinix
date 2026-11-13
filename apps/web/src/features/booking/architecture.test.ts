import { describe, expect, it } from 'vitest';

// booking F3. Mã ca BWZ-08 là [đề xuất] (PLAN booking mục 7.27). ESLint của web không có `no-restricted-imports` và không có test quét,
// nên luật "`features/` không import chéo nhau, chỉ import `features/auth` qua `index.ts`" (CODING_CONVENTION, PLAN 5.13) chỉ là quy ước:
// test này khoá nó cho MỌI file mã của `features/booking/` (F1 đến F11 cũng nằm ở đây). Đọc mã bằng `import.meta.glob` của Vite
// (không cần `node:fs`); bỏ file test.
const SOURCES = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
const ROOT = 'http://web.invalid/features/booking/';

// Module `features/<tên>` mà một import tương đối của `file` (khoá `./wizard/x.ts`) trỏ vào, kèm phần đường dẫn còn lại;
// null nếu không trỏ vào `features/` (shared, thư viện…)
function featureTarget(
  file: string,
  specifier: string,
): { feature: string; rest: string[] } | null {
  if (!specifier.startsWith('.')) return null;
  const resolved = new URL(specifier, new URL(file.slice(2), ROOT));
  const [, root, feature, ...rest] = resolved.pathname.split('/');
  if (root !== 'features' || feature === undefined) return null;
  return { feature, rest: rest.filter(Boolean) };
}

// Module ngoài booking được import, CHỈ qua `index.ts` của nó (dừng ở tên thư mục, không đi sâu vào file): `auth` (đăng nhập, vai trò) và `admin` (booking F10: `AdminScopeGuard` bọc route và
// `useAdminScope` cho trang Lịch hẹn của Quản trị viên, đúng tiền lệ module `doctor`; Đại duyệt 13/11/2026). Mọi module khác vẫn cấm.
const THROUGH_INDEX_ONLY = ['auth', 'admin'];

function isAllowedImport(
  target: { feature: string; rest: string[] } | null,
): boolean {
  if (target === null || target.feature === 'booking') return true;
  return (
    THROUGH_INDEX_ONLY.includes(target.feature) && target.rest.length === 0
  );
}

describe('booking F3 — features/booking không import chéo', () => {
  it('BWZ-08 chỉ import trong chính booking, shared/, features/auth và features/admin qua index.ts', () => {
    const files = Object.keys(SOURCES);
    expect(files.length).toBeGreaterThan(10);

    const violations: string[] = [];
    for (const file of files) {
      for (const match of SOURCES[file].matchAll(IMPORT_PATTERN)) {
        if (!isAllowedImport(featureTarget(file, match[1]))) {
          violations.push(`${file} → ${match[1]}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('BWZ-08 (F10) luật nhận admin qua index.ts và cấm mọi thứ khác (đối chứng)', () => {
    const file = './appointments/admin/x.ts';
    const allowed = (specifier: string) =>
      isAllowedImport(featureTarget(file, specifier));
    // Cho phép: chính booking, shared/, thư viện, auth và admin chỉ qua index.ts
    expect(allowed('./detail/y')).toBe(true);
    expect(allowed('../../../../shared/api/client')).toBe(true);
    expect(allowed('react')).toBe(true);
    expect(allowed('../../../auth')).toBe(true);
    expect(allowed('../../../admin')).toBe(true);
    // Cấm: đi sâu vào admin hay auth, và mọi module khác
    expect(allowed('../../../admin/admin-layout')).toBe(false);
    expect(allowed('../../../admin/components/admin-sidebar')).toBe(false);
    expect(allowed('../../../auth/use-page-active')).toBe(false);
    expect(allowed('../../../search')).toBe(false);
    expect(allowed('../../../doctor')).toBe(false);
    expect(allowed('../../../patient')).toBe(false);
  });

  it('BWZ-08 bộ quét có tác dụng: nhận ra import chéo và import sâu vào auth (đối chứng)', () => {
    const file = './wizard/x.ts';
    expect(featureTarget(file, '../../search')).toEqual({
      feature: 'search',
      rest: [],
    });
    expect(featureTarget(file, '../../search/use-remote')).toEqual({
      feature: 'search',
      rest: ['use-remote'],
    });
    expect(featureTarget(file, '../../auth')).toEqual({
      feature: 'auth',
      rest: [],
    });
    expect(featureTarget(file, '../../auth/use-page-active')).toEqual({
      feature: 'auth',
      rest: ['use-page-active'],
    });
    expect(featureTarget(file, '../../../shared/api/client')).toBeNull();
    expect(featureTarget(file, 'react')).toBeNull();
    expect(featureTarget(file, './pages')).toEqual({
      feature: 'booking',
      rest: ['wizard', 'pages'],
    });
  });

  it('BWZ-08 bộ quét thấy mã thật: có index.ts và wizard/ trong danh sách file', () => {
    expect(Object.keys(SOURCES)).toEqual(
      expect.arrayContaining(['./index.ts', './wizard/wizard-routes.tsx']),
    );
  });
});
