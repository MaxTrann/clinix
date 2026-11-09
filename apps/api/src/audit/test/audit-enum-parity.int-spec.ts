import type { DataSource } from 'typeorm';
import {
  HANH_DONG_NHAY_CAM,
  LOAI_DOI_TUONG_NHAT_KY,
} from '../../admin/entities/enums.js';
import {
  createTestDataSource,
  readTestDbSettings,
} from '../../database/testing/test-database.js';
import { officialStatementsFor } from '../../database/testing/official-schema.js';
import { auditEntries } from '../testing/audit-fixtures.js';

// MG-08 (Q34, L14): ba nguồn phải khớp nhau theo TẬP HỢP giá trị (không so số lượng, để PR của
// module khác thêm giá trị vào cuối enum không gây xung đột số đếm):
//   DB đã migrate  ↔  docs/database/clinix_mysql.sql  ↔  HANH_DONG_NHAY_CAM / LOAI_DOI_TUONG_NHAT_KY
//   và mọi hành động/đối tượng của AuditEntry phải nằm trong các tuple đó.
function enumValues(source: string): string[] {
  return [...source.matchAll(/'([^']+)'/g)].map((match) => match[1]!);
}

describe('MG-08 — đối chiếu ENUM nhật ký giữa DB, schema chính thức và mã', () => {
  let db: DataSource;
  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
  });
  afterAll(async () => {
    await db?.destroy();
  });

  async function dbEnum(column: string): Promise<string[]> {
    const rows = (await db.query(
      "SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'nhat_ky_hanh_dong' AND COLUMN_NAME = ?",
      [column],
    )) as { type: string }[];
    return enumValues(rows[0]?.type ?? '');
  }

  function officialEnum(column: string): string[] {
    const create = officialStatementsFor(['nhat_ky_hanh_dong']).find(
      (statement) => statement.startsWith('CREATE TABLE'),
    )!;
    const match = new RegExp(`\`${column}\` ENUM \\(([^)]*)\\)`).exec(create);
    return enumValues(match?.[1] ?? '');
  }

  it.each([
    ['hanh_dong', HANH_DONG_NHAY_CAM],
    ['loai_doi_tuong', LOAI_DOI_TUONG_NHAT_KY],
  ] as const)(
    'cột %s: DB đã migrate = file SQL chính thức = tuple TypeScript (so tập hợp)',
    async (column, tuple) => {
      const expected = [...tuple].sort();
      expect((await dbEnum(column)).sort()).toEqual(expected);
      expect(officialEnum(column).sort()).toEqual(expected);
    },
  );

  it('mọi hành động và đối tượng của AuditEntry nằm trong bộ giá trị ENUM của DB', async () => {
    const actions = new Set(await dbEnum('hanh_dong'));
    const targets = new Set(await dbEnum('loai_doi_tuong'));
    const entries = auditEntries();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(actions.has(entry.action), entry.action).toBe(true);
      expect(targets.has(entry.targetType), entry.targetType).toBe(true);
    }
  });

  it('4 hành động của P4 (Q34) có mặt đủ trong ba nguồn', async () => {
    const added = [
      'PhanCongLichLamViec',
      'GoLichLamViec',
      'DuyetNghiPhep',
      'TuChoiNghiPhep',
    ];
    const dbActions = await dbEnum('hanh_dong');
    for (const action of added) {
      expect(dbActions).toContain(action);
      expect(HANH_DONG_NHAY_CAM).toContain(action);
      expect(auditEntries().some((entry) => entry.action === action)).toBe(
        true,
      );
    }
    expect(await dbEnum('loai_doi_tuong')).toEqual(
      expect.arrayContaining(['lich_lam_viec', 'yeu_cau_nghi_phep']),
    );
  });
});
