import { AdminScopeRepository } from './admin-scope.repository.js';
import { AdminScopeService } from './admin-scope.service.js';
import { DataSource } from 'typeorm';

describe('C1 PQ-09/10 — resolve mỗi request và đóng mặc định', () => {
  const repository = new AdminScopeRepository(
    new DataSource({ type: 'mysql' }),
  );
  const service = new AdminScopeService(repository);
  beforeEach(() => vi.restoreAllMocks());

  it('đọc lại, không cache; đổi chi nhánh với cùng accountId', async () => {
    const read = vi
      .spyOn(repository, 'findByAccountId')
      .mockResolvedValueOnce({
        taiKhoanId: '1',
        phamViQuanTri: 'ToanHeThong',
        chiNhanhId: null,
      })
      .mockResolvedValueOnce({
        taiKhoanId: '1',
        phamViQuanTri: 'ChiNhanh',
        chiNhanhId: '2',
      });
    expect(await service.resolve('1')).toEqual({ kind: 'ToanHeThong' });
    expect(await service.resolve('1')).toEqual({
      kind: 'ChiNhanh',
      chiNhanhId: '2',
    });
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('thiếu hồ sơ/sai NULL/sai bigint đều 403; không biến lỗi DB thành lỗi scope', async () => {
    const read = vi.spyOn(repository, 'findByAccountId');
    for (const profile of [
      null,
      { taiKhoanId: '1', phamViQuanTri: 'ChiNhanh' as const, chiNhanhId: null },
      {
        taiKhoanId: '1',
        phamViQuanTri: 'ToanHeThong' as const,
        chiNhanhId: '2',
      },
      { taiKhoanId: '1', phamViQuanTri: 'ChiNhanh' as const, chiNhanhId: '' },
    ]) {
      read.mockResolvedValue(profile);
      await expect(service.resolve('1')).rejects.toMatchObject({
        maLoi: 'KHONG_DU_QUYEN',
      });
    }
    const dbError = new Error('DB test unavailable');
    read.mockRejectedValue(dbError);
    await expect(service.resolve('1')).rejects.toBe(dbError);
  });
  it('/me chỉ expose allowlist; thiếu chi nhánh đóng mặc định', async () => {
    const read = vi.spyOn(repository, 'findBranch').mockResolvedValue({
      chiNhanhId: '2',
      ten: 'Mẫu',
      diaChi: 'Ẩn',
      toaDoLat: null,
      toaDoLng: null,
    });
    expect(await service.describe({ kind: 'ToanHeThong' })).toEqual({
      phamVi: 'ToanHeThong',
    });
    expect(read).not.toHaveBeenCalled();
    expect(
      await service.describe({ kind: 'ChiNhanh', chiNhanhId: '2' }),
    ).toEqual({ phamVi: 'ChiNhanh', chiNhanh: { id: '2', ten: 'Mẫu' } });
    read.mockResolvedValue(null);
    await expect(
      service.describe({ kind: 'ChiNhanh', chiNhanhId: '2' }),
    ).rejects.toThrow('KHONG_DU_QUYEN');
  });
});
