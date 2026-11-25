import { fileURLToPath } from 'node:url';
import { READ_CONTEXT_SQL } from '../../appointments/notifications/notification-context.query.js';
import {
  listSourceFiles,
  readSource,
  stripComments,
} from '../../doctor/testing/architecture-scan.js';
import * as queries from './reminder.query.js';

// notification B3 — quét mã chạy: HTB-06 (INSERT và UPDATE `nhac_lich_hen` CHỈ ở `notification/reminders/reminder.query.ts`; nhắc lịch không ghi `thong_bao`, `email_thong_bao`, `lich_hen` hay
// nhật ký), BTB-05 (SQL tham số hoá, không `SELECT *`), BTB-06 (câu SQL dựng thư không chọn `ly_do_kham`, `ly_do_huy`, `so_dien_thoai`).
const SRC_DIR = fileURLToPath(new URL('../../', import.meta.url));
const REMINDER_DIR = fileURLToPath(new URL('.', import.meta.url));
const runtime = (dir: string) =>
  listSourceFiles(dir).map((file) => ({
    file: file.replaceAll('\\', '/'),
    code: stripComments(readSource(file)),
  }));
const reminders = runtime(REMINDER_DIR);
const sqlConstants = Object.entries(queries).filter(
  (entry): entry is [string, string] =>
    entry[0].endsWith('_SQL') && typeof entry[1] === 'string',
);

describe('HTB-06 nơi ghi nhac_lich_hen', () => {
  it('trong cả src/, câu INSERT hay UPDATE `nhac_lich_hen` chỉ nằm ở notification/reminders/reminder.query.ts', () => {
    const writers = runtime(SRC_DIR)
      .filter(({ code }) =>
        /\b(?:INSERT\s+INTO|UPDATE)\s+`?nhac_lich_hen\b/i.test(code),
      )
      .map(({ file }) => file.slice(file.indexOf('src/')));
    expect(writers).toEqual(['src/notification/reminders/reminder.query.ts']);
  });

  it('mã chạy của reminders/ không ghi thong_bao, email_thong_bao, lich_hen, nhat_ky_hanh_dong và không DELETE', () => {
    expect(reminders.length).toBeGreaterThanOrEqual(6);
    for (const { file, code } of reminders) {
      expect(code, file).not.toMatch(
        /\b(?:INSERT\s+INTO|UPDATE)\s+`?(?:thong_bao|email_thong_bao|lich_hen|nhat_ky_hanh_dong)\b/i,
      );
      expect(code, file).not.toMatch(/\bDELETE\s+FROM\b/i);
    }
  });
});

describe('BTB-05 SQL tham số hoá', () => {
  it('không `SELECT *`; mọi `em.query` nhận hằng SQL đặt tên', () => {
    for (const { file, code } of reminders) {
      expect(code, file).not.toMatch(/SELECT\s+\*/i);
      for (const call of code.matchAll(/em\.query\(\s*([^,)]+)/g))
        expect(call[1]?.trim(), file).toMatch(/^[A-Z][A-Z_]*_SQL$/);
    }
  });

  it('các hằng SQL không có chữ nội suy `${` (giá trị đi qua `?`)', () => {
    expect(sqlConstants.length).toBeGreaterThanOrEqual(8);
    for (const [name, sql] of sqlConstants) {
      expect(sql, name).not.toContain('${');
      expect(sql, name).toContain('?');
    }
  });
});

describe('BTB-06 dữ kiện thư nhắc lịch', () => {
  it('câu đọc dữ kiện thư và mọi câu của reminders/ không chọn ly_do_kham, ly_do_huy, so_dien_thoai', () => {
    for (const sql of [READ_CONTEXT_SQL, ...sqlConstants.map(([, s]) => s)])
      expect(sql).not.toMatch(/ly_do_kham|ly_do_huy|so_dien_thoai/);
  });
});
