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

describe('booking F3 — features/booking không import chéo', () => {
  it('BWZ-08 chỉ import trong chính booking, shared/ và features/auth qua index.ts', () => {
    const files = Object.keys(SOURCES);
    expect(files.length).toBeGreaterThan(10);

    const violations: string[] = [];
    for (const file of files) {
      for (const match of SOURCES[file].matchAll(IMPORT_PATTERN)) {
        const target = featureTarget(file, match[1]);
        if (target === null || target.feature === 'booking') continue;
        // Chỉ `features/auth` và chỉ qua `index.ts` (dừng ở tên thư mục, không đi sâu vào file)
        const throughIndex =
          target.feature === 'auth' && target.rest.length === 0;
        if (!throughIndex) violations.push(`${file} → ${match[1]}`);
      }
    }
    expect(violations).toEqual([]);
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
