import { describe, expect, it } from 'vitest';

// doctor-exam F5, WXH-16 [đề xuất] (F6 mở rộng): bộ quét TĨNH mã nguồn của trang Hồ sơ khám bệnh và của hai thẻ ở chi tiết lịch hẹn của Bệnh nhân. Dữ liệu sức khoẻ không được vào kho trình duyệt, tiêu đề, log; nội dung hồ sơ và nhận xét chỉ hiện bằng chữ do React vẽ
// (không HTML thô); và `features/doctor` KHÔNG import `features/booking` hay đi sâu vào file của feature khác (Q20; WHT-10 ở `features/doctor/architecture.test.ts` quét cả cây, đây là quét riêng thư mục `patient/` và hai file `api/patient-exam-*`). Bỏ file test và `testing/`; bỏ chú thích.
//
// F6 (điều kiện (g) của phiên kiểm, 16/11/2026): `patient/` cần dùng chung `normalizeText`, `textLength` (từ `../exam-record-form`) và `formatCount` (từ `../exam-messages`) của hộp ghi hồ sơ F3 thay vì chép bản thứ hai (hai bản chuẩn hoá lệch nhau là lỗi âm thầm).
// Cho phép THEO TÊN, không theo module: CHỈ ba tên đó; mọi tên khác từ hai module đó, import mặc định, `* as`, import động và import không tên vẫn bị chặn. Ba hàm đã kiểm là hàm thuần (không storage, URL, `console`).
const SOURCES = import.meta.glob(
  [
    './*.{ts,tsx}',
    '../api/patient-exam-*.ts',
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
};

// Một import: đường dẫn và các TÊN được nhập; `names` là `null` khi không phải dạng `{ a, b }` (mặc định, `* as x`, không tên, động)
interface ImportRef {
  specifier: string;
  names: string[] | null;
}

// Nhánh 1: `import|export [type] <mệnh đề> from '…'` (mệnh đề không chứa nháy hay `;` nên không nuốt qua câu lệnh khác); nhánh 2: `import '…'` và `import('…')`
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

// Ngoại lệ THEO TÊN (một `Map` để tên như "constructor" không trúng nguyên mẫu)
const NAMED_ALLOWANCE = new Map<string, readonly string[]>([
  ['../exam-record-form', ['normalizeText', 'textLength']],
  ['../exam-messages', ['formatCount']],
]);

// Import tương đối được phép: cùng thư mục (`./`), `../api/…` và `shared/` (`../../../../shared/…`), và đúng ba tên ở `NAMED_ALLOWANCE`; gói ngoài (không tương đối) luôn được phép
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

describe('doctor-exam F5 — vệ sinh dữ liệu và import của trang Hồ sơ khám bệnh (WXH-16)', () => {
  it('WXH-16 bộ quét thấy mã thật: trang, hook, bộ đọc, hai thẻ của F6, và KHÔNG thấy file test hay thư mục testing', () => {
    const files = Object.keys(SOURCES);
    expect(files.length).toBeGreaterThan(15);
    expect(files).toEqual(
      expect.arrayContaining([
        './exam-records-page.tsx',
        './use-exam-browser.ts',
        './record-pane.tsx',
        '../api/patient-exam-readers.ts',
        '../api/patient-exam-types.ts',
        './patient-exam-sections.tsx',
        './rating-form.tsx',
        './use-rating.ts',
        './rating-rules.ts',
      ]),
    );
    expect(files.filter((file) => /\.test\.|testing\//.test(file))).toEqual([]);
  });

  it('WXH-16 không file nào dùng kho trình duyệt, cookie, tiêu đề tài liệu, `console.*`, HTML thô, `eval`', () => {
    const report = Object.entries(SOURCES)
      .map(([file, source]) => [file, violations(source)] as const)
      .filter(([, list]) => list.length > 0);
    expect(report).toEqual([]);
  });

  it('WXH-16 import chỉ trong `patient/`, `api/` và `shared/` (kèm ba tên được phép): không `features/booking`, không file sâu của feature khác (Q20)', () => {
    const outside: string[] = [];
    for (const [file, source] of Object.entries(SOURCES)) {
      for (const ref of importsOf(stripComments(source))) {
        if (!importAllowed(ref)) outside.push(`${file} → ${ref.specifier}`);
      }
    }
    expect(outside).toEqual([]);
  });

  it('WXH-16 đối chứng: bộ quét BẮT mã vi phạm và KHÔNG báo nhầm chú thích', () => {
    expect(violations('localStorage.setItem("a", "b");')).toEqual([
      'dùng localStorage',
    ]);
    expect(violations("window.sessionStorage.getItem('a');")).toEqual([
      'dùng sessionStorage',
    ]);
    expect(violations('document.title = ten;')).toEqual([
      'dùng document.title',
    ]);
    expect(violations('console.log(hoSo);')).toEqual(['dùng console.*']);
    expect(violations('<p dangerouslySetInnerHTML={{ __html: x }} />')).toEqual(
      ['dùng dangerouslySetInnerHTML'],
    );
    expect(violations('el.innerHTML = x;')).toEqual(['dùng innerHTML']);
    expect(
      violations(
        "import x from '../../../booking/appointments/common/status-chip';",
      ),
    ).toEqual(['import ../../../booking/appointments/common/status-chip']);
    expect(
      violations(
        "import { ExamRecordCard } from '../doctor/exam-record-card';",
      ),
    ).toEqual(['import ../doctor/exam-record-card']);
    expect(
      violations("import { request } from '../../../../shared/api/client';"),
    ).toEqual([]);
    expect(violations("import { useState } from 'react';")).toEqual([]);
    expect(
      violations('// không dùng localStorage hay console.log\nconst a = 1;'),
    ).toEqual([]);
    expect(
      violations('/* sessionStorage, document.title */ const a = 1;'),
    ).toEqual([]);
  });

  it('WXH-16 (g) ba tên được phép: `normalizeText`, `textLength` từ `../exam-record-form` và `formatCount` từ `../exam-messages` (kể cả nhiều dòng, `type`, đặt lại tên)', () => {
    expect(
      violations(
        "import { normalizeText, textLength } from '../exam-record-form';",
      ),
    ).toEqual([]);
    expect(
      violations("import { formatCount } from '../exam-messages';"),
    ).toEqual([]);
    expect(
      violations(
        "import {\n  normalizeText as normalize,\n  textLength,\n} from '../exam-record-form';",
      ),
    ).toEqual([]);
    expect(
      violations("import { type textLength } from '../exam-record-form';"),
    ).toEqual([]);
  });

  it('WXH-16 (g) đối chứng: MỘT TÊN KHÁC từ hai module đó, import mặc định, `* as`, import động, import không tên và re-export đều bị BẮT (không cho phép theo module)', () => {
    const bad = (source: string, specifier: string) =>
      expect(violations(source)).toEqual([`import ${specifier}`]);
    bad(
      "import { EXAM_TEXT_MAX } from '../exam-record-form';",
      '../exam-record-form',
    );
    bad(
      "import { validateRecord } from '../exam-record-form';",
      '../exam-record-form',
    );
    bad("import { SAVE_TEXT } from '../exam-messages';", '../exam-messages');
    bad("import { fieldMessage } from '../exam-messages';", '../exam-messages');
    // một tên được phép lẫn một tên không ⇒ vẫn bị bắt
    bad(
      "import { normalizeText, validateRecord } from '../exam-record-form';",
      '../exam-record-form',
    );
    bad(
      "import { formatCount, SAVE_TEXT } from '../exam-messages';",
      '../exam-messages',
    );
    bad(
      "import type { RecordValues } from '../exam-record-form';",
      '../exam-record-form',
    );
    bad("import form from '../exam-record-form';", '../exam-record-form');
    bad("import * as form from '../exam-record-form';", '../exam-record-form');
    bad("import '../exam-messages';", '../exam-messages');
    bad("const x = import('../exam-record-form');", '../exam-record-form');
    bad(
      "export { normalizeText } from '../exam-record-form'; export { SAVE_TEXT } from '../exam-messages';",
      '../exam-messages',
    );
    // module khác của `examination/` vẫn cấm hẳn, kể cả tên "giống"
    bad(
      "import { normalizeText } from '../exam-record-text';",
      '../exam-record-text',
    );
    bad(
      "import { textLength } from '../doctor/exam-record-form';",
      '../doctor/exam-record-form',
    );
  });

  it('WXH-16 (g) bộ phân tích import không nuốt qua câu lệnh: import không tên đứng trước một import hợp lệ vẫn bị bắt đúng một lần', () => {
    expect(
      violations(
        "import '../exam-messages';\nimport { formatCount } from '../exam-messages';",
      ),
    ).toEqual(['import ../exam-messages']);
  });
});
