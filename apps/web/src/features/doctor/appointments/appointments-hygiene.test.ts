// doctor UX6, DUX6-57 [đề xuất]: bộ quét TĨNH mã chạy của mục "Lịch hẹn trong ca". Lịch hẹn chứa tên bệnh nhân và dịch vụ khám, nên mã không được: ghi log (`console.*`),
// đọc các khoá cá nhân hay tiền không cần (người đặt, SĐT, ngày sinh, giới tính, giá, cọc), hay lưu vào kho trình duyệt. Chú thích bị bỏ trước khi quét (chú thích
// được phép NÓI về các khoá này). Đọc mã bằng `import.meta.glob` (không cần `node:fs`); bỏ file test.
const SOURCES = import.meta.glob(
  [
    './*.{ts,tsx}',
    '!./*.test.{ts,tsx}',
    '../api/appointments-api.ts',
    '../schedule/shift-detail-dialog.tsx',
    '../reception/reception-drawers.tsx',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

// Bỏ chú thích khối và chú thích dòng (không có chuỗi chứa `//` trong các file này)
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const FORBIDDEN: [string, RegExp][] = [
  ['console.*', /\bconsole\s*\./],
  [
    'khoá cá nhân hoặc tiền không cần',
    /\b(nguoiDat|soDienThoai|ngaySinh|gioiTinh|giaSnapshot|tienCoc|lyDoKham|lyDoHuy)\b/,
  ],
  [
    'kho trình duyệt',
    /\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie/,
  ],
];

describe('doctor UX6 — mã lịch hẹn trong ca không lộ dữ liệu cá nhân', () => {
  it('DUX6-57 không có `console.*`, khoá cá nhân hay tiền, kho trình duyệt trong mã chạy', () => {
    const files = Object.keys(SOURCES);
    // Bộ quét có tác dụng: thấy đủ các file của mục lịch hẹn
    expect(files).toEqual(
      expect.arrayContaining([
        './appointment-group.ts',
        './appointments-panel.tsx',
        '../api/appointments-api.ts',
        '../schedule/shift-detail-dialog.tsx',
        '../reception/reception-drawers.tsx',
      ]),
    );
    const violations: string[] = [];
    for (const file of files) {
      const code = stripComments(SOURCES[file]);
      for (const [name, pattern] of FORBIDDEN)
        if (pattern.test(code)) violations.push(`${file}: ${name}`);
    }
    expect(violations).toEqual([]);
  });

  it('DUX6-57b đối chứng: bộ quét BẮT được mã vi phạm (không quét nhầm chú thích)', () => {
    const bad = 'const x = row.nguoiDat; console.log(x);';
    expect(FORBIDDEN[0][1].test(bad)).toBe(true);
    expect(FORBIDDEN[1][1].test(bad)).toBe(true);
    expect(FORBIDDEN[2][1].test('localStorage.setItem("a", "b")')).toBe(true);
    expect(
      stripComments('// nguoiDat\nconst ok = 1; /* console.log */'),
    ).not.toMatch(/nguoiDat|console/);
  });
});
