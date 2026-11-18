import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { ACCOUNT_FROM_SQL, accountVisibility } from '../account-visibility.js';

const policy = new BranchAccessPolicy();
const system: AdminScope = { kind: 'ToanHeThong' };
const branch = (chiNhanhId: string): AdminScope => ({
  kind: 'ChiNhanh',
  chiNhanhId,
});

describe('TKB17-04 (Q27, PQ-07, PQ-08) — accountVisibility: phạm vi tầm nhìn tài khoản', () => {
  it('Toàn hệ thống không lọc chi nhánh: thấy tất cả, không có tham số nào', () => {
    expect(accountVisibility(policy, system)).toEqual({
      sql: '1 = 1',
      parameters: {},
    });
  });

  it('Toàn hệ thống lọc chi nhánh X: bốn nhánh, GỒM Quản trị viên của X', () => {
    const { sql, parameters } = accountVisibility(policy, system, '5');
    expect(sql).toContain("t.loai_tai_khoan = 'BacSi' AND bs.chi_nhanh_id");
    expect(sql).toContain("t.loai_tai_khoan = 'LeTan' AND le.chi_nhanh_id");
    expect(sql).toContain("t.loai_tai_khoan = 'BenhNhan' AND EXISTS");
    expect(sql).toContain(
      "t.loai_tai_khoan = 'QuanTriVien' AND qv.chi_nhanh_id",
    );
    expect(parameters).toEqual({ accountBranchId: '5', rbacBranchId: '5' });
  });

  it('Chi nhánh: đúng ba nhánh và KHÔNG có Quản trị viên (Q27)', () => {
    const { sql } = accountVisibility(policy, branch('7'));
    expect(sql).not.toContain('QuanTriVien');
    expect(sql).not.toContain('quan_tri_vien');
    expect(sql).not.toContain('qv.');
    expect(sql.match(/t\.loai_tai_khoan = /g)).toHaveLength(3);
  });

  it('Chi nhánh bọc cả ba nhánh trong MỘT cặp ngoặc để AND với bộ lọc không bị lệch thứ tự ưu tiên', () => {
    const { sql } = accountVisibility(policy, branch('7'));
    expect(sql.startsWith('(')).toBe(true);
    expect(sql.endsWith(')')).toBe(true);
    expect(sql.match(/ OR /g)).toHaveLength(2);
  });

  it('Chi nhánh: tham số luôn là chi nhánh của scope, KHÔNG nghe client (IDOR, PQ-07)', () => {
    const { parameters } = accountVisibility(policy, branch('7'), '9');
    expect(parameters).toEqual({ accountBranchId: '7', rbacBranchId: '7' });
  });

  it('không nối giá trị vào chuỗi SQL (chỉ tên tham số), kể cả giá trị độc hại', () => {
    const hostile = "1'; DROP TABLE tai_khoan; --";
    const { sql, parameters } = accountVisibility(policy, system, hostile);
    expect(sql).not.toContain('DROP');
    expect(sql).not.toContain(hostile);
    expect(parameters.accountBranchId).toBe(hostile);
    const asBranch = accountVisibility(policy, branch('7'));
    expect(asBranch.sql).not.toContain('7');
  });

  it('điều kiện Bệnh nhân dùng EXISTS của C1 theo alias t (một Bệnh nhân nhiều lịch vẫn một dòng)', () => {
    const { sql } = accountVisibility(policy, branch('7'));
    expect(sql).toContain('EXISTS (SELECT 1 FROM lich_hen');
    expect(sql).toContain('benh_nhan_id = t.tai_khoan_id');
    expect(sql).not.toMatch(/JOIN lich_hen/i);
  });

  it('đoạn FROM dùng chung có đủ năm LEFT JOIN theo khoá chính, alias cố định cho B18 đến B20', () => {
    for (const join of [
      'LEFT JOIN benh_nhan bn ON bn.tai_khoan_id = t.tai_khoan_id',
      'LEFT JOIN bac_si bs ON bs.tai_khoan_id = t.tai_khoan_id',
      'LEFT JOIN le_tan le ON le.tai_khoan_id = t.tai_khoan_id',
      'LEFT JOIN quan_tri_vien qv ON qv.tai_khoan_id = t.tai_khoan_id',
      'LEFT JOIN chi_nhanh cn ON cn.chi_nhanh_id = CASE t.loai_tai_khoan',
    ])
      expect(ACCOUNT_FROM_SQL).toContain(join);
    expect(ACCOUNT_FROM_SQL.trimStart().startsWith('tai_khoan t')).toBe(true);
  });
});
