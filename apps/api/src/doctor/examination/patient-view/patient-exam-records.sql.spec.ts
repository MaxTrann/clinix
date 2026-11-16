import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// doctor-exam B4 — luật quét SQL của patient-view/ (XHS-15 `[đề xuất]`; mở rộng AR-05). AR-05 của booking chỉ bắt `DATE(thoi_gian)`: bản đột biến M7 (gom tháng bằng `MONTH(lh.thoi_gian)`) cho cùng kết quả đúng
// ở mọi ca hành vi và LỌT qua AR-05 (đo ở lượt đột biến B4, TRACKING 15.8), nên luật riêng này bắt MỌI hàm ngày giờ bọc cột `thoi_gian`: bọc cột làm mất chỉ mục `(benh_nhan_id, trang_thai, thoi_gian)`, phải dùng khoảng nửa mở.
// Quét VĂN BẢN nguồn (bỏ chú thích), không DB.
const DIR = fileURLToPath(new URL('.', import.meta.url));
const WRAPPED_TIME =
  /\b(?:DATE|MONTH|YEAR|DAY|DAYOFMONTH|WEEK|QUARTER|EXTRACT|DATE_FORMAT|TIME|UNIX_TIMESTAMP)\s*\(\s*(?:\w+\.)?thoi_gian\b/gi;

const withoutComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function findWrappedTime(source: string): string[] {
  return [...withoutComments(source).matchAll(WRAPPED_TIME)].map(
    (match) => match[0],
  );
}

const sources = readdirSync(DIR)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
  .map((name) => ({ name, source: readFileSync(`${DIR}${name}`, 'utf8') }));

describe('XHS-15 (AR-05 mở rộng) không hàm ngày giờ nào bọc cột thoi_gian ở patient-view/', () => {
  it('mã thật của thư mục: không DATE(), MONTH(), YEAR()… quanh `thoi_gian`', () => {
    for (const file of sources)
      expect([file.name, findWrappedTime(file.source)]).toEqual([
        file.name,
        [],
      ]);
  });

  it('bộ quét thật sự thấy mã: có file repository và câu SQL của nó nhắc `lh.thoi_gian` (không quét rỗng)', () => {
    const repository = sources.find(
      (file) => file.name === 'patient-exam-records.repository.ts',
    );
    expect(repository?.source).toContain('lh.thoi_gian >= ?');
  });

  it.each([
    'WHERE MONTH(lh.thoi_gian) = 11',
    'WHERE YEAR (lh.thoi_gian) = 2026',
    'GROUP BY DATE(thoi_gian)',
    "SELECT DATE_FORMAT(lh.thoi_gian, '%m')",
    'SUM(EXTRACT( lh.thoi_gian ))',
  ])('đột biến: %s bị bắt', (sql) => {
    expect(findWrappedTime(sql)).toHaveLength(1);
  });

  it('không bắt nhầm: khoảng nửa mở, cột khác, và chú thích nhắc hàm', () => {
    expect(findWrappedTime('lh.thoi_gian >= ? AND lh.thoi_gian < ?')).toEqual(
      [],
    );
    expect(findWrappedTime('MONTH(lh.thoi_diem_tao)')).toEqual([]);
    expect(findWrappedTime('// không bọc MONTH(lh.thoi_gian)')).toEqual([]);
    expect(findWrappedTime('/* DATE(thoi_gian) */ const a = 1;')).toEqual([]);
  });
});
