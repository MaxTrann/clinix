import { blockOf, readCssSource } from '../../test/css-source';

// UIA-06 và UIA-08 (search UI PR-A, 17/11/2026; Đại chọn cam `#ffb900` và nền banner B): khoá hợp đồng màu của nút cam (token `cta`, MỘT nguồn)
// và nền gradient của hero (lớp `hero-gradient`) trong `styles/index.css`. vitest chạy `css: false` nên không có kiểu tính toán: đọc nguồn CSS
// bằng `node:fs` (`test/css-source.ts`) và quét nguồn `.ts`/`.tsx` bằng `import.meta.glob(..., '?raw')` như `styles/focus-hygiene.test.ts`.
// Màu, tương phản và điểm ảnh thật đo bằng Chromium (TRACKING search mục 7).

const css = readCssSource(import.meta.url, '../../styles/index.css');
const compactCss = css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
  .trim();

const SOURCES = import.meta.glob(
  [
    '/src/features/search/**/*.{ts,tsx}',
    '!/src/features/search/**/*.test.{ts,tsx}',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

// Bỏ chú thích (câu giải thích có thể nhắc `bg-amber-500`)
const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const FILES = Object.entries(SOURCES).map(
  ([key, source]) => [key.slice('/src/'.length), strip(source)] as const,
);

// Sáu nút CTA cam, mỗi nút MỘT `bg-cta` và MỘT `hover:bg-cta-hover`
const CTA_FILES = [
  'features/search/branches/branch-detail-page.tsx',
  'features/search/doctors/doctor-detail-page.tsx',
  'features/search/home/global-search.tsx',
  'features/search/home/home-process.tsx',
  'features/search/shell/public-header.tsx',
  'features/search/specialties/specialty-detail-page.tsx',
];

const countOf = (source: string, pattern: RegExp) =>
  (source.match(pattern) ?? []).length;
// `bg-cta` đứng riêng (không phải `hover:bg-cta-hover`, `bg-cta-hover`)
const BG_CTA = /(?<![\w:-])bg-cta(?![\w-])/g;
const HOVER_CTA = /(?<![\w-])hover:bg-cta-hover(?![\w-])/g;
// `bg-amber-400`, `bg-amber-500` có hoặc không có biến thể (`hover:`)
const RAW_AMBER_BG = /(?<![\w-])bg-amber-(?:400|500)(?![\w-])/g;

describe('UIA-06 token màu cam `cta` (một nguồn)', () => {
  it('UIA-06 `styles/index.css` khai `--color-cta` = amber-400 (#ffb900, chữ gray-900 10,30:1) và `--color-cta-hover` = amber-300, trỏ về thang chuẩn, không chép mã màu', () => {
    expect(compactCss).toContain('--color-cta: var(--color-amber-400);');
    expect(compactCss).toContain('--color-cta-hover: var(--color-amber-300);');
    expect(compactCss).not.toMatch(/#ffb900/i);
    // Hai token nằm trong khối `@theme` đầu (13 token chuẩn của ADR 0004)
    const theme = blockOf(css, '@theme');
    expect(theme?.inner).toContain('--color-cta:');
    expect(theme?.inner).toContain('--color-cta-hover:');
    // Mỗi token chỉ khai MỘT lần
    expect(countOf(compactCss, /--color-cta:/g)).toBe(1);
    expect(countOf(compactCss, /--color-cta-hover:/g)).toBe(1);
  });

  it('UIA-06 bộ quét thật sự thấy mã (không xanh giả vì glob rỗng): có đủ sáu file nút CTA', () => {
    const names = FILES.map(([file]) => file);
    expect(FILES.length).toBeGreaterThan(40);
    for (const file of CTA_FILES) expect(names, file).toContain(file);
    expect(names.some((file) => file.includes('.test.'))).toBe(false);
  });

  it('UIA-06 mỗi file nút CTA dùng đúng MỘT `bg-cta` và MỘT `hover:bg-cta-hover`; không file nào khác trong `features/search` dùng chúng', () => {
    for (const [file, source] of FILES) {
      const expected = CTA_FILES.includes(file) ? 1 : 0;
      expect(countOf(source, BG_CTA), `${file}: bg-cta`).toBe(expected);
      expect(countOf(source, HOVER_CTA), `${file}: hover:bg-cta-hover`).toBe(
        expected,
      );
    }
  });

  it('UIA-06 ca âm: không còn `bg-amber-400`, `bg-amber-500` (kể cả `hover:`) ở mã của `features/search`; màu cam đi qua token', () => {
    const found = FILES.filter(
      ([, source]) => countOf(source, RAW_AMBER_BG) > 0,
    ).map(([file]) => file);
    expect(found).toEqual([]);
  });

  it('UIA-06 đối chứng của bộ quét: bắt 4 mẫu xấu, không báo nhầm 4 mẫu lành', () => {
    for (const bad of [
      'className="bg-amber-500 px-4"',
      'className="a hover:bg-amber-400"',
      'className={`x bg-amber-400`}',
      'className="bg-amber-500"',
    ]) {
      expect(countOf(bad, RAW_AMBER_BG), bad).toBeGreaterThan(0);
    }
    for (const fine of [
      'className="fill-amber-500 text-amber-500"',
      'className="border-amber-200 bg-amber-50"',
      'className="bg-cta text-gray-900 hover:bg-cta-hover"',
      'className="text-amber-300"',
    ]) {
      expect(countOf(fine, RAW_AMBER_BG), fine).toBe(0);
    }
    expect(countOf('className="bg-cta hover:bg-cta-hover"', BG_CTA)).toBe(1);
    expect(countOf('className="hover:bg-cta-hover"', BG_CTA)).toBe(0);
  });
});

describe('UIA-08 nền gradient của hero (phương án B)', () => {
  const block = blockOf(css, '@utility hero-gradient');
  const inner = (block?.inner ?? '').replace(/\s+/g, ' ').trim();

  it('UIA-08 có đúng MỘT `@utility hero-gradient` và hero là nơi DUY NHẤT dùng nó', () => {
    expect(block).toBeDefined();
    expect(countOf(compactCss, /@utility hero-gradient/g)).toBe(1);
    const users = FILES.filter(
      ([, source]) => countOf(source, /(?<![\w-])hero-gradient(?![\w-])/g) > 0,
    ).map(([file]) => file);
    expect(users).toEqual(['features/search/home/home-page.tsx']);
  });

  it('UIA-08 gradient ngang: #007595 (brand-strong) phẳng tới max(57%, 820px), rồi #0092b8 (brand) tới max(78%, 1120px), rồi #00bba7 (teal-500) ở 100%; màu lấy từ token', () => {
    expect(inner).toContain('background-image: linear-gradient(to right,');
    expect(inner).toContain(
      'var(--color-brand-strong) 0, var(--color-brand-strong) max(57%, 820px), var(--color-brand) max(78%, 1120px), var(--color-teal-500) 100%',
    );
    // Không chép mã màu hex vào gradient
    expect(inner).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it('UIA-08 vùng chữ phẳng: điểm dừng đầu (820 px) nằm sau mép phải cột chữ ở khung 1440 (lề 150 px + cột `max-w-168` 630 px = 780 px) và dưới 820 px nền hoàn toàn phẳng', () => {
    const plateau = Number(/max\(57%, (\d+)px\)/.exec(inner)?.[1]);
    const textRight = 150 + 630;
    expect(plateau).toBeGreaterThanOrEqual(textRight);
    // Dưới `plateau` px, `max(57%, plateau px)` luôn bằng `plateau` px lớn hơn bề rộng hero nên nền chỉ còn #007595
    for (const width of [375, 768, 819]) {
      expect(Math.max(0.57 * width, plateau)).toBeGreaterThanOrEqual(width);
    }
  });
});
