import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { ClinicInfoRepository } from '../clinic-info.repository.js';
import { ClinicInfoService } from '../clinic-info.service.js';

const branch: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '12' };

describe('B4 ClinicInfoService — PK-01/02/07', () => {
  const repo = {
    get: vi.fn(),
    upsert: vi.fn(),
  };
  const service = new ClinicInfoService(
    repo as unknown as ClinicInfoRepository,
    new BranchAccessPolicy(),
  );

  beforeEach(() => vi.clearAllMocks());

  it('PK-01: GET chưa cấu hình trả object bốn field null, không trả id', async () => {
    repo.get.mockResolvedValue(null);
    await expect(service.get()).resolves.toEqual({
      tenThuongHieu: null,
      diaChiTruSo: null,
      duongDayNong: null,
      email: null,
    });
  });

  it('PK-02: trả public shape bốn field khi có dữ liệu', async () => {
    repo.get.mockResolvedValue({
      id: 1,
      tenThuongHieu: 'CLINIX',
      diaChiTruSo: '12 Đường Mẫu',
      duongDayNong: '19001234',
      email: 'Support@example.com',
    });
    const result = await service.get();
    expect(result).toEqual({
      tenThuongHieu: 'CLINIX',
      diaChiTruSo: '12 Đường Mẫu',
      duongDayNong: '19001234',
      email: 'Support@example.com',
    });
    expect(result).not.toHaveProperty('id');
  });

  it('PK-07: service cho đọc nhưng vẫn chặn scope Chi nhánh khi sửa', async () => {
    repo.get.mockResolvedValueOnce(null);
    await expect(service.get()).resolves.toEqual({
      tenThuongHieu: null,
      diaChiTruSo: null,
      duongDayNong: null,
      email: null,
    });
    await expect(
      service.update(branch, {
        tenThuongHieu: 'CLINIX',
        diaChiTruSo: '12 Đường Mẫu',
        duongDayNong: '19001234',
        email: 'Support@example.com',
      }),
    ).rejects.toMatchObject({ status: 403, maLoi: 'KHONG_DU_QUYEN' });
    expect(repo.upsert).not.toHaveBeenCalled();
  });
});
