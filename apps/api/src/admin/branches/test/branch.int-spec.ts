import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../../database/testing/test-database.js';
import { AdminFixtures } from '../../testing/admin-fixtures.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { BranchListDto, CreateBranchDto } from '../branch.dto.js';
import { BranchRepository } from '../branch.repository.js';
import { BranchService } from '../branch.service.js';

const system = { kind: 'ToanHeThong' } as const;
const week = () =>
  Array.from({ length: 7 }, (_, index) => ({
    thuTrongTuan: index + 1,
    hoatDong: index !== 6,
    ...(index === 6 ? {} : { sang: { batDau: '08:00', ketThuc: '12:00' } }),
  }));
const query = (values: Partial<BranchListDto> = {}) =>
  Object.assign(new BranchListDto(), values);
const input = (values: Partial<CreateBranchDto> = {}) =>
  Object.assign(new CreateBranchDto(), {
    ten: 'Chi nhánh test',
    diaChi: 'Địa chỉ test',
    lichHoatDong: week(),
    dichVuKhamIds: [],
    ...values,
  });

describe('B7 CN/PQ — MySQL thật', () => {
  let db: DataSource;
  let repository: BranchRepository;
  let service: BranchService;

  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    repository = new BranchRepository(db);
    service = new BranchService(repository, new BranchAccessPolicy());
  });
  beforeEach(async () => resetTables(db));
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => db?.destroy());

  it('CN-01/10/11/12: tạo branch, 7 thứ, tọa độ chuỗi, dịch vụ và đọc lại cùng shape', async () => {
    const fixtures = new AdminFixtures(db);
    const { service: catalogService } = await fixtures.catalog();
    const created = await service.create(
      system,
      input({
        ten: '  Chi nhánh\tA ',
        diaChi: 'Đường 50%_! ',
        toaDoLat: '-90.0000000',
        toaDoLng: '180',
        dichVuKhamIds: [catalogService.dichVuKhamId],
      }),
    );
    expect(created).toMatchObject({
      ten: 'Chi nhánh A',
      diaChi: 'Đường 50%_!',
      toaDoLat: '-90.0000000',
      toaDoLng: '180.0000000',
      coYeuCauDangMo: false,
      dichVuKham: [
        { dichVuKhamId: catalogService.dichVuKhamId, ten: catalogService.ten },
      ],
    });
    expect(created.lichHoatDong).toHaveLength(7);
    expect(created.lichHoatDong[0]).toMatchObject({
      thuTrongTuan: 1,
      hoatDong: true,
      sang: { batDau: '08:00:00', ketThuc: '12:00:00' },
      chieu: null,
    });
    expect(created.lichHoatDong[6]).toEqual({
      thuTrongTuan: 7,
      hoatDong: false,
      sang: null,
      chieu: null,
    });
    const counts: { schedules: string | number; services: string | number }[] =
      await db.query(
        `SELECT (SELECT COUNT(*) FROM chi_nhanh_lich_hoat_dong WHERE chi_nhanh_id=?) AS schedules,
                (SELECT COUNT(*) FROM chi_nhanh_dich_vu_kham WHERE chi_nhanh_id=?) AS services`,
        [created.chiNhanhId, created.chiNhanhId],
      );
    expect(Number(counts[0]!.schedules)).toBe(7);
    expect(Number(counts[0]!.services)).toBe(1);
    expect(await repository.get(created.chiNhanhId)).toEqual(created);
  });

  it('CN-12: unknown service không tạo branch, duplicate service được gộp, rỗng cho phép', async () => {
    const { service: catalogService } = await new AdminFixtures(db).catalog();
    await expect(
      service.create(system, input({ dichVuKhamIds: ['9223372036854775807'] })),
    ).rejects.toMatchObject({ status: 404, maLoi: 'KHONG_TIM_THAY' });
    const duplicated = await service.create(
      system,
      input({
        ten: 'Chi nhánh có dịch vụ',
        dichVuKhamIds: [
          catalogService.dichVuKhamId,
          catalogService.dichVuKhamId,
        ],
      }),
    );
    expect(duplicated.dichVuKham).toHaveLength(1);
    const empty = await service.create(
      system,
      input({ ten: 'Chi nhánh không dịch vụ', dichVuKhamIds: [] }),
    );
    expect(empty.dichVuKham).toEqual([]);
    expect((await service.list(system, query())).total).toBe(2);
  });

  it('Q2: cho phép tên chi nhánh trùng', async () => {
    await service.create(system, input({ ten: 'Trùng tên' }));
    await service.create(system, input({ ten: 'Trùng tên' }));
    expect((await service.list(system, query({ q: 'Trùng tên' }))).total).toBe(
      2,
    );
  });

  it('PQ-01…08/11/13: search tên+địa chỉ escape, paging, sort và scope trước total', async () => {
    const fixtures = new AdminFixtures(db);
    const owned = await fixtures.branch({
      ten: 'Branch B',
      diaChi: 'Số 50%_! đường A',
    });
    const other = await fixtures.branch({ ten: 'Branch A', diaChi: 'Đường B' });
    const admin = await fixtures.branch({ ten: 'Branch C', diaChi: 'Đường C' });
    const all = await service.list(system, query({ page: 1, pageSize: 2 }));
    expect(all).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(all.items.map((row) => row.ten)).toEqual(['Branch A', 'Branch B']);
    expect(
      (await service.list(system, query({ page: 2, pageSize: 2 }))).items,
    ).toHaveLength(1);
    expect(await service.list(system, query({ q: '%_!' }))).toMatchObject({
      total: 1,
      items: [{ chiNhanhId: owned.chiNhanhId }],
    });
    expect(await service.list(system, query({ q: 'Branch' }))).toMatchObject({
      total: 3,
    });
    const scoped = { kind: 'ChiNhanh', chiNhanhId: owned.chiNhanhId } as const;
    expect(await service.list(scoped, query())).toMatchObject({
      total: 1,
      items: [{ chiNhanhId: owned.chiNhanhId }],
    });
    await expect(service.get(scoped, other.chiNhanhId)).rejects.toMatchObject({
      status: 404,
      maLoi: 'KHONG_TIM_THAY',
    });
    expect((await service.get(scoped, owned.chiNhanhId)).chiNhanhId).toBe(
      owned.chiNhanhId,
    );
    expect(admin.chiNhanhId).not.toBe(owned.chiNhanhId);
  });

  it('Q3: cờ yêu cầu mở dùng generated dang_mo_chi_nhanh; lịch thiếu giữ trạng thái chưa khai báo', async () => {
    const fixtures = new AdminFixtures(db);
    const branch = await fixtures.branch({ ten: 'Chi nhánh yêu cầu' });
    const admin = await fixtures.admin();
    await db.query(
      `INSERT INTO yeu_cau_thay_doi_chi_nhanh
        (chi_nhanh_id,nguoi_de_xuat_id,noi_dung_truoc,noi_dung_sau,trang_thai)
       VALUES (?,?,JSON_OBJECT('ten','Cu'),JSON_OBJECT('ten','Moi'),'ChoDuyet')`,
      [branch.chiNhanhId, admin.account.taiKhoanId],
    );
    const result = await service.get(system, branch.chiNhanhId);
    expect(result.coYeuCauDangMo).toBe(true);
    expect(result.lichHoatDong).toHaveLength(7);
    expect(result.lichHoatDong[0]).toEqual({
      thuTrongTuan: 1,
      hoatDong: null,
      sang: null,
      chieu: null,
    });
  });

  it('CN-13: lỗi sau khi chèn lịch thứ 5 rollback branch và bốn lịch trước đó', async () => {
    const original = repository.insertSchedule.bind(repository);
    let calls = 0;
    vi.spyOn(repository, 'insertSchedule').mockImplementation(
      async (...args) => {
        await original(...args);
        calls += 1;
        if (calls === 5)
          throw new Error('B7 injected failure at schedule row 5');
      },
    );
    await expect(service.create(system, input())).rejects.toThrow(
      'B7 injected failure at schedule row 5',
    );
    const counts: { branches: string | number; schedules: string | number }[] =
      await db.query(
        `SELECT (SELECT COUNT(*) FROM chi_nhanh) AS branches,
                (SELECT COUNT(*) FROM chi_nhanh_lich_hoat_dong) AS schedules`,
      );
    expect(Number(counts[0]!.branches)).toBe(0);
    expect(Number(counts[0]!.schedules)).toBe(0);
    expect(calls).toBe(5);
  });
});
