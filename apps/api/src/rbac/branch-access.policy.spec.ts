import { AppException } from '../common/errors/app.exception.js';
import type { AdminScope } from './admin-scope.js';
import { BranchAccessPolicy } from './branch-access.policy.js';

const policy = new BranchAccessPolicy();
const system: AdminScope = { kind: 'ToanHeThong' };
const branch: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '9007199254740993' };

describe('C1 PQ-03…08/13 — policy phạm vi', () => {
  it('TH thấy mọi chi nhánh; CN chỉ thấy chính mình, giữ bigint string', () => {
    expect(policy.canAccessBranch(system, '2')).toBe(true);
    expect(policy.canAccessBranch(branch, branch.chiNhanhId)).toBe(true);
    expect(policy.canAccessBranch(branch, '9007199254740992')).toBe(false);
    expect(() => policy.assertToanHeThong(system)).not.toThrow();
    expect(() => policy.assertToanHeThong(branch)).toThrow('KHONG_DU_QUYEN');
  });
  it('ngoài tầm nhìn luôn 404, kể cả hành động được cho phép; thấy nhưng cấm hành động 403', () => {
    for (const allowed of [false, true]) {
      try {
        policy.assertCanAct(branch, '2', allowed);
        expect.fail('Phải chặn ngoài phạm vi');
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        expect((error as AppException).getStatus()).toBe(404);
        expect((error as AppException).maLoi).toBe('KHONG_TIM_THAY');
      }
    }
    expect(() => policy.assertCanAct(branch, branch.chiNhanhId, false)).toThrow(
      'KHONG_DU_QUYEN',
    );
    expect(() =>
      policy.assertCanAct(branch, branch.chiNhanhId, true),
    ).not.toThrow();
  });
  it('requested branch giả không mở scope; TH cho phép lọc hoặc tất cả', () => {
    expect(policy.branchFilter(branch, '2')).toBe(branch.chiNhanhId);
    expect(policy.branchFilter(branch)).toBe(branch.chiNhanhId);
    expect(policy.branchFilter(system, '2')).toBe('2');
    expect(policy.branchFilter(system)).toBeUndefined();
  });
  it('patient EXISTS tham số hóa; TH không cần lịch; alias không thể chèn SQL', () => {
    const predicate = policy.patientVisibilityFilter(branch, 'p');
    expect(predicate.sql).toContain('p.tai_khoan_id');
    expect(predicate.sql).not.toContain(branch.chiNhanhId);
    expect(predicate.parameters).toEqual({ rbacBranchId: branch.chiNhanhId });
    expect(policy.patientVisibilityFilter(system)).toEqual({
      sql: '1 = 1',
      parameters: {},
    });
    expect(() => policy.patientVisibilityFilter(branch, 'p; DELETE')).toThrow(
      'Alias SQL',
    );
  });
});
