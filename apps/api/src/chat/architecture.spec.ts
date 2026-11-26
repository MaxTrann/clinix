import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSqlConcatenation } from '../appointments/testing/sql-concatenation-scan.js';
import {
  listSourceFiles,
  readSource,
  stripComments,
} from '../doctor/testing/architecture-scan.js';

// chat B1 — HCH-01, HCH-02, HCH-03 (PLAN chat 7.11): quét mã nguồn `src/chat` (không test, không `testing/`). Mỗi luật có đối chứng ÂM trên nguồn giả trước khi quét mã thật.
const CHAT_DIR = fileURLToPath(new URL('.', import.meta.url));
const CHAT_TABLES = ['hoi_thoai', 'tai_khoan_hoi_thoai', 'tin_nhan'];
// `thong_bao` chỉ được ghi ở `chat/notifications/` (B6, nếp Q5 của thông báo)
const NOTIFICATIONS_DIR = `notifications${sep}`;

const sources = listSourceFiles(CHAT_DIR).map((file) => ({
  file: relative(CHAT_DIR, file),
  code: stripComments(readSource(file)),
}));

const INSERT_HOI_THOAI = /INSERT\s+INTO\s+`?hoi_thoai`?\s*\(/gi;
const SELECT_STAR = /SELECT\s+(?:DISTINCT\s+)?(?:\w+\.)?\*/i;
const WRITE_TARGET =
  /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+`?([a-z_][a-z0-9_]*)`?/gi;

/** Bảng bị ghi (INSERT, UPDATE, DELETE) trong một đoạn mã. `UPDATE` sau `ON DUPLICATE KEY` không phải câu ghi bảng riêng. */
function writtenTables(code: string): string[] {
  const tables: string[] = [];
  for (const match of code.matchAll(WRITE_TARGET)) {
    const before = code.slice(
      Math.max(0, (match.index ?? 0) - 15),
      match.index,
    );
    if (/KEY\s+$/i.test(before)) continue;
    tables.push((match[1] ?? '').toLowerCase());
  }
  return tables;
}

function forbiddenWrites(file: string, code: string): string[] {
  return writtenTables(code).filter(
    (table) =>
      !CHAT_TABLES.includes(table) &&
      !(table === 'thong_bao' && file.startsWith(NOTIFICATIONS_DIR)),
  );
}

describe('chat B1 — kiến trúc (HCH)', () => {
  it('có mã nguồn để quét (chống quét rỗng)', () => {
    expect(sources.map((s) => s.file)).toContain(
      join('core', 'conversation-open.repository.ts'),
    );
  });

  it('HCH-01: đúng MỘT nơi `INSERT INTO hoi_thoai` (conversation-open.repository.ts), đúng một câu; đối chứng âm: nguồn giả có câu đó thì bị đếm', () => {
    expect([
      ...'x("INSERT INTO hoi_thoai (loai) VALUES (?)")'.matchAll(
        INSERT_HOI_THOAI,
      ),
    ]).toHaveLength(1);
    const hits = sources.flatMap(({ file, code }) =>
      [...code.matchAll(INSERT_HOI_THOAI)].map(() => file),
    );
    expect(hits).toEqual([join('core', 'conversation-open.repository.ts')]);
  });

  it('HCH-02: SQL của chat tham số hoá (không nối chuỗi giá trị) và không `SELECT *`; đối chứng âm bị bắt', () => {
    expect(
      findSqlConcatenation(
        'const q = `SELECT 1 FROM tin_nhan WHERE id = ${id}`;',
      ),
    ).not.toEqual([]);
    expect(SELECT_STAR.test('SELECT * FROM tin_nhan')).toBe(true);
    expect(SELECT_STAR.test('SELECT t.* FROM tin_nhan t')).toBe(true);
    expect(SELECT_STAR.test('SELECT COUNT(*) AS n FROM tin_nhan')).toBe(false);
    for (const { file, code } of sources) {
      expect(findSqlConcatenation(code), file).toEqual([]);
      expect(SELECT_STAR.test(code), file).toBe(false);
    }
  });

  it('HCH-03: chỉ ghi ba bảng chat; `thong_bao` chỉ ở chat/notifications/; đối chứng âm: ghi bảng khác hay thong_bao ngoài notifications thì bị bắt', () => {
    expect(
      forbiddenWrites('core/x.ts', "q('UPDATE tai_khoan SET a = 1')"),
    ).toEqual(['tai_khoan']);
    expect(
      forbiddenWrites('core/x.ts', "q('INSERT INTO thong_bao (a) VALUES (?)')"),
    ).toEqual(['thong_bao']);
    expect(
      forbiddenWrites(
        `notifications${sep}x.ts`,
        "q('INSERT INTO thong_bao (a) VALUES (?)')",
      ),
    ).toEqual([]);
    expect(
      forbiddenWrites(
        'core/x.ts',
        "q('INSERT INTO tai_khoan_hoi_thoai (a) VALUES (?) ON DUPLICATE KEY UPDATE a = a')",
      ),
    ).toEqual([]);
    const all = sources.flatMap(({ file, code }) =>
      forbiddenWrites(file, code).map((table) => `${file}: ${table}`),
    );
    expect(all).toEqual([]);
    // Mã thật có ghi đủ ba bảng chat (phép quét không rỗng)
    const written = new Set(sources.flatMap(({ code }) => writtenTables(code)));
    expect([...written].sort()).toEqual(CHAT_TABLES);
  });
});
