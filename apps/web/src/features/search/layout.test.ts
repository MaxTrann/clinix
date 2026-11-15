import { PUBLIC_CONTAINER, PUBLIC_STEP_CONTAINER } from './layout';

// search F14, nhóm G0 (UIS-01; mã UIS là [đề xuất], PLAN search F14). Mức W (`css: false`): khoá LỚP CSS, không đo bố cục.
// Lỗi cũ: số đơn vị Tailwind viết theo gốc 16 px trong khi `html` là 15 px (1 đơn vị = 3,75 px), nên khung chỉ 1125 px và đệm 28,1 px
// thay vì 1200 px và 30 px của Figma. Test đọc mã bằng `import.meta.glob` của Vite (như `booking/architecture.test.ts`), bỏ file test.
const SOURCES = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const MISCONVERTED =
  /(?<![\w-])(?:max-w-300|px-7\.5|h-15|size-7\.5|size-4\.5|py-11|gap-7\.5|mt-7\.5|pt-5\.5)(?![\w.-])/;

const WIDE_PAGES = [
  './branches/branch-detail-page.tsx',
  './branches/branch-list-page.tsx',
  './doctors/doctor-detail-page.tsx',
  './doctors/doctor-team-page.tsx',
  './specialties/specialty-detail-page.tsx',
  './specialties/specialty-list-page.tsx',
  './home/home-page.tsx',
  './home/home-process.tsx',
  './shell/public-header.tsx',
  './shell/public-footer.tsx',
];
const STEP_PAGES = [
  './services/service-group-page.tsx',
  './services/service-list-page.tsx',
  './doctors/doctor-list-page.tsx',
];

describe('khung nội dung công khai theo Figma (UIS-01)', () => {
  it('UIS-01 hằng khung: 1200 px đệm 30 px; Đặt lịch bước 1–3: 840 px đệm 15 px, đệm dọc 37,5 px', () => {
    expect(PUBLIC_CONTAINER).toBe('mx-auto max-w-320 px-8');
    expect(PUBLIC_STEP_CONTAINER).toBe('mx-auto max-w-4xl px-4 py-10');
  });

  it('UIS-01 không file mã nào của `features/search` còn viết lớp theo gốc 16 px (`max-w-300`, `px-7.5`, `h-15`, `size-7.5`, `size-4.5`, `py-11`, `gap-7.5`, `mt-7.5`, `pt-5.5`)', () => {
    const offenders = Object.entries(SOURCES)
      .filter(([, code]) => MISCONVERTED.test(code))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  it.each(WIDE_PAGES)('UIS-01 %s dùng hằng khung 1200 px', (file) => {
    expect(SOURCES[file]).toContain('PUBLIC_CONTAINER');
    expect(SOURCES[file]).not.toContain('PUBLIC_STEP_CONTAINER');
  });

  it.each(STEP_PAGES)(
    'UIS-01 %s dùng khung 840 px của Đặt lịch bước 1–3',
    (file) => {
      expect(SOURCES[file]).toContain('PUBLIC_STEP_CONTAINER');
      expect(SOURCES[file]).not.toContain('PUBLIC_CONTAINER');
    },
  );
});
