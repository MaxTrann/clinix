import { fileURLToPath } from 'node:url';
import type { EntityManager } from 'typeorm';
import {
  listSourceFiles,
  readSource,
  stripComments,
} from '../../doctor/testing/architecture-scan.js';
import { PUBLIC_DOCTOR_CONDITION } from '../common/public-doctor.sql.js';
import {
  PublicSlotRepository,
  publicDoctorIdsSql,
} from './public-slot.repository.js';

// Search Slots PR-C1 — KGC-13, KGC-14: luật quét câu SQL THẬT của câu lọc công khai và quét mã nguồn `search/slots/` (mẫu `rating.sql.spec`, `admin-ratings.sql.spec`).
// Không DB: `EntityManager` giả chỉ ghi câu và tham số mà repository THẬT gửi đi (không gõ lại câu ở test).
const DIR = fileURLToPath(new URL('.', import.meta.url));
const squash = (sql: string) => sql.replace(/\s+/g, ' ').trim();
const placeholders = (sql: string) => sql.match(/\?/g)?.length ?? 0;

interface Sent {
  sql: string;
  params: unknown[];
}
function recorder(answer: unknown[] = []) {
  const sent: Sent[] = [];
  const em = {
    query: (sql: string, params: unknown[]) => {
      sent.push({ sql, params });
      return Promise.resolve(answer);
    },
  } as unknown as EntityManager;
  return { em, sent };
}

/** Câu ghi, khoá hàng hoặc đọc giờ DB: không được có trong đường đọc công khai (chỉ đọc, giờ do ứng dụng truyền). */
const WRITE_OR_LOCK =
  /\b(?:INSERT|UPDATE|DELETE|REPLACE|FOR\s+UPDATE|FOR\s+SHARE|LOCK\s+IN\s+SHARE\s+MODE)\b|\b(?:NOW|CURDATE)\s*\(/i;
const IMPORTS_BOOKING_OR_DOCTOR = /from\s+'[^']*\/(?:appointments|doctor)\//;

describe('KGC-13 câu lọc bác sĩ công khai', () => {
  it('đúng MỘT câu SELECT, nguyên văn PUBLIC_DOCTOR_CONDITION, số `?` bằng số id, tham số đúng thứ tự', async () => {
    const { em, sent } = recorder([{ bacSiId: '7' }]);
    await new PublicSlotRepository().findPublicIds(em, ['7', '5', '9']);

    expect(sent).toHaveLength(1);
    const { sql, params } = sent[0] as Sent;
    expect(sql).toMatch(/^\s*SELECT\b/i);
    expect(squash(sql)).toContain(squash(PUBLIC_DOCTOR_CONDITION));
    expect(placeholders(sql)).toBe(3);
    expect(params).toEqual(['7', '5', '9']);
    expect(sql).not.toMatch(WRITE_OR_LOCK);
    expect(sql).not.toMatch(/\*/); // không SELECT *
  });

  it('chỉ đọc đúng MỘT cột, id qua CAST … AS CHAR (id là bigint)', () => {
    const sql = publicDoctorIdsSql(1);
    expect(sql).toContain('CAST(b.tai_khoan_id AS CHAR) AS bacSiId');
    expect(sql).not.toMatch(/\bemail\b|so_dien_thoai|mat_khau/i);
  });

  it('số `?` của câu sinh ra đúng bằng số id (1, 2, 100)', () => {
    for (const count of [1, 2, 100])
      expect(placeholders(publicDoctorIdsSql(count))).toBe(count);
  });

  it('trả id công khai THEO THỨ TỰ đầu vào, không theo thứ tự DB trả', async () => {
    const { em } = recorder([{ bacSiId: '9' }, { bacSiId: '5' }]);
    expect(
      await new PublicSlotRepository().findPublicIds(em, ['5', '7', '9']),
    ).toEqual(['5', '9']);
  });

  it('không có id nào ⇒ không gửi câu nào', async () => {
    const { em, sent } = recorder();
    expect(await new PublicSlotRepository().findPublicIds(em, [])).toEqual([]);
    expect(sent).toHaveLength(0);
  });
});

describe('KGC-14 quét mã nguồn search/slots/', () => {
  const sources = listSourceFiles(DIR).map((file) => ({
    file,
    code: stripComments(readSource(file)),
  }));

  it('có file để quét (không đạt giả vì thư mục rỗng)', () => {
    expect(sources.length).toBeGreaterThanOrEqual(6);
  });

  it('không câu ghi, không khoá, không giờ của DB; không import appointments/ hay doctor/', () => {
    for (const { file, code } of sources) {
      expect(code, file).not.toMatch(WRITE_OR_LOCK);
      expect(code, file).not.toMatch(IMPORTS_BOOKING_OR_DOCTOR);
    }
  });

  it('câu lọc dùng hằng chung PUBLIC_DOCTOR_CONDITION, không tự viết lại điều kiện công khai', () => {
    const repository = sources.find(({ file }) =>
      file.endsWith('public-slot.repository.ts'),
    );
    expect(repository?.code).toContain('PUBLIC_DOCTOR_CONDITION');
    for (const { file, code } of sources)
      expect(code, file).not.toMatch(/trang_thai\s*=\s*'DangHoatDong'/);
  });

  it('bộ quét thật sự bắt mẫu xấu và không báo nhầm mẫu lành', () => {
    for (const bad of [
      'SELECT 1 FOR UPDATE',
      'x FOR SHARE',
      "UPDATE khung_gio SET trang_thai = 'DaDat'",
      'INSERT INTO lich_hen',
      'DELETE FROM khung_gio',
      'WHERE d < NOW()',
      'CURDATE()',
    ])
      expect(bad).toMatch(WRITE_OR_LOCK);
    for (const good of [
      'SELECT CAST(b.tai_khoan_id AS CHAR) AS bacSiId FROM bac_si b',
      'const updatedAt = 1; // UPDATE chỉ trong chú thích',
      'khung_gio_id IN (?, ?)',
    ])
      expect(stripComments(good)).not.toMatch(WRITE_OR_LOCK);
    expect("import x from '../../appointments/y.js'").toMatch(
      IMPORTS_BOOKING_OR_DOCTOR,
    );
    expect("import x from '../../scheduling/y.js'").not.toMatch(
      IMPORTS_BOOKING_OR_DOCTOR,
    );
  });
});
