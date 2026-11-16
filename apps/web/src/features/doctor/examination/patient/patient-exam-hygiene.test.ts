import { describe, expect, it } from 'vitest';

// doctor-exam F5, WXH-16 [đề xuất]: bộ quét TĨNH mã nguồn của trang Hồ sơ khám bệnh của Bệnh nhân. Dữ liệu sức khoẻ không được vào kho trình duyệt, tiêu đề, log; nội dung hồ sơ chỉ hiện bằng chữ do React vẽ (không HTML thô); và `features/doctor`
// KHÔNG import `features/booking` hay đi sâu vào file của feature khác (Q20; WHT-10 ở `features/doctor/architecture.test.ts` quét cả cây, đây là quét riêng thư mục `patient/` và hai file `api/patient-exam-*`). Bỏ file test và `testing/`; bỏ chú thích.
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
const IMPORT_PATTERN = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

// Bỏ chú thích khối và chú thích dòng (không đụng `//` trong chuỗi như `http://`)
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

// Import tương đối được phép: cùng thư mục (`./`), `../api/…` và `shared/` (`../../../../shared/…`); gói ngoài (không tương đối) luôn được phép
function importAllowed(specifier: string): boolean {
  if (!specifier.startsWith('.')) return true;
  return (
    specifier.startsWith('./') ||
    specifier.startsWith('../api/') ||
    specifier.startsWith('../../../../shared/')
  );
}

function violations(source: string): string[] {
  const code = stripComments(source);
  const found = Object.entries(FORBIDDEN)
    .filter(([, pattern]) => pattern.test(code))
    .map(([name]) => `dùng ${name}`);
  for (const match of code.matchAll(IMPORT_PATTERN)) {
    if (!importAllowed(match[1])) found.push(`import ${match[1]}`);
  }
  return found;
}

describe('doctor-exam F5 — vệ sinh dữ liệu và import của trang Hồ sơ khám bệnh (WXH-16)', () => {
  it('WXH-16 bộ quét thấy mã thật: trang, hook, bộ đọc, và KHÔNG thấy file test hay thư mục testing', () => {
    const files = Object.keys(SOURCES);
    expect(files.length).toBeGreaterThan(15);
    expect(files).toEqual(
      expect.arrayContaining([
        './exam-records-page.tsx',
        './use-exam-browser.ts',
        './record-pane.tsx',
        '../api/patient-exam-readers.ts',
        '../api/patient-exam-types.ts',
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

  it('WXH-16 import chỉ trong `patient/`, `api/` và `shared/`: không `features/booking`, không file sâu của feature khác (Q20)', () => {
    const outside: string[] = [];
    for (const [file, source] of Object.entries(SOURCES)) {
      for (const match of stripComments(source).matchAll(IMPORT_PATTERN)) {
        if (!importAllowed(match[1])) outside.push(`${file} → ${match[1]}`);
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
    expect(violations("import { a } from '../exam-record-form';")).toEqual([
      'import ../exam-record-form',
    ]);
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
});
