import { cssRules, readCssSource } from '../test/css-source';

// FG-05 đến FG-08 (PR "focus toàn hệ thống", TRACKING admin mục 7; quy tắc FE của Đại 16/11/2026, ADR 0004): bộ quét TĨNH cấm viền focus riêng ở mọi
// file mã của `apps/web`. Lớp base `styles/index.css` đã vẽ viền focus (ô chữ: vòng teal 2 px lùi vào trong, đỏ khi `aria-invalid`; còn lại: outline
// 2 px lệch 2 px), nên mã khác KHÔNG tự viết `focus:`, `focus-visible:`, `focus-within:`, `outline-*`, `ring-*`, bóng focus, `:focus*` trong CSS
// Module. Lý do (bẫy ba tầng, TRACKING admin 7.3): lớp `utilities` thắng `base` bất kể độ đặc hiệu, CSS Module không thuộc lớp nào nên thắng cả hai,
// nên mọi viền focus tự viết hoặc làm hỏng quy tắc chung hoặc lệch nhau giữa trang. Khung bọc ô (ô tìm có biểu tượng) dùng lớp `field-frame`.
// Ngoại lệ phải có lý do và còn xuất hiện thật (FG-08); thêm ngoại lệ mới là sửa danh sách này, nên lộ ra khi review.

const SOURCES = import.meta.glob(
  [
    '/src/**/*.{ts,tsx}',
    '!/src/**/*.test.{ts,tsx}',
    '!/src/**/*.d.ts',
    '!/src/**/testing/**',
    '!/src/test/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const SRC_PREFIX = '/src/';
const relative = (key: string) => key.slice(SRC_PREFIX.length);
const CODE_FILES = Object.entries(SOURCES).map(
  ([key, source]) => [relative(key), source] as const,
);
const CSS_FILES = Object.keys(import.meta.glob('/src/**/*.css')).map(relative);
const INDEX_CSS = 'styles/index.css';

// ----- mã .ts/.tsx -----

// Bỏ chú thích (câu giải thích có thể nhắc "focus:ring") rồi tách chuỗi lớp theo khoảng trắng, nháy, ngoặc: mỗi mảnh là một "lớp"
const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const SPLIT = /[\s'"`{}()<>,;=]+/;
// biến thể focus rồi một tiện ích (`focus:ring-2`, `hover:focus-visible:x`); `focus:` đứng một mình (khoá đối tượng) không tính
const FOCUS_VARIANT =
  /^(?:[^:]+:)*(?:focus|focus-visible|focus-within|group-focus|group-focus-within|peer-focus):[^:]/;
// tiện ích `outline`, `outline-*`, `ring`, `ring-*` (kể cả `outline-none`, `outline-offset-*`, `ring-offset-*`), có hoặc không biến thể
const OUTLINE_OR_RING = /^(?:[^:]+:)*!?-?(?:outline|ring)(?:-[^:]*)?$/;
// style nội tuyến (`style={{ outline: … }}`); chỉ tính khi nằm trong `style={{ … }}` để khoá đối tượng tên `outline` ở nơi khác không bị báo nhầm
const INLINE_STYLE =
  /style=\{\{[^}]*\b(outline|outlineOffset|outlineColor|outlineStyle|outlineWidth|boxShadow)\s*:/g;

function focusTokens(source: string): string[] {
  const code = strip(source);
  const found = new Set<string>();
  for (const token of code.split(SPLIT)) {
    if (FOCUS_VARIANT.test(token) || OUTLINE_OR_RING.test(token)) {
      found.add(token);
    }
  }
  for (const match of code.matchAll(INLINE_STYLE)) {
    found.add(`style:${match[1] ?? ''}`);
  }
  return [...found];
}

interface CodeException {
  file: string;
  tokens: string[];
  reason: string;
}

// Mỗi mục: file (tính từ `src/`), các token được phép, lý do. KHÔNG phải ô nhập: tiêu điểm lập trình, trang trí, danh sách cuộn, nút xoá đỏ.
const CODE_EXCEPTIONS: CodeException[] = [
  {
    file: 'features/booking/appointments/common/detail-frame.tsx',
    tokens: ['outline-none'],
    reason:
      'Tiêu đề h1 nhận tiêu điểm bằng mã (tabIndex -1) khi mở trang để đọc màn hình; không phải điều khiển nên không cần vòng',
  },
  {
    file: 'features/booking/wizard/confirm/confirm-panel.tsx',
    tokens: ['outline-none'],
    reason:
      'Khối thông báo lỗi nhận tiêu điểm bằng mã (tabIndex -1) để đọc lỗi; không phải điều khiển nên không cần vòng',
  },
  {
    file: 'features/booking/wizard/done/done-receipt.tsx',
    tokens: ['outline-none'],
    reason:
      'Tiêu đề h1 nhận tiêu điểm bằng mã (tabIndex -1) khi đặt lịch xong; không phải điều khiển nên không cần vòng',
  },
  {
    file: 'features/booking/wizard/done/done-state-notice.tsx',
    tokens: ['outline-none'],
    reason:
      'Tiêu đề h1 nhận tiêu điểm bằng mã (tabIndex -1) ở trạng thái thông báo; không phải điều khiển nên không cần vòng',
  },
  {
    file: 'features/booking/appointments/patient/detail/detail-timeline.tsx',
    tokens: ['ring-4', 'ring-cyan-100'],
    reason:
      'Vành trang trí quanh chấm mốc thời gian (không tương tác), không phải viền focus',
  },
  {
    file: 'features/patient/lookup/lookup-result-list.tsx',
    tokens: ['focus-visible:outline-offset-[-2px]'],
    reason:
      'Dòng danh sách (nút) nằm trong vùng cuộn: vòng outline lệch ra ngoài bị vùng cuộn cắt nên lệch vào trong 2 px; không phải ô nhập',
  },
  {
    file: 'features/admin/service-catalog/service-groups-tab.tsx',
    tokens: ['focus-visible:outline-2', 'focus-visible:outline-danger'],
    reason:
      'Nút xoá đỏ: vòng focus đỏ có chủ ý từ admin PR1 (nút, không phải ô nhập); Đại giữ làm ngoại lệ 17/11/2026',
  },
];

const allowedTokens = (file: string) =>
  CODE_EXCEPTIONS.find((item) => item.file === file)?.tokens ?? [];

// ----- CSS (CSS Module và index.css) -----

interface CssViolation {
  file: string;
  selector: string;
  kind: 'focus-selector' | 'outline-none-on-field';
}

interface CssException {
  file: string;
  selector: string;
  reason: string;
}

// Chỉ ô nhập NẰM TRONG khung bọc mới được tắt outline (khung vẽ vòng bằng `field-frame`)
const CSS_EXCEPTIONS: CssException[] = [
  {
    file: 'features/admin/branches/branches.module.css',
    selector: '.searchBox input',
    reason:
      'Ô tìm nằm trong khung `.searchBox` (lớp `field-frame`): khung vẽ vòng focus, ô bên trong phải tắt outline của nó',
  },
  {
    file: 'features/admin/specialties/specialty.module.css',
    selector: '.searchBox input',
    reason:
      'Ô tìm nằm trong khung `.searchBox` (lớp `field-frame`): khung vẽ vòng focus, ô bên trong phải tắt outline của nó',
  },
];

// Hợp tử cuối của bộ chọn (sau dấu cách hoặc `>`, `+`, `~` ở độ sâu 0; không tách trong ngoặc)
function lastCompound(selector: string): string {
  let depth = 0;
  let current = '';
  for (const char of selector) {
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth -= 1;
    if (depth === 0 && /[\s>+~]/.test(char)) {
      if (current !== '') current = '';
    } else {
      current += char;
    }
  }
  return current;
}

// Ô chữ: phần tử `input`, `textarea`, `select`, hay lớp `.input` (clinic-info)
const isTextControl = (selector: string) => {
  const last = lastCompound(selector);
  return (
    /(?:^|[^\w-])(?:input|textarea|select)(?![\w-])/.test(last) ||
    /^\.input(?![\w-])/.test(last)
  );
};
const OUTLINE_OFF = /^outline(?:-style)?:\s*(?:none|0)(?:\s|$)/;

function cssViolations(
  file: string,
  css: string,
  exceptions: CssException[] = CSS_EXCEPTIONS,
): CssViolation[] {
  // `styles/index.css` là nơi DUY NHẤT được viết `:focus*`; hợp đồng của nó do `focus-ring.test.ts` (FG-01 đến FG-04) khoá
  if (file === INDEX_CSS) return [];
  const found: CssViolation[] = [];
  for (const rule of cssRules(css)) {
    for (const selector of rule.selectors) {
      if (/:focus/.test(selector)) {
        found.push({ file, selector, kind: 'focus-selector' });
      }
      const allowed = exceptions.some(
        (item) => item.file === file && item.selector === selector,
      );
      if (
        isTextControl(selector) &&
        rule.declarations.some((item) => OUTLINE_OFF.test(item)) &&
        !allowed
      ) {
        found.push({ file, selector, kind: 'outline-none-on-field' });
      }
    }
  }
  return found;
}

const readCss = (file: string) => readCssSource(import.meta.url, `../${file}`);
const describeCss = (items: CssViolation[]) =>
  items.map((item) => `${item.file}: ${item.selector} (${item.kind})`);

describe('FG-05 mã .ts/.tsx: không lớp focus, outline, ring riêng ngoài danh sách ngoại lệ', () => {
  it('FG-05 bộ quét thật sự thấy mã (không xanh giả vì glob rỗng): hơn 400 file, có các file đã biết', () => {
    expect(CODE_FILES.length).toBeGreaterThan(400);
    const names = CODE_FILES.map(([file]) => file);
    for (const known of [
      'features/admin/service-catalog/service-form.tsx',
      'features/search/search-field.tsx',
      'features/doctor/examination/patient/rating-form.tsx',
      'features/auth/login/login-form.tsx',
      'features/patient/lookup/lookup-search-box.tsx',
    ]) {
      expect(names).toContain(known);
    }
    expect(names.some((file) => file.includes('.test.'))).toBe(false);
  });

  it('FG-05 không file nào có `focus:`, `focus-visible:`, `focus-within:`, `outline-*`, `ring-*` hay style nội tuyến `outline`, `boxShadow` ngoài ngoại lệ', () => {
    const found = CODE_FILES.flatMap(([file, source]) =>
      focusTokens(source)
        .filter((token) => !allowedTokens(file).includes(token))
        .map((token) => `${file}: ${token}`),
    );
    expect(found).toEqual([]);
  });
});

describe('FG-06 CSS: `:focus*` chỉ ở `styles/index.css`; không `outline: none` trên ô chữ ngoài khung bọc', () => {
  it('FG-06 bộ quét thật sự thấy CSS: có `styles/index.css` và các CSS Module của admin', () => {
    expect(CSS_FILES).toContain(INDEX_CSS);
    expect(
      CSS_FILES.filter((file) => file.endsWith('.module.css')),
    ).toHaveLength(5);
  });

  it('FG-06 không CSS Module nào có bộ chọn `:focus`, `:focus-visible`, `:focus-within` hay `outline: none` / `outline: 0` trên `input`, `textarea`, `select`, `.input` (trừ ô trong khung bọc)', () => {
    const found = CSS_FILES.flatMap((file) =>
      describeCss(cssViolations(file, readCss(file))),
    );
    expect(found).toEqual([]);
  });
});

describe('FG-07 đối chứng: bộ quét BẮT mẫu xấu và KHÔNG báo nhầm mẫu lành', () => {
  it('FG-07 bắt 10 mẫu xấu của mã .tsx', () => {
    for (const bad of [
      'className="focus:ring-2"',
      'className="a focus-visible:outline-2"',
      'className="x focus:border-brand"',
      'className={`x outline-none`}',
      'className="ring-1 ring-cyan-600"',
      'className="outline-offset-2"',
      'className="hover:focus:shadow-sm"',
      'className="peer-focus:outline-brand"',
      "style={{ outline: 'none' }}",
      "style={{ boxShadow: '0 0 0 1px red' }}",
    ]) {
      expect(focusTokens(bad), bad).not.toEqual([]);
    }
  });

  it('FG-07 KHÔNG báo nhầm 9 mẫu lành của mã .tsx (chữ gần giống, chú thích, tên hàm, khoá đối tượng, chuỗi bộ chọn)', () => {
    for (const fine of [
      'className="border-gray-300 aria-[invalid=true]:border-danger"',
      'className="rounded-[13.375px] px-6 hover:bg-gray-50"',
      '// viền focus theo lớp base, focus:ring-2 chỉ nhắc trong chú thích\nconst a = 1;',
      '/* outline-none, ring-1 */ const b = 2;',
      'const spring = 1; const string = "x";',
      'inputRef.current?.focus();',
      'const state = { focus: true, outline: false };',
      "document.querySelector('button:focus-visible')",
      'const focusFirstInvalid = () => undefined;',
    ]) {
      expect(focusTokens(fine), fine).toEqual([]);
    }
  });

  it('FG-07 bắt 6 mẫu xấu của CSS Module và KHÔNG báo nhầm 6 mẫu lành', () => {
    const file = 'features/x/x.module.css';
    for (const bad of [
      '.x input:focus-visible { box-shadow: inset 0 0 0 1px red; }',
      '.formField input { outline: none; }',
      '.input { outline: 0; }',
      '.searchBox:focus-within { outline: none; }',
      '.addButton:focus-visible { outline: 2px solid red; }',
      ".x input:not([type='file']) { outline-style: none; }",
    ]) {
      expect(cssViolations(file, bad), bad).not.toEqual([]);
    }
    for (const fine of [
      '.formField input { border: 1px solid #e5e7eb; }',
      '.dialog { outline: none; }',
      '.addButton { color: red; }',
      '.x input:disabled { opacity: 0.6; }',
      '.formField > span { outline: none; }',
      '.inputRow { outline: none; }',
    ]) {
      expect(cssViolations(file, fine), fine).toEqual([]);
    }
  });

  it('FG-07 ngoại lệ CSS chỉ đúng file và đúng bộ chọn: `.searchBox input` được ở branches, bị bắt ở file khác', () => {
    const css = '.searchBox input { outline: 0; }';
    expect(
      cssViolations('features/admin/branches/branches.module.css', css),
    ).toEqual([]);
    expect(cssViolations('features/admin/other.module.css', css)).toHaveLength(
      1,
    );
  });
});

describe('FG-08 danh sách ngoại lệ: có lý do và không để ngoại lệ chết', () => {
  it('FG-08 đúng 7 ngoại lệ ở mã và 2 ở CSS; không trùng', () => {
    expect(CODE_EXCEPTIONS).toHaveLength(7);
    expect(CSS_EXCEPTIONS).toHaveLength(2);
    expect(new Set(CODE_EXCEPTIONS.map((item) => item.file)).size).toBe(7);
    expect(
      new Set(CSS_EXCEPTIONS.map((item) => `${item.file}#${item.selector}`))
        .size,
    ).toBe(2);
  });

  it('FG-08 mỗi ngoại lệ ở mã có lý do (≥ 30 ký tự), file có thật và MỌI token còn xuất hiện thật trong file', () => {
    const byFile = new Map(CODE_FILES);
    for (const item of CODE_EXCEPTIONS) {
      expect(item.reason.length, item.file).toBeGreaterThanOrEqual(30);
      const source = byFile.get(item.file);
      expect(source, `${item.file} không còn`).toBeDefined();
      const live = focusTokens(source ?? '');
      for (const token of item.tokens) {
        expect(live, `${item.file}: ${token} đã hết, xoá ngoại lệ`).toContain(
          token,
        );
      }
    }
  });

  it('FG-08 mỗi ngoại lệ CSS có lý do, file có thật và bộ chọn CÒN vi phạm nếu bỏ ngoại lệ (không giữ ngoại lệ chết)', () => {
    for (const item of CSS_EXCEPTIONS) {
      expect(item.reason.length, item.file).toBeGreaterThanOrEqual(30);
      expect(CSS_FILES, item.file).toContain(item.file);
      const without = cssViolations(item.file, readCss(item.file), []);
      expect(
        without.some(
          (found) =>
            found.selector === item.selector &&
            found.kind === 'outline-none-on-field',
        ),
        `${item.file}: ${item.selector} không còn tắt outline, xoá ngoại lệ`,
      ).toBe(true);
    }
  });
});
