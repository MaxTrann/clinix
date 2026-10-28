import { TAO_BANG_ANH_SQL } from './migrations/1793188800000-tao-bang-anh.js';
import { TAO_BANG_DANH_MUC_SQL } from './migrations/1793024340000-tao-bang-danh-muc.js';
import { TAO_BANG_NHAN_SU_SQL } from './migrations/1793080000000-tao-bang-nhan-su.js';
import { TAO_BANG_VAN_HANH_SQL } from './migrations/1793090000000-tao-bang-van-hanh.js';
import {
  normalizeStatement,
  officialStatementsFor,
  targetTable,
} from './testing/official-schema.js';

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

describe('migration P1 khớp schema SQL chính thức', () => {
  it('sao chép đúng từng câu DDL, cùng thứ tự, từ clinix_mysql.sql', () => {
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

  it('mọi câu migration chỉ tác động các bảng catalog P1', () => {
    for (const statement of TAO_BANG_DANH_MUC_SQL) {
      expect(CATALOG_TABLES).toContain(targetTable(statement));
    }
  });
});

describe('migration P2 khớp schema SQL chính thức', () => {
  it('sao chép đúng từng câu DDL, cùng thứ tự, từ clinix_mysql.sql', () => {
    const official =
      officialStatementsFor(STAFF_TABLES).map(normalizeStatement);
    expect(official.length).toBeGreaterThan(0);
    expect(TAO_BANG_NHAN_SU_SQL.map(normalizeStatement)).toEqual(official);
  });

  it('mọi câu migration chỉ tác động tám bảng nhân sự và bảng nền P2', () => {
    for (const statement of TAO_BANG_NHAN_SU_SQL) {
      expect(STAFF_TABLES).toContain(targetTable(statement));
    }
  });
});

describe('migration P3 khớp schema SQL chính thức', () => {
  it('sao chép đúng từng câu DDL, cùng thứ tự, từ clinix_mysql.sql', () => {
    const official =
      officialStatementsFor(OPERATIONS_TABLES).map(normalizeStatement);
    expect(official.length).toBeGreaterThan(0);
    expect(TAO_BANG_VAN_HANH_SQL.map(normalizeStatement)).toEqual(official);
  });

  it('mọi câu migration chỉ tác động bảy bảng vận hành P3', () => {
    for (const statement of TAO_BANG_VAN_HANH_SQL) {
      expect(OPERATIONS_TABLES).toContain(targetTable(statement));
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
