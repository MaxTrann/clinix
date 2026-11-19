import { blockOf, cssRules, readCssSource } from '../test/css-source';

// UX1-55 đến UX1-60 (doctor UX1, G8): mũi tên ô chọn (`select`) bằng MỘT quy tắc chung trong `styles/index.css`. vitest chạy `css: false` nên test này khoá
// HỢP ĐỒNG của khối CSS (có đủ thuộc tính, nằm ngoài lớp, không đụng focus). Cascade thật (utilities `px-*`, CSS Module của specialty-page) và điểm ảnh
// chỉ trình duyệt thấy: số đo ở TRACKING admin mục 9A.13.
//
// Vì sao ngoài `@layer`: mọi ô chọn đều có `px-*` ở lớp `utilities`, mà `utilities` thắng `base` bất kể độ đặc hiệu, nên `padding-right` ở lớp base
// bị `px-3` ghi đè (mũi tên đè chữ). CSS ngoài lớp thắng mọi lớp. Loại `.appearance-none`: bảy ô đã tự vẽ mũi tên (`ChevronDown`) từ booking F12.

const css = readCssSource(import.meta.url, './index.css');
const rules = cssRules(css);
const SELECTOR = 'select:not(.appearance-none)';

const arrowRule = rules.find(
  (rule) =>
    rule.selectors.some((selector) => selector.endsWith(SELECTOR)) &&
    rule.declarations.includes('appearance: none'),
);
const forcedColors = blockOf(css, '@media (forced-colors: active)');
const forcedRule = forcedColors
  ? cssRules(forcedColors.inner).find((rule) =>
      rule.selectors.some((selector) => selector.endsWith(SELECTOR)),
    )
  : undefined;

const declaration = (name: string) =>
  arrowRule?.declarations.find((item) => item.startsWith(`${name}:`));

describe('UX1-55 khối mũi tên ô chọn nằm NGOÀI mọi `@layer`', () => {
  it('UX1-55 có đúng MỘT khối `select:not(.appearance-none)` có `appearance: none`; khối không nằm trong `@layer`, `@utility`', () => {
    expect(arrowRule).toBeDefined();
    expect(
      rules.filter(
        (rule) =>
          rule.selectors.some((selector) => selector.endsWith(SELECTOR)) &&
          rule.declarations.includes('appearance: none'),
      ),
    ).toHaveLength(1);

    // Độ sâu ngoặc nhọn tại vị trí khối: 0 = ở gốc tệp, không nằm trong `@layer base { … }`, `@utility … { … }` hay `@media`
    const source = blockOf(css, '@layer base')?.source ?? '';
    const at = source.indexOf(`${SELECTOR} {`);
    expect(at).toBeGreaterThan(0);
    let depth = 0;
    for (const char of source.slice(0, at)) {
      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;
    }
    expect(depth).toBe(0);
  });
});

describe('UX1-56 thuộc tính của khối', () => {
  it('UX1-56 bỏ mũi tên gốc, chừa chỗ bên phải, vẽ mũi tên bằng ảnh nền cách mép phải 0,75 rem như icon lịch', () => {
    expect(declaration('appearance')).toBe('appearance: none');
    expect(declaration('padding-right')).toBe('padding-right: 2.25rem');
    expect(declaration('background-repeat')).toBe(
      'background-repeat: no-repeat',
    );
    expect(declaration('background-position')).toBe(
      'background-position: right 0.75rem center',
    );
    expect(declaration('background-size')).toBe('background-size: 1rem');
    expect(declaration('background-image')).toMatch(
      /^background-image: url\("data:image\/svg\+xml,%3Csvg /,
    );
  });

  it('UX1-56 ảnh nền là mũi tên xuống (đường `m6 9 6 6 6-6`), nét tròn, không chứa `;` hay `{` (bộ tách khai báo và bộ tách khối không vỡ)', () => {
    const image = declaration('background-image') ?? '';
    expect(image).toContain("d='m6 9 6 6 6-6'");
    expect(image).toContain("stroke-linecap='round'");
    expect(image.slice('background-image: '.length)).not.toMatch(/[;{}]/);
  });
});

describe('UX1-57 khối KHÔNG đụng viền focus, nền, viền ô', () => {
  it('UX1-57 ca âm: không `:focus`, `outline`, `box-shadow`, `border`, `background` viết tắt, `background-color` (bg-white của nơi gọi vẫn thắng)', () => {
    expect(arrowRule).toBeDefined();
    const names = (arrowRule?.declarations ?? []).map((item) =>
      item.slice(0, item.indexOf(':')),
    );
    for (const forbidden of [
      'outline',
      'outline-offset',
      'box-shadow',
      'border',
      'border-color',
      'background',
      'background-color',
    ]) {
      expect(names, forbidden).not.toContain(forbidden);
    }
    for (const selector of arrowRule?.selectors ?? []) {
      expect(selector).not.toMatch(/:focus/);
    }
  });
});

describe('UX1-58 màu mũi tên bằng token chữ phụ', () => {
  it('UX1-58 ảnh nhúng không dùng được biến CSS nên hex trong ảnh PHẢI bằng `--color-text-secondary`', () => {
    const token = /--color-text-secondary:\s*#([0-9a-f]{6})/i.exec(css)?.[1];
    expect(token).toBeDefined();
    expect(declaration('background-image')).toContain(
      `stroke='%23${token ?? ''}'`,
    );
  });
});

describe('UX1-59 chế độ tương phản cao', () => {
  it('UX1-59 `forced-colors: active` bỏ ảnh nền (hệ điều hành xoá ảnh nền) nên trả lại mũi tên gốc: `appearance: auto` và `background-image: none`', () => {
    expect(forcedColors).toBeDefined();
    expect(forcedRule?.declarations).toEqual(
      expect.arrayContaining(['appearance: auto', 'background-image: none']),
    );
  });
});

// Mọi ô chọn đã `appearance-none` PHẢI tự vẽ mũi tên: khối trên loại `.appearance-none`, nên một ô `appearance-none` mà không có `ChevronDown` sẽ MẤT mũi tên.
const SOURCES = import.meta.glob(
  [
    '/src/**/*.tsx',
    '!/src/**/*.test.tsx',
    '!/src/**/testing/**',
    '!/src/test/**',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

// Thẻ mở `<select …>` (đếm ngoặc nhọn và nháy để `>` của hàm mũi tên không cắt cụt)
function selectTags(code: string): string[] {
  const tags: string[] = [];
  for (const match of code.matchAll(/<select(?=[\s>])/g)) {
    const start = match.index ?? 0;
    let depth = 0;
    let quote = '';
    let end = start;
    for (; end < code.length; end += 1) {
      const char = code.charAt(end);
      if (quote) {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'" || char === '`') {
        quote = char;
      } else if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
      } else if (char === '>' && depth === 0) {
        break;
      }
    }
    tags.push(code.slice(start, end + 1));
  }
  return tags;
}

// File có thẻ `<select` mang `appearance-none` (ở thẻ hoặc ở hằng lớp dùng chung của file) nhưng không import `ChevronDown`
function arrowlessSelectFiles(sources: Record<string, string>): string[] {
  return Object.entries(sources)
    .filter(([, source]) => {
      const code = strip(source);
      const hasSelect = selectTags(code).length > 0;
      return hasSelect && /\bappearance-none\b/.test(code);
    })
    .filter(([, source]) => !/\bChevronDown\b/.test(strip(source)))
    .map(([file]) => file);
}

describe('UX1-60 ô chọn tự vẽ mũi tên không bị mất mũi tên', () => {
  const withOwnArrow = Object.entries(SOURCES)
    .filter(([, source]) => {
      const code = strip(source);
      return selectTags(code).length > 0 && /\bappearance-none\b/.test(code);
    })
    .map(([file]) => file.replace('/src/', ''));

  it('UX1-60 bộ quét thấy bảy ô tự vẽ ở bốn file đã biết (không xanh giả vì glob rỗng)', () => {
    for (const known of [
      'features/booking/appointments/common/filter-controls.tsx',
      'features/patient/profile/profile-field.tsx',
      'features/search/doctors/doctor-filters.tsx',
      'features/wallet/patient/transaction-history.tsx',
    ]) {
      expect(withOwnArrow).toContain(known);
    }
  });

  it('UX1-60 mọi file có ô `appearance-none` đều import `ChevronDown` (tự vẽ mũi tên)', () => {
    expect(arrowlessSelectFiles(SOURCES)).toEqual([]);
  });

  it('UX1-60 đối chứng: bộ quét BẮT mẫu xấu (ô `appearance-none` không có `ChevronDown`) và KHÔNG báo nhầm mẫu lành', () => {
    const bad = {
      '/src/x.tsx': '<select className="appearance-none pr-9"></select>',
    };
    const good = {
      '/src/y.tsx':
        'import { ChevronDown } from \'lucide-react\'; <select className="appearance-none"></select>',
      '/src/z.tsx': '<select className="px-3"></select>',
      '/src/w.tsx':
        '// <select className="appearance-none"> chỉ nhắc trong chú thích',
    };
    expect(arrowlessSelectFiles(bad)).toEqual(['/src/x.tsx']);
    expect(arrowlessSelectFiles(good)).toEqual([]);
  });
});
