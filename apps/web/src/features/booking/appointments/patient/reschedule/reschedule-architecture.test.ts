import { describe, expect, it } from 'vitest';

// reschedule F1, mã ca WDH-10 (PLAN reschedule 7.11, "ca kiến trúc như BWZ-08"): bộ quét TĨNH các file mã của trang đổi lịch (thư mục `reschedule/` và `detail/reschedule-section.tsx`):
// không `fetch` ngoài lớp API client, đường dẫn dựng từ `booking-paths` (không viết tay), không `dangerouslySetInnerHTML`, không kho trình duyệt, id không qua `Number`. Đọc mã bằng
// `import.meta.glob` của Vite với `?raw` (nếp BWZ-08), bỏ file test, và bỏ chú thích trước khi quét (chú thích có thể nhắc các từ này).
const SOURCES = import.meta.glob(
  ['./*.{ts,tsx}', '!./*.test.{ts,tsx}', '../detail/reschedule-section.tsx'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

type Rule = readonly [name: string, pattern: RegExp];

const RULES: readonly Rule[] = [
  ['gọi fetch', /(?<![\w.])fetch\s*\(/],
  [
    'XMLHttpRequest hay axios',
    /XMLHttpRequest|\baxios\b|navigator\.sendBeacon/,
  ],
  ['dangerouslySetInnerHTML', /dangerouslySetInnerHTML/],
  ['innerHTML hay outerHTML', /\.(inner|outer)HTML\b/],
  [
    'kho trình duyệt',
    /\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie|caches\./,
  ],
  [
    'đường dẫn viết tay (phải dựng từ booking-paths)',
    /['"`]\/(benh-nhan|dat-lich|le-tan|admin|bac-si-portal)\b/,
  ],
  ['ép id sang số', /\b(Number|parseInt|parseFloat|BigInt)\s*\(/],
];

function violations(sources: Record<string, string>): string[] {
  const found: string[] = [];
  for (const [file, source] of Object.entries(sources)) {
    const code = strip(source);
    for (const [name, pattern] of RULES) {
      if (pattern.test(code)) found.push(`${file}: ${name}`);
    }
  }
  return found;
}

describe('reschedule F1 — kiến trúc web của trang đổi lịch (WDH-10)', () => {
  it('WDH-10 bộ quét thấy mã thật: trang, bộ đọc, hook, mã lỗi, màn xác nhận và nút ở chi tiết', () => {
    expect(Object.keys(SOURCES)).toEqual(
      expect.arrayContaining([
        './reschedule-page.tsx',
        './reschedule-confirm-page.tsx',
        './reschedule-preview-api.ts',
        './use-reschedule-preview.ts',
        './reschedule-errors.ts',
        './reschedule-text.ts',
        './current-appointment-card.tsx',
        '../detail/reschedule-section.tsx',
      ]),
    );
  });

  it('WDH-10 không fetch ngoài lớp client, không dangerouslySetInnerHTML, không kho trình duyệt, không đường dẫn viết tay, không ép id sang số', () => {
    expect(violations(SOURCES)).toEqual([]);
  });

  it('WDH-10 mọi lời gọi mạng đi qua `request()` của lớp API client duy nhất, và chỉ ở bộ đọc preview', () => {
    const callers = Object.entries(SOURCES)
      .filter(([, source]) => /\brequest\s*(<[^>]*>)?\s*\(/.test(strip(source)))
      .map(([file]) => file);
    expect(callers).toEqual(['./reschedule-preview-api.ts']);
    expect(SOURCES['./reschedule-preview-api.ts']).toContain(
      "from '../../../../../shared/api/client'",
    );
  });

  it('WDH-10 đường dẫn điều hướng lấy từ `shared/routes/booking-paths`', () => {
    for (const file of [
      './reschedule-page.tsx',
      './reschedule-confirm-page.tsx',
      '../detail/reschedule-section.tsx',
    ]) {
      expect(SOURCES[file]).toContain('shared/routes/booking-paths');
    }
  });

  it('WDH-10 bộ chọn khung giờ nhập từ cổng `index.ts` của search (không đi sâu vào search)', () => {
    const imports = [
      ...SOURCES['./reschedule-page.tsx'].matchAll(
        /import\s*\{[^}]*\bSlotPicker\b[^}]*\}\s*from\s*'([^']+)'/g,
      ),
    ].map((match) => match[1]);
    expect(imports).toEqual(['../../../../search']);
  });

  it('WDH-10 bộ quét có tác dụng (đối chứng): bắt từng loại vi phạm trong mã giả', () => {
    const bad = {
      './a.ts': 'const r = await fetch("/api/x");',
      './b.tsx': '<div dangerouslySetInnerHTML={{ __html: x }} />',
      './c.ts': "localStorage.setItem('k', v);",
      './d.ts': "const to = '/benh-nhan/lich-hen-cua-toi';",
      './e.ts': 'const id = Number(slot.khungGioId);',
      './f.ts': 'const id = parseInt(slot.khungGioId, 10);',
      './g.ts': 'document.cookie = "a=b";',
      './h.ts': 'el.innerHTML = x;',
      './i.ts': 'const x = axios.get("/api");',
    };
    expect(violations(bad)).toHaveLength(Object.keys(bad).length);
  });

  it('WDH-10 bộ quét không báo nhầm (đối chứng): chú thích nhắc các từ này và `request(` hợp lệ đều lành', () => {
    const good = {
      './a.ts': [
        '// không fetch(), không Number(id), không localStorage',
        '/* dangerouslySetInnerHTML là cấm */',
        'const to = patientAppointmentDetailPath(ma);',
        "const out = await request<unknown>('patient/x', { query });",
        'const url = "http://web.invalid/x";',
      ].join('\n'),
    };
    expect(violations(good)).toEqual([]);
  });
});
