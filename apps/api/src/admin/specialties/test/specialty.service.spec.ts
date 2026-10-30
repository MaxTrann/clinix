import 'reflect-metadata';
import { DataSource, QueryFailedError } from 'typeorm';
import { UploadRepository } from '../../../common/upload/upload.repository.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { SpecialtyListDto } from '../specialty.dto.js';
import { SpecialtyRepository } from '../specialty.repository.js';
import { SpecialtyService } from '../specialty.service.js';

describe('B1 service — CK-03/10/13/14', () => {
  const db = new DataSource({ type: 'mysql' });
  const repo = new SpecialtyRepository(db);
  const images = new UploadRepository(db);
  const service = new SpecialtyService(repo, images, new BranchAccessPolicy());
  const system = { kind: 'ToanHeThong' } as const;
  const branch = { kind: 'ChiNhanh', chiNhanhId: '1' } as const;
  afterEach(() => vi.restoreAllMocks());

  it('CK-13: service từ chối mọi ghi của Chi nhánh trước transaction', () => {
    const transaction = vi.spyOn(repo, 'transaction');
    expect(() => service.create(branch, '1', { ten: 'Tim' })).toThrow(
      'KHONG_DU_QUYEN',
    );
    expect(() => service.update(branch, '1', '2', { ten: 'Tim' })).toThrow(
      'KHONG_DU_QUYEN',
    );
    expect(() =>
      service.setStatus(branch, '2', { trangThaiHoatDong: 'NgungHoatDong' }),
    ).toThrow('KHONG_DU_QUYEN');
    expect(transaction).not.toHaveBeenCalled();
  });
  it('CK-14: PATCH rỗng không mở giao dịch', () => {
    const transaction = vi.spyOn(repo, 'transaction');
    expect(() => service.update(system, '1', '2', {})).toThrow(
      'DU_LIEU_KHONG_HOP_LE',
    );
    expect(transaction).not.toHaveBeenCalled();
  });
  it('CK-17: offset vượt miền số an toàn bị từ chối trước query', () => {
    const query = Object.assign(new SpecialtyListDto(), { page: 1e20 });
    expect(() => service.list(system, query)).toThrow('DU_LIEU_KHONG_HOP_LE');
  });
  it.each([
    ['chuyen_khoa_index_ten', 'ER_DUP_ENTRY', true],
    ['chuyen_khoa.chuyen_khoa_index_ten', 'ER_DUP_ENTRY', true],
    ['uq_chuyen_khoa_anh', 'ER_DUP_ENTRY', false],
    ['chuyen_khoa_index_ten', 'ER_NO_REFERENCED_ROW_2', false],
  ])('CK-10: chỉ ánh xạ UNIQUE tên %s / %s', async (key, code, duplicate) => {
    const error = new QueryFailedError(
      'INSERT',
      [],
      Object.assign(new Error('test DB error'), {
        code,
        sqlMessage: `Duplicate entry 'mẫu' for key '${key}'`,
      }),
    );
    vi.spyOn(repo, 'transaction').mockRejectedValue(error);
    const result = service.create(system, '1', { ten: 'Tim' });
    if (duplicate)
      await expect(result).rejects.toMatchObject({
        maLoi: 'TEN_CHUYEN_KHOA_TRUNG',
        status: 409,
      });
    else await expect(result).rejects.toBe(error);
  });
  it('CK-14: lỗi không phải QueryFailedError giữ nguyên', async () => {
    const error = new Error('DB unavailable');
    vi.spyOn(repo, 'transaction').mockRejectedValue(error);
    await expect(service.create(system, '1', { ten: 'Tim' })).rejects.toBe(
      error,
    );
  });
});
