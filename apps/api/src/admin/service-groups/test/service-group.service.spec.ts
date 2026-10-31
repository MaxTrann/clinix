import 'reflect-metadata';
import { DataSource, QueryFailedError } from 'typeorm';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { ServiceGroupListDto } from '../service-group.dto.js';
import { ServiceGroupRepository } from '../service-group.repository.js';
import { ServiceGroupService } from '../service-group.service.js';

describe('B2 service — DV-03/05/06/16', () => {
  const repo = new ServiceGroupRepository(new DataSource({ type: 'mysql' }));
  const service = new ServiceGroupService(repo, new BranchAccessPolicy());
  const system = { kind: 'ToanHeThong' } as const;
  const branch = { kind: 'ChiNhanh', chiNhanhId: '1' } as const;
  afterEach(() => vi.restoreAllMocks());
  it('DV-16: mọi ghi Chi nhánh bị chặn trước transaction', () => {
    const transaction = vi.spyOn(repo, 'transaction');
    expect(() => service.create(branch, { ten: 'Mẫu' })).toThrow(
      'KHONG_DU_QUYEN',
    );
    expect(() => service.update(branch, '1', { ten: 'Mẫu' })).toThrow(
      'KHONG_DU_QUYEN',
    );
    expect(() => service.remove(branch, '1')).toThrow('KHONG_DU_QUYEN');
    expect(transaction).not.toHaveBeenCalled();
  });
  it('DV-04/16: PATCH rỗng và offset không an toàn bị từ chối', () => {
    const transaction = vi.spyOn(repo, 'transaction');
    expect(() => service.update(system, '1', {})).toThrow(
      'DU_LIEU_KHONG_HOP_LE',
    );
    expect(() =>
      service.list(
        system,
        Object.assign(new ServiceGroupListDto(), { page: 1e20 }),
      ),
    ).toThrow('DU_LIEU_KHONG_HOP_LE');
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each([
    ['ten', 'ER_DUP_ENTRY', true],
    ['nhom_dich_vu.ten', 'ER_DUP_ENTRY', true],
    ['PRIMARY', 'ER_DUP_ENTRY', false],
    ['dich_vu_kham_index_nhom_ten', 'ER_DUP_ENTRY', false],
    ['ten', 'ER_NO_REFERENCED_ROW_2', false],
  ])('DV-03: chỉ map đúng UNIQUE nhóm %s %s', async (key, code, mapped) => {
    const error = new QueryFailedError(
      'INSERT',
      [],
      Object.assign(new Error('test'), {
        code,
        sqlMessage: `Duplicate entry 'Mẫu' for key '${key}'`,
      }),
    );
    vi.spyOn(repo, 'transaction').mockRejectedValue(error);
    const result = service.create(system, { ten: 'Mẫu' });
    if (mapped)
      await expect(result).rejects.toMatchObject({
        status: 409,
        maLoi: 'TEN_NHOM_DICH_VU_TRUNG',
      });
    else await expect(result).rejects.toBe(error);
  });
  it('DV-06: không che lỗi hệ thống không phải QueryFailedError', async () => {
    const error = new Error('test unavailable');
    vi.spyOn(repo, 'transaction').mockRejectedValue(error);
    await expect(service.remove(system, '1')).rejects.toBe(error);
  });
});
