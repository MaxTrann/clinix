import { describe, expect, it } from 'vitest';

// booking F6: bộ quét TĨNH các file mã của `wizard/payment/` (không tính test). WPF6-50 là [đề xuất] (TRACKING booking 3.49.3). Khoá các luật mà test hành vi không thấy: không `console.*`, không kho
// trình duyệt (WZ-09: tải lại là GET lại), không viền focus tự đặt (FG-05), không `Date.now()` trong component (luật `purity`; đồng hồ nằm ở hook), và chỉ MỘT chỗ import `features/payment`,
// qua `index.ts` (BWZ-08). Đọc mã bằng `import.meta.glob` của Vite (như `architecture.test.ts`).
const SOURCES = import.meta.glob(['./*.{ts,tsx}', '!./*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// Bỏ chú thích (câu giải thích có thể nhắc "localStorage", "console") trước khi quét
const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const CODE = Object.entries(SOURCES).map(
  ([file, source]) => [file, strip(source)] as const,
);

const FORBIDDEN: [string, RegExp][] = [
  ['console.*', /\bconsole\s*\./],
  [
    'kho trình duyệt',
    /\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie/,
  ],
  [
    'viền focus tự đặt (FG-05)',
    /(?:^|[\s'"`{])(?:[^\s'"`{:]+:)*(?:outline|ring)(?:-[^\s'"`}:]*)?(?=[\s'"`}]|$)|focus(?:-visible|-within)?:/,
  ],
  ['CSS Module (FG-06)', /\.module\.css/],
];

describe('WPF6-50 quét tĩnh wizard/payment', () => {
  it('có đủ file mã để quét (đối chứng: bộ quét không rỗng)', () => {
    expect(CODE.length).toBeGreaterThanOrEqual(8);
    expect(CODE.map(([file]) => file)).toEqual(
      expect.arrayContaining([
        './hold-countdown.ts',
        './use-hold-clock.ts',
        './payment-panel.tsx',
      ]),
    );
  });

  it.each(FORBIDDEN)(
    'không có %s trong mã (đã bỏ chú thích)',
    (_name, pattern) => {
      const violations = CODE.filter(([, source]) => pattern.test(source)).map(
        ([file]) => file,
      );
      expect(violations).toEqual([]);
    },
  );

  it('component (.tsx) không đọc đồng hồ máy lúc render: `Date.now()` chỉ ở hook và hàm tải', () => {
    const tsx = CODE.filter(([file]) => file.endsWith('.tsx'));
    const violations = tsx
      .filter(([, source]) => /Date\.now\(\)|new Date\(\)/.test(source))
      .map(([file]) => file);
    expect(violations).toEqual([]);
  });

  it('chỉ `payment-panel.tsx` import `features/payment`, và CHỈ qua `index.ts` (BWZ-08)', () => {
    const IMPORT = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
    const importers: string[] = [];
    for (const [file, source] of CODE) {
      for (const match of source.matchAll(IMPORT)) {
        const specifier = match[1];
        if (/\/payment(\/|$)/.test(specifier) && specifier.startsWith('..')) {
          // `../../../payment` ở đúng độ sâu của thư mục này là `features/payment`
          importers.push(`${file} → ${specifier}`);
        }
      }
    }
    expect(importers).toEqual(['./payment-panel.tsx → ../../../payment']);
  });

  it('đối chứng: bộ lọc chú thích bỏ chú thích nhưng GIỮ mã thật', () => {
    const sample = [
      '// nhắc localStorage và console.log trong chú thích',
      '/* sessionStorage */',
      "const url = 'http://x.invalid/a';",
      'localStorage.setItem("a", "b");',
    ].join('\n');
    const code = strip(sample);
    expect(FORBIDDEN[1][1].test(code)).toBe(true);
    expect(FORBIDDEN[0][1].test(code)).toBe(false);
    expect(code).toContain("'http://x.invalid/a'");
  });
});
