// UX1-61, UX1-62 (doctor UX1, G5 và G6): bộ quét TĨNH chặn quay lại hai lỗi giao diện đã sửa.
// UX1-61: ô ngày dùng `DateField` (dd/mm/yyyy), KHÔNG dùng `input type="date"` (hiện mm/dd/yyyy theo cài đặt máy, mã không đổi được).
// UX1-62: khoảng số in qua `formatRange` ("1 – 4", "08:00 – 12:00"), KHÔNG dính sát dấu gạch giữa (en dash "–", U+2013).

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

const FILES = Object.entries(SOURCES).map(
  ([key, source]) => [key.slice('/src/'.length), source] as const,
);

// Bỏ chú thích (câu giải thích có thể nhắc "type=date" hay "2–500")
const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

// ----- UX1-61: type="date" -----
const NATIVE_DATE = /\btype=(?:"date"|'date'|\{\s*['"`]date['"`]\s*\})/;
const DATE_FIELD_FILE = 'shared/masked-input/date-field.tsx';

const nativeDateFiles = (files: readonly (readonly [string, string])[]) =>
  files
    .filter(([file]) => file !== DATE_FIELD_FILE)
    .filter(([, source]) => NATIVE_DATE.test(strip(source)))
    .map(([file]) => file);

// ----- UX1-62: số–số dính dấu gạch giữa -----
// Hai số liền dấu gạch giữa trong chuỗi ("1–4", "08:00–12:00") hoặc nối hai biểu thức bằng mẫu `${a}–${b}`.
const NUMBER_DASH = /[0-9]–[0-9]/;
const TEMPLATE_DASH = /\}–\$\{/;

// Khoảng CHỮ (nhãn thứ trong tuần "Thứ 2–Thứ 6") không phải khoảng số: Đại và phiên kiểm quyết định KHÔNG đổi (19/11/2026), nên chỉ mẫu `${…}–${…}`
// của hai file dưới đây được phép; số–số chữ số liền nhau vẫn bị bắt ở mọi file.
const TEXT_RANGE_FILES = [
  'features/admin/branches/branch-schedule-format.ts',
  'features/admin/branches/quick-apply.ts',
];

function tightRanges(
  files: readonly (readonly [string, string])[],
  allowTemplate: readonly string[] = TEXT_RANGE_FILES,
) {
  return files.flatMap(([file, source]) => {
    const code = strip(source);
    const found: string[] = [];
    if (NUMBER_DASH.test(code)) found.push(`${file}: số–số`);
    if (TEMPLATE_DASH.test(code) && !allowTemplate.includes(file)) {
      found.push(`${file}: \${…}–\${…}`);
    }
    return found;
  });
}

describe('UX1-61 ô ngày: không còn `input type="date"` ngoài `DateField`', () => {
  it('UX1-61 bộ quét thấy mã thật (không xanh giả vì glob rỗng): hơn 400 file, có `date-field.tsx` và một nơi dùng nó', () => {
    expect(FILES.length).toBeGreaterThan(400);
    const names = FILES.map(([file]) => file);
    expect(names).toContain(DATE_FIELD_FILE);
    expect(
      FILES.filter(([, source]) => /<DateField\b/.test(source)).length,
    ).toBeGreaterThanOrEqual(5);
  });

  it('UX1-61 không file nào ngoài `date-field.tsx` có `type="date"`', () => {
    expect(nativeDateFiles(FILES)).toEqual([]);
  });

  it('UX1-61 `date-field.tsx` còn dùng `type="date"` đúng chỗ (ô gốc ẩn mở bộ chọn); đối chứng: bộ quét BẮT mẫu xấu và KHÔNG báo nhầm mẫu lành', () => {
    const own = FILES.find(([file]) => file === DATE_FIELD_FILE)?.[1] ?? '';
    expect(NATIVE_DATE.test(strip(own))).toBe(true);

    expect(
      nativeDateFiles([
        ['a.tsx', '<input type="date" value={x} />'],
        ['b.tsx', "<input type='date' />"],
        ['c.tsx', "<input type={'date'} />"],
      ]),
    ).toEqual(['a.tsx', 'b.tsx', 'c.tsx']);
    expect(
      nativeDateFiles([
        ['d.tsx', '<input type="text" placeholder="dd/mm/yyyy" />'],
        [
          'e.tsx',
          '// <input type="date" /> chỉ nhắc trong chú thích\nconst a = 1;',
        ],
        ['f.tsx', '<DateField id="x" value="" onChange={f} />'],
        ['g.tsx', '<input type="datetime-local" />'],
      ]),
    ).toEqual([]);
  });
});

describe('UX1-62 khoảng số: in có khoảng trắng hai bên dấu gạch giữa', () => {
  it('UX1-62 không file mã nào (đã bỏ chú thích) in số–số dính dấu gạch giữa, hay nối hai biểu thức bằng `${a}–${b}` ngoài hai file khoảng chữ', () => {
    expect(tightRanges(FILES)).toEqual([]);
  });

  it('UX1-62 đối chứng: bắt "1–4", "08:00–12:00", `${a}–${b}`; KHÔNG báo nhầm khoảng đã có khoảng trắng, khoảng ngày, chú thích, khoảng chữ ở hai file được phép', () => {
    expect(
      tightRanges([
        ['a.ts', "const x = 'Hiển thị 1–4 trên 4';"],
        ['b.ts', "const x = '08:00–12:00';"],
        ['c.ts', 'const x = `${a}–${b}`;'],
        ['d.ts', "const x = '2–500 ký tự';"],
      ]),
    ).toEqual(['a.ts: số–số', 'b.ts: số–số', 'c.ts: ${…}–${…}', 'd.ts: số–số']);
    expect(
      tightRanges([
        ['e.ts', "const x = '08:00 – 12:00';"],
        ['f.ts', "const x = '24/11 – 25/11';"],
        ['g.ts', '// 2–500 ký tự chỉ nhắc trong chú thích\nconst a = 1;'],
        ['h.ts', "const x = 'Thứ 2–Thứ 6';"],
        [
          'features/admin/branches/quick-apply.ts',
          'const x = `${dayLabel(from)}–${dayLabel(to)}`;',
        ],
      ]),
    ).toEqual([]);
  });
});
