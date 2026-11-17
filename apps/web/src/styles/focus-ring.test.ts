import { blockOf, cssRules, readCssSource } from '../test/css-source';

// FG-01 đến FG-04 (PR "focus toàn hệ thống", TRACKING admin mục 7; quy tắc FE của Đại 16/11/2026, ADR 0004): vitest chạy `css: false`
// nên không thấy kiểu tính toán; test này khoá HỢP ĐỒNG trong `styles/index.css`. Cascade, kích thước và điểm ảnh chỉ Chromium thấy
// (số đo ở TRACKING admin 7.4 và 7.8). Phương án Af (phiên kiểm chọn 17/11/2026): vòng `outline` 2 px lùi vào trong 2 px, phủ đúng viền 1 px
// cộng 1 px bên trong, trigger là `:focus` (không phụ thuộc heuristic `:focus-visible` của từng engine), ở `@layer base`.

const css = readCssSource(import.meta.url, './index.css');
const rules = cssRules(css);

// Các loại `input` KHÔNG vào quy tắc ô chữ (giữ outline 2 px lệch 2 px của lớp base): quyết định (a) của Đại 17/11/2026
const EXCLUDED_TYPES = [
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
];

const typesIn = (selector: string): string[] =>
  [...selector.matchAll(/\[type='([a-z]+)'\]/g)]
    .map((match) => match[1] ?? '')
    .sort();

const isInput = (selector: string) => selector.startsWith('input:not(');

const fieldRule = rules.find((rule) =>
  rule.selectors.some((selector) => selector.endsWith(':focus')),
);
const invalidRule = rules.find((rule) =>
  rule.selectors.some((selector) => selector.includes("[aria-invalid='true']")),
);

describe('FG-01 ô chữ khi focus: vòng teal 2 px lùi vào trong (lớp base)', () => {
  it('FG-01 có MỘT khối cho `input` (trừ các loại không phải ô chữ), `textarea`, `select` với `:focus`', () => {
    expect(fieldRule).toBeDefined();
    const selectors = fieldRule?.selectors ?? [];
    expect(selectors).toHaveLength(3);
    expect(selectors.filter(isInput)).toHaveLength(1);
    expect(selectors).toContain('textarea:focus');
    expect(selectors).toContain('select:focus');
    for (const selector of selectors)
      expect(selector.endsWith(':focus')).toBe(true);
  });

  it('FG-01 `:not()` của `input` loại đúng 9 loại: nút, checkbox, color, file, image, radio, range, reset, submit', () => {
    const input = (fieldRule?.selectors ?? []).find(isInput) ?? '';
    expect(typesIn(input)).toEqual(EXCLUDED_TYPES);
  });

  it('FG-01 khai báo đúng hai dòng: `outline: 2px solid var(--color-brand)` và `outline-offset: -2px` (lùi vào trong, không to ra)', () => {
    expect(fieldRule?.declarations).toEqual([
      'outline: 2px solid var(--color-brand)',
      'outline-offset: -2px',
    ]);
  });

  it('FG-01 ca âm: không `box-shadow`, không `border-color`, không `outline: none` trong khối ô chữ (utilities thắng lớp base ở các thuộc tính đó)', () => {
    expect(fieldRule).toBeDefined();
    const text = (fieldRule?.declarations ?? []).join(';');
    expect(text).not.toContain('box-shadow');
    expect(text).not.toContain('border-color');
    expect(text).not.toContain('none');
  });

  it('FG-01 ca âm: bộ chọn `:focus` duy nhất ngoài `:focus-visible` chung và `field-frame` là hai khối ô chữ và ô lỗi (nút, liên kết, checkbox, radio, tab, ô sao không có khối riêng)', () => {
    const focusSelectors = rules
      .flatMap((rule) => rule.selectors)
      .filter((selector) => /:focus(?![-\w])/.test(selector));
    // 3 bộ chọn của khối ô chữ + 3 bộ chọn của khối ô lỗi
    expect(focusSelectors).toHaveLength(6);
    for (const selector of focusSelectors) {
      expect(selector).toMatch(/^(input:not\(|textarea|select)/);
    }
  });

  it('FG-01 mọi quy tắc ô chữ nằm TRONG `@layer base` (utilities vẫn thắng; không đặt ngoài lớp: phương án D bị loại)', () => {
    const base = blockOf(css, '@layer base');
    expect(base).toBeDefined();
    expect(base?.inner).toMatch(/textarea:focus\s*,/);
    expect(base?.inner).toMatch(/select:focus\s*\{/);
    const outside =
      (base?.source.slice(0, base.start) ?? '') +
      (base?.source.slice(base.end) ?? '');
    expect(outside).not.toMatch(
      /(?:input|textarea|select)[^{}]*:focus(?![-\w])/,
    );
  });
});

describe('FG-02 ô đang lỗi khi focus: vòng đỏ, đứng SAU khối ô chữ', () => {
  it('FG-02 khối `[aria-invalid=true]` cho `input` (cùng danh sách loại), `textarea`, `select`: chỉ đổi `outline-color` sang `--color-danger`', () => {
    expect(invalidRule).toBeDefined();
    const selectors = invalidRule?.selectors ?? [];
    expect(selectors).toHaveLength(3);
    expect(selectors).toContain("textarea[aria-invalid='true']:focus");
    expect(selectors).toContain("select[aria-invalid='true']:focus");
    const input = selectors.find(isInput) ?? '';
    expect(input.endsWith(':focus')).toBe(true);
    expect(input).toContain("[aria-invalid='true']");
    expect(invalidRule?.declarations).toEqual([
      'outline-color: var(--color-danger)',
    ]);
  });

  it('FG-02 ca âm: `input` lỗi dùng ĐÚNG danh sách loại của ô chữ (checkbox, radio, nút có `aria-invalid` không đổi màu); không bộ chọn `div`, `role` (ô sao `radiogroup` của F6)', () => {
    const selectors = invalidRule?.selectors ?? [];
    expect(typesIn(selectors.find(isInput) ?? '')).toEqual(EXCLUDED_TYPES);
    for (const selector of selectors) {
      expect(selector).not.toContain('div');
      expect(selector).not.toContain('[role');
    }
  });

  it('FG-02 thứ tự: khối ô lỗi đứng SAU khối ô chữ (cùng độ ưu tiên, khối sau thắng: bài học AI-BUG-053)', () => {
    expect(invalidRule?.order).toBeGreaterThan(fieldRule?.order ?? Infinity);
  });
});

describe('FG-03 quy tắc chung `:focus-visible` còn nguyên cho nút, liên kết, checkbox, radio, tab, ô sao', () => {
  const general = rules.find(
    (rule) =>
      rule.selectors.length === 1 && rule.selectors[0] === ':focus-visible',
  );

  it('FG-03 `:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px }`', () => {
    expect(general).toBeDefined();
    expect(general?.declarations).toEqual([
      'outline: 2px solid var(--color-brand)',
      'outline-offset: 2px',
    ]);
  });

  it('FG-03 đứng TRƯỚC khối ô chữ (khối ô chữ ghi đè bằng độ ưu tiên và thứ tự)', () => {
    expect(general?.order).toBeLessThan(fieldRule?.order ?? -1);
  });
});

describe('FG-04 khung bọc ô (`field-frame`): khung vẽ vòng, ô bên trong tắt vòng của nó', () => {
  const frame = blockOf(css, '@utility field-frame');
  const inner = frame ? cssRules(frame.inner) : [];

  it('FG-04 chỉ có MỘT `@utility field-frame`', () => {
    expect(frame).toBeDefined();
    expect(css.split('@utility field-frame').length - 1).toBe(1);
  });

  it('FG-04 `&:focus-within` vẽ cùng vòng 2 px lùi vào trong 2 px', () => {
    const rule = inner.find((item) =>
      item.selectors.includes('&:focus-within'),
    );
    expect(rule?.declarations).toEqual([
      'outline: 2px solid var(--color-brand)',
      'outline-offset: -2px',
    ]);
  });

  it('FG-04 ô nhập bên trong khung tắt vòng của chính nó (`outline: none; box-shadow: none`), nếu không sẽ hiện hai vòng', () => {
    const rule = inner.find((item) =>
      item.selectors.includes('& :is(input, textarea, select)'),
    );
    expect(rule?.declarations).toEqual(['outline: none', 'box-shadow: none']);
  });

  it('FG-04 ca âm: khung chỉ dành cho ô nhập, không nhắc `button`', () => {
    expect(frame?.inner).not.toContain('button');
  });
});
