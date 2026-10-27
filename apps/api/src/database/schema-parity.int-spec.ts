import type { DataSource } from 'typeorm';
import { TAO_BANG_AUTH_SQL } from './migrations/1793001600000-tao-bang-auth.js';
import { TAO_BANG_DANH_MUC_SQL } from './migrations/1793024340000-tao-bang-danh-muc.js';
import { TAO_BANG_NHAN_SU_SQL } from './migrations/1793080000000-tao-bang-nhan-su.js';
import {
  normalizeStatement,
  officialStatementsFor,
  referencedTables,
  targetTable,
} from './testing/official-schema.js';
import {
  createTestDataSource,
  listTables,
  readTestDbSettings,
  recreateDatabase,
} from './testing/test-database.js';

// P1 — danh mục; P2 — nhân sự và bảng nền; auth P3 — tài khoản và xác thực.
const AUTH_TABLES = [
  'tai_khoan',
  'benh_nhan',
  'ma_xac_thuc',
  'phien_dang_nhap',
  'vi_noi_bo',
];
const CATALOG_TABLES = [
  'chi_nhanh',
  'chi_nhanh_lich_hoat_dong',
  'chuyen_khoa',
  'nhom_dich_vu',
  'dich_vu_kham',
  'chi_nhanh_dich_vu_kham',
];
const STAFF_TABLES = [
  'bac_si',
  'le_tan',
  'quan_tri_vien',
  'phu_phi_bac_si',
  'ho_so_nguoi_than',
  'lich_lam_viec',
  'khung_gio',
  'lich_hen',
];
const MIGRATED_TABLES = [...AUTH_TABLES, ...CATALOG_TABLES, ...STAFF_TABLES];
let migrated: DataSource;
let reference: DataSource;

beforeAll(async () => {
  // clinix_test đã được dựng bằng migration ở globalSetup; clinix_ref_test dựng thẳng từ file SQL chính thức
  migrated = await createTestDataSource(readTestDbSettings());
  const referenceSettings = readTestDbSettings(process.env, 'clinix_ref_test');
  await recreateDatabase(referenceSettings);
  reference = await createTestDataSource(referenceSettings);
});

afterAll(async () => {
  await migrated?.destroy();
  await reference?.destroy();
});

async function showCreateTable(
  dataSource: DataSource,
  table: string,
): Promise<string> {
  const rows: Record<string, string>[] = await dataSource.query(
    `SHOW CREATE TABLE \`${table}\``,
  );
  const ddl = rows[0]?.['Create Table'] ?? '';
  return ddl.replace(/ AUTO_INCREMENT=\d+/, '');
}

describe('migration khớp schema chính thức (docs/database/clinix_mysql.sql)', () => {
  it('văn bản DDL trong migration trùng TỪNG CÂU, cùng thứ tự, với file SQL chính thức', () => {
    const official = officialStatementsFor(AUTH_TABLES).map(normalizeStatement);
    expect(official.length).toBeGreaterThan(0);
    expect(TAO_BANG_AUTH_SQL.map(normalizeStatement)).toEqual(official);
  });

  it('SHOW CREATE TABLE của DB dựng bằng migration giống hệt DB dựng thẳng từ file SQL chính thức', async () => {
    const tables = (await listTables(migrated)).filter(
      (table) => table !== 'migrations' && table !== 'typeorm_metadata',
    );
    expect(tables).toEqual([...MIGRATED_TABLES].sort());

    // Dựng DB tham chiếu: chỉ các câu lệnh của bảng đã có migration, và khóa ngoại chỉ tới bảng đã có
    const known = new Set(tables);
    const statements = officialStatementsFor(tables).filter((statement) =>
      referencedTables(statement).every((ref) => known.has(ref)),
    );
    for (const statement of statements) await reference.query(statement);
    expect((await listTables(reference)).sort()).toEqual(tables);

    for (const table of tables) {
      expect(await showCreateTable(migrated, table), `bảng ${table}`).toBe(
        await showCreateTable(reference, table),
      );
    }
  });

  it('mọi câu lệnh trong migration thuộc đúng 5 bảng auth', () => {
    for (const statement of TAO_BANG_AUTH_SQL) {
      expect(AUTH_TABLES).toContain(targetTable(statement));
    }
  });

  it('văn bản DDL danh mục trùng TỪNG CÂU, cùng thứ tự, với file SQL chính thức', () => {
    const official =
      officialStatementsFor(CATALOG_TABLES).map(normalizeStatement);
    expect(official.length).toBeGreaterThan(0);
    expect(TAO_BANG_DANH_MUC_SQL.map(normalizeStatement)).toEqual(official);
  });

  it('mọi câu lệnh trong migration danh mục chỉ tác động sáu bảng P1', () => {
    for (const statement of TAO_BANG_DANH_MUC_SQL) {
      expect(CATALOG_TABLES).toContain(targetTable(statement));
    }
  });

  it('văn bản DDL nhân sự và bảng nền trùng TỪNG CÂU, cùng thứ tự, với schema chính thức', () => {
    const official =
      officialStatementsFor(STAFF_TABLES).map(normalizeStatement);
    expect(official.length).toBeGreaterThan(0);
    expect(TAO_BANG_NHAN_SU_SQL.map(normalizeStatement)).toEqual(official);
  });

  it('mọi câu lệnh trong migration P2 chỉ tác động tám bảng được giao', () => {
    for (const statement of TAO_BANG_NHAN_SU_SQL) {
      expect(STAFF_TABLES).toContain(targetTable(statement));
    }
  });
});
