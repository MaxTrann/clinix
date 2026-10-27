import { TAO_BANG_DANH_MUC_SQL } from './migrations/1793024340000-tao-bang-danh-muc.js';
import { TAO_BANG_NHAN_SU_SQL } from './migrations/1793080000000-tao-bang-nhan-su.js';
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

describe('migration P1 khớp schema SQL chính thức', () => {
  it('sao chép đúng từng câu DDL, cùng thứ tự, từ clinix_mysql.sql', () => {
    const official =
      officialStatementsFor(CATALOG_TABLES).map(normalizeStatement);
    expect(official.length).toBeGreaterThan(0);
    expect(TAO_BANG_DANH_MUC_SQL.map(normalizeStatement)).toEqual(official);
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
