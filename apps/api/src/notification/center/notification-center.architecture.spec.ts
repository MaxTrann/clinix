import { fileURLToPath } from 'node:url';
import {
  listSourceFiles,
  readSource,
  stripComments,
} from '../../doctor/testing/architecture-scan.js';

// notification B2 — quét mã chạy của `notification/center/`: BTB-05 (SQL tham số hoá, không `SELECT *`), HTB-06 phần Trung tâm (chỉ `UPDATE thong_bao SET trang_thai_doc`,
// không INSERT, không DELETE, không bảng khác).
const CENTER_DIR = fileURLToPath(new URL('.', import.meta.url));
const sources = listSourceFiles(CENTER_DIR).map((file) => ({
  file,
  code: stripComments(readSource(file)),
}));

describe('kiến trúc notification/center', () => {
  it('có mã để quét', () => {
    expect(sources.length).toBeGreaterThanOrEqual(5);
  });

  it('BTB-05: không `SELECT *`; mọi `em.query` nhận hằng SQL đặt tên (giá trị đi qua tham số `?`, không nối chuỗi)', () => {
    for (const { file, code } of sources) {
      expect(code, file).not.toMatch(/SELECT\s+\*/i);
      for (const call of code.matchAll(/em\.query\(\s*([^,)]+)/g))
        expect(call[1]?.trim(), file).toMatch(/^[A-Z][A-Z_]*_SQL$/);
    }
  });

  it('HTB-06: chỉ ghi `UPDATE thong_bao SET trang_thai_doc = 1`; không INSERT, DELETE hay UPDATE bảng khác', () => {
    for (const { file, code } of sources) {
      expect(code, file).not.toMatch(/\bINSERT\s+INTO\b/i);
      expect(code, file).not.toMatch(/\bDELETE\s+FROM\b/i);
      for (const update of code.matchAll(
        /\bUPDATE\s+`?(\w+)`?\s+SET\s+([^']+)/gi,
      )) {
        expect(update[1], file).toBe('thong_bao');
        expect(update[2]?.trim(), file).toMatch(/^trang_thai_doc = 1\b/);
      }
    }
  });
});
