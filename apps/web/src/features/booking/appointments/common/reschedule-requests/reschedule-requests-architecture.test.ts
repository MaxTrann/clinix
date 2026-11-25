import { describe, expect, it } from 'vitest';

// reschedule F4, WXD-75…WXD-78 `[đề xuất]` và WXD-10 theo PLAN reschedule 7.11 ("ca kiến trúc như BWZ-08"; nếp WDH-10 của F1): bộ quét TĨNH các file mã của trang yêu cầu đổi lịch (thư mục dùng chung
// `common/reschedule-requests/` và phần của Lễ tân `reception/reschedule-requests/`): không `fetch` ngoài lớp API client, đường dẫn dựng từ `booking-paths` (không viết tay), không `dangerouslySetInnerHTML`,
// không kho trình duyệt (tab, trang, bộ lọc nằm trên URL), id không qua `Number`, không ghi ra `console` (mã lịch, lý do, ghi chú là dữ liệu cá nhân), và KHÔNG BAO GIỜ nhắc `chiNhanhId` (Lễ tân gửi nó là khoá lạ
// ⇒ 400; phạm vi chi nhánh do máy chủ đọc từ tài khoản). Đọc mã bằng `import.meta.glob` của Vite với `?raw` (nếp BWZ-08), bỏ file test, và bỏ chú thích trước khi quét.
const SOURCES = import.meta.glob(
  [
    './*.{ts,tsx}',
    '!./*.test.{ts,tsx}',
    '../../reception/reschedule-requests/*.{ts,tsx}',
    '!../../reception/reschedule-requests/*.test.{ts,tsx}',
  ],
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
  // `Number(page)` là số trang, không phải id: chỉ cấm ép một thứ có tên là id sang số
  [
    'ép id sang số',
    /\b(?:Number|parseInt|parseFloat|BigInt)\s*\([^)]*(?:Id|\bid)\b/,
  ],
  [
    'ghi ra console (mã lịch, lý do, ghi chú là dữ liệu cá nhân)',
    /\bconsole\s*\./,
  ],
  [
    'chiNhanhId (Lễ tân không bao giờ gửi; chi nhánh do máy chủ quyết)',
    /chiNhanhId/,
  ],
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

describe('reschedule F4 — kiến trúc web của trang yêu cầu đổi lịch (WXD-10)', () => {
  it('WXD-75 bộ quét thấy mã thật: bộ đọc, trạng thái URL, hook, bảng, chi tiết, API và trang của Lễ tân', () => {
    expect(Object.keys(SOURCES)).toEqual(
      expect.arrayContaining([
        './request-readers.ts',
        './request-query-state.ts',
        './request-code.ts',
        './request-states.ts',
        './request-text.ts',
        './use-request-list.ts',
        './use-request-detail.ts',
        './use-doctor-options.ts',
        './request-list-view.tsx',
        './request-table.tsx',
        './request-search.tsx',
        './request-detail-view.tsx',
        './request-detail-sections.tsx',
        // Pha B1
        './request-handle-readers.ts',
        './request-handle-failure.ts',
        './request-handle-text.ts',
        './request-note-rules.ts',
        './request-notice-state.ts',
        './use-handle-request.ts',
        './handle-dialog.tsx',
        './request-actions.tsx',
        './request-detail-page.tsx',
        '../../reception/reschedule-requests/reception-requests-handle-api.ts',
        '../../reception/reschedule-requests/reception-requests-api.ts',
        '../../reception/reschedule-requests/reception-requests-pages.tsx',
        '../../reception/reschedule-requests/reception-request-routes.tsx',
      ]),
    );
  });

  it('WXD-76 không fetch ngoài lớp client, không dangerouslySetInnerHTML, không kho trình duyệt, không đường dẫn viết tay, không ép id sang số, không console, không chiNhanhId', () => {
    expect(violations(SOURCES)).toEqual([]);
  });

  it('WXD-77 mọi lời gọi mạng đi qua `request()` của lớp API client duy nhất, và chỉ ở HAI file của Lễ tân (đọc và ghi); chỉ file ghi gửi POST và KHÔNG truyền `signal`', () => {
    const callers = Object.entries(SOURCES)
      .filter(([, source]) => /\brequest\s*(<[^>]*>)?\s*\(/.test(strip(source)))
      .map(([file]) => file)
      .sort();
    expect(callers).toEqual([
      '../../reception/reschedule-requests/reception-requests-api.ts',
      '../../reception/reschedule-requests/reception-requests-handle-api.ts',
    ]);
    for (const file of callers) {
      expect(SOURCES[file]).toContain(
        "from '../../../../../shared/api/client'",
      );
    }
    const posters = Object.entries(SOURCES)
      .filter(([, source]) =>
        /method:\s*'(POST|PUT|PATCH|DELETE)'/.test(strip(source)),
      )
      .map(([file]) => file);
    expect(posters).toEqual([
      '../../reception/reschedule-requests/reception-requests-handle-api.ts',
    ]);
    // POST đã gửi thì máy chủ vẫn xử lý dù trang bị gỡ: huỷ ở client chỉ làm người dùng không biết kết quả (nếp F2, F9)
    expect(
      strip(
        SOURCES[
          '../../reception/reschedule-requests/reception-requests-handle-api.ts'
        ],
      ),
    ).not.toMatch(/\bsignal\b/);
  });

  it('WXD-77 đường dẫn điều hướng của trang Lễ tân lấy từ `shared/routes/booking-paths`', () => {
    for (const file of [
      '../../reception/reschedule-requests/reception-requests-pages.tsx',
      '../../reception/reschedule-requests/reception-request-routes.tsx',
    ]) {
      expect(SOURCES[file]).toContain('shared/routes/booking-paths');
    }
  });

  it('WXD-78 bộ quét có tác dụng (đối chứng): bắt từng loại vi phạm trong mã giả', () => {
    const bad = {
      './a.ts': 'const r = await fetch("/api/x");',
      './b.tsx': '<div dangerouslySetInnerHTML={{ __html: x }} />',
      './c.ts': "localStorage.setItem('k', v);",
      './d.ts': "const to = '/le-tan/yeu-cau-doi-lich';",
      './e.ts': 'const id = Number(row.yeuCauId);',
      './f.ts': 'const id = parseInt(bacSiId, 10);',
      './g.ts': 'document.cookie = "a=b";',
      './h.ts': 'el.innerHTML = x;',
      './i.ts': 'const x = axios.get("/api");',
      './j.ts': 'console.log(ghiChu);',
      './k.ts': 'const query = { chiNhanhId: row.chiNhanh.id };',
      './l.ts': 'const n = BigInt(id);',
    };
    expect(violations(bad)).toHaveLength(Object.keys(bad).length);
  });

  it('WXD-78 bộ quét không báo nhầm (đối chứng): chú thích nhắc các từ này, `Number(page)` và `request(` hợp lệ đều lành', () => {
    const good = {
      './a.ts': [
        '// không fetch(), không Number(id), không localStorage, không chiNhanhId',
        '/* dangerouslySetInnerHTML là cấm */',
        'const to = receptionRescheduleRequestDetailPath(id);',
        'const page = Number(params.get("page"));',
        "const out = await request<unknown>('reception/reschedule-requests', { query });",
        'const url = "http://web.invalid/x";',
      ].join('\n'),
    };
    expect(violations(good)).toEqual([]);
  });
});
