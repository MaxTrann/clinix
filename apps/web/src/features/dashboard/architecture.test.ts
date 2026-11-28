import { describe, expect, it } from 'vitest';
import {
  ADMIN_APPROVALS_PATH,
  ADMIN_BRANCH_CHANGES_PATH,
  ADMIN_LEAVE_APPROVALS_PATH,
} from './admin/pending-list';

// dashboard F1 — ranh giới module web (PLAN dashboard 1.2; T10, T15): `features/dashboard` chỉ import `shared/` và `features/admin`, `features/auth`
// QUA `index.ts`; không module nào khác import `features/dashboard` (router ghép route qua `index.ts`). Không `fetch` ngoài client chung, không kho trình duyệt.
const SOURCES = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const OTHER_FEATURES = import.meta.glob(
  ['../*/**/*.{ts,tsx}', '!../dashboard/**', '!../*/**/*.test.{ts,tsx}'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*['"](\.[^'"]*)['"]/g;
const MAY_IMPORT = ['admin', 'auth'];

/** Các import của `file` (đường dẫn tương đối trong `features/dashboard/`) đi vào feature khác mà không qua `index.ts` của feature được phép. */
function forbiddenImports(file: string, source: string): string[] {
  const base = new URL(file, 'http://web.invalid/features/dashboard/');
  return [...source.matchAll(IMPORT_PATTERN)]
    .map((match) => match[1] ?? '')
    .filter((specifier) => {
      const [, root, feature, ...rest] = new URL(specifier, base).pathname
        .split('/')
        .filter((part, index) => index === 0 || part !== '');
      if (root !== 'features' || feature === 'dashboard') return false;
      return !(
        feature !== undefined &&
        MAY_IMPORT.includes(feature) &&
        rest.length === 0
      );
    });
}

describe('dashboard F1 — ranh giới module', () => {
  it('chỉ import shared/ và admin, auth qua index.ts (đối chứng: import sâu hay feature khác bị bắt)', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(6);
    expect(
      forbiddenImports('./admin/x.tsx', "import { A } from '../../admin';"),
    ).toEqual([]);
    expect(
      forbiddenImports(
        './admin/x.tsx',
        "import { A } from '../../../shared/api/client';",
      ),
    ).toEqual([]);
    expect(
      forbiddenImports(
        './admin/x.tsx',
        "import { A } from '../../admin/use-admin-scope';",
      ),
    ).toHaveLength(1);
    expect(
      forbiddenImports('./admin/x.tsx', "import { A } from '../../booking';"),
    ).toHaveLength(1);
    expect(
      Object.entries(SOURCES).flatMap(([file, source]) =>
        forbiddenImports(file, source).map((target) => `${file} → ${target}`),
      ),
    ).toEqual([]);
  });

  it('không feature nào khác import features/dashboard (chỉ router ghép route)', () => {
    expect(Object.keys(OTHER_FEATURES).length).toBeGreaterThan(50);
    const users = Object.entries(OTHER_FEATURES)
      .filter(([, source]) => /['"][./]*dashboard(?:\/|['"])/.test(source))
      .map(([file]) => file);
    expect(users).toEqual([]);
  });

  it('không `fetch` ngoài lớp client, không kho trình duyệt, không `dangerouslySetInnerHTML`', () => {
    for (const [file, source] of Object.entries(SOURCES)) {
      expect(source, file).not.toMatch(/(?<![\w.])fetch\s*\(/);
      expect(source, file).not.toMatch(
        /localStorage|sessionStorage|indexedDB|document\.cookie/,
      );
      expect(source, file).not.toMatch(/dangerouslySetInnerHTML/);
    }
  });

  it('DWB-07 (T10): khoá các đường dẫn viết bằng chữ của khối "Việc cần xử lý" (trang của module khác)', () => {
    expect(ADMIN_LEAVE_APPROVALS_PATH).toBe('/admin/duyet-yeu-cau/nghi-phep');
    expect(ADMIN_APPROVALS_PATH).toBe('/admin/duyet-yeu-cau');
    expect(ADMIN_BRANCH_CHANGES_PATH).toBe(
      '/admin/thong-tin-phong-kham?tab=chi-nhanh',
    );
  });
});
