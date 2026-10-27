import type { DataSource } from 'typeorm';
import {
  listMigrations,
  revertLastMigration,
  runPendingMigrations,
} from './migration-runner.js';
import { MIGRATIONS } from './migrations/index.js';
import { TaoBangDanhMuc1793024340000 } from './migrations/1793024340000-tao-bang-danh-muc.js';
import {
  createTestDataSource,
  listTables,
  readTestDbSettings,
  recreateDatabase,
} from './testing/test-database.js';

// P1/P2/P3 — vòng đời migration và các tiền kiểm dữ liệu trên DB riêng
// (clinix_migration_test), không dùng DB của các file test khác.
const AUTH_TABLES = [
  'benh_nhan',
  'ma_xac_thuc',
  'phien_dang_nhap',
  'tai_khoan',
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
const OPERATIONS_TABLES = [
  'yeu_cau_thay_doi_chi_nhanh',
  'yeu_cau_thay_doi_chi_nhanh_lich_hen',
  'thong_tin_phong_kham',
  'cau_hinh_he_thong',
  'nhat_ky_hanh_dong',
  'thong_bao',
  'email_thong_bao',
];
const MIGRATED_TABLES = [
  ...AUTH_TABLES,
  ...CATALOG_TABLES,
  ...STAFF_TABLES,
  ...OPERATIONS_TABLES,
];
const settings = readTestDbSettings(process.env, 'clinix_migration_test');
let dataSource: DataSource;

beforeAll(async () => {
  await recreateDatabase(settings);
  dataSource = await createTestDataSource(settings);
});

afterAll(async () => {
  await dataSource?.destroy();
});

describe('tiền kiểm migration danh mục trên dữ liệu có sẵn (CK-18, DV-21)', () => {
  it('CK-18: dừng, liệt kê chuyên khoa trùng sau trim/gộp khoảng trắng và giữ nguyên dữ liệu', async () => {
    await dataSource.query(`
      CREATE TABLE \`chuyen_khoa\` (
        \`chuyen_khoa_id\` bigint PRIMARY KEY AUTO_INCREMENT,
        \`ten\` varchar(100) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await dataSource.query(
      'INSERT INTO `chuyen_khoa` (`ten`) VALUES (?), (?)',
      ['Cơ   xương khớp', '  Cơ xương khớp  '],
    );
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await expect(
        new TaoBangDanhMuc1793024340000().up(queryRunner),
      ).rejects.toThrow(/chưa thực hiện DDL nào[\s\S]*CK id=1[\s\S]*CK id=2/);
      const rows = (await dataSource.query(
        'SELECT `chuyen_khoa_id`, `ten` FROM `chuyen_khoa` ORDER BY `chuyen_khoa_id`',
      )) as { ten: string }[];
      expect(rows.map((row) => row.ten)).toEqual([
        'Cơ   xương khớp',
        '  Cơ xương khớp  ',
      ]);
      expect(await listTables(dataSource)).toEqual(['chuyen_khoa']);
    } finally {
      await queryRunner.release();
      await dataSource.query('DROP TABLE `chuyen_khoa`');
    }
  });

  it('DV-21: dừng và liệt kê tên dịch vụ trùng trong cùng nhóm, nhưng bỏ qua nhóm khác', async () => {
    await dataSource.query(`
      CREATE TABLE \`dich_vu_kham\` (
        \`dich_vu_kham_id\` bigint PRIMARY KEY AUTO_INCREMENT,
        \`nhom_dich_vu_id\` bigint NOT NULL,
        \`ten\` varchar(100) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await dataSource.query(
      'INSERT INTO `dich_vu_kham` (`nhom_dich_vu_id`, `ten`) VALUES (1, ?), (1, ?), (2, ?)',
      ['Khám   tổng quát', ' Khám tổng quát ', 'Khám tổng quát'],
    );
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      let migrationError: unknown;
      try {
        await new TaoBangDanhMuc1793024340000().up(queryRunner);
      } catch (error) {
        migrationError = error;
      }
      expect(migrationError).toBeInstanceOf(Error);
      const message = (migrationError as Error).message;
      expect(message).toContain('DV id=1, nhom_dich_vu_id=1');
      expect(message).toContain('DV id=2, nhom_dich_vu_id=1');
      expect(message).not.toContain('DV id=3');
      const rows = await dataSource.query('SELECT * FROM `dich_vu_kham`');
      expect(rows).toHaveLength(3);
      expect(await listTables(dataSource)).toEqual(['dich_vu_kham']);
    } finally {
      await queryRunner.release();
      await dataSource.query('DROP TABLE `dich_vu_kham`');
    }
  });
});

describe('vòng đời migration', () => {
  it('DB mới tinh: chưa có bảng nào và mọi migration ở trạng thái chưa áp dụng', async () => {
    expect(await listTables(dataSource)).toEqual([]);
    const status = await listMigrations(dataSource);
    expect(status).toHaveLength(MIGRATIONS.length);
    expect(status.every((item) => !item.executed)).toBe(true);
  });

  it('up: áp dụng mọi migration và tạo đủ bảng auth, danh mục, nhân sự và bảng nền', async () => {
    const done = await runPendingMigrations(dataSource);
    expect(done).toEqual(MIGRATIONS.map((migration) => migration.name));
    expect(await listTables(dataSource)).toEqual(
      expect.arrayContaining(MIGRATED_TABLES),
    );
    expect(
      (await listMigrations(dataSource)).every((item) => item.executed),
    ).toBe(true);
  });

  it('up lần hai không làm gì', async () => {
    expect(await runPendingMigrations(dataSource)).toEqual([]);
  });

  it('P3 giữ một yêu cầu mở mỗi chi nhánh, cho phép BoQua và enum audit mới', async () => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
      const insertRequest = `
        INSERT INTO yeu_cau_thay_doi_chi_nhanh
          (chi_nhanh_id, nguoi_de_xuat_id, noi_dung_truoc, noi_dung_sau)
        VALUES (900001, 900001, JSON_OBJECT('x', 1), JSON_OBJECT('x', 2))
      `;
      await queryRunner.query(insertRequest);
      await expect(queryRunner.query(insertRequest)).rejects.toThrow();

      await queryRunner.query(
        "UPDATE yeu_cau_thay_doi_chi_nhanh SET trang_thai = 'DaRut' WHERE chi_nhanh_id = 900001",
      );
      await queryRunner.query(insertRequest);
      const openRequests = await queryRunner.query(
        'SELECT dang_mo_chi_nhanh FROM yeu_cau_thay_doi_chi_nhanh WHERE chi_nhanh_id = 900001 AND dang_mo_chi_nhanh IS NOT NULL',
      );
      expect(openRequests).toHaveLength(1);

      await queryRunner.query(
        "INSERT INTO email_thong_bao (thong_bao_id, trang_thai) VALUES (900001, 'BoQua')",
      );
      await queryRunner.query(
        "INSERT INTO nhat_ky_hanh_dong (tai_khoan_id, hanh_dong, loai_doi_tuong, ma_doi_tuong, thoi_diem, ket_qua) VALUES (900001, 'DoiHieuLucThayDoiChiNhanh', 'yeu_cau_thay_doi_chi_nhanh', 1, NOW(), 'ThanhCong')",
      );

      await expect(
        queryRunner.query('INSERT INTO thong_tin_phong_kham (id) VALUES (2)'),
      ).rejects.toThrow();
      const configRows = await queryRunner.query(
        'SELECT COUNT(*) AS total FROM cau_hinh_he_thong',
      );
      expect(Number(configRows[0]?.total)).toBe(0);
    } finally {
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
      await queryRunner.release();
    }
  });

  it('down hoàn tác migration P3 cuối: giữ P1/P2, xóa bảy bảng vận hành, rồi up lại được', async () => {
    const last = MIGRATIONS.at(-1)?.name;
    expect(await revertLastMigration(dataSource)).toBe(last);
    const tables = await listTables(dataSource);
    for (const table of OPERATIONS_TABLES) expect(tables).not.toContain(table);
    for (const table of STAFF_TABLES) expect(tables).toContain(table);
    for (const table of CATALOG_TABLES) expect(tables).toContain(table);
    for (const table of AUTH_TABLES) expect(tables).toContain(table);
    expect((await listMigrations(dataSource)).at(-1)?.executed).toBe(false);

    expect(await runPendingMigrations(dataSource)).toEqual([last]);
    expect(await listTables(dataSource)).toEqual(
      expect.arrayContaining(MIGRATED_TABLES),
    );
  });

  it('hoàn tác hết rồi hoàn tác tiếp: trả về null, không lỗi', async () => {
    for (let i = 0; i < MIGRATIONS.length; i++)
      await revertLastMigration(dataSource);
    expect(await revertLastMigration(dataSource)).toBeNull();
    expect(await runPendingMigrations(dataSource)).toHaveLength(
      MIGRATIONS.length,
    );
  });
});
