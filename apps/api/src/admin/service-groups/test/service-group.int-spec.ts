import 'reflect-metadata';
import type { DataSource, EntityManager } from 'typeorm';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../../database/testing/test-database.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { ServiceGroupListDto } from '../service-group.dto.js';
import { ServiceGroupRepository } from '../service-group.repository.js';
import { ServiceGroupService } from '../service-group.service.js';

describe('B2 DV — MySQL thật', () => {
  let db: DataSource;
  let repo: ServiceGroupRepository;
  let service: ServiceGroupService;
  const system = { kind: 'ToanHeThong' } as const;
  const query = (values: Partial<ServiceGroupListDto> = {}) =>
    Object.assign(new ServiceGroupListDto(), values);
  const create = (ten: string, thuTuHienThi?: number) =>
    service.create(system, { ten, thuTuHienThi });
  const addService = (id: string) =>
    db.query(
      'INSERT INTO dich_vu_kham (nhom_dich_vu_id,ten,thoi_luong,gia_mac_dinh) VALUES (?, ?, 30, 100)',
      [id, 'Dịch vụ mẫu'],
    );
  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    repo = new ServiceGroupRepository(db);
    service = new ServiceGroupService(repo, new BranchAccessPolicy());
  });
  beforeEach(async () => resetTables(db));
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => db?.destroy());

  it('DV-01/04: tạo mặc định, chuẩn hóa, sửa riêng tên/thứ tự, tự sửa tên', async () => {
    const row = await create(' Khám\t chuyên khoa ');
    expect(row).toEqual({
      nhomDichVuId: expect.any(String),
      ten: 'Khám chuyên khoa',
      thuTuHienThi: 0,
    });
    expect(
      await service.update(system, row.nhomDichVuId, {
        thuTuHienThi: 2147483647,
      }),
    ).toMatchObject({ ten: row.ten, thuTuHienThi: 2147483647 });
    expect(
      await service.update(system, row.nhomDichVuId, {
        ten: ' Khám chuyên khoa ',
      }),
    ).toMatchObject({ thuTuHienThi: 2147483647 });
    expect(
      await service.update(system, row.nhomDichVuId, { thuTuHienThi: 0 }),
    ).toMatchObject({ thuTuHienThi: 0 });
  });
  it('DV-03/04: trùng tên hoa/thường/dấu/space, sửa trùng rollback thứ tự', async () => {
    await create('Khám tổng quát');
    for (const ten of ['KHÁM TỔNG QUÁT', 'Kham tong quat', ' Kham  tong quat '])
      await expect(create(ten)).rejects.toMatchObject({
        maLoi: 'TEN_NHOM_DICH_VU_TRUNG',
        status: 409,
      });
    const row = await create('Nhóm B', 5);
    await expect(
      service.update(system, row.nhomDichVuId, {
        ten: 'Kham tong quat',
        thuTuHienThi: 9,
      }),
    ).rejects.toMatchObject({ maLoi: 'TEN_NHOM_DICH_VU_TRUNG' });
    expect(await repo.get(db.manager, row.nhomDichVuId)).toMatchObject({
      ten: 'Nhóm B',
      thuTuHienThi: 5,
    });
  });
  it('DV-03: race create chạm UNIQUE thật, một thắng một 409', async () => {
    vi.spyOn(repo, 'nameExists').mockResolvedValue(false);
    const results = await Promise.allSettled([create('Race'), create('Race')]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((x) => x.status === 'rejected')).toMatchObject({
      reason: { status: 409, maLoi: 'TEN_NHOM_DICH_VU_TRUNG' },
    });
    expect((await service.list(system, query())).total).toBe(1);
  });
  it('DV-03/04: race hai update cùng tên không lưu phần thứ tự của bên thua', async () => {
    const a = await create('A', 1),
      b = await create('B', 2);
    vi.spyOn(repo, 'nameExists').mockResolvedValue(false);
    const results = await Promise.allSettled([
      service.update(system, a.nhomDichVuId, { ten: 'Race', thuTuHienThi: 9 }),
      service.update(system, b.nhomDichVuId, { ten: 'Race', thuTuHienThi: 9 }),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((x) => x.status === 'rejected')).toMatchObject({
      reason: { maLoi: 'TEN_NHOM_DICH_VU_TRUNG' },
    });
    const rows = (await service.list(system, query())).items;
    expect(rows.find((x) => x.ten !== 'Race')).toMatchObject({
      thuTuHienThi: expect.any(Number),
    });
    expect([1, 2]).toContain(rows.find((x) => x.ten !== 'Race')!.thuTuHienThi);
  });
  it('DV-05/06: xóa nhóm rỗng 204 consumer; nhóm còn dịch vụ 409, dữ liệu giữ', async () => {
    const empty = await create('Rỗng');
    await service.remove(system, empty.nhomDichVuId);
    expect(await repo.get(db.manager, empty.nhomDichVuId)).toBeNull();
    const used = await create('Có dịch vụ');
    await addService(used.nhomDichVuId);
    await expect(
      service.remove(system, used.nhomDichVuId),
    ).rejects.toMatchObject({ status: 409, maLoi: 'NHOM_DICH_VU_CON_DICH_VU' });
    expect(await repo.get(db.manager, used.nhomDichVuId)).not.toBeNull();
  });
  it('DV-06: bỏ precheck vẫn map FK MySQL thật thành 409', async () => {
    const row = await create('FK');
    await addService(row.nhomDichVuId);
    vi.spyOn(repo, 'hasServices').mockResolvedValue(false);
    await expect(
      service.remove(system, row.nhomDichVuId),
    ).rejects.toMatchObject({ status: 409, maLoi: 'NHOM_DICH_VU_CON_DICH_VU' });
    expect(await repo.get(db.manager, row.nhomDichVuId)).not.toBeNull();
  });
  it('DV-06: insert dịch vụ commit trước khóa xóa ⇒ 409, không orphan', async () => {
    const row = await create('Race insert');
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(
        'INSERT INTO dich_vu_kham (nhom_dich_vu_id,ten,thoi_luong,gia_mac_dinh) VALUES (?, ?, 30,100)',
        [row.nhomDichVuId, 'Dịch vụ race'],
      );
      let signal!: () => void;
      const reached = new Promise<void>((resolve) => {
        signal = resolve;
      });
      const lock = repo.lock.bind(repo);
      vi.spyOn(repo, 'lock').mockImplementation((...args) => {
        signal();
        return lock(...args);
      });
      const pending = service.remove(system, row.nhomDichVuId);
      const result = Promise.allSettled([pending]);
      await reached;
      await runner.commitTransaction();
      expect((await result)[0]).toMatchObject({
        status: 'rejected',
        reason: { maLoi: 'NHOM_DICH_VU_CON_DICH_VU' },
      });
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });
  it('DV-06: nhóm bị khóa xóa trước insert ⇒ insert bị FK chặn sau commit', async () => {
    const row = await create('Race delete');
    const remove = repo.remove.bind(repo);
    let inserted: Promise<PromiseSettledResult<unknown>[]> | undefined;
    vi.spyOn(repo, 'remove').mockImplementation(async (manager, id) => {
      inserted = Promise.allSettled([addService(id)]);
      await remove(manager, id);
    });
    await service.remove(system, row.nhomDichVuId);
    expect((await inserted!)[0]).toMatchObject({
      status: 'rejected',
      reason: { driverError: { code: 'ER_NO_REFERENCED_ROW_2' } },
    });
    const counts: { n: string | number }[] = await db.query(
      'SELECT COUNT(*) AS n FROM dich_vu_kham',
    );
    expect(Number(counts[0]!.n)).toBe(0);
  });
  it('DV-04/05: lỗi sau update/delete rollback toàn bộ', async () => {
    const row = await create('Giữ', 3);
    const update = repo.update.bind(repo);
    vi.spyOn(repo, 'update').mockImplementation(async (...args) => {
      await update(...args);
      throw new Error('B2 rollback');
    });
    await expect(
      service.update(system, row.nhomDichVuId, {
        ten: 'Không lưu',
        thuTuHienThi: 9,
      }),
    ).rejects.toThrow('B2 rollback');
    expect(await repo.get(db.manager, row.nhomDichVuId)).toEqual(row);
    const remove = repo.remove.bind(repo);
    vi.spyOn(repo, 'remove').mockImplementation(async (...args) => {
      await remove(...args);
      throw new Error('B2 rollback');
    });
    await expect(service.remove(system, row.nhomDichVuId)).rejects.toThrow(
      'B2 rollback',
    );
    expect(await repo.get(db.manager, row.nhomDichVuId)).toEqual(row);
  });
  it('DV-16: sort, paging/total, q escape và injection, danh mục hai scope như nhau', async () => {
    await create('B', 0);
    await create('A', 0);
    await create('C 50%_!', 1);
    const page = await service.list(system, query({ page: 2, pageSize: 1 }));
    expect(page).toMatchObject({
      page: 2,
      pageSize: 1,
      total: 3,
      items: [{ ten: 'B' }],
    });
    for (const q of ['%', '_', '!'])
      expect(await service.list(system, query({ q }))).toMatchObject({
        total: 1,
        items: [{ ten: 'C 50%_!' }],
      });
    expect(
      (await service.list(system, query({ q: "' OR 1=1 --" }))).total,
    ).toBe(0);
    expect(await service.list(system, query({ page: 99 }))).toMatchObject({
      total: 3,
      items: [],
    });
    expect(
      await service.list({ kind: 'ChiNhanh', chiNhanhId: '999' }, query()),
    ).toEqual(await service.list(system, query()));
  });
  it('DV-04/05: missing 404, bigint vượt Number safe giữ chính xác', async () => {
    await expect(
      service.update(system, '999', { ten: 'X' }),
    ).rejects.toMatchObject({ status: 404, maLoi: 'KHONG_TIM_THAY' });
    await expect(service.remove(system, '999')).rejects.toMatchObject({
      status: 404,
    });
    await db.query('ALTER TABLE nhom_dich_vu AUTO_INCREMENT=9007199254740993');
    const row = await create('Bigint');
    expect(row.nhomDichVuId).toBe('9007199254740993');
    expect(
      await service.update(system, row.nhomDichVuId, { ten: 'Bigint sửa' }),
    ).toMatchObject({ nhomDichVuId: row.nhomDichVuId });
    await service.remove(system, row.nhomDichVuId);
    await expect(
      service.remove(system, row.nhomDichVuId),
    ).rejects.toMatchObject({ status: 404 });
  });

  describe('PR3-A05: số dịch vụ theo nhóm (soDichVu)', () => {
    // Tên dịch vụ phải khác nhau trong cùng nhóm (UNIQUE nhóm + tên)
    const addServices = async (id: string, count: number) => {
      for (let index = 1; index <= count; index += 1)
        await db.query(
          'INSERT INTO dich_vu_kham (nhom_dich_vu_id,ten,thoi_luong,gia_mac_dinh) VALUES (?, ?, 30, 100)',
          [id, `Dịch vụ ${index}`],
        );
    };
    const counts = (items: { ten: string; soDichVu: number }[]) =>
      items.map(({ ten, soDichVu }) => ({ ten, soDichVu }));

    it('nhóm 0, 1, nhiều dịch vụ: nhóm rỗng KHÔNG biến mất, hai nhóm không đếm chéo', async () => {
      await create('Rỗng', 1);
      const one = await create('Một', 2);
      const many = await create('Nhiều', 3);
      await addServices(one.nhomDichVuId, 1);
      await addServices(many.nhomDichVuId, 3);

      const { items, total } = await service.list(system, query());

      expect(total).toBe(3);
      expect(counts(items)).toEqual([
        { ten: 'Rỗng', soDichVu: 0 },
        { ten: 'Một', soDichVu: 1 },
        { ten: 'Nhiều', soDichVu: 3 },
      ]);
      for (const item of items) expect(typeof item.soDichVu).toBe('number');
    });

    it('total là số NHÓM (không phải số dịch vụ), trang 2 và lọc q vẫn đúng số của từng nhóm', async () => {
      const a = await create('A', 0);
      const b = await create('B', 1);
      const c = await create('C 50%_!', 2);
      await addServices(a.nhomDichVuId, 2);
      await addServices(b.nhomDichVuId, 2);
      await addServices(c.nhomDichVuId, 1);

      expect(
        await service.list(system, query({ page: 2, pageSize: 1 })),
      ).toMatchObject({
        total: 3,
        page: 2,
        pageSize: 1,
        items: [{ ten: 'B', soDichVu: 2 }],
      });
      for (const q of ['%', '_', '!'])
        expect(await service.list(system, query({ q }))).toMatchObject({
          total: 1,
          items: [{ ten: 'C 50%_!', soDichVu: 1 }],
        });
      expect(
        await service.list(system, query({ q: "' OR 1=1 --" })),
      ).toMatchObject({ total: 0, items: [] });
    });

    it('số được đếm lúc đọc: thêm một dịch vụ thì tăng 1, xoá thì giảm 1', async () => {
      const row = await create('Đổi số');
      const soDichVu = async () =>
        (await service.list(system, query())).items[0]!.soDichVu;
      expect(await soDichVu()).toBe(0);
      await addServices(row.nhomDichVuId, 2);
      expect(await soDichVu()).toBe(2);
      await db.query(
        'DELETE FROM dich_vu_kham WHERE nhom_dich_vu_id=? AND ten=?',
        [row.nhomDichVuId, 'Dịch vụ 1'],
      );
      expect(await soDichVu()).toBe(1);
    });

    it('thứ tự ổn định khi phân trang: nhiều nhóm cùng thứ tự, ghép các trang không trùng không sót', async () => {
      for (let index = 1; index <= 5; index += 1) {
        const row = await create(`G${index}`, 0);
        await addServices(row.nhomDichVuId, index - 1);
      }
      const pages = [
        await service.list(system, query({ page: 1, pageSize: 2 })),
        await service.list(system, query({ page: 2, pageSize: 2 })),
        await service.list(system, query({ page: 3, pageSize: 2 })),
      ];
      expect(counts(pages.flatMap((page) => page.items))).toEqual([
        { ten: 'G1', soDichVu: 0 },
        { ten: 'G2', soDichVu: 1 },
        { ten: 'G3', soDichVu: 2 },
        { ten: 'G4', soDichVu: 3 },
        { ten: 'G5', soDichVu: 4 },
      ]);
      expect(pages.map((page) => page.total)).toEqual([5, 5, 5]);
    });

    it('id bigint vượt Number safe giữ chính xác trong danh sách có đếm', async () => {
      await db.query(
        'ALTER TABLE nhom_dich_vu AUTO_INCREMENT=9007199254740993',
      );
      const row = await create('Bigint đếm');
      await addServices(row.nhomDichVuId, 2);
      expect((await service.list(system, query())).items).toEqual([
        {
          nhomDichVuId: '9007199254740993',
          ten: 'Bigint đếm',
          thuTuHienThi: 0,
          soDichVu: 2,
        },
      ]);
    });

    it.each([1, 25])(
      'số câu SQL của list không phụ thuộc số nhóm: %i nhóm đều đúng 2 câu (không N+1)',
      async (groupCount) => {
        for (let index = 1; index <= groupCount; index += 1) {
          const row = await create(`Nhóm ${String(index).padStart(2, '0')}`, 0);
          await addServices(row.nhomDichVuId, index % 3);
        }
        const statements: string[] = [];
        // Chỉ bọc `manager.query` của giao dịch đọc, chạy câu thật bên dưới
        const counting = new ServiceGroupRepository({
          transaction: (
            level: 'REPEATABLE READ',
            work: (manager: EntityManager) => Promise<unknown>,
          ) =>
            db.transaction(level, (manager) => {
              const original = manager.query.bind(manager);
              manager.query = ((sql: string, parameters?: unknown[]) => {
                statements.push(sql);
                return original(sql, parameters);
              }) as typeof manager.query;
              return work(manager);
            }),
        } as unknown as DataSource);

        const result = await counting.list(query({ pageSize: 100 }));

        expect(result.items).toHaveLength(groupCount);
        expect(statements).toHaveLength(2);
        expect(result.items.map((item) => item.soDichVu)).toEqual(
          Array.from({ length: groupCount }, (_x, i) => (i + 1) % 3),
        );
      },
    );

    it('create/update vẫn trả đúng ba khoá, không có soDichVu', async () => {
      const row = await create('Ba khoá', 4);
      expect(Object.keys(row).sort()).toEqual([
        'nhomDichVuId',
        'ten',
        'thuTuHienThi',
      ]);
      expect(
        Object.keys(
          await service.update(system, row.nhomDichVuId, {
            ten: 'Ba khoá đổi',
          }),
        ).sort(),
      ).toEqual(['nhomDichVuId', 'ten', 'thuTuHienThi']);
    });
  });
});
