import 'reflect-metadata';
import { DataSource, QueryFailedError, type EntityManager } from 'typeorm';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { ServiceListDto, type UpdateServiceDto } from '../service.dto.js';
import { ServiceRepository } from '../service.repository.js';
import { ServiceService } from '../service.service.js';

describe('B3 service — DV-08/14/15/16/20', () => {
  const repo = new ServiceRepository(new DataSource({ type: 'mysql' }));
  const service = new ServiceService(repo, new BranchAccessPolicy());
  const system = { kind: 'ToanHeThong' } as const;
  const branch = { kind: 'ChiNhanh', chiNhanhId: '1' } as const;
  const current = {
    dichVuKhamId: '5',
    nhomDichVuId: '1',
    ten: 'Khám tổng quát',
    thoiLuong: 30,
    giaMacDinh: '100.00',
  };
  const manager = {} as EntityManager;
  const transaction = () =>
    vi
      .spyOn(repo, 'transaction')
      .mockImplementation(async (work) => work(manager));

  afterEach(() => vi.restoreAllMocks());

  it('DV-16: Branch scope bị từ chối trước transaction cho POST/PATCH', () => {
    const run = vi.spyOn(repo, 'transaction');
    expect(() =>
      service.create(branch, {
        nhomDichVuId: '1',
        ten: 'Mới',
        thoiLuong: 30,
        giaMacDinh: '100.00',
      }),
    ).toThrow('KHONG_DU_QUYEN');
    expect(() => service.update(branch, '5', { ten: 'Mới' })).toThrow(
      'KHONG_DU_QUYEN',
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('DV-14: PATCH rỗng và offset không an toàn bị từ chối', () => {
    const run = vi.spyOn(repo, 'transaction');
    expect(() => service.update(system, '5', {})).toThrow(
      'DU_LIEU_KHONG_HOP_LE',
    );
    expect(() =>
      service.list(system, Object.assign(new ServiceListDto(), { page: 1e20 })),
    ).toThrow('DU_LIEU_KHONG_HOP_LE');
    expect(run).not.toHaveBeenCalled();
  });

  it('DV-14: đổi thời lượng bị chặn nếu có lịch hẹn hoạt động', async () => {
    transaction();
    vi.spyOn(repo, 'lock').mockResolvedValue(current);
    vi.spyOn(repo, 'lockGroup').mockResolvedValue(true);
    vi.spyOn(repo, 'nameExists').mockResolvedValue(false);
    vi.spyOn(repo, 'hasActiveAppointments').mockResolvedValue(true);
    const update = vi.spyOn(repo, 'update');

    await expect(
      service.update(system, '5', { thoiLuong: 45 }),
    ).rejects.toMatchObject({ status: 409, maLoi: 'THOI_LUONG_DANG_DUNG' });
    expect(update).not.toHaveBeenCalled();
  });

  it('DV-14: đổi thời lượng bị chặn nếu có khung giờ tương lai', async () => {
    transaction();
    vi.spyOn(repo, 'lock').mockResolvedValue(current);
    vi.spyOn(repo, 'lockGroup').mockResolvedValue(true);
    vi.spyOn(repo, 'nameExists').mockResolvedValue(false);
    vi.spyOn(repo, 'hasActiveAppointments').mockResolvedValue(false);
    vi.spyOn(repo, 'hasFutureSlots').mockResolvedValue(true);
    const update = vi.spyOn(repo, 'update');

    await expect(
      service.update(system, '5', { thoiLuong: 45 }),
    ).rejects.toMatchObject({ status: 409, maLoi: 'THOI_LUONG_DANG_DUNG' });
    expect(update).not.toHaveBeenCalled();
  });

  it('DV-14: cho sửa tên/giá khi thời lượng đang dùng', async () => {
    transaction();
    vi.spyOn(repo, 'lock').mockResolvedValue(current);
    vi.spyOn(repo, 'lockGroup').mockResolvedValue(true);
    vi.spyOn(repo, 'nameExists').mockResolvedValue(false);
    const active = vi.spyOn(repo, 'hasActiveAppointments');
    const future = vi.spyOn(repo, 'hasFutureSlots');
    vi.spyOn(repo, 'update').mockResolvedValue({
      ...current,
      tenNhom: 'Nhóm',
      ten: 'Tên mới',
      giaMacDinh: '200.00',
    });

    await expect(
      service.update(system, '5', { ten: 'Tên mới', giaMacDinh: '200.00' }),
    ).resolves.toMatchObject({ ten: 'Tên mới', giaMacDinh: '200.00' });
    expect(active).not.toHaveBeenCalled();
    expect(future).not.toHaveBeenCalled();
  });

  it('DV-15/20: chỉ ánh xạ UNIQUE dịch vụ theo nhóm', async () => {
    const duplicate = (key: string) =>
      new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('test'), {
          code: 'ER_DUP_ENTRY',
          sqlMessage: `Duplicate entry 'Mẫu' for key '${key}'`,
        }),
      );
    vi.spyOn(repo, 'transaction').mockRejectedValue(
      duplicate('dich_vu_kham_index_nhom_ten'),
    );
    await expect(
      service.create(system, {
        nhomDichVuId: '1',
        ten: 'Mẫu',
        thoiLuong: 30,
        giaMacDinh: '100.00',
      }),
    ).rejects.toMatchObject({ status: 409, maLoi: 'TEN_DICH_VU_TRUNG' });

    vi.restoreAllMocks();
    const unrelated = duplicate('PRIMARY');
    vi.spyOn(repo, 'transaction').mockRejectedValue(unrelated);
    await expect(
      service.create(system, {
        nhomDichVuId: '1',
        ten: 'Mẫu',
        thoiLuong: 30,
        giaMacDinh: '100.00',
      }),
    ).rejects.toBe(unrelated);
  });

  it('DV-08: FK nhóm đã biết được ánh xạ lỗi nghiệp vụ', async () => {
    const error = new QueryFailedError(
      'INSERT',
      [],
      Object.assign(new Error('test'), {
        code: 'ER_NO_REFERENCED_ROW_2',
        sqlMessage:
          'Cannot add or update a child row: a foreign key constraint fails (`clinix_test`.`dich_vu_kham`, CONSTRAINT `fk_dich_vu_kham_nhom_dich_vu` FOREIGN KEY (`nhom_dich_vu_id`) REFERENCES `nhom_dich_vu` (`nhom_dich_vu_id`))',
      }),
    );
    vi.spyOn(repo, 'transaction').mockRejectedValue(error);
    await expect(
      service.create(system, {
        nhomDichVuId: '1',
        ten: 'Mẫu',
        thoiLuong: 30,
        giaMacDinh: '100.00',
      }),
    ).rejects.toMatchObject({
      status: 400,
      maLoi: 'NHOM_DICH_VU_KHONG_TON_TAI',
    });
  });

  it('DV-13/14: chặn duration không ảnh hưởng update transaction shape', async () => {
    transaction();
    vi.spyOn(repo, 'lock').mockResolvedValue(current);
    vi.spyOn(repo, 'lockGroup').mockResolvedValue(true);
    vi.spyOn(repo, 'nameExists').mockResolvedValue(false);
    vi.spyOn(repo, 'hasActiveAppointments').mockResolvedValue(false);
    vi.spyOn(repo, 'hasFutureSlots').mockResolvedValue(false);
    const updated = {
      ...current,
      tenNhom: 'Nhóm',
      nhomDichVuId: '2',
      thoiLuong: 45,
    };
    const save = vi.spyOn(repo, 'update').mockResolvedValue(updated);
    await expect(
      service.update(system, '5', {
        nhomDichVuId: '2',
        thoiLuong: 45,
      } satisfies UpdateServiceDto),
    ).resolves.toEqual(updated);
    expect(save).toHaveBeenCalledWith(
      manager,
      '5',
      '2',
      { nhomDichVuId: '2', thoiLuong: 45 },
      'Khám tổng quát',
    );
  });
});
