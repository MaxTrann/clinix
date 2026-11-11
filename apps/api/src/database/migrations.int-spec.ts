import type { DataSource, QueryRunner } from 'typeorm';
import {
  listMigrations,
  revertLastMigration,
  runPendingMigrations,
} from './migration-runner.js';
import { MIGRATIONS } from './migrations/index.js';
import { TaoBangDanhMuc1793024340000 } from './migrations/1793024340000-tao-bang-danh-muc.js';
import { TaoBangMocHoanTien1793534400000 } from './migrations/1793534400000-tao-bang-moc-hoan-tien.js';
import { TaoBangNghiPhep1793275200000 } from './migrations/1793275200000-tao-bang-nghi-phep.js';
import { NhatKyPhanCongNghiPhep1793361600000 } from './migrations/1793361600000-nhat-ky-phan-cong-nghi-phep.js';
import { ThongBaoLichHen1793448000000 } from './migrations/1793448000000-thong-bao-lich-hen.js';
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
const NGHI_PHEP_TABLES = ['yeu_cau_nghi_phep'];
const MOC_HOAN_TIEN_TABLES = ['moc_hoan_tien'];
const MIGRATED_TABLES = [
  ...AUTH_TABLES,
  ...CATALOG_TABLES,
  ...STAFF_TABLES,
  ...OPERATIONS_TABLES,
  'anh_tai_len',
  ...NGHI_PHEP_TABLES,
  ...MOC_HOAN_TIEN_TABLES,
];
// 20 hành động đã có trước P4 (đúng thứ tự trong migration vận hành).
const HANH_DONG_TRUOC_P4 = [
  'DoiQuyen',
  'OverrideLichHen',
  'HoanTienDacBiet',
  'DoiChiNhanhBacSi',
  'ChinhNoShow',
  'AnDanhGia',
  'XuLyDoiLichNgoaiChinhSach',
  'SuaGhiChuKham',
  'BacSiHuyDotXuat',
  'CapNhatCauHinh',
  'XuLyNapViChuaCong',
  'TaoTaiKhoanNhanSu',
  'KhoaTaiKhoan',
  'MoKhoaTaiKhoan',
  'MoKhoaNoShow',
  'DuyetThayDoiChiNhanh',
  'TuChoiThayDoiChiNhanh',
  'RutThayDoiChiNhanh',
  'HuyThayDoiChiNhanh',
  'DoiHieuLucThayDoiChiNhanh',
];
const NGHI_PHEP_NAME = TaoBangNghiPhep1793275200000.name;
const P4_NAME = NhatKyPhanCongNghiPhep1793361600000.name;
const BOOKING_P7_NAME = ThongBaoLichHen1793448000000.name;
const BOOKING_P6_NAME = TaoBangMocHoanTien1793534400000.name;
const settings = readTestDbSettings(process.env, 'clinix_migration_test');
let dataSource: DataSource;

/** Tên các migration đứng SAU `name` trong sổ đăng ký, theo thứ tự áp dụng (rỗng nếu `name` là migration cuối). */
function migrationsAfter(name: string): string[] {
  const index = MIGRATIONS.findIndex((migration) => migration.name === name);
  expect(index, `${name} có trong MIGRATIONS`).toBeGreaterThanOrEqual(0);
  return MIGRATIONS.slice(index + 1).map((migration) => migration.name);
}

/**
 * Hoàn tác mọi migration đứng sau `name` (từ cuối về) để `name` thành migration cuối đã áp dụng; trả về tên chúng.
 * Các test MG-05, MG-06, TBLH-09, MHT-09 gọi migration theo TÊN nên thêm migration mới ở cuối sổ không làm chúng vỡ.
 */
async function revertAfter(name: string): Promise<string[]> {
  const later = migrationsAfter(name);
  for (const expected of [...later].reverse()) {
    expect(await revertLastMigration(dataSource)).toBe(expected);
  }
  return later;
}

/** Cột thong_bao.lich_hen_id, chỉ mục thong_bao_index_lich_hen và khóa ngoại của nó trong DB. */
async function readThongBaoLichHen(): Promise<{
  hasColumn: boolean;
  indexColumns: string[];
  foreignKeys: number;
}> {
  const [columns, indexes, foreignKeys] = await Promise.all([
    dataSource.query(
      "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'thong_bao' AND COLUMN_NAME = 'lich_hen_id'",
    ) as Promise<unknown[]>,
    dataSource.query(
      "SELECT COLUMN_NAME AS name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'thong_bao' AND INDEX_NAME = 'thong_bao_index_lich_hen' ORDER BY SEQ_IN_INDEX",
    ) as Promise<{ name: string }[]>,
    dataSource.query(
      "SELECT 1 FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'thong_bao' AND COLUMN_NAME = 'lich_hen_id' AND REFERENCED_TABLE_NAME = 'lich_hen'",
    ) as Promise<unknown[]>,
  ]);
  return {
    hasColumn: columns.length > 0,
    indexColumns: indexes.map((row) => row.name),
    foreignKeys: foreignKeys.length,
  };
}

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

  it('MHT-09: down của booking P6 xóa bảng moc_hoan_tien kể cả khi còn dòng (không chặn); up lại cho bảng RỖNG, cùng cấu trúc', async () => {
    // P6 là migration cuối trong sổ nên không có gì phải hoàn tác trước nó
    expect(await revertAfter(BOOKING_P6_NAME)).toEqual([]);
    const showCreate = async (): Promise<string> => {
      const rows = (await dataSource.query(
        'SHOW CREATE TABLE `moc_hoan_tien`',
      )) as Record<string, string>[];
      return (rows[0]?.['Create Table'] ?? '').replace(
        / AUTO_INCREMENT=\d+/,
        '',
      );
    };
    const installed = await showCreate();
    expect(installed).toContain('chk_moc_hoan_ty_le');

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      // dich_vu_kham để trống: tắt kiểm khóa ngoại trên MỘT kết nối để dựng dòng mốc (như TBLH-09)
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
      await queryRunner.query(
        'INSERT INTO moc_hoan_tien (dich_vu_kham_id, so_gio_truoc_toi_thieu, ty_le_hoan) VALUES (900001, 24, 100)',
      );
      const countRows = async (): Promise<number> => {
        const rows = (await queryRunner.query(
          'SELECT COUNT(*) AS total FROM moc_hoan_tien',
        )) as { total: string | number }[];
        return Number(rows[0]?.total);
      };
      expect(await countRows()).toBe(1);

      // Còn dòng mốc: down VẪN chạy (chỉ mất cấu hình mốc), các bảng khác còn nguyên
      expect(await revertLastMigration(dataSource)).toBe(BOOKING_P6_NAME);
      const tables = await listTables(dataSource);
      expect(tables).not.toContain('moc_hoan_tien');
      expect(tables).toEqual(
        expect.arrayContaining(
          MIGRATED_TABLES.filter((table) => table !== 'moc_hoan_tien'),
        ),
      );
      expect(
        (await listMigrations(dataSource)).find(
          (item) => item.name === BOOKING_P6_NAME,
        )?.executed,
      ).toBe(false);

      // up lại: đúng một migration, bảng trở lại RỖNG với cùng cấu trúc (cột, COMMENT, UNIQUE, khóa ngoại, CHECK)
      expect(await runPendingMigrations(dataSource)).toEqual([BOOKING_P6_NAME]);
      expect(await showCreate()).toBe(installed);
      expect(await countRows()).toBe(0);
    } finally {
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
      await queryRunner.release();
    }
  });

  it('TBLH-09: down của booking P7 gỡ cột, chỉ mục, khóa ngoại và bị chặn khi còn thông báo gắn lịch hẹn; up lại được', async () => {
    const later = await revertAfter(BOOKING_P7_NAME);
    const installed = {
      hasColumn: true,
      indexColumns: ['lich_hen_id', 'tai_khoan_id', 'loai_su_kien'],
      foreignKeys: 1,
    };
    expect(await readThongBaoLichHen()).toEqual(installed);
    const countRows = async (): Promise<number> => {
      const rows = (await dataSource.query(
        'SELECT COUNT(*) AS total FROM thong_bao',
      )) as { total: string | number }[];
      return Number(rows[0]?.total);
    };

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      // Bảng tham chiếu để trống: tắt kiểm khóa ngoại trên MỘT kết nối để dựng dòng (như test P3 ở trên)
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
      const insert = (lichHenId: string | null) =>
        queryRunner.query(
          "INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, lich_hen_id, thoi_diem_tao) VALUES (900001, 'TBLH-09', 'LichHenDaHuy', ?, NOW())",
          [lichHenId],
        );
      await insert(null);
      await insert('900001');

      // Còn dòng gắn lịch hẹn: down ném lỗi và KHÔNG đổi gì (cột, chỉ mục, khóa ngoại, dòng, sổ migration)
      await expect(revertLastMigration(dataSource)).rejects.toThrow(
        /thông báo gắn lịch hẹn/,
      );
      expect(await readThongBaoLichHen()).toEqual(installed);
      expect(await countRows()).toBe(2);
      const status = await listMigrations(dataSource);
      expect(
        status.find((item) => item.name === BOOKING_P7_NAME)?.executed,
      ).toBe(true);

      // Hết dòng gắn lịch hẹn: down chạy; thông báo khác còn nguyên
      await queryRunner.query(
        'DELETE FROM thong_bao WHERE lich_hen_id IS NOT NULL',
      );
      expect(await revertLastMigration(dataSource)).toBe(BOOKING_P7_NAME);
      expect(await readThongBaoLichHen()).toEqual({
        hasColumn: false,
        indexColumns: [],
        foreignKeys: 0,
      });
      expect(await countRows()).toBe(1);

      // up lại được, cùng trạng thái như trước khi hoàn tác
      expect(await runPendingMigrations(dataSource)).toEqual([
        BOOKING_P7_NAME,
        ...later,
      ]);
      expect(await readThongBaoLichHen()).toEqual(installed);
      await queryRunner.query('DELETE FROM thong_bao');
    } finally {
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
      await queryRunner.release();
    }
  });

  it('MG-06: migration enum nhật ký (P4) nhận giá trị mới, giữ giá trị cũ; down bị chặn khi còn dòng dùng giá trị mới', async () => {
    const readEnum = async (column: string): Promise<string[]> => {
      const rows = (await dataSource.query(
        "SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'nhat_ky_hanh_dong' AND COLUMN_NAME = ?",
        [column],
      )) as { type: string }[];
      return [...(rows[0]?.type ?? '').matchAll(/'([^']+)'/g)].map(
        (match) => match[1]!,
      );
    };
    const insertNew = (queryRunner: QueryRunner) =>
      queryRunner.query(
        "INSERT INTO nhat_ky_hanh_dong (tai_khoan_id, hanh_dong, loai_doi_tuong, ma_doi_tuong, thoi_diem, ket_qua) VALUES (900001, 'GoLichLamViec', 'lich_lam_viec', 1, NOW(), 'ThanhCong')",
      );

    // P4 phải là migration cuối đã áp dụng thì revertLastMigration mới chạm đúng nó (migration thêm sau P4 được hoàn tác trước).
    const later = await revertAfter(P4_NAME);
    const afterUp = await readEnum('hanh_dong');
    // Giá trị cũ đứng nguyên vị trí đầu danh sách, giá trị mới thêm cuối.
    expect(afterUp.slice(0, 20)).toEqual(HANH_DONG_TRUOC_P4);
    expect(afterUp.slice(20)).toEqual([
      'PhanCongLichLamViec',
      'GoLichLamViec',
      'DuyetNghiPhep',
      'TuChoiNghiPhep',
    ]);
    expect((await readEnum('loai_doi_tuong')).slice(9)).toEqual([
      'lich_lam_viec',
      'yeu_cau_nghi_phep',
    ]);

    // Có dòng dùng giá trị mới: down không được làm mất dấu vết (MySQL 1265, không đổi gì).
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
      await insertNew(queryRunner);
      await expect(revertLastMigration(dataSource)).rejects.toThrow();
      expect(await readEnum('hanh_dong')).toEqual(afterUp);
      await queryRunner.query('DELETE FROM nhat_ky_hanh_dong');
    } finally {
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
      await queryRunner.release();
    }

    // Hết dòng dùng giá trị mới: down chạy, enum về như trước P4; up lại được.
    expect(await revertLastMigration(dataSource)).toBe(P4_NAME);
    expect(await readEnum('hanh_dong')).toEqual(HANH_DONG_TRUOC_P4);
    expect(await readEnum('loai_doi_tuong')).toHaveLength(9);
    expect(await listTables(dataSource)).toContain('yeu_cau_nghi_phep');
    expect(await runPendingMigrations(dataSource)).toEqual([P4_NAME, ...later]);
    expect(await readEnum('hanh_dong')).toEqual(afterUp);
  });

  it('MG-05: down hoàn tác migration nghỉ phép (ngay trước P4): giữ các bảng cũ, xóa bảng nghỉ phép, rồi up lại được', async () => {
    const later = await revertAfter(P4_NAME);
    expect(await revertLastMigration(dataSource)).toBe(P4_NAME);
    expect(await revertLastMigration(dataSource)).toBe(NGHI_PHEP_NAME);
    const tables = await listTables(dataSource);
    expect(tables).not.toContain('yeu_cau_nghi_phep');
    expect(tables).toContain('anh_tai_len');
    for (const table of OPERATIONS_TABLES) expect(tables).toContain(table);
    for (const table of STAFF_TABLES) expect(tables).toContain(table);
    for (const table of CATALOG_TABLES) expect(tables).toContain(table);
    for (const table of AUTH_TABLES) expect(tables).toContain(table);
    expect((await listMigrations(dataSource)).at(-1)?.executed).toBe(false);

    expect(await runPendingMigrations(dataSource)).toEqual([
      NGHI_PHEP_NAME,
      P4_NAME,
      ...later,
    ]);
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
