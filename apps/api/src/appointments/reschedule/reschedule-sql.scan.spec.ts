import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listSourceFiles,
  readSource,
  stripComments,
} from '../../doctor/testing/architecture-scan.js';
import { findSqlConcatenation } from '../testing/sql-concatenation-scan.js';

// Task reschedule B6 — BDL-05: quét `src/appointments/reschedule/` (mọi file mã, kể cả của B1 đến B5; không tính `*.spec.ts`, `*.int-spec.ts`, `testing/`): mọi câu SQL là chuỗi hằng, mọi `${…}` trong chuỗi SQL chỉ
// là hằng UPPER_SNAKE_CASE, không nối `+` giá trị. Có ĐỐI CHỨNG ÂM: nguồn giả có nối chuỗi PHẢI bị bắt (chứng minh bộ quét có hiệu lực, không "xanh vì không thấy gì"). Không DB.
const RESCHEDULE_DIR = fileURLToPath(new URL('.', import.meta.url));

describe('BDL-05 bộ quét SQL nối chuỗi: đối chứng ÂM và không bắt nhầm', () => {
  it.each([
    [
      'nội suy biến trong chuỗi mẫu',
      'const sql = `SELECT 1 FROM t WHERE id = ${id}`;',
    ],
    [
      'nội suy lời gọi hàm',
      'q(`UPDATE t SET a = 1 WHERE x IN (${ids.map(() => "?").join(",")})`);',
    ],
    ['nội suy thuộc tính', 'q(`DELETE FROM t WHERE a = ${input.value}`);'],
    [
      'nối chuỗi nháy đơn (+ ở sau)',
      "const sql = 'SELECT * FROM t WHERE id = ' + id;",
    ],
    [
      'nối chuỗi nháy kép (+ ở trước)',
      'const sql = prefix + "INSERT INTO t (a) VALUES (1)";',
    ],
    ['nối chuỗi xuống dòng', "const sql =\n  'SELECT * FROM t ' +\n  filter;"],
  ])('BẮT: %s', (_name, source) => {
    expect(findSqlConcatenation(source)).not.toEqual([]);
  });

  it.each([
    [
      'tham số ? và hằng UPPER_SNAKE_CASE',
      'const sql = `SELECT DATE_FORMAT(a, ${DATE_TIME_FORMAT}) FROM t WHERE id = ?`;',
    ],
    [
      'chuỗi SQL hằng không nội suy',
      "const sql = 'SELECT 1 FROM t WHERE id = ?';",
    ],
    [
      'nội suy ngoài SQL (thông báo lỗi tiếng Việt)',
      'throw new Error(`kết quả xuất hiện: ${rejection.kind}`);',
    ],
    [
      'chuỗi nháy có chữ "update" thường trong câu văn',
      "const note = 'cần update lại giá trị ' + name;",
    ],
  ])('KHÔNG bắt nhầm: %s', (_name, source) => {
    expect(findSqlConcatenation(source)).toEqual([]);
  });

  it('comment bị bỏ trước khi quét (stripComments): SQL nối chuỗi nằm trong comment không bị tính', () => {
    const source =
      "// const sql = 'SELECT 1 FROM t WHERE id = ' + id;\nconst ok = 1;";
    expect(findSqlConcatenation(stripComments(source))).toEqual([]);
  });
});

describe('BDL-05 mã thật của reschedule/', () => {
  const files = listSourceFiles(RESCHEDULE_DIR);

  it('có file để quét (không "xanh vì quét thư mục rỗng") và gồm file của B4, B5, B6', () => {
    const names = files.map((file) =>
      relative(RESCHEDULE_DIR, file).split(sep).join('/'),
    );
    expect(names.length).toBeGreaterThanOrEqual(10);
    expect(names).toEqual(
      expect.arrayContaining([
        'appointment-reschedule.service.ts',
        'reschedule-request.service.ts',
        'reschedule.reader.ts',
        'patient-reschedule.service.ts',
        'reschedule-preview.service.ts',
      ]),
    );
  });

  it('mọi câu SQL tham số hoá: không nội suy giá trị, không nối chuỗi', () => {
    const violations = files.flatMap((file) =>
      findSqlConcatenation(stripComments(readSource(file))).map(
        (message) => `${relative(RESCHEDULE_DIR, file)}: ${message}`,
      ),
    );
    expect(violations).toEqual([]);
  });
});
