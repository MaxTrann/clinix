import { DataSource } from 'typeorm';
import { BranchAccessPolicy } from './branch-access.policy.js';
import { ReceptionScopeRepository } from './reception-scope.repository.js';
import type { ReceptionProfile } from './reception-scope.repository.js';
import { ReceptionScopeService } from './reception-scope.service.js';

// Booking P4 (PLAN 7.20): repository giả, không DB. Ca MySQL thật ở reception-scope.int-spec.ts.
describe('Booking P4 RSC-01…07 — ReceptionScopeService (repository giả)', () => {
  const repository = new ReceptionScopeRepository(
    new DataSource({ type: 'mysql' }),
  );
  const service = new ReceptionScopeService(repository);
  const active = (chiNhanhId: string): ReceptionProfile => ({
    chiNhanhId,
    trangThai: 'DangHoatDong',
  });
  beforeEach(() => vi.restoreAllMocks());

  it('RSC-01: hồ sơ hợp lệ trả phạm vi ChiNhanh', async () => {
    vi.spyOn(repository, 'findByAccountId').mockResolvedValue(active('2'));
    expect(await service.resolve('10')).toEqual({
      kind: 'ChiNhanh',
      chiNhanhId: '2',
    });
  });

  it('RSC-02: đọc lại mỗi lần gọi, không cache theo accountId', async () => {
    const read = vi
      .spyOn(repository, 'findByAccountId')
      .mockResolvedValueOnce(active('2'))
      .mockResolvedValueOnce(active('3'));
    expect(await service.resolve('10')).toEqual({
      kind: 'ChiNhanh',
      chiNhanhId: '2',
    });
    expect(await service.resolve('10')).toEqual({
      kind: 'ChiNhanh',
      chiNhanhId: '3',
    });
    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledWith('10');
  });

  it('RSC-03: không có dòng le_tan ⇒ 403 KHONG_DU_QUYEN', async () => {
    vi.spyOn(repository, 'findByAccountId').mockResolvedValue(null);
    await expect(service.resolve('10')).rejects.toMatchObject({
      status: 403,
      maLoi: 'KHONG_DU_QUYEN',
    });
  });

  it('RSC-04: chiNhanhId sai dạng ⇒ 403 KHONG_DU_QUYEN (ca biên)', async () => {
    const read = vi.spyOn(repository, 'findByAccountId');
    for (const chiNhanhId of ['', '0', '01', '-1', '1.5', 'abc', ' 1']) {
      read.mockResolvedValue(active(chiNhanhId));
      await expect(service.resolve('10')).rejects.toMatchObject({
        maLoi: 'KHONG_DU_QUYEN',
      });
    }
  });

  it('RSC-05: tài khoản ChoKichHoat hoặc NgungHoatDong ⇒ 403 dù chiNhanhId hợp lệ', async () => {
    const read = vi.spyOn(repository, 'findByAccountId');
    for (const trangThai of ['ChoKichHoat', 'NgungHoatDong'] as const) {
      read.mockResolvedValue({ chiNhanhId: '2', trangThai });
      await expect(service.resolve('10')).rejects.toMatchObject({
        status: 403,
        maLoi: 'KHONG_DU_QUYEN',
      });
    }
  });

  it('RSC-06: lỗi DB đi nguyên ra ngoài, không biến thành 403 hay phạm vi', async () => {
    const dbError = new Error('DB test unavailable');
    vi.spyOn(repository, 'findByAccountId').mockRejectedValue(dbError);
    await expect(service.resolve('10')).rejects.toBe(dbError);
  });

  it('RSC-07: phạm vi đưa thẳng vào BranchAccessPolicy, không cần chuyển đổi', async () => {
    vi.spyOn(repository, 'findByAccountId').mockResolvedValue(active('2'));
    const scope = await service.resolve('10');
    const policy = new BranchAccessPolicy();
    // Các lời gọi dưới đây biên dịch được vì ReceptionScope là biến thể ChiNhanh của AdminScope (tsc kiểm).
    expect(policy.canAccessBranch(scope, '2')).toBe(true);
    expect(policy.canAccessBranch(scope, '3')).toBe(false);
    expect(() => policy.assertCanSee(scope, '2')).not.toThrow();
    expect(() => policy.assertCanSee(scope, '3')).toThrow(
      expect.objectContaining({ status: 404, maLoi: 'KHONG_TIM_THAY' }),
    );
    // Giá trị client gửi (?chiNhanhId=3) bị bỏ qua: luôn chi nhánh của Lễ tân.
    expect(policy.branchFilter(scope, '3')).toBe('2');
    expect(policy.branchFilter(scope)).toBe('2');
    expect(() => policy.assertToanHeThong(scope)).toThrow(
      expect.objectContaining({ status: 403, maLoi: 'KHONG_DU_QUYEN' }),
    );
  });
});
