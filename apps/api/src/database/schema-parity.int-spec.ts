import { TAO_BANG_ANH_SQL } from './migrations/1793188800000-tao-bang-anh.js';
import type { DataSource } from 'typeorm';
import { TAO_BANG_AUTH_SQL } from './migrations/1793001600000-tao-bang-auth.js';
import { TAO_BANG_DANH_MUC_SQL } from './migrations/1793024340000-tao-bang-danh-muc.js';
import { TAO_BANG_NGHI_PHEP_SQL } from './migrations/1793275200000-tao-bang-nghi-phep.js';
import { TAO_BANG_NHAN_SU_SQL } from './migrations/1793080000000-tao-bang-nhan-su.js';
import { TAO_BANG_VAN_HANH_SQL } from './migrations/1793090000000-tao-bang-van-hanh.js';
import {
  maskAuditEnums,
  maskLichHenDoiLich,
  maskLichHenMoc,
  maskNghiTheoCaNhieuNgay,
  maskThongBaoChiMucTaiKhoan,
  maskThongBaoDoiLich,
  maskThongBaoLichHen,
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
// booking P6: mốc hoàn tiền
const MOC_HOAN_TIEN_TABLES = ['moc_hoan_tien'];
// doctor-exam P1: hồ sơ khám và đánh giá bác sĩ
const EXAM_TABLES = ['ho_so_kham', 'danh_gia_bac_si'];
// payment P1: năm bảng tiền (MGT-02; gồm cột lich_su_hoan_tien.loai, bảng lan_doi_soat_nap_vi và ENUM nhat_ky_hanh_dong mở rộng)
const PAYMENT_TABLES = [
  'giao_dich_thanh_toan',
  'lich_su_hoan_tien',
  'yeu_cau_rut_tien',
  'giao_dich_vi',
  'lan_doi_soat_nap_vi',
];
// reschedule P1: bảng yêu cầu đổi lịch ngoài chính sách (có trong file SQL từ trước, nay mới có migration)
const DOI_LICH_TABLES = ['yeu_cau_doi_lich_ngoai_chinh_sach'];
// notification P1: bảng nhắc lịch hẹn (có trong file SQL từ trước, nay mới có migration)
const NHAC_LICH_HEN_TABLES = ['nhac_lich_hen'];
// chat P1: ba bảng nhắn tin (có trong file SQL từ trước, nay mới có migration; tin_nhan dùng bản DDL đã sửa ở P1)
const CHAT_TABLES = ['hoi_thoai', 'tai_khoan_hoi_thoai', 'tin_nhan'];
// article B1: bốn bảng bài viết (có trong file SQL từ trước, nay mới có migration; ABD-01)
const ARTICLE_TABLES = [
  'bai_viet',
  'hashtag',
  'bai_viet_hashtag',
  'benh_nhan_danh_gia_bai_viet',
];
const MIGRATED_TABLES = [
  ...AUTH_TABLES,
  ...CATALOG_TABLES,
  ...STAFF_TABLES,
  ...OPERATIONS_TABLES,
  'anh_tai_len',
  ...NGHI_PHEP_TABLES,
  ...MOC_HOAN_TIEN_TABLES,
  ...EXAM_TABLES,
  ...PAYMENT_TABLES,
  ...DOI_LICH_TABLES,
  ...NHAC_LICH_HEN_TABLES,
  ...CHAT_TABLES,
  ...ARTICLE_TABLES,
];
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

  // TBLH-10: gồm cả thong_bao.lich_hen_id (thứ tự cột, COMMENT, chỉ mục thong_bao_index_lich_hen, thong_bao_ibfk_3).
  // MHT-03: gồm cả moc_hoan_tien (COMMENT, UNIQUE moc_hoan_tien_index_1, khóa ngoại moc_hoan_tien_ibfk_1, CHECK chk_moc_hoan_ty_le).
  // MOC-03: gồm cả ba cột mốc của lich_hen (thoi_diem_xac_nhan, thoi_diem_tiep_don, thoi_diem_hoan_thanh: thứ tự cột sau thoi_diem_tao, kiểu, NULL, COMMENT).
  // MGK-05: gồm cả ho_so_kham và danh_gia_bac_si (UNIQUE lich_hen_id, khóa ngoại *_ibfk_1, COMMENT bảng và cột, hai CHECK chk_danh_gia_*).
  // MDL-04 (reschedule P1): gồm cả bảng yeu_cau_doi_lich_ngoai_chinh_sach (chỉ mục _index_12, ba khóa ngoại, hai CHECK, COMMENT bảng), cột lich_hen.so_lan_tu_doi_lich và CHECK
  // chk_lich_hen_so_lan_tu_doi, cột thong_bao.yeu_cau_doi_lich_ngoai_chinh_sach_id cùng UNIQUE thong_bao_index_yeu_cau_doi_lich và khóa ngoại thong_bao_ibfk_4, ENUM hanh_dong 27 giá trị.
  // MTB-01 (notification P1): gồm cả bảng nhac_lich_hen (khóa chính kép, chỉ mục nhac_lich_hen_index_trang_thai, khóa ngoại nhac_lich_hen_ibfk_1, hai CHECK, COMMENT bảng).
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

    // MGK-05: hai bảng của doctor-exam P1 có mặt thật và mang đủ ràng buộc/ghi chú, để phép so ở trên không rỗng
    const danhGia = await showCreateTable(migrated, 'danh_gia_bac_si');
    for (const part of [
      'UNIQUE KEY `lich_hen_id`',
      'CONSTRAINT `chk_danh_gia_so_sao` CHECK',
      'CONSTRAINT `chk_danh_gia_an` CHECK',
      'Tối đa 1 đánh giá cho mỗi lịch hẹn',
      'COMMENT=',
    ]) {
      expect(danhGia, part).toContain(part);
    }
    expect(await showCreateTable(migrated, 'ho_so_kham')).toContain(
      'UNIQUE KEY `lich_hen_id`',
    );

    // MDL-04: các phần của reschedule P1 có mặt thật trong DB dựng bằng migration, để phép so ở trên không rỗng
    const lichHen = await showCreateTable(migrated, 'lich_hen');
    expect(lichHen).toContain('`so_lan_tu_doi_lich` int NOT NULL DEFAULT');
    expect(lichHen).toContain('CONSTRAINT `chk_lich_hen_so_lan_tu_doi` CHECK');
    const thongBao = await showCreateTable(migrated, 'thong_bao');
    expect(thongBao).toContain('`yeu_cau_doi_lich_ngoai_chinh_sach_id` bigint');
    expect(thongBao).toContain('UNIQUE KEY `thong_bao_index_yeu_cau_doi_lich`');
    expect(thongBao).toContain('CONSTRAINT `thong_bao_ibfk_4` FOREIGN KEY');
    const yeuCau = await showCreateTable(
      migrated,
      'yeu_cau_doi_lich_ngoai_chinh_sach',
    );
    for (const part of [
      'KEY `yeu_cau_doi_lich_ngoai_chinh_sach_index_12`',
      'CONSTRAINT `chk_doi_lich_xu_ly` CHECK',
      'CONSTRAINT `chk_doi_lich_nguoi_xu_ly` CHECK',
      'yeu_cau_doi_lich_ngoai_chinh_sach_ibfk_3',
    ]) {
      expect(yeuCau, part).toContain(part);
    }
    expect(await showCreateTable(migrated, 'nhat_ky_hanh_dong')).toContain(
      "'TuChoiRutTien','DoiLichHo')",
    );

    // MTB-01: bảng nhac_lich_hen có mặt thật và mang đủ ràng buộc, để phép so ở trên không rỗng
    const nhacLich = await showCreateTable(migrated, 'nhac_lich_hen');
    for (const part of [
      'PRIMARY KEY (`lich_hen_id`,`so_gio_truoc`)',
      'KEY `nhac_lich_hen_index_trang_thai` (`trang_thai`,`lan_thu_cuoi_luc`)',
      'CONSTRAINT `nhac_lich_hen_ibfk_1` FOREIGN KEY (`lich_hen_id`) REFERENCES `lich_hen`',
      'CONSTRAINT `chk_nhac_lich_hen_moc` CHECK',
      'CONSTRAINT `chk_nhac_lich_hen_ket_qua` CHECK',
      'Nhắc lịch chỉ qua email',
    ]) {
      expect(nhacLich, part).toContain(part);
    }

    // MTB-10 (notification P2): chỉ mục danh sách thông báo theo tài khoản có mặt thật, đúng ba cột theo thứ tự
    expect(thongBao).toContain(
      'KEY `thong_bao_index_tai_khoan_thoi_diem` (`tai_khoan_id`,`thoi_diem_tao`,`thong_bao_id`)',
    );

    // MCH-03 (chat P1): ba bảng chat có mặt thật và mang đủ cột mới, chỉ mục, khóa ngoại và CHECK, để phép so ở trên không rỗng
    const tinNhan = await showCreateTable(migrated, 'tin_nhan');
    for (const part of [
      '`ma_gui` char(36)',
      '`tep_dung_luong` int',
      'UNIQUE KEY `tin_nhan_index_nguoi_gui_ma_gui` (`nguoi_gui_id`,`ma_gui`)',
      'KEY `tin_nhan_index_28` (`hoi_thoai_id`,`tin_nhan_id`)',
      'CONSTRAINT `chk_tin_nhan_tep` CHECK',
      'CONSTRAINT `chk_tin_nhan_noi_dung` CHECK',
      'REFERENCES `tai_khoan`',
    ]) {
      expect(tinNhan, part).toContain(part);
    }
    // MCH-12 (chat P2): chỉ mục đếm giới hạn tốc độ theo người gửi có mặt thật, đúng hai cột theo thứ tự
    expect(tinNhan).toContain(
      'KEY `tin_nhan_index_nguoi_gui_thoi_diem` (`nguoi_gui_id`,`thoi_diem_gui`)',
    );
    expect(await showCreateTable(migrated, 'hoi_thoai')).toContain(
      'CONSTRAINT `chk_hoi_thoai_chi_nhanh` CHECK',
    );
    expect(await showCreateTable(migrated, 'tai_khoan_hoi_thoai')).toContain(
      'REFERENCES `tin_nhan`',
    );

    // ABD-01 (article B1): bốn bảng bài viết có mặt thật và mang đủ ENUM, mặc định, ON UPDATE, UNIQUE, khóa chính kép, hai chỉ mục và năm khóa ngoại, để phép so ở trên không rỗng
    const baiViet = await showCreateTable(migrated, 'bai_viet');
    for (const part of [
      "`trang_thai` enum('BanNhap','DaXuatBan','LuuTruAn') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'BanNhap'",
      '`cap_nhat_lan_cuoi` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      '`noi_dung` text COLLATE utf8mb4_unicode_ci NOT NULL',
      'CONSTRAINT `bai_viet_ibfk_1` FOREIGN KEY (`tac_gia_id`) REFERENCES `quan_tri_vien` (`tai_khoan_id`)',
    ]) {
      expect(baiViet, part).toContain(part);
    }
    // `bai_viet` không có chỉ mục nào ngoài khóa chính và khóa ngoại (PLAN article 5.10: chỉ mục chỉ thêm khi X1 đo không đạt và Đại đồng ý)
    expect(baiViet).not.toMatch(/\n\s+(?:UNIQUE )?KEY `(?!tac_gia_id`)/);
    const hashtag = await showCreateTable(migrated, 'hashtag');
    for (const part of [
      '`ten` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL',
      '`trang_thai_hoat_dong` tinyint(1) NOT NULL DEFAULT',
      'UNIQUE KEY `ten` (`ten`)',
    ]) {
      expect(hashtag, part).toContain(part);
    }
    const baiVietHashtag = await showCreateTable(migrated, 'bai_viet_hashtag');
    for (const part of [
      'PRIMARY KEY (`bai_viet_id`,`hashtag_id`)',
      'KEY `bai_viet_hashtag_index_23` (`hashtag_id`,`bai_viet_id`)',
      'FOREIGN KEY (`bai_viet_id`) REFERENCES `bai_viet`',
      'FOREIGN KEY (`hashtag_id`) REFERENCES `hashtag`',
    ]) {
      expect(baiVietHashtag, part).toContain(part);
    }
    const danhGiaBaiViet = await showCreateTable(
      migrated,
      'benh_nhan_danh_gia_bai_viet',
    );
    for (const part of [
      "`loai` enum('Thich','KhongThich') COLLATE utf8mb4_unicode_ci NOT NULL",
      'PRIMARY KEY (`benh_nhan_id`,`bai_viet_id`)',
      'KEY `benh_nhan_danh_gia_bai_viet_index_24` (`bai_viet_id`,`loai`)',
      'FOREIGN KEY (`benh_nhan_id`) REFERENCES `benh_nhan`',
      'FOREIGN KEY (`bai_viet_id`) REFERENCES `bai_viet`',
    ]) {
      expect(danhGiaBaiViet, part).toContain(part);
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
    expect(
      [
        ...TAO_BANG_DANH_MUC_SQL,
        ...TAO_BANG_ANH_SQL.filter((sql) => targetTable(sql) === 'chuyen_khoa'),
      ].map(normalizeStatement),
    ).toEqual(official);
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
    // Ba cột mốc của lich_hen được thêm ở migration booking B19 và bộ đếm so_lan_tu_doi_lich (cùng CHECK) ở migration reschedule P1 (đều sau migration này): hai phần được che,
    // xem MOC-01, MOC-02, MOC-03 và MDL-04, MDL-08
    expect(TAO_BANG_NHAN_SU_SQL.map(normalizeStatement)).toEqual(
      maskLichHenDoiLich(maskLichHenMoc(official)),
    );
  });

  it('mọi câu lệnh trong migration P2 chỉ tác động tám bảng được giao', () => {
    for (const statement of TAO_BANG_NHAN_SU_SQL) {
      expect(STAFF_TABLES).toContain(targetTable(statement));
    }
  });

  it('văn bản DDL vận hành P3 trùng từng câu, cùng thứ tự, với schema chính thức', () => {
    const official =
      officialStatementsFor(OPERATIONS_TABLES).map(normalizeStatement);
    expect(official.length).toBeGreaterThan(0);
    // Hai enum của nhat_ky_hanh_dong được mở rộng ở migration P4 và cột thong_bao.lich_hen_id (cùng chỉ mục, khóa ngoại)
    // được thêm ở migration booking P7 (đều sau migration này); trạng thái cuối được so bằng SHOW CREATE TABLE ở test
    // phía trên, MG-08 và TBLH-01. Cột thong_bao.yeu_cau_doi_lich_ngoai_chinh_sach_id (cùng chỉ mục, khóa ngoại) được thêm ở migration reschedule P1: được che, xem MDL-04, MDL-08. Chỉ mục thong_bao_index_tai_khoan_thoi_diem thêm ở notification P2: cũng được che (MTB-10).
    expect(
      TAO_BANG_VAN_HANH_SQL.map(normalizeStatement).map(maskAuditEnums),
    ).toEqual(
      maskThongBaoChiMucTaiKhoan(
        maskThongBaoDoiLich(maskThongBaoLichHen(official)),
      ).map(maskAuditEnums),
    );
  });

  it('mọi câu lệnh trong migration P3 chỉ tác động bảy bảng vận hành', () => {
    for (const statement of TAO_BANG_VAN_HANH_SQL) {
      expect(OPERATIONS_TABLES).toContain(targetTable(statement));
    }
  });
});

describe('doctor P1 — bảng nghỉ phép', () => {
  it('MG-01: DDL migration nghỉ phép trùng TỪNG CÂU, cùng thứ tự, với file SQL chính thức', () => {
    const official =
      officialStatementsFor(NGHI_PHEP_TABLES).map(normalizeStatement);
    expect(official.length).toBeGreaterThan(0);
    // Doctor UX7: CHECK `chk_nghi_phep_hinh_thuc` (nhánh TheoCa) và COMMENT bảng được đổi ở migration 1793880000000, nên migration GỐC (không sửa) chỉ trùng sau khi
    // đưa hai câu đó về chữ cũ; chữ mới được so ở migration-source.spec.ts (NTC-01) và trạng thái cuối bằng SHOW CREATE TABLE ở test phía trên.
    expect(TAO_BANG_NGHI_PHEP_SQL.map(normalizeStatement)).toEqual(
      maskNghiTheoCaNhieuNgay(official),
    );
  });

  it('mọi câu lệnh trong migration nghỉ phép chỉ tác động bảng yeu_cau_nghi_phep', () => {
    for (const statement of TAO_BANG_NGHI_PHEP_SQL) {
      expect(NGHI_PHEP_TABLES).toContain(targetTable(statement));
    }
  });
});

describe('P7 — canonical SQL ảnh Cloudinary', () => {
  it('CK-11/SE-A7: migration ảnh khớp canonical SQL và ALTER chuyên khoa bổ sung', () => {
    const expected = officialStatementsFor([
      'anh_tai_len',
      'chuyen_khoa',
    ]).filter(
      (sql) =>
        targetTable(sql) === 'anh_tai_len' || sql.includes('`anh_tai_len_id`'),
    );
    expect(TAO_BANG_ANH_SQL.map(normalizeStatement)).toEqual(
      expected.map(normalizeStatement),
    );
  });
});
