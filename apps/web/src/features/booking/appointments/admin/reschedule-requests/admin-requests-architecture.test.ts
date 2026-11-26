import { describe, expect, it } from 'vitest';
import { RULES, strip, violations } from '../../../testing/static-scan';

// reschedule F5, WXD-132…WXD-135 (`[đề xuất]`; nếp BWZ-08, WXD-76 của F4): bộ quét TĨNH mã của trang yêu cầu đổi lịch phía Quản trị viên: các luật dùng chung (không `fetch` ngoài client, không
// `dangerouslySetInnerHTML`, không kho trình duyệt, đường dẫn dựng từ `booking-paths`, id không qua số, không `console`), tham số chi nhánh chỉ ở đúng chỗ, lời gọi mạng chỉ ở hai file API, và phân tầng.
const SOURCES = import.meta.glob(['./*.{ts,tsx}', '!./*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const COMMON = import.meta.glob(
  ['../../common/**/*.{ts,tsx}', '!../../common/**/*.test.{ts,tsx}'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const API_FILE = './admin-requests-api.ts';
const WRITE_FILE = './admin-requests-handle-api.ts';
const FILTER_FILE = './admin-branch-filter.tsx';

const filesWith = (sources: Record<string, string>, pattern: RegExp) =>
  Object.entries(sources)
    .filter(([, source]) => pattern.test(strip(source)))
    .map(([file]) => file)
    .sort();

// Chỗ nhắc `chiNhanhId` KHÔNG phải đọc thuộc tính (`x.chiNhanhId`), hay gán vào thuộc tính đó: tức là dựng khoá tham số
const writesBranchParam = (source: string) =>
  /(?<!\.)\bchiNhanhId\b|\.chiNhanhId\s*=[^=]/.test(strip(source));

const importsOf = (source: string) =>
  [...strip(source).matchAll(/(?:from|import\()\s*'([^']+)'/g)].map(
    (match) => match[1],
  );

describe('reschedule F5 — kiến trúc web của trang yêu cầu đổi lịch phía Quản trị viên', () => {
  it('WXD-132 bộ quét thấy mã thật (tám file nguồn)', () => {
    expect(Object.keys(SOURCES).sort()).toEqual(
      [
        FILTER_FILE,
        './admin-request-routes.tsx',
        API_FILE,
        WRITE_FILE,
        './admin-requests-layout.tsx',
        './admin-requests-pages.tsx',
        './admin-requests-scope.ts',
        './admin-requests-text.ts',
      ].sort(),
    );
  });

  it('WXD-132 không fetch ngoài lớp client, không dangerouslySetInnerHTML, không kho trình duyệt, không đường dẫn viết tay, không ép id sang số, không console', () => {
    expect(violations(SOURCES)).toEqual([]);
  });

  it('WXD-132 tham số chi nhánh: chỉ file API đọc dựng khoá `chiNhanhId`; bộ chọn chỉ ĐỌC thuộc tính của lựa chọn; không file nào khác nhắc tới', () => {
    expect(filesWith(SOURCES, /\bchiNhanhId\b/)).toEqual(
      [API_FILE, FILTER_FILE].sort(),
    );
    expect(writesBranchParam(SOURCES[API_FILE])).toBe(true);
    expect(writesBranchParam(SOURCES[FILTER_FILE])).toBe(false);
    // đường GHI không bao giờ biết chi nhánh
    expect(strip(SOURCES[WRITE_FILE])).not.toMatch(/chiNhanh/);
  });

  it('WXD-133 mọi lời gọi mạng đi qua `request()` của lớp client, chỉ ở HAI file API; chỉ file ghi gửi POST và KHÔNG truyền `signal`; đường dẫn điều hướng lấy từ `booking-paths`', () => {
    expect(filesWith(SOURCES, /\brequest\s*(<[^>]*>)?\s*\(/)).toEqual([
      API_FILE,
      WRITE_FILE,
    ]);
    for (const file of [API_FILE, WRITE_FILE]) {
      expect(SOURCES[file]).toContain(
        "from '../../../../../shared/api/client'",
      );
    }
    expect(filesWith(SOURCES, /method:\s*'(POST|PUT|PATCH|DELETE)'/)).toEqual([
      WRITE_FILE,
    ]);
    expect(strip(SOURCES[WRITE_FILE])).not.toMatch(/\bsignal\b/);
    for (const file of [
      './admin-requests-pages.tsx',
      './admin-request-routes.tsx',
    ]) {
      expect(SOURCES[file]).toContain('shared/routes/booking-paths');
    }
  });

  it('WXD-134 đối chứng: bộ quét bắt từng loại vi phạm trong mã giả và không báo nhầm chú thích', () => {
    const bad = {
      './a.ts': 'const r = await fetch("/api/x");',
      './b.tsx': '<div dangerouslySetInnerHTML={{ __html: x }} />',
      './c.ts': "sessionStorage.setItem('chi-nhanh', branch);",
      './d.ts': "const to = '/admin/duyet-yeu-cau/doi-lich';",
      './e.ts': 'const id = Number(row.yeuCauId);',
      './f.ts': 'console.log(ghiChu);',
      './g.ts': 'const x = axios.get("/api");',
      './h.ts': 'el.innerHTML = x;',
    };
    expect(violations(bad)).toHaveLength(Object.keys(bad).length);
    expect(RULES.length).toBeGreaterThanOrEqual(8);
    expect(writesBranchParam('const q = { chiNhanhId: branch };')).toBe(true);
    expect(writesBranchParam('params.chiNhanhId = branch;')).toBe(true);
    expect(writesBranchParam('<option value={o.chiNhanhId} />')).toBe(false);
    expect(writesBranchParam('o.chiNhanhId === branch')).toBe(false);
    expect(
      violations({
        './a.ts': [
          '// không fetch(), không localStorage, không Number(id)',
          '/* chiNhanhId và dangerouslySetInnerHTML */',
          'const to = adminRescheduleRequestDetailPath(id);',
        ].join('\n'),
      }),
    ).toEqual([]);
  });

  it('WXD-135 phân tầng: thư mục của Quản trị viên chỉ nhập `common/`, chính nó, `shared/`, bề mặt công khai của `admin` và thư viện; `common/` không nhập thư mục `admin/`', () => {
    const allowed =
      /^(react$|react-router$|\.\/|\.\.\/\.\.\/common\/|\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/shared\/|\.\.\/\.\.\/\.\.\/\.\.\/admin$)/;
    const outside = Object.entries(SOURCES).flatMap(([file, source]) =>
      importsOf(source)
        .filter((path) => !allowed.test(path))
        .map((path) => `${file}: ${path}`),
    );
    expect(outside).toEqual([]);
    expect(Object.keys(COMMON).length).toBeGreaterThan(20);
    expect(
      Object.entries(COMMON).flatMap(([file, source]) =>
        importsOf(source)
          .filter((path) => /(^|\/)admin\//.test(path))
          .map((path) => `${file}: ${path}`),
      ),
    ).toEqual([]);
  });
});
