import type { DataSource, QueryRunner } from 'typeorm';
import {
  listMigrations,
  revertLastMigration,
  runPendingMigrations,
} from './migration-runner.js';
import { MIGRATIONS } from './migrations/index.js';
import { TaoBangDanhMuc1793024340000 } from './migrations/1793024340000-tao-bang-danh-muc.js';
import { TaoBangHoSoKham1793620800000 } from './migrations/1793620800000-tao-bang-ho-so-kham.js';
import { TaoBangThanhToanVi1793707200000 } from './migrations/1793707200000-tao-bang-thanh-toan-vi.js';
import { MocThoiGianLichHen1793793600000 } from './migrations/1793793600000-moc-thoi-gian-lich-hen.js';
import { NghiTheoCaNhieuNgay1793880000000 } from './migrations/1793880000000-nghi-theo-ca-nhieu-ngay.js';
import { DoiLich1793966400000 } from './migrations/1793966400000-doi-lich.js';
import { TaoBangNhacLichHen1794052800000 } from './migrations/1794052800000-tao-bang-nhac-lich-hen.js';
import { ChiMucThongBaoTaiKhoan1794139200000 } from './migrations/1794139200000-chi-muc-thong-bao-tai-khoan.js';
import { TaoBangChat1794225600000 } from './migrations/1794225600000-tao-bang-chat.js';
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
const EXAM_TABLES = ['ho_so_kham', 'danh_gia_bac_si'];
// payment P1: năm bảng tiền
const PAYMENT_TABLES = [
  'giao_dich_thanh_toan',
  'giao_dich_vi',
  'lan_doi_soat_nap_vi',
  'lich_su_hoan_tien',
  'yeu_cau_rut_tien',
];
// Bảng có trước từng migration cuối: ca down/up của MHT-09 và MGK-06 chỉ khẳng định các bảng này còn nguyên, nên thêm
// migration mới ở cuối sổ chỉ cần thêm một dòng vào cuối chuỗi này, không phải sửa hai ca đó.
const TABLES_BEFORE_P6 = [
  ...AUTH_TABLES,
  ...CATALOG_TABLES,
  ...STAFF_TABLES,
  ...OPERATIONS_TABLES,
  'anh_tai_len',
  ...NGHI_PHEP_TABLES,
];
const TABLES_BEFORE_EXAM = [...TABLES_BEFORE_P6, ...MOC_HOAN_TIEN_TABLES];
const TABLES_BEFORE_PAYMENT = [...TABLES_BEFORE_EXAM, ...EXAM_TABLES];
// reschedule P1: bảng yêu cầu đổi lịch ngoài chính sách (có trong file SQL từ trước, nay mới có migration)
const DOI_LICH_TABLES = ['yeu_cau_doi_lich_ngoai_chinh_sach'];
// notification P1: bảng nhắc lịch hẹn (có trong file SQL từ trước, nay mới có migration)
const NHAC_LICH_HEN_TABLES = ['nhac_lich_hen'];
const MIGRATED_TABLES = [
  ...TABLES_BEFORE_PAYMENT,
  ...PAYMENT_TABLES,
  ...DOI_LICH_TABLES,
  ...NHAC_LICH_HEN_TABLES,
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
const EXAM_NAME = TaoBangHoSoKham1793620800000.name;
const PAYMENT_NAME = TaoBangThanhToanVi1793707200000.name;
const MOC_NAME = MocThoiGianLichHen1793793600000.name;
const NTC_NAME = NghiTheoCaNhieuNgay1793880000000.name;
const DOI_LICH_NAME = DoiLich1793966400000.name;
const NHAC_LICH_HEN_NAME = TaoBangNhacLichHen1794052800000.name;
const CHI_MUC_THONG_BAO_NAME = ChiMucThongBaoTaiKhoan1794139200000.name;
const CHAT_NAME = TaoBangChat1794225600000.name;
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
    // Hoàn tác các migration đứng sau P6 (hiện là doctor-exam P1) để P6 thành migration cuối đã áp dụng; up lại ở cuối ca
    const later = await revertAfter(BOOKING_P6_NAME);
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
      expect(tables).toEqual(expect.arrayContaining(TABLES_BEFORE_P6));
      expect(
        (await listMigrations(dataSource)).find(
          (item) => item.name === BOOKING_P6_NAME,
        )?.executed,
      ).toBe(false);

      // up lại: đúng một migration, bảng trở lại RỖNG với cùng cấu trúc (cột, COMMENT, UNIQUE, khóa ngoại, CHECK)
      expect(await runPendingMigrations(dataSource)).toEqual([
        BOOKING_P6_NAME,
        ...later,
      ]);
      expect(await showCreate()).toBe(installed);
      expect(await countRows()).toBe(0);
    } finally {
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
      await queryRunner.release();
    }
  });

  it('MGK-06: down của doctor-exam P1 xóa cả hai bảng kể cả khi còn dòng (không để lại bảng nào); up lại cho hai bảng RỖNG, cùng cấu trúc', async () => {
    // Tính theo tên: thêm migration mới sau P1 không làm ca này vỡ (chúng được hoàn tác trước và up lại ở cuối)
    const later = await revertAfter(EXAM_NAME);
    const showCreate = async (table: string): Promise<string> => {
      const rows = (await dataSource.query(
        `SHOW CREATE TABLE \`${table}\``,
      )) as Record<string, string>[];
      return (rows[0]?.['Create Table'] ?? '').replace(
        / AUTO_INCREMENT=\d+/,
        '',
      );
    };
    const installed = {
      hoSoKham: await showCreate('ho_so_kham'),
      danhGia: await showCreate('danh_gia_bac_si'),
    };
    expect(installed.hoSoKham).toContain('UNIQUE KEY `lich_hen_id`');
    expect(installed.danhGia).toContain('chk_danh_gia_so_sao');

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      // lich_hen để trống: tắt kiểm khóa ngoại trên MỘT kết nối để dựng dòng (như MHT-09)
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
      await queryRunner.query(
        'INSERT INTO ho_so_kham (lich_hen_id, cap_nhat_lan_cuoi) VALUES (900001, NOW())',
      );
      await queryRunner.query(
        'INSERT INTO danh_gia_bac_si (lich_hen_id, so_sao, thoi_diem_tao) VALUES (900001, 5, NOW())',
      );

      // Còn dòng: down VẪN chạy (theo PLAN, mất luôn hồ sơ khám và đánh giá), các bảng khác còn nguyên
      expect(await revertLastMigration(dataSource)).toBe(EXAM_NAME);
      const tables = await listTables(dataSource);
      expect(tables).not.toContain('ho_so_kham');
      expect(tables).not.toContain('danh_gia_bac_si');
      expect(tables).toEqual(expect.arrayContaining(TABLES_BEFORE_EXAM));
      expect(
        (await listMigrations(dataSource)).find(
          (item) => item.name === EXAM_NAME,
        )?.executed,
      ).toBe(false);

      // up lại: đúng migration này (cộng các migration sau nó), hai bảng trở lại RỖNG với cùng cấu trúc
      expect(await runPendingMigrations(dataSource)).toEqual([
        EXAM_NAME,
        ...later,
      ]);
      expect(await showCreate('ho_so_kham')).toBe(installed.hoSoKham);
      expect(await showCreate('danh_gia_bac_si')).toBe(installed.danhGia);
      const counts = (await queryRunner.query(
        'SELECT (SELECT COUNT(*) FROM ho_so_kham) AS hoSoKham, (SELECT COUNT(*) FROM danh_gia_bac_si) AS danhGia',
      )) as { hoSoKham: string | number; danhGia: string | number }[];
      expect(
        counts.map((row) => [Number(row.hoSoKham), Number(row.danhGia)]),
      ).toEqual([[0, 0]]);
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
    // Migration sau P4 có thể thêm giá trị CUỐI danh sách (payment P1 thêm DuyetRutTien, TuChoiRutTien): chỉ so phần của P4.
    expect((await readEnum('hanh_dong')).slice(0, afterUp.length)).toEqual(
      afterUp,
    );
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

  // payment P1 (MGT-01, MGT-14, MGT-15): up/down của migration năm bảng tiền và mở rộng ENUM nhật ký rút tiền.
  describe('payment P1: năm bảng tiền và ENUM nhật ký rút tiền', () => {
    const readEnum = async (column: string): Promise<string[]> => {
      const rows = (await dataSource.query(
        "SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'nhat_ky_hanh_dong' AND COLUMN_NAME = ?",
        [column],
      )) as { type: string }[];
      return [...(rows[0]?.type ?? '').matchAll(/'([^']+)'/g)].map(
        (match) => match[1]!,
      );
    };
    const hasColumn = async (table: string, column: string): Promise<boolean> =>
      (
        (await dataSource.query(
          'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
          [table, column],
        )) as unknown[]
      ).length > 0;
    /** Dựng một dòng nhật ký trên MỘT kết nối đã tắt kiểm khóa ngoại (tài khoản không cần có thật). */
    const insertAudit = async (
      action: string,
      target: string,
    ): Promise<void> => {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      try {
        await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
        await queryRunner.query(
          "INSERT INTO nhat_ky_hanh_dong (tai_khoan_id, hanh_dong, loai_doi_tuong, ma_doi_tuong, thoi_diem, ket_qua) VALUES (900001, ?, ?, 1, NOW(), 'ThanhCong')",
          [action, target],
        );
      } finally {
        await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
        await queryRunner.release();
      }
    };
    const countAudit = async (): Promise<number> => {
      const rows = (await dataSource.query(
        'SELECT COUNT(*) AS total FROM nhat_ky_hanh_dong',
      )) as { total: string | number }[];
      return Number(rows[0]?.total);
    };
    const expectFullyInstalled = async (): Promise<void> => {
      expect(await listTables(dataSource)).toEqual(
        expect.arrayContaining(PAYMENT_TABLES),
      );
      expect(await hasColumn('lich_su_hoan_tien', 'loai')).toBe(true);
      expect(await readEnum('hanh_dong')).toEqual(
        expect.arrayContaining(['DuyetRutTien', 'TuChoiRutTien']),
      );
      expect(await readEnum('loai_doi_tuong')).toContain('yeu_cau_rut_tien');
    };

    it('MGT-14: down khi ĐÃ có dòng nhật ký dùng giá trị mới thì dừng với thông báo rõ TRƯỚC mọi câu DDL; DB nguyên vẹn (cả hai loại giá trị mới, ca biên một giá trị)', async () => {
      // Booking B19 (MOC-04) đứng SAU payment P1: hoàn tác nó trước để payment P1 thành migration cuối đã áp dụng, up lại ở cuối ca
      const later = await revertAfter(PAYMENT_NAME);
      await expectFullyInstalled();
      const before = {
        hanhDong: await readEnum('hanh_dong'),
        doiTuong: await readEnum('loai_doi_tuong'),
      };

      // (a) hành động mới; (b) chỉ loai_doi_tuong mới với hành động cũ; (c) chỉ hành động mới với đối tượng cũ
      const cases = [
        ['DuyetRutTien', 'yeu_cau_rut_tien'],
        ['XuLyNapViChuaCong', 'yeu_cau_rut_tien'],
        ['TuChoiRutTien', 'giao_dich_thanh_toan'],
      ] as const;
      for (const [action, target] of cases) {
        await insertAudit(action, target);
        await expect(revertLastMigration(dataSource)).rejects.toThrow(
          /Không hoàn tác được migration[\s\S]*còn 1 dòng/,
        );
        // Không DDL nào đã chạy: đủ năm bảng, cột loai, ENUM mở rộng; dòng nhật ký còn nguyên; migration vẫn ở trạng thái đã áp dụng
        await expectFullyInstalled();
        expect(await readEnum('hanh_dong')).toEqual(before.hanhDong);
        expect(await readEnum('loai_doi_tuong')).toEqual(before.doiTuong);
        expect(await countAudit()).toBe(1);
        expect(
          (await listMigrations(dataSource)).find(
            (item) => item.name === PAYMENT_NAME,
          )?.executed,
        ).toBe(true);
        await dataSource.query('DELETE FROM nhat_ky_hanh_dong');
      }
      expect(await runPendingMigrations(dataSource)).toEqual(later);
    });

    it('MGT-01, MGT-15: down khi KHÔNG có dòng nào dùng giá trị mới khôi phục ENUM cũ và xoá cả năm bảng; up lại chạy được', async () => {
      const later = await revertAfter(PAYMENT_NAME);
      await insertAudit('XuLyNapViChuaCong', 'giao_dich_thanh_toan'); // giá trị CŨ không chặn down
      await expectFullyInstalled();
      expect(await revertLastMigration(dataSource)).toBe(PAYMENT_NAME);
      const tables = await listTables(dataSource);
      for (const table of PAYMENT_TABLES) expect(tables).not.toContain(table);
      expect(tables).toEqual(expect.arrayContaining(TABLES_BEFORE_PAYMENT));
      expect(await readEnum('hanh_dong')).toHaveLength(24);
      expect(await readEnum('hanh_dong')).not.toContain('DuyetRutTien');
      expect(await readEnum('loai_doi_tuong')).toHaveLength(11);
      expect(await readEnum('loai_doi_tuong')).not.toContain(
        'yeu_cau_rut_tien',
      );
      expect(await countAudit()).toBe(1); // dòng nhật ký cũ không bị mất
      expect(
        (await listMigrations(dataSource)).find((i) => i.name === PAYMENT_NAME)
          ?.executed,
      ).toBe(false);

      expect(await runPendingMigrations(dataSource)).toEqual([
        PAYMENT_NAME,
        ...later,
      ]);
      await expectFullyInstalled();
      expect(await countAudit()).toBe(1);
      await dataSource.query('DELETE FROM nhat_ky_hanh_dong');
    });
  });

  it('MOC-04: down của booking B19 gỡ ba cột mốc của lich_hen và bị CHẶN khi còn lịch có mốc (DB nguyên vẹn); up lại thêm đúng ba cột NULL được, liền nhau sau thoi_diem_tao', async () => {
    const later = await revertAfter(MOC_NAME);
    // UX7 (đổi): trước là `expect(later).toEqual([])` vì B19 là migration cuối; nay migration nghỉ theo ca nhiều ngày đứng sau và được hoàn tác trước.
    // reschedule P1 (đổi): thêm migration đổi lịch đứng sau nữa, cũng được hoàn tác trước (down của nó không chặn vì DB chưa có dữ liệu đổi lịch).
    // notification P1, P2 (đổi): migration bảng nhắc lịch hẹn và chỉ mục thông báo đứng sau, cũng được hoàn tác trước (down của chúng không chặn).
    // chat P1 (đổi): migration ba bảng chat đứng sau cùng, cũng được hoàn tác trước (down chỉ chặn khi tin_nhan còn dòng; ở đây rỗng).
    expect(later).toEqual([
      NTC_NAME,
      DOI_LICH_NAME,
      NHAC_LICH_HEN_NAME,
      CHI_MUC_THONG_BAO_NAME,
      CHAT_NAME,
    ]);
    const MOC_COLUMNS = [
      'thoi_diem_xac_nhan',
      'thoi_diem_tiep_don',
      'thoi_diem_hoan_thanh',
    ];
    const readColumns = async () =>
      (await dataSource.query(
        `SELECT COLUMN_NAME AS name, DATA_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS def, ORDINAL_POSITION AS position
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lich_hen'
            AND COLUMN_NAME IN ('thoi_diem_tao', 'thoi_diem_xac_nhan', 'thoi_diem_tiep_don', 'thoi_diem_hoan_thanh', 'cap_nhat_lan_cuoi')
          ORDER BY ORDINAL_POSITION`,
      )) as {
        name: string;
        type: string;
        nullable: string;
        def: string | null;
        position: number;
      }[];
    const installed = await readColumns();
    // Thứ tự: thoi_diem_tao, ba cột mốc liền nhau, cap_nhat_lan_cuoi; ba cột mới là datetime, NULL được, không DEFAULT
    expect(installed.map((column) => column.name)).toEqual([
      'thoi_diem_tao',
      ...MOC_COLUMNS,
      'cap_nhat_lan_cuoi',
    ]);
    for (const column of installed.filter((item) =>
      MOC_COLUMNS.includes(item.name),
    )) {
      expect(column.type, column.name).toBe('datetime');
      expect(column.nullable, column.name).toBe('YES');
      expect(column.def, column.name).toBeNull();
    }
    const positions = installed.map((column) => Number(column.position));
    expect(positions).toEqual(
      positions.map((_, index) => (positions[0] ?? 0) + index),
    );

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      // Các khoá ngoại của lich_hen để trống: tắt kiểm khóa ngoại trên MỘT kết nối để dựng một dòng có mốc (như TBLH-09)
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
      await queryRunner.query(
        `INSERT INTO lich_hen (ma_lich_hen, khung_gio_id, benh_nhan_id, bac_si_id, chi_nhanh_id, dich_vu_kham_id, thoi_gian, gia_snapshot, trang_thai, thoi_diem_tao, thoi_diem_xac_nhan)
         VALUES ('CLX-20261118-MOC04', 900001, 900001, 900001, 900001, 900001, '2026-11-20 08:00:00', 100000, 'DaXacNhan', NOW(), NOW())`,
      );
      // Còn lịch có mốc: down bị chặn TRƯỚC mọi câu DDL, ba cột còn nguyên, migration vẫn ở trạng thái đã áp dụng
      await expect(revertLastMigration(dataSource)).rejects.toThrow(
        /Không hoàn tác được MocThoiGianLichHen1793793600000[\s\S]*còn 1 lịch hẹn/,
      );
      expect(await readColumns()).toEqual(installed);
      expect(
        (await listMigrations(dataSource)).find(
          (item) => item.name === MOC_NAME,
        )?.executed,
      ).toBe(true);

      // Hết lịch có mốc: down gỡ đúng ba cột, không đụng cột khác
      await queryRunner.query(
        "DELETE FROM lich_hen WHERE ma_lich_hen = 'CLX-20261118-MOC04'",
      );
      expect(await revertLastMigration(dataSource)).toBe(MOC_NAME);
      expect((await readColumns()).map((column) => column.name)).toEqual([
        'thoi_diem_tao',
        'cap_nhat_lan_cuoi',
      ]);
      expect(
        (await listMigrations(dataSource)).find(
          (item) => item.name === MOC_NAME,
        )?.executed,
      ).toBe(false);

      // Up lại: đúng ba cột như trước (cùng thứ tự, kiểu, NULL); migration đứng sau (UX7, reschedule P1) chạy lại theo sau.
      // Vị trí tuyệt đối có thể lệch khi migration đứng sau CHÈN cột vào trước các cột này (reschedule P1 thêm so_lan_tu_doi_lich sau lich_hen_truoc_id nên mọi vị trí +1): so vị trí TƯƠNG ĐỐI.
      expect(await runPendingMigrations(dataSource)).toEqual([
        MOC_NAME,
        ...later,
      ]);
      const relative = (columns: typeof installed) =>
        columns.map((column) => ({
          ...column,
          position: Number(column.position) - Number(columns[0]?.position),
        }));
      expect(relative(await readColumns())).toEqual(relative(installed));
    } finally {
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
      await queryRunner.release();
    }
  });

  // Doctor UX7 (issue #582): CHECK `chk_nghi_phep_hinh_thuc` cho `TheoCa` nhiều ngày. DUX7-17 đến DUX7-22 (và NTC-06 đến NTC-09 ở tên test) trên DB `clinix_migration_test`.
  // Dựng dòng bằng SQL thẳng (bỏ kiểm khoá ngoại trên MỘT kết nối như MOC-04): chỉ cần CHECK, không cần bác sĩ thật.
  describe('doctor UX7: nghỉ theo ca nhiều ngày (CHECK chk_nghi_phep_hinh_thuc)', () => {
    // Bỏ `AUTO_INCREMENT=n` (đổi mỗi khi chèn dòng, như schema-parity.int-spec.ts) để chỉ so cấu trúc: cột, CHECK, COMMENT
    const showCreate = async (): Promise<string> =>
      (
        (
          (await dataSource.query(
            'SHOW CREATE TABLE `yeu_cau_nghi_phep`',
          )) as Record<string, string>[]
        )[0]?.['Create Table'] ?? ''
      ).replace(/ AUTO_INCREMENT=\d+/, '');
    const countLeaves = async (): Promise<number> =>
      Number(
        (
          (await dataSource.query(
            'SELECT COUNT(*) AS total FROM `yeu_cau_nghi_phep`',
          )) as { total: string | number }[]
        )[0]?.total,
      );
    const insertLeave = (
      queryRunner: QueryRunner,
      leave: {
        kind: 'CaNgay' | 'TheoCa';
        ca: string | null;
        from: string;
        to: string;
        status?: 'ChoDuyet' | 'DaDuyet' | 'TuChoi';
      },
    ) => {
      const status = leave.status ?? 'ChoDuyet';
      const handled = status !== 'ChoDuyet';
      return queryRunner.query(
        `INSERT INTO yeu_cau_nghi_phep (bac_si_id, hinh_thuc_nghi, ngay_bat_dau, ngay_ket_thuc, ca, ly_do, trang_thai, nguoi_xu_ly_id, thoi_diem_xu_ly, thoi_diem_tao)
         VALUES (900001, ?, ?, ?, ?, 'ly do gia', ?, ?, ?, '2026-11-23 09:00:00')`,
        [
          leave.kind,
          leave.from,
          leave.to,
          leave.ca,
          status,
          handled ? 900002 : null,
          handled ? '2026-11-23 10:00:00' : null,
        ],
      );
    };
    const withQueryRunner = async (
      work: (queryRunner: QueryRunner) => Promise<void>,
    ): Promise<void> => {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      try {
        await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
        await work(queryRunner);
      } finally {
        await queryRunner.query('DELETE FROM yeu_cau_nghi_phep');
        await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
        await queryRunner.release();
      }
    };

    it('NTC-06 (DUX7-17, DUX7-18): sau khi áp dụng, CHECK nhận TheoCa nhiều ngày và từ chối TheoCa không ca, TheoCa ngược ngày, CaNgay có ca, CaNgay ngược ngày', async () => {
      await runPendingMigrations(dataSource);
      await withQueryRunner(async (queryRunner) => {
        await insertLeave(queryRunner, {
          kind: 'TheoCa',
          ca: 'CaSang',
          from: '2026-12-24',
          to: '2026-12-28',
        });
        // Biên: một ngày vẫn hợp lệ (mọi dòng cũ), và khoảng dài 31 ngày không bị CHECK chặn (hạn 31 ngày là của API)
        await insertLeave(queryRunner, {
          kind: 'TheoCa',
          ca: 'CaChieu',
          from: '2026-12-24',
          to: '2026-12-24',
        });
        await insertLeave(queryRunner, {
          kind: 'TheoCa',
          ca: 'CaChieu',
          from: '2027-02-01',
          to: '2027-03-03',
        });
        expect(await countLeaves()).toBe(3);

        const rejected = /chk_nghi_phep_hinh_thuc/;
        await expect(
          insertLeave(queryRunner, {
            kind: 'TheoCa',
            ca: null,
            from: '2026-12-24',
            to: '2026-12-28',
          }),
        ).rejects.toThrow(rejected);
        await expect(
          insertLeave(queryRunner, {
            kind: 'TheoCa',
            ca: 'CaSang',
            from: '2026-12-28',
            to: '2026-12-24',
          }),
        ).rejects.toThrow(rejected);
        await expect(
          insertLeave(queryRunner, {
            kind: 'CaNgay',
            ca: 'CaSang',
            from: '2026-12-24',
            to: '2026-12-28',
          }),
        ).rejects.toThrow(rejected);
        await expect(
          insertLeave(queryRunner, {
            kind: 'CaNgay',
            ca: null,
            from: '2026-12-28',
            to: '2026-12-24',
          }),
        ).rejects.toThrow(rejected);
        expect(await countLeaves()).toBe(3);
      });
    });

    it('NTC-07 (DUX7-19, DUX7-20): down bị CHẶN khi còn yêu cầu TheoCa nhiều ngày ở BẤT KỲ trạng thái nào (đếm đúng, không đếm CaNgay nhiều ngày hay TheoCa một ngày); DB và dữ liệu nguyên vẹn', async () => {
      await runPendingMigrations(dataSource);
      // Hoàn tác migration đứng sau (reschedule P1 trở đi) để NTC thành migration cuối đã áp dụng: `revertLastMigration` ở dưới nhắm đúng NTC
      await revertAfter(NTC_NAME);
      await withQueryRunner(async (queryRunner) => {
        // Không bị đếm: CaNgay nhiều ngày, TheoCa một ngày
        await insertLeave(queryRunner, {
          kind: 'CaNgay',
          ca: null,
          from: '2026-12-24',
          to: '2026-12-28',
        });
        await insertLeave(queryRunner, {
          kind: 'TheoCa',
          ca: 'CaSang',
          from: '2026-12-30',
          to: '2026-12-30',
        });
        // Bị đếm: ChoDuyet rồi TuChoi và DaDuyet (trạng thái đã xử lý cũng vi phạm CHECK cũ)
        await insertLeave(queryRunner, {
          kind: 'TheoCa',
          ca: 'CaSang',
          from: '2026-12-24',
          to: '2026-12-26',
        });
        const before = await showCreate();
        const rowsBefore = await countLeaves();
        await expect(revertLastMigration(dataSource)).rejects.toThrow(
          /Không hoàn tác được NghiTheoCaNhieuNgay1793880000000[\s\S]*còn 1 yêu cầu nghỉ theo ca/,
        );
        await insertLeave(queryRunner, {
          kind: 'TheoCa',
          ca: 'CaChieu',
          from: '2027-01-04',
          to: '2027-01-05',
          status: 'TuChoi',
        });
        await insertLeave(queryRunner, {
          kind: 'TheoCa',
          ca: 'CaChieu',
          from: '2027-01-11',
          to: '2027-01-12',
          status: 'DaDuyet',
        });
        const failure = await revertLastMigration(dataSource).then(
          () => null,
          (error: unknown) => error,
        );
        expect(failure).toBeInstanceOf(Error);
        expect(String(failure)).toMatch(/còn 3 yêu cầu nghỉ theo ca/);
        // Thông báo chỉ có số dòng: không id, không lý do nghỉ
        expect(String(failure)).not.toMatch(/ly do gia|900001/);
        // Không đổi gì: CHECK, COMMENT và dữ liệu như cũ; migration vẫn ở trạng thái đã áp dụng
        expect(await showCreate()).toBe(before);
        expect(await countLeaves()).toBe(rowsBefore + 2);
        expect(
          (await listMigrations(dataSource)).find(
            (item) => item.name === NTC_NAME,
          )?.executed,
        ).toBe(true);
      });
    });

    it('NTC-08 (DUX7-21, DUX7-22): hết dòng nhiều ngày thì down đưa CHECK và COMMENT về chữ cũ giữ nguyên dòng còn lại; up lại ra đúng bảng như trước và nhận TheoCa nhiều ngày', async () => {
      await runPendingMigrations(dataSource);
      const later = await revertAfter(NTC_NAME);
      const upState = await showCreate();
      // SHOW CREATE TABLE viết lại biểu thức (thêm tiền tố bộ ký tự `_utf8mb4` trước chuỗi, chữ thường `and`, `is not null`): so bằng biểu thức chính quy
      const theoCaBranch = (operator: string) =>
        new RegExp(
          "`hinh_thuc_nghi` = (?:_utf8mb4)?'TheoCa'\\) and \\(`ca` is not null\\) and \\(`ngay_bat_dau` " +
            operator +
            ' `ngay_ket_thuc`\\)',
        );
      expect(upState).toMatch(theoCaBranch('<='));
      expect(upState).toContain('được nghỉ nhiều ngày, một ca');
      await withQueryRunner(async (queryRunner) => {
        await insertLeave(queryRunner, {
          kind: 'CaNgay',
          ca: null,
          from: '2026-12-24',
          to: '2026-12-28',
        });
        await insertLeave(queryRunner, {
          kind: 'TheoCa',
          ca: 'CaSang',
          from: '2026-12-30',
          to: '2026-12-30',
        });
        expect(await revertLastMigration(dataSource)).toBe(NTC_NAME);
        expect(
          (await listMigrations(dataSource)).find(
            (item) => item.name === NTC_NAME,
          )?.executed,
        ).toBe(false);
        // Chữ cũ: nhánh TheoCa là `=` (một ngày), COMMENT "chỉ nghỉ 1 ngày"; hai dòng cũ còn nguyên
        const downState = await showCreate();
        expect(downState).toMatch(theoCaBranch('='));
        expect(downState).not.toMatch(theoCaBranch('<='));
        expect(downState).toContain('chỉ nghỉ 1 ngày');
        expect(downState).not.toContain('được nghỉ nhiều ngày, một ca');
        expect(await countLeaves()).toBe(2);
        // Và CHECK cũ thật sự đang chạy: TheoCa nhiều ngày bị từ chối
        await expect(
          insertLeave(queryRunner, {
            kind: 'TheoCa',
            ca: 'CaSang',
            from: '2026-12-24',
            to: '2026-12-26',
          }),
        ).rejects.toThrow(/chk_nghi_phep_hinh_thuc/);

        // Up lại: bảng giống hệt trạng thái lên lần trước, hai dòng còn nguyên, TheoCa nhiều ngày được nhận
        expect(await runPendingMigrations(dataSource)).toEqual([
          NTC_NAME,
          ...later,
        ]);
        expect(await showCreate()).toBe(upState);
        expect(await countLeaves()).toBe(2);
        await insertLeave(queryRunner, {
          kind: 'TheoCa',
          ca: 'CaSang',
          from: '2026-12-24',
          to: '2026-12-26',
        });
        expect(await countLeaves()).toBe(3);
      });
    });
  });

  // Reschedule P1 (issue #634): MDL-01 (up, down, up lại) và MDL-06 (down bị chặn khi còn dữ liệu mới) trên DB `clinix_migration_test`. Ràng buộc thật (CHECK, UNIQUE, ENUM, entity) ở
  // doi-lich-schema.int-spec.ts; phần chữ DDL ở migration-source.spec.ts; SHOW CREATE TABLE so với file SQL chính thức ở schema-parity.int-spec.ts.
  describe('reschedule P1: bảng yêu cầu, bộ đếm, cột thông báo, DoiLichHo', () => {
    const REQUEST_TABLE = 'yeu_cau_doi_lich_ngoai_chinh_sach';
    // Bỏ `AUTO_INCREMENT=n` (đổi mỗi khi chèn dòng) để chỉ so cấu trúc. notification P2 (đổi): bỏ cả dòng chỉ mục `thong_bao_index_tai_khoan_thoi_diem` vì migration P2 đứng SAU,
    // bị hoàn tác trước khi chụp trạng thái và lên lại sau đó; vòng đời của chính chỉ mục này kiểm ở MTB-10.
    const showCreate = async (table: string): Promise<string> => {
      const rows = (await dataSource.query(
        `SHOW CREATE TABLE \`${table}\``,
      )) as Record<string, string>[];
      return (rows[0]?.['Create Table'] ?? '')
        .replace(/ AUTO_INCREMENT=\d+/, '')
        .replace(/\n {2}KEY `thong_bao_index_tai_khoan_thoi_diem` [^\n]*/, '');
    };
    const tableExists = async (table: string): Promise<boolean> =>
      (await listTables(dataSource)).includes(table);
    const columnPositions = async (table: string): Promise<string[]> =>
      (
        (await dataSource.query(
          'SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
          [table],
        )) as { name: string }[]
      ).map((row) => row.name);
    const hanhDongValues = async (): Promise<string[]> => {
      const rows = (await dataSource.query(
        "SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'nhat_ky_hanh_dong' AND COLUMN_NAME = 'hanh_dong'",
      )) as { type: string }[];
      return [...(rows[0]?.type ?? '').matchAll(/'([^']+)'/g)].map(
        (match) => match[1] as string,
      );
    };
    const hasConstraint = async (
      table: string,
      name: string,
    ): Promise<boolean> =>
      (
        (await dataSource.query(
          'SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?',
          [table, name],
        )) as unknown[]
      ).length > 0;
    const count = async (table: string, where = '1 = 1'): Promise<number> =>
      Number(
        (
          (await dataSource.query(
            `SELECT COUNT(*) AS total FROM \`${table}\` WHERE ${where}`,
          )) as { total: string | number }[]
        )[0]?.total,
      );
    const isApplied = async (): Promise<boolean | undefined> =>
      (await listMigrations(dataSource)).find(
        (item) => item.name === DOI_LICH_NAME,
      )?.executed;
    /** Chạy `work` trên MỘT kết nối đã tắt kiểm khóa ngoại (dựng dòng mà không cần bác sĩ, khung giờ... thật), luôn bật lại. */
    const withoutForeignKeys = async (
      work: (run: (sql: string) => Promise<unknown>) => Promise<void>,
    ): Promise<void> => {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      try {
        await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
        await work((sql) => queryRunner.query(sql));
      } finally {
        await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
        await queryRunner.release();
      }
    };
    // DaHuy để cột sinh khung_gio_dang_giu = NULL (UNIQUE không đụng nhau giữa các dòng thử)
    const insertLichHen = (code: string, soLan: number | null): string =>
      `INSERT INTO lich_hen (ma_lich_hen, khung_gio_id, benh_nhan_id, bac_si_id, chi_nhanh_id, dich_vu_kham_id, thoi_gian, gia_snapshot, trang_thai, thoi_diem_tao${soLan === null ? '' : ', so_lan_tu_doi_lich'})
       VALUES ('${code}', 900001, 900001, 900001, 900001, 900001, '2026-11-20 08:00:00', 100000, 'DaHuy', NOW()${soLan === null ? '' : `, ${soLan}`})`;

    it('MDL-01: down (chưa có dữ liệu đổi lịch) bỏ cột, CHECK, bảng yêu cầu, cột thông báo và DoiLichHo mà giữ nguyên dòng khác; up lại: lịch có trước nhận 0, cột sau lich_hen_truoc_id, bảng giống hệt lần lên đầu', async () => {
      await runPendingMigrations(dataSource);
      const later = await revertAfter(DOI_LICH_NAME);
      const upState = {
        lichHen: await showCreate('lich_hen'),
        thongBao: await showCreate('thong_bao'),
        nhatKy: await showCreate('nhat_ky_hanh_dong'),
        yeuCau: await showCreate(REQUEST_TABLE),
      };
      const lichHenColumns = await columnPositions('lich_hen');
      expect(lichHenColumns.indexOf('so_lan_tu_doi_lich')).toBe(
        lichHenColumns.indexOf('lich_hen_truoc_id') + 1,
      );
      const hanhDongUp = await hanhDongValues();
      expect(hanhDongUp).toHaveLength(27);
      expect(hanhDongUp.at(-1)).toBe('DoiLichHo');

      // Down: không có dữ liệu mới nên không bị chặn; gỡ đủ mọi thứ, ENUM về đúng 26 giá trị cũ
      expect(await revertLastMigration(dataSource)).toBe(DOI_LICH_NAME);
      expect(await isApplied()).toBe(false);
      expect(await columnPositions('lich_hen')).not.toContain(
        'so_lan_tu_doi_lich',
      );
      expect(
        await hasConstraint('lich_hen', 'chk_lich_hen_so_lan_tu_doi'),
      ).toBe(false);
      expect(await columnPositions('thong_bao')).not.toContain(
        'yeu_cau_doi_lich_ngoai_chinh_sach_id',
      );
      expect(await tableExists(REQUEST_TABLE)).toBe(false);
      expect(await hanhDongValues()).toEqual(hanhDongUp.slice(0, -1));
      expect(await showCreate('thong_bao')).not.toContain(
        'thong_bao_index_yeu_cau_doi_lich',
      );
      expect(await showCreate('thong_bao')).not.toContain('thong_bao_ibfk_4');

      // Dựng lịch hẹn theo cấu trúc CŨ (chưa có cột bộ đếm) rồi lên lại: dòng có trước nhận 0, không điền giả
      await withoutForeignKeys(async (run) => {
        await run(insertLichHen('CLX-20261124-MDL01', null));
      });
      const rowsBefore = await count('lich_hen');
      expect(await runPendingMigrations(dataSource)).toEqual([
        DOI_LICH_NAME,
        ...later,
      ]);
      expect(await count('lich_hen')).toBe(rowsBefore);
      expect(await count('lich_hen', 'so_lan_tu_doi_lich = 0')).toBe(
        rowsBefore,
      );
      expect(await showCreate('lich_hen')).toBe(upState.lichHen);
      expect(await showCreate('thong_bao')).toBe(upState.thongBao);
      expect(await showCreate('nhat_ky_hanh_dong')).toBe(upState.nhatKy);
      expect(await showCreate(REQUEST_TABLE)).toBe(upState.yeuCau);
      expect(await hanhDongValues()).toEqual(hanhDongUp);
      expect(await isApplied()).toBe(true);
      await withoutForeignKeys(async (run) => {
        await run(
          "DELETE FROM lich_hen WHERE ma_lich_hen = 'CLX-20261124-MDL01'",
        );
      });
    });

    it('MDL-06: down bị CHẶN TRƯỚC mọi câu DDL khi còn dữ liệu mới, từng loại một (bộ đếm khác 0, thông báo gắn yêu cầu, nhật ký DoiLichHo, yêu cầu đổi lịch), chỉ báo SỐ dòng; DB nguyên vẹn; hết dữ liệu thì down được và không mất dòng nào khác', async () => {
      await runPendingMigrations(dataSource);
      const later = await revertAfter(DOI_LICH_NAME);
      const state = async () => ({
        lichHen: await showCreate('lich_hen'),
        thongBao: await showCreate('thong_bao'),
        nhatKy: await showCreate('nhat_ky_hanh_dong'),
        yeuCau: await showCreate(REQUEST_TABLE),
        hanhDong: await hanhDongValues(),
      });
      const before = await state();
      const expectBlocked = async (message: RegExp): Promise<string> => {
        const failure = await revertLastMigration(dataSource).then(
          () => null,
          (error: unknown) => error,
        );
        expect(failure).toBeInstanceOf(Error);
        const text = String(failure);
        expect(text).toMatch(/Không hoàn tác được DoiLich1793966400000/);
        expect(text).toMatch(message);
        // Thông báo chỉ có số dòng: không id, không nội dung
        expect(text).not.toMatch(/900001|MDL06/);
        // Không đổi gì: cấu trúc như cũ, migration vẫn ở trạng thái đã áp dụng
        expect(await state()).toEqual(before);
        expect(await isApplied()).toBe(true);
        return text;
      };

      // Dòng KHÔNG thuộc dữ liệu mới: phải còn nguyên sau cùng
      await withoutForeignKeys(async (run) => {
        await run(insertLichHen('CLX-20261124-KEEP1', 0));
        await run(
          "INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, thoi_diem_tao) VALUES (900001, 'MDL06', 'KEEP', NOW())",
        );
        await run(
          "INSERT INTO nhat_ky_hanh_dong (tai_khoan_id, hanh_dong, loai_doi_tuong, ma_doi_tuong, thoi_diem, ket_qua) VALUES (900001, 'DoiQuyen', 'tai_khoan', 1, NOW(), 'ThanhCong')",
        );
      });
      const keep = {
        lichHen: await count('lich_hen'),
        thongBao: await count('thong_bao'),
        nhatKy: await count('nhat_ky_hanh_dong'),
      };

      // (a) lịch hẹn có bộ đếm khác 0
      await withoutForeignKeys(async (run) => {
        await run(insertLichHen('CLX-20261124-MDL06A', 2));
      });
      await expectBlocked(
        /còn 1 lịch hẹn có so_lan_tu_doi_lich khác 0, 0 thông báo gắn yêu cầu đổi lịch, 0 dòng nhật ký DoiLichHo và 0 yêu cầu/,
      );
      await withoutForeignKeys(async (run) => {
        await run(
          "DELETE FROM lich_hen WHERE ma_lich_hen = 'CLX-20261124-MDL06A'",
        );
      });

      // (b) thông báo gắn yêu cầu đổi lịch
      await withoutForeignKeys(async (run) => {
        await run(
          "INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, yeu_cau_doi_lich_ngoai_chinh_sach_id, thoi_diem_tao) VALUES (900001, 'MDL06', 'MDL06', 900001, NOW())",
        );
      });
      await expectBlocked(
        /còn 0 lịch hẹn có so_lan_tu_doi_lich khác 0, 1 thông báo gắn yêu cầu đổi lịch, 0 dòng nhật ký DoiLichHo và 0 yêu cầu/,
      );
      await withoutForeignKeys(async (run) => {
        await run("DELETE FROM thong_bao WHERE loai_su_kien = 'MDL06'");
      });

      // (c) nhật ký DoiLichHo
      await withoutForeignKeys(async (run) => {
        await run(
          "INSERT INTO nhat_ky_hanh_dong (tai_khoan_id, hanh_dong, loai_doi_tuong, ma_doi_tuong, thoi_diem, ket_qua) VALUES (900001, 'DoiLichHo', 'lich_hen', 900001, NOW(), 'ThanhCong')",
        );
      });
      await expectBlocked(
        /còn 0 lịch hẹn có so_lan_tu_doi_lich khác 0, 0 thông báo gắn yêu cầu đổi lịch, 1 dòng nhật ký DoiLichHo và 0 yêu cầu/,
      );
      await withoutForeignKeys(async (run) => {
        await run(
          "DELETE FROM nhat_ky_hanh_dong WHERE hanh_dong = 'DoiLichHo'",
        );
      });

      // (d) yêu cầu đổi lịch ngoài chính sách (bảng sắp bị bỏ)
      await withoutForeignKeys(async (run) => {
        await run(
          "INSERT INTO yeu_cau_doi_lich_ngoai_chinh_sach (lich_hen_id, khung_gio_mong_muon_id, ly_do_yeu_cau, thoi_diem_tao) VALUES (900001, 900001, 'MDL06', NOW())",
        );
      });
      await expectBlocked(
        /còn 0 lịch hẹn có so_lan_tu_doi_lich khác 0, 0 thông báo gắn yêu cầu đổi lịch, 0 dòng nhật ký DoiLichHo và 1 yêu cầu/,
      );

      // Cả bốn cùng lúc: số đúng ở từng loại
      await withoutForeignKeys(async (run) => {
        await run(insertLichHen('CLX-20261124-MDL06A', 3));
        await run(
          "INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, yeu_cau_doi_lich_ngoai_chinh_sach_id, thoi_diem_tao) VALUES (900001, 'MDL06', 'MDL06', 900001, NOW())",
        );
        await run(
          "INSERT INTO nhat_ky_hanh_dong (tai_khoan_id, hanh_dong, loai_doi_tuong, ma_doi_tuong, thoi_diem, ket_qua) VALUES (900001, 'DoiLichHo', 'lich_hen', 900001, NOW(), 'ThanhCong')",
        );
      });
      await expectBlocked(
        /còn 1 lịch hẹn có so_lan_tu_doi_lich khác 0, 1 thông báo gắn yêu cầu đổi lịch, 1 dòng nhật ký DoiLichHo và 1 yêu cầu/,
      );

      // Hết dữ liệu mới: down gỡ được; các dòng không thuộc dữ liệu mới còn nguyên
      await withoutForeignKeys(async (run) => {
        await run(
          "DELETE FROM lich_hen WHERE ma_lich_hen = 'CLX-20261124-MDL06A'",
        );
        await run("DELETE FROM thong_bao WHERE loai_su_kien = 'MDL06'");
        await run(
          "DELETE FROM nhat_ky_hanh_dong WHERE hanh_dong = 'DoiLichHo'",
        );
        await run('DELETE FROM yeu_cau_doi_lich_ngoai_chinh_sach');
      });
      expect(await revertLastMigration(dataSource)).toBe(DOI_LICH_NAME);
      expect(await isApplied()).toBe(false);
      expect(await tableExists(REQUEST_TABLE)).toBe(false);
      expect({
        lichHen: await count('lich_hen'),
        thongBao: await count('thong_bao'),
        nhatKy: await count('nhat_ky_hanh_dong'),
      }).toEqual(keep);

      // Up lại ra đúng cấu trúc như trước và các dòng giữ lại vẫn còn
      expect(await runPendingMigrations(dataSource)).toEqual([
        DOI_LICH_NAME,
        ...later,
      ]);
      expect(await state()).toEqual(before);
      expect({
        lichHen: await count('lich_hen'),
        thongBao: await count('thong_bao'),
        nhatKy: await count('nhat_ky_hanh_dong'),
      }).toEqual(keep);
      await withoutForeignKeys(async (run) => {
        await run(
          "DELETE FROM lich_hen WHERE ma_lich_hen = 'CLX-20261124-KEEP1'",
        );
        await run("DELETE FROM thong_bao WHERE loai_su_kien = 'KEEP'");
        await run(
          "DELETE FROM nhat_ky_hanh_dong WHERE hanh_dong = 'DoiQuyen' AND ma_doi_tuong = 1",
        );
      });
    });
  });

  // notification P1 (#656): MTB-02 (up, down, up) và MTB-09 (chạy trên DB đã có dữ liệu của bảng khác). MTB-01 ở migration-source.spec.ts và schema-parity.int-spec.ts.
  describe('notification P1: bảng nhac_lich_hen', () => {
    const TABLE = 'nhac_lich_hen';
    const showCreate = async (): Promise<string> =>
      (
        (await dataSource.query(`SHOW CREATE TABLE \`${TABLE}\``)) as Record<
          string,
          string
        >[]
      )[0]?.['Create Table'] ?? '';
    const tableExists = async (): Promise<boolean> =>
      (await listTables(dataSource)).includes(TABLE);
    /** Checksum nội dung của ba bảng mà nhắc lịch đọc hay nằm cạnh: không được đổi dòng nào khi lên/xuống P1. */
    const checksums = async (): Promise<Record<string, string>> => {
      const rows = (await dataSource.query(
        'CHECKSUM TABLE `lich_hen`, `thong_bao`, `email_thong_bao`',
      )) as { Table: string; Checksum: string | number }[];
      return Object.fromEntries(
        rows.map((row) => [row.Table, String(row.Checksum)]),
      );
    };
    /** Chạy `work` trên MỘT kết nối đã tắt kiểm khóa ngoại (dựng dòng mà không cần bác sĩ, khung giờ... thật), luôn bật lại. */
    const withoutForeignKeys = async (
      work: (
        run: (sql: string, params?: unknown[]) => Promise<unknown>,
      ) => Promise<void>,
    ): Promise<void> => {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      try {
        await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
        await work((sql, params) => queryRunner.query(sql, params));
      } finally {
        await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
        await queryRunner.release();
      }
    };

    it('MTB-02: up, down, up: down xoá bảng (kể cả còn dòng, không chặn), schema trở về trước; up lại ra bảng RỖNG cùng cấu trúc', async () => {
      await runPendingMigrations(dataSource);
      // notification P2 (đổi): migration chỉ mục thông báo đứng sau, được hoàn tác trước rồi lên lại
      const later = await revertAfter(NHAC_LICH_HEN_NAME);
      const upState = await showCreate();
      const otherTables = (await listTables(dataSource)).filter(
        (table) => table !== TABLE,
      );
      await withoutForeignKeys(async (run) => {
        await run(
          `INSERT INTO ${TABLE} (lich_hen_id, so_gio_truoc) VALUES (900001, 24)`,
        );
      });

      expect(await revertLastMigration(dataSource)).toBe(NHAC_LICH_HEN_NAME);
      expect(await tableExists()).toBe(false);
      // Chỉ mất đúng một bảng, các bảng khác còn nguyên
      expect(await listTables(dataSource)).toEqual(otherTables);

      expect(await runPendingMigrations(dataSource)).toEqual([
        NHAC_LICH_HEN_NAME,
        ...later,
      ]);
      expect(await showCreate()).toBe(upState);
      const [{ total }] = (await dataSource.query(
        `SELECT COUNT(*) AS total FROM ${TABLE}`,
      )) as [{ total: string | number }];
      expect(Number(total)).toBe(0);
    });

    it('MTB-09: down rồi up trên DB đã có lịch hẹn, thông báo và thư: không đổi dòng nào của ba bảng đó', async () => {
      await runPendingMigrations(dataSource);
      await withoutForeignKeys(async (run) => {
        await run(
          `INSERT INTO lich_hen (ma_lich_hen, khung_gio_id, benh_nhan_id, bac_si_id, chi_nhanh_id, dich_vu_kham_id, thoi_gian, gia_snapshot, trang_thai, thoi_diem_tao)
           VALUES ('CLX-20261125-MTB09', 900001, 900001, 900001, 900001, 900001, '2026-12-02 14:30:00', 100000, 'DaHuy', '2026-11-25 08:00:00')`,
        );
        const notice = (await run(
          "INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, thoi_diem_tao) VALUES (900001, 'MTB09', 'MTB09', '2026-11-25 08:00:00')",
        )) as { insertId: number | string };
        await run(
          'INSERT INTO email_thong_bao (thong_bao_id, thoi_diem_tao) VALUES (?, ?)',
          [notice.insertId, '2026-11-25 08:00:00'],
        );
      });
      const before = await checksums();
      expect(Object.values(before).every((sum) => sum !== '0')).toBe(true);

      const later = await revertAfter(NHAC_LICH_HEN_NAME);
      expect(await revertLastMigration(dataSource)).toBe(NHAC_LICH_HEN_NAME);
      expect(await checksums()).toEqual(before);
      expect(await runPendingMigrations(dataSource)).toEqual([
        NHAC_LICH_HEN_NAME,
        ...later,
      ]);
      expect(await checksums()).toEqual(before);

      await withoutForeignKeys(async (run) => {
        await run('DELETE FROM email_thong_bao');
        await run("DELETE FROM thong_bao WHERE loai_su_kien = 'MTB09'");
        await run(
          "DELETE FROM lich_hen WHERE ma_lich_hen = 'CLX-20261125-MTB09'",
        );
      });
    });
  });

  // notification P2 (#657): MTB-10 phần vòng đời: down chỉ xoá chỉ mục, không đổi dòng nào; up lại ra đúng cấu trúc cũ.
  describe('notification P2: chỉ mục thong_bao_index_tai_khoan_thoi_diem', () => {
    const INDEX = 'thong_bao_index_tai_khoan_thoi_diem';
    // Bỏ `AUTO_INCREMENT=n` (test chèn một dòng) để chỉ so cấu trúc
    const showThongBao = async (): Promise<string> =>
      (
        (
          (await dataSource.query('SHOW CREATE TABLE `thong_bao`')) as Record<
            string,
            string
          >[]
        )[0]?.['Create Table'] ?? ''
      ).replace(/ AUTO_INCREMENT=\d+/, '');
    const indexColumns = async (): Promise<string[]> =>
      (
        (await dataSource.query(
          "SELECT COLUMN_NAME AS name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'thong_bao' AND INDEX_NAME = ? ORDER BY SEQ_IN_INDEX",
          [INDEX],
        )) as { name: string }[]
      ).map((row) => row.name);
    const checksum = async (): Promise<string> =>
      String(
        (
          (await dataSource.query('CHECKSUM TABLE `thong_bao`')) as {
            Checksum: string | number;
          }[]
        )[0]?.Checksum,
      );

    it('MTB-10: up, down, up trên DB có thông báo: down chỉ xoá chỉ mục (thong_bao_index_25 còn nguyên), dữ liệu không đổi; up lại giống hệt', async () => {
      await runPendingMigrations(dataSource);
      // chat P1 (đổi): migration ba bảng chat đứng sau, được hoàn tác trước rồi lên lại
      const later = await revertAfter(CHI_MUC_THONG_BAO_NAME);
      expect(await indexColumns()).toEqual([
        'tai_khoan_id',
        'thoi_diem_tao',
        'thong_bao_id',
      ]);
      const upState = await showThongBao();
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      try {
        await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
        await queryRunner.query(
          "INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, thoi_diem_tao) VALUES (900001, 'MTB10', 'MTB10', '2026-11-25 08:00:00')",
        );
      } finally {
        await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
        await queryRunner.release();
      }
      const before = await checksum();

      expect(await revertLastMigration(dataSource)).toBe(
        CHI_MUC_THONG_BAO_NAME,
      );
      expect(await indexColumns()).toEqual([]);
      expect(await showThongBao()).toContain('KEY `thong_bao_index_25`');
      expect(await checksum()).toBe(before);

      expect(await runPendingMigrations(dataSource)).toEqual([
        CHI_MUC_THONG_BAO_NAME,
        ...later,
      ]);
      expect(await showThongBao()).toBe(upState);
      expect(await checksum()).toBe(before);
      await dataSource.query(
        "DELETE FROM thong_bao WHERE loai_su_kien = 'MTB10'",
      );
    });
  });

  // chat P1 (#706): MCH-02 (up, down, up; down TỪ CHỐI khi tin_nhan còn dòng). MCH-01 ở migration-source.spec.ts, MCH-03 ở schema-parity.int-spec.ts.
  describe('chat P1: ba bảng hoi_thoai, tai_khoan_hoi_thoai, tin_nhan', () => {
    const CHAT = ['hoi_thoai', 'tai_khoan_hoi_thoai', 'tin_nhan'];
    const showChat = async (): Promise<string[]> => {
      const result: string[] = [];
      for (const table of CHAT)
        result.push(
          (
            (await dataSource.query(
              `SHOW CREATE TABLE \`${table}\``,
            )) as Record<string, string>[]
          )[0]?.['Create Table'] ?? '',
        );
      return result;
    };

    it('MCH-02: up, down, up khi ba bảng rỗng: down xoá đúng ba bảng, bảng khác còn nguyên; up lại giống hệt', async () => {
      await runPendingMigrations(dataSource);
      const later = await revertAfter(CHAT_NAME);
      const upState = await showChat();
      const otherTables = (await listTables(dataSource)).filter(
        (table) => !CHAT.includes(table),
      );

      expect(await revertLastMigration(dataSource)).toBe(CHAT_NAME);
      expect(await listTables(dataSource)).toEqual(otherTables);

      expect(await runPendingMigrations(dataSource)).toEqual([
        CHAT_NAME,
        ...later,
      ]);
      expect(await showChat()).toEqual(upState);
    });

    it('MCH-02: down khi tin_nhan còn một dòng: TỪ CHỐI, ba bảng và dòng còn nguyên, migration vẫn được ghi là đã chạy', async () => {
      await runPendingMigrations(dataSource);
      const later = await revertAfter(CHAT_NAME);
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();
      try {
        // Dựng một tin mà không cần tài khoản, hội thoại thật
        await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
        await queryRunner.query(
          "INSERT INTO tin_nhan (hoi_thoai_id, nguoi_gui_id, noi_dung, thoi_diem_gui) VALUES (900001, 900001, 'MCH02', '2026-11-27 08:00:00')",
        );
      } finally {
        await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
        await queryRunner.release();
      }

      await expect(revertLastMigration(dataSource)).rejects.toThrow(
        /tin_nhan còn dữ liệu/,
      );
      for (const table of CHAT)
        expect(await listTables(dataSource)).toContain(table);
      const [{ total }] = (await dataSource.query(
        'SELECT COUNT(*) AS total FROM tin_nhan',
      )) as [{ total: string | number }];
      expect(Number(total)).toBe(1);

      await dataSource.query("DELETE FROM tin_nhan WHERE noi_dung = 'MCH02'");
      expect(await runPendingMigrations(dataSource)).toEqual(later);
    });
  });

  // chat P1 (đổi): hạ rồi nâng lại cả 18 migration mất khoảng 23 giây khi chạy riêng, vượt 30 giây mặc định khi chạy cùng cả bộ (đo 27/11/2026): nới riêng ca này
  it('hoàn tác hết rồi hoàn tác tiếp: trả về null, không lỗi', async () => {
    for (let i = 0; i < MIGRATIONS.length; i++)
      await revertLastMigration(dataSource);
    expect(await revertLastMigration(dataSource)).toBeNull();
    expect(await runPendingMigrations(dataSource)).toHaveLength(
      MIGRATIONS.length,
    );
  }, 120_000);
});
