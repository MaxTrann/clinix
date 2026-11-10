import { doctorScopePredicate } from './doctor-scope.sql.js';

// Doctor B9 — vị từ phạm vi bác sĩ dùng chung (XL-19, QH-02, Q14).
describe('doctorScopePredicate', () => {
  it('QH-02 Toàn hệ thống (không có chi nhánh) ⇒ không giới hạn, không tham số', () => {
    expect(doctorScopePredicate(undefined)).toEqual({
      sql: '1 = 1',
      parameters: [],
    });
  });

  it('XL-19 có chi nhánh ⇒ hồ sơ HOẶC có ca ở chi nhánh, bind hai lần, không nối giá trị vào SQL', () => {
    const predicate = doctorScopePredicate('42');
    expect(predicate.parameters).toEqual(['42', '42']);
    expect(predicate.sql).toContain('b.chi_nhanh_id = ?');
    expect(predicate.sql).toContain('EXISTS (SELECT 1 FROM lich_lam_viec');
    expect(predicate.sql).not.toContain('42');
    expect(predicate.sql.match(/\?/g)).toHaveLength(2);
  });

  it('dùng đúng bí danh bảng bac_si; bí danh sai định danh bị từ chối (chống nối chuỗi SQL)', () => {
    expect(doctorScopePredicate('1', 'doc').sql).toContain(
      'doc.chi_nhanh_id = ?',
    );
    expect(() => doctorScopePredicate('1', 'b; DROP TABLE x')).toThrow();
    expect(() => doctorScopePredicate('1', '1b')).toThrow();
  });
});
