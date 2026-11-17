import { describe, expect, it } from 'vitest';

// doctor-exam F7, WKD-18 [đề xuất]: bộ quét TĨNH mã nguồn của trang Kiểm duyệt đánh giá (`admin/`) và hai file `api/admin-review-*`. Tên người đặt, nhận xét và `q` là chữ của người dùng: KHÔNG vào kho trình duyệt, URL, `location.state`, tiêu đề tài liệu hay log;
// nhận xét chỉ hiện bằng chữ do React vẽ (không HTML thô). `features/doctor` KHÔNG import `features/booking` và không đi sâu vào file của feature khác (Q20; WHT-10 ở `features/doctor/architecture.test.ts` quét cả cây, đây là quét riêng). Bỏ file test và `testing/`; bỏ chú thích.
const SOURCES = import.meta.glob(
  [
    './*.{ts,tsx}',
    '../api/admin-review-*.ts',
    '!./*.test.{ts,tsx}',
    '!../api/*.test.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const FORBIDDEN: Record<string, RegExp> = {
  localStorage: /\blocalStorage\b/,
  sessionStorage: /\bsessionStorage\b/,
  indexedDB: /\bindexedDB\b/,
  cookie: /\bdocument\.cookie\b/,
  'document.title': /\bdocument\.title\b/,
  'console.*': /\bconsole\./,
  dangerouslySetInnerHTML: /dangerouslySetInnerHTML/,
  innerHTML: /\.(?:inner|outer)HTML\b/,
  eval: /\beval\s*\(/,
  // `q` và bộ lọc KHÔNG lên URL (nếp F11): không đọc hay ghi query, lịch sử, `location.state`
  useSearchParams: /\buseSearchParams\b/,
  setSearchParams: /\bsetSearchParams\b/,
  useNavigate: /\buseNavigate\b/,
  useLocation: /\buseLocation\b/,
  'history.*': /\b(?:pushState|replaceState)\b/,
  'location.*': /\blocation\.(?:search|hash|href|state)\b/,
};

interface ImportRef {
  specifier: string;
  names: string[] | null;
}

// Nhánh 1: `import|export [type] <mệnh đề> from '…'`; nhánh 2: `import '…'` và `import('…')`
const IMPORT_PATTERN =
  /(?:import|export)\s+(?:type\s+)?([^'";]*?)\s+from\s*['"]([^'"]+)['"]|import\s*\(?\s*['"]([^'"]+)['"]/g;

function importsOf(code: string): ImportRef[] {
  return [...code.matchAll(IMPORT_PATTERN)].map((match) => {
    if (match[2] === undefined) return { specifier: match[3], names: null };
    const named = /^\{([^}]*)\}$/.exec(match[1].trim());
    const names =
      named === null
        ? null
        : named[1]
            .split(',')
            .map(
              (part) =>
                part
                  .trim()
                  .replace(/^type\s+/, '')
                  .split(/\s+as\s+/)[0],
            )
            .filter((name) => name !== '');
    return { specifier: match[2], names };
  });
}

// Bỏ chú thích khối và chú thích dòng (không đụng `//` trong chuỗi như `http://`)
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

// Ngoại lệ THEO TÊN (một `Map` để tên như "constructor" không trúng nguyên mẫu): mỗi module ngoài `admin/`, `api/`, `shared/` chỉ được nhập đúng các tên đã kiểm
const NAMED_ALLOWANCE = new Map<string, readonly string[]>([
  [
    '../../../admin',
    [
      'AdminScopeGuard',
      'AdminTable',
      'AdminTableColumn',
      'AdminMe',
      'useAdminScope',
    ],
  ],
  ['../../../auth', ['ROLE_HOME_PATHS']],
  ['../../components/modal-frame', ['ModalFrame']],
  ['../../reception/use-reception-data', ['useReceptionDoctors']],
  ['../exam-messages', ['formatCount']],
  ['../patient/patient-exam-format', ['formatRatingDate', 'formatVisitTime']],
  ['../patient/rating-text', ['starName']],
]);

// Import tương đối được phép: cùng thư mục (`./`), `../api/…`, `shared/` (`../../../../shared/…`), và đúng các tên ở `NAMED_ALLOWANCE`; gói ngoài (không tương đối) luôn được
function importAllowed({ specifier, names }: ImportRef): boolean {
  if (!specifier.startsWith('.')) return true;
  if (
    specifier.startsWith('./') ||
    specifier.startsWith('../api/') ||
    specifier.startsWith('../../../../shared/')
  ) {
    return true;
  }
  const allowed = NAMED_ALLOWANCE.get(specifier);
  return (
    allowed !== undefined &&
    names !== null &&
    names.length > 0 &&
    names.every((name) => allowed.includes(name))
  );
}

function violations(source: string): string[] {
  const code = stripComments(source);
  const found = Object.entries(FORBIDDEN)
    .filter(([, pattern]) => pattern.test(code))
    .map(([name]) => `dùng ${name}`);
  for (const ref of importsOf(code)) {
    if (!importAllowed(ref)) found.push(`import ${ref.specifier}`);
  }
  return found;
}

describe('doctor-exam F7 — vệ sinh dữ liệu và import của trang Kiểm duyệt đánh giá (WKD-18)', () => {
  it('WKD-18 bộ quét thấy mã thật (trang, hook, bộ đọc, hộp) và KHÔNG thấy file test hay thư mục testing', () => {
    const files = Object.keys(SOURCES);
    expect(files.length).toBeGreaterThan(10);
    expect(files).toEqual(
      expect.arrayContaining([
        './reviews-page.tsx',
        './use-reviews.ts',
        './review-detail-dialog.tsx',
        './reviews-table.tsx',
        '../api/admin-review-readers.ts',
        '../api/admin-review-types.ts',
      ]),
    );
    expect(files.filter((file) => /\.test\.|testing\//.test(file))).toEqual([]);
  });

  it('WKD-18 không file nào dùng kho trình duyệt, cookie, tiêu đề tài liệu, `console.*`, HTML thô, `eval`, URL hay `location.state`', () => {
    const report = Object.entries(SOURCES)
      .map(([file, source]) => [file, violations(source)] as const)
      .filter(([, list]) => list.length > 0);
    expect(report).toEqual([]);
  });

  it('WKD-18 import chỉ trong `admin/`, `api/`, `shared/` và các tên đã kiểm: không `features/booking`, không file sâu của feature khác (Q20)', () => {
    const outside: string[] = [];
    for (const [file, source] of Object.entries(SOURCES)) {
      for (const ref of importsOf(stripComments(source))) {
        if (!importAllowed(ref)) outside.push(`${file} → ${ref.specifier}`);
      }
    }
    expect(outside).toEqual([]);
  });

  it('WKD-18 ĐỐI CHỨNG: bộ quét có tác dụng (nhận ra từng điều cấm và từng import sai, không báo nhầm chú thích)', () => {
    const bad: Record<string, string> = {
      localStorage: "localStorage.setItem('q', q);",
      sessionStorage: 'sessionStorage.length;',
      'document.title': 'document.title = name;',
      'console.*': 'console.warn(nhanXet);',
      dangerouslySetInnerHTML: '<p dangerouslySetInnerHTML={{ __html: x }} />',
      innerHTML: 'node.innerHTML = x;',
      useSearchParams: 'const [p] = useSearchParams();',
      setSearchParams: 'setSearchParams({ q });',
      useNavigate: 'const go = useNavigate();',
      'location.*': 'window.location.search;',
      'history.*': "history.replaceState(null, '', '?q=a');",
    };
    for (const [name, code] of Object.entries(bad)) {
      expect(violations(code), name).toContain(`dùng ${name}`);
    }
    // Chú thích và chuỗi URL không bị báo nhầm
    expect(
      violations(
        "// không localStorage, không console.log\nconst url = 'http://x.example';\n/* document.title */",
      ),
    ).toEqual([]);

    expect(violations("import { x } from '../../../booking';")).toEqual([
      'import ../../../booking',
    ]);
    expect(
      violations("import { Y } from '../../../booking/appointments/common/y';"),
    ).toHaveLength(1);
    // Đi sâu vào file của feature admin, tên ngoài danh sách, import mặc định, `* as`, động, không tên: đều bị chặn
    for (const code of [
      "import { AdminTable } from '../../../admin/components/admin-table';",
      "import { AdminTable, AdminHeader } from '../../../admin';",
      "import Admin from '../../../admin';",
      "import * as admin from '../../../admin';",
      "const m = import('../../../booking');",
      "import '../../../booking';",
      "import { normalizeText } from '../exam-messages';",
    ]) {
      expect(violations(code), code).not.toEqual([]);
    }
    // Đúng tên được phép thì qua
    expect(
      violations(
        "import { AdminTable, type AdminTableColumn } from '../../../admin';\nimport { useReceptionDoctors } from '../../reception/use-reception-data';",
      ),
    ).toEqual([]);
  });
});
