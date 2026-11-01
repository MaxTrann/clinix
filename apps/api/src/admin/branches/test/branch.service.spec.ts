import { EntityManager } from 'typeorm';
import { AppException } from '../../../common/errors/app.exception.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import {
  BranchListDto,
  BranchScheduleDto,
  CreateBranchDto,
} from '../branch.dto.js';
import { BranchRepository, type BranchView } from '../branch.repository.js';
import { BranchService } from '../branch.service.js';

const week = (): BranchScheduleDto[] =>
  Array.from({ length: 7 }, (_, index) => ({
    thuTrongTuan: index + 1,
    hoatDong: true,
    sang: { batDau: '08:00', ketThuc: '12:00' },
  }));
const input = (overrides: Partial<CreateBranchDto> = {}) =>
  Object.assign(new CreateBranchDto(), {
    ten: 'Chi nhánh A',
    diaChi: 'Địa chỉ A',
    lichHoatDong: week(),
    dichVuKhamIds: [],
    ...overrides,
  });
const view: BranchView = {
  chiNhanhId: '1',
  ten: 'Chi nhánh A',
  diaChi: 'Địa chỉ A',
  toaDoLat: null,
  toaDoLng: null,
  lichHoatDong: [],
  dichVuKham: [],
  coYeuCauDangMo: false,
};

function captureError(work: () => unknown): unknown {
  try {
    work();
  } catch (error) {
    return error;
  }
  throw new Error('Expected synchronous exception');
}

describe('BranchService — CN/PQ scope and business rules', () => {
  const repository = {
    list: vi.fn(),
    get: vi.fn(),
    transaction: vi.fn(),
    serviceIdsExist: vi.fn(),
    create: vi.fn(),
  };
  const service = new BranchService(
    repository as unknown as BranchRepository,
    new BranchAccessPolicy(),
  );
  const system = { kind: 'ToanHeThong' } as const;
  const branchAdmin = { kind: 'ChiNhanh', chiNhanhId: '7' } as const;

  beforeEach(() => {
    vi.resetAllMocks();
    repository.transaction.mockImplementation(
      (work: (manager: EntityManager) => Promise<unknown>) =>
        work({} as EntityManager),
    );
    repository.serviceIdsExist.mockImplementation(
      async (_manager, ids: string[]) => ids,
    );
    repository.create.mockResolvedValue(view);
  });

  it('PQ: luôn áp branch scope khi lấy list/detail và 404 id ngoài scope', async () => {
    const query = Object.assign(new BranchListDto(), { page: 1, pageSize: 20 });
    repository.list.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    await service.list(branchAdmin, query);
    expect(repository.list).toHaveBeenCalledWith(query, '7');
    repository.get.mockResolvedValue(null);
    await expect(service.get(branchAdmin, '8')).rejects.toMatchObject({
      status: 404,
      maLoi: 'KHONG_TIM_THAY',
    });
    expect(repository.get).toHaveBeenCalledWith('8', '7');
  });

  it('CN-02: Admin Chi nhánh không thể tạo', async () => {
    expect(
      captureError(() => service.create(branchAdmin, input())),
    ).toMatchObject({
      status: 403,
      maLoi: 'KHONG_DU_QUYEN',
    });
    expect(repository.transaction).not.toHaveBeenCalled();
  });

  it('CN-11: toạ độ phải đi theo cặp, không mở transaction', async () => {
    const error = captureError(() =>
      service.create(system, input({ toaDoLat: '10.1' })),
    );
    expect(error).toMatchObject({ maLoi: 'DU_LIEU_KHONG_HOP_LE' });
    expect((error as AppException).getResponse()).toMatchObject({
      loi: [{ truong: 'toaDoLng', ma: 'TOA_DO_PHAI_DI_THEO_CAP' }],
    });
    expect(repository.transaction).not.toHaveBeenCalled();
  });

  it('CN-03…09: lịch sai trả đủ chiTiet, không ghi DB', async () => {
    const invalidWeek = week();
    invalidWeek[0] = { thuTrongTuan: 1, hoatDong: true };
    invalidWeek[1] = {
      thuTrongTuan: 2,
      hoatDong: true,
      sang: { batDau: '25:00', ketThuc: '12:00' },
    };
    const error = captureError(() =>
      service.create(system, input({ lichHoatDong: invalidWeek })),
    );
    expect(error).toMatchObject({
      status: 400,
      maLoi: 'LICH_HOAT_DONG_KHONG_HOP_LE',
    });
    expect((error as AppException).getResponse()).toMatchObject({
      chiTiet: expect.arrayContaining([
        { thu: 1, maLoi: 'NGAY_HOAT_DONG_THIEU_KHOANG' },
        { thu: 2, maLoi: 'GIO_KHONG_HOP_LE' },
      ]),
    });
    expect(repository.transaction).not.toHaveBeenCalled();
  });

  it('CN-12: từ chối dịch vụ thiếu và gộp ID lặp trước khi gọi repository', async () => {
    repository.serviceIdsExist.mockResolvedValueOnce(['5']);
    await expect(
      service.create(system, input({ dichVuKhamIds: ['5', '6'] })),
    ).rejects.toMatchObject({ status: 404, maLoi: 'KHONG_TIM_THAY' });
    expect(repository.create).not.toHaveBeenCalled();

    repository.serviceIdsExist.mockResolvedValueOnce(['5']);
    await service.create(system, input({ dichVuKhamIds: ['5', '5'] }));
    expect(repository.serviceIdsExist).toHaveBeenLastCalledWith({}, ['5']);
    expect(repository.create).toHaveBeenLastCalledWith({}, expect.anything(), [
      '5',
    ]);
  });

  it('từ chối offset vượt miền an toàn trước khi truy vấn', async () => {
    const query = Object.assign(new BranchListDto(), {
      page: Number.MAX_SAFE_INTEGER,
      pageSize: 100,
    });
    expect(() => service.list(system, query)).toThrow(AppException);
    expect(repository.list).not.toHaveBeenCalled();
  });
});
