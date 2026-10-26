import { TAO_BANG_DANH_MUC_SQL } from './migrations/1793024340000-tao-bang-danh-muc.js';
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

describe('migration P1 khớp schema SQL chính thức', () => {
  it('sao chép đúng từng câu DDL, cùng thứ tự, từ clinix_mysql.sql', () => {
    const official = officialStatementsFor(CATALOG_TABLES).map(
      normalizeStatement,
    );
    expect(official.length).toBeGreaterThan(0);
    expect(TAO_BANG_DANH_MUC_SQL.map(normalizeStatement)).toEqual(official);
  });

  it('mọi câu migration chỉ tác động các bảng catalog P1', () => {
    for (const statement of TAO_BANG_DANH_MUC_SQL) {
      expect(CATALOG_TABLES).toContain(targetTable(statement));
    }
  });
});
