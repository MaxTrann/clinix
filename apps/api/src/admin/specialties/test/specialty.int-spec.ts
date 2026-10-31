import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../../database/testing/test-database.js';
import { UploadRepository } from '../../../common/upload/upload.repository.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { AdminFixtures } from '../../testing/admin-fixtures.js';
import { runConcurrently } from '../../testing/test-helpers.js';
import { ChuyenKhoa } from '../../entities/chuyen-khoa.entity.js';
import { BacSi } from '../../entities/bac-si.entity.js';
import { SpecialtyListDto } from '../specialty.dto.js';
import { SpecialtyRepository } from '../specialty.repository.js';
import { SpecialtyService } from '../specialty.service.js';

describe('B1 — CK MySQL thật', () => {
  let db: DataSource;
  let repo: SpecialtyRepository;
  let images: UploadRepository;
  let service: SpecialtyService;
  let fixtures: AdminFixtures;
  let actor: string;
  const system = { kind: 'ToanHeThong' } as const;
  const query = (values: Partial<SpecialtyListDto> = {}) =>
    Object.assign(new SpecialtyListDto(), values);
  const create = (
    ten: string,
    moTa?: string | null,
    imageUploadId?: string | null,
  ) => service.create(system, actor, { ten, moTa, imageUploadId });

  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    repo = new SpecialtyRepository(db);
    images = new UploadRepository(db);
    service = new SpecialtyService(repo, images, new BranchAccessPolicy());
    fixtures = new AdminFixtures(db);
  });
  beforeEach(async () => {
    await resetTables(db);
    actor = (await fixtures.admin()).account.taiKhoanId;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => db?.destroy());

  async function upload(owner = actor, confirmed = true, expired = false) {
    const id = randomUUID();
    const now = new Date();
    await images.createPending(
      id,
      `test/b1/${id}`,
      owner,
      now,
      new Date(now.getTime() + (expired ? -1000 : 86400000)),
    );
    if (confirmed)
      await images.confirm(id, `https://example.test/${id}.webp`, now);
    return id;
  }
  async function imageState(id: string) {
    const rows: { trang_thai: string }[] = await db.query(
      'SELECT trang_thai FROM anh_tai_len WHERE anh_tai_len_id=?',
      [id],
    );
    return rows[0]?.trang_thai;
  }

  it('CK-01/05/12: tạo mặc định, sửa giữ tên và mô tả rỗng/null', async () => {
    const row = await create('  Tim\t mạch  ', 'Mô tả mẫu');
    expect(row).toMatchObject({
      ten: 'Tim mạch',
      moTa: 'Mô tả mẫu',
      anhDaiDien: null,
      trangThaiHoatDong: 'DangHoatDong',
      soBacSi: 0,
    });
    expect(typeof row.chuyenKhoaId).toBe('string');
    const same = await service.update(system, actor, row.chuyenKhoaId, {
      ten: 'Tim mạch',
      moTa: '',
    });
    expect(same.moTa).toBeNull();
    expect(
      (
        await service.update(system, actor, row.chuyenKhoaId, {
          moTa: 'Giữ nguyên\n khoảng trắng',
        })
      ).ten,
    ).toBe('Tim mạch');
    expect(
      (await service.update(system, actor, row.chuyenKhoaId, { moTa: null }))
        .moTa,
    ).toBeNull();
  });

  it('CK-03/04: UNIQUE tên y hệt, hoa/thường, dấu và khoảng trắng', async () => {
    await create('Tim mạch');
    for (const name of ['Tim mạch', 'TIM MẠCH', 'Tim mach', '  Tim  mach\n'])
      await expect(create(name)).rejects.toMatchObject({
        maLoi: 'TEN_CHUYEN_KHOA_TRUNG',
        status: 409,
      });
    expect(await db.getRepository(ChuyenKhoa).count()).toBe(1);
  });

  it('CK-06: sửa sang tên trùng không lưu phần khác; đổi tên hợp lệ rồi gửi lại', async () => {
    await create('Tim mạch');
    const row = await create('Nội', 'Trước');
    await expect(
      service.update(system, actor, row.chuyenKhoaId, {
        ten: 'Tim mach',
        moTa: 'Không lưu',
      }),
    ).rejects.toMatchObject({ maLoi: 'TEN_CHUYEN_KHOA_TRUNG' });
    expect(await service.get(system, row.chuyenKhoaId)).toMatchObject({
      ten: 'Nội',
      moTa: 'Trước',
    });
    expect(
      await service.update(system, actor, row.chuyenKhoaId, {
        ten: 'Nội tổng quát',
        moTa: 'Sau',
      }),
    ).toMatchObject({ ten: 'Nội tổng quát', moTa: 'Sau' });
  });

  it('CK-07/08/09/17: ngừng/bật idempotent, giữ bác sĩ/số đếm toàn hệ thống', async () => {
    const specialty = await create('Có bác sĩ');
    const a = await fixtures.branch();
    const b = await fixtures.branch();
    const doctorA = await fixtures.doctor(a, {
      chuyenKhoaId: specialty.chuyenKhoaId,
    });
    const doctorB = await fixtures.doctor(
      b,
      { chuyenKhoaId: specialty.chuyenKhoaId },
      { trangThai: 'NgungHoatDong' },
    );
    for (const status of [
      'NgungHoatDong',
      'NgungHoatDong',
      'DangHoatDong',
    ] as const) {
      const result = await service.setStatus(system, specialty.chuyenKhoaId, {
        trangThaiHoatDong: status,
      });
      expect(result).toMatchObject({ trangThaiHoatDong: status, soBacSi: 2 });
      for (const doctor of [doctorA, doctorB])
        expect(
          (
            await db
              .getRepository(BacSi)
              .findOneByOrFail({ taiKhoanId: doctor.account.taiKhoanId })
          ).chuyenKhoaId,
        ).toBe(specialty.chuyenKhoaId);
    }
    const local = { kind: 'ChiNhanh', chiNhanhId: a.chiNhanhId } as const;
    expect((await service.get(local, specialty.chuyenKhoaId)).soBacSi).toBe(2);
  });

  it('CK-10: hai create đồng thời cùng tên, một dòng và một lỗi nghiệp vụ', async () => {
    // Bỏ precheck trong test để buộc nhánh lỗi UNIQUE thật, thay vì chỉ thắng ở precheck.
    vi.spyOn(repo, 'nameExists').mockResolvedValue(false);
    const results = await runConcurrently([
      () => create('Race Tim'),
      () => create('Race Tim'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({
      reason: { maLoi: 'TEN_CHUYEN_KHOA_TRUNG', status: 409 },
    });
    expect(
      await db.getRepository(ChuyenKhoa).countBy({ ten: 'Race Tim' }),
    ).toBe(1);
  });

  it('CK-06/10: hai update đồng thời cùng tên đích, không 500 và không lưu một phần', async () => {
    const a = await create('A');
    const b = await create('B');
    vi.spyOn(repo, 'nameExists').mockResolvedValue(false);
    const results = await runConcurrently([
      () =>
        service.update(system, actor, a.chuyenKhoaId, {
          ten: 'Race',
          moTa: 'A mới',
        }),
      () =>
        service.update(system, actor, b.chuyenKhoaId, {
          ten: 'Race',
          moTa: 'B mới',
        }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({ reason: { maLoi: 'TEN_CHUYEN_KHOA_TRUNG' } });
    const remaining = await service.list(system, query());
    expect(remaining.items.filter((item) => item.ten === 'Race')).toHaveLength(
      1,
    );
    expect(
      remaining.items.find((item) => item.ten !== 'Race')?.moTa,
    ).toBeNull();
  });

  it('CK-16/17: list tìm tên/mô tả, filter, stable paging, total và page quá cuối', async () => {
    const rows = [
      await create('A', 'dấu tìm'),
      await create('B', 'dấu tìm'),
      await create('C', 'khác'),
    ];
    await service.setStatus(system, rows[1]!.chuyenKhoaId, {
      trangThaiHoatDong: 'NgungHoatDong',
    });
    const page = await service.list(
      system,
      query({ q: 'dau tim', page: 2, pageSize: 1 }),
    );
    expect(page).toMatchObject({
      total: 2,
      page: 2,
      pageSize: 1,
      items: [{ ten: 'B' }],
    });
    expect(
      (
        await service.list(
          system,
          query({ q: 'dau tim', trangThaiHoatDong: 'DangHoatDong' }),
        )
      ).items.map((item) => item.ten),
    ).toEqual(['A']);
    expect(await service.list(system, query({ page: 10 }))).toMatchObject({
      items: [],
      total: 3,
    });
    expect(
      await service.options(system, query({ pageSize: 1, page: 2 })),
    ).toEqual({
      items: [{ chuyenKhoaId: rows[2]!.chuyenKhoaId, ten: 'C' }],
      total: 2,
      page: 2,
      pageSize: 1,
    });
  });

  it('CK-17: wildcard %, _ và ! là ký tự literal, query injection không mở rộng kết quả', async () => {
    await create('A', '50%_!');
    await create('B', '50xx');
    for (const q of ['%', '_', '!'])
      expect(
        (await service.list(system, query({ q }))).items.map(
          (item) => item.ten,
        ),
      ).toEqual(['A']);
    expect(
      (await service.list(system, query({ q: "' OR 1=1 --" }))).total,
    ).toBe(0);
  });

  it('CK-11/14: create gắn ảnh, JOIN URL, PATCH bỏ trường giữ, thay/gỡ ảnh không hồi sinh legacy', async () => {
    const a = await upload();
    const row = await create('Ảnh', undefined, a);
    expect(row.anhDaiDien).toBe(`https://example.test/${a}.webp`);
    expect(await imageState(a)).toBe('DaGan');
    expect(
      (
        await service.update(system, actor, row.chuyenKhoaId, {
          ten: 'Ảnh giữ',
        })
      ).anhDaiDien,
    ).toBe(row.anhDaiDien);
    expect(
      (
        await service.update(system, actor, row.chuyenKhoaId, {
          imageUploadId: a,
        })
      ).anhDaiDien,
    ).toBe(row.anhDaiDien);
    const b = await upload();
    expect(
      (
        await service.update(system, actor, row.chuyenKhoaId, {
          imageUploadId: b,
        })
      ).anhDaiDien,
    ).toBe(`https://example.test/${b}.webp`);
    expect(await imageState(a)).toBe('ChoXoa');
    expect(await imageState(b)).toBe('DaGan');
    expect(
      (
        await service.update(system, actor, row.chuyenKhoaId, {
          imageUploadId: null,
        })
      ).anhDaiDien,
    ).toBeNull();
    expect(await imageState(b)).toBe('ChoXoa');
    const legacy = await create('Legacy');
    await db.getRepository(ChuyenKhoa).update(legacy.chuyenKhoaId, {
      anhDaiDien: 'https://example.test/legacy.png',
    });
    expect(
      (await service.get(system, legacy.chuyenKhoaId)).anhDaiDien,
    ).toContain('legacy.png');
    expect(
      (
        await service.update(system, actor, legacy.chuyenKhoaId, {
          imageUploadId: null,
        })
      ).anhDaiDien,
    ).toBeNull();
  });

  it('CK-11/14: sai chủ/chưa xác nhận/hết hạn/đã gắn/không tồn tại rollback tên và ảnh cũ', async () => {
    const a = await upload();
    const row = await create('Giữ', 'Mô tả giữ', a);
    const other = (await fixtures.admin()).account.taiKhoanId;
    const attached = await upload();
    await create('Đã gắn', undefined, attached);
    const invalid = [
      await upload(other),
      await upload(actor, false),
      await upload(actor, true, true),
      attached,
      randomUUID(),
    ];
    for (const imageUploadId of invalid) {
      await expect(
        service.update(system, actor, row.chuyenKhoaId, {
          ten: 'Không lưu',
          moTa: 'Không lưu',
          imageUploadId,
        }),
      ).rejects.toMatchObject({ maLoi: 'ANH_TAI_LEN_KHONG_HOP_LE' });
      expect(await service.get(system, row.chuyenKhoaId)).toMatchObject({
        ten: 'Giữ',
        moTa: 'Mô tả giữ',
        anhDaiDien: row.anhDaiDien,
      });
      expect(await imageState(a)).toBe('DaGan');
    }
    await expect(create('Tạo lỗi', undefined, invalid[0])).rejects.toThrow();
    expect(await db.getRepository(ChuyenKhoa).countBy({ ten: 'Tạo lỗi' })).toBe(
      0,
    );
  });

  it('CK-14: ép lỗi sau ghi toàn bộ ảnh; rollback cả tên/mô tả/FK/ledger', async () => {
    const a = await upload();
    const b = await upload();
    const row = await create('Trước', 'Giữ', a);
    const assign = images.assignSpecialty.bind(images);
    vi.spyOn(images, 'assignSpecialty').mockImplementation(async (...args) => {
      await assign(...args);
      throw new Error('B1 injected after image write');
    });
    await expect(
      service.update(system, actor, row.chuyenKhoaId, {
        ten: 'Sau',
        moTa: 'Không lưu',
        imageUploadId: b,
      }),
    ).rejects.toThrow('B1 injected after image write');
    expect(await service.get(system, row.chuyenKhoaId)).toMatchObject({
      ten: 'Trước',
      moTa: 'Giữ',
      anhDaiDien: row.anhDaiDien,
    });
    expect(await imageState(a)).toBe('DaGan');
    expect(await imageState(b)).toBe('ChuaGan');
    await expect(create('Tạo rollback', undefined, b)).rejects.toThrow();
    expect(
      await db.getRepository(ChuyenKhoa).countBy({ ten: 'Tạo rollback' }),
    ).toBe(0);
    expect(await imageState(b)).toBe('ChuaGan');
  });

  it('CK-11/14: hai chuyên khoa tranh một upload chỉ một được gắn', async () => {
    const image = await upload();
    const results = await runConcurrently([
      () => create('Ảnh A', undefined, image),
      () => create('Ảnh B', undefined, image),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({ reason: { maLoi: 'ANH_TAI_LEN_KHONG_HOP_LE' } });
    expect(await db.getRepository(ChuyenKhoa).count()).toBe(1);
    expect(await imageState(image)).toBe('DaGan');
  });

  it('CK-11/14: chạy đua gắn ảnh hết hạn với cleanup không để ảnh bị gắn sau khi nhận xóa', async () => {
    const image = await upload(actor, true, true);
    const results = await runConcurrently<unknown>([
      () => create('Hết hạn', undefined, image),
      () => images.claimCleanup(new Date()),
    ]);
    expect(results[0]).toMatchObject({
      status: 'rejected',
      reason: { maLoi: 'ANH_TAI_LEN_KHONG_HOP_LE' },
    });
    expect(results[1]).toMatchObject({ status: 'fulfilled' });
    expect(await imageState(image)).toBe('ChoXoa');
    expect(await db.getRepository(ChuyenKhoa).count()).toBe(0);
  });

  it('CK-13/14: không tồn tại đồng nhất 404, bigint vượt Number giữ đúng', async () => {
    await expect(service.get(system, '999')).rejects.toMatchObject({
      status: 404,
      maLoi: 'KHONG_TIM_THAY',
    });
    await expect(
      service.update(system, actor, '999', { ten: 'X' }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.setStatus(system, '999', { trangThaiHoatDong: 'DangHoatDong' }),
    ).rejects.toMatchObject({ status: 404 });
    await db.query('ALTER TABLE chuyen_khoa AUTO_INCREMENT=9007199254740993');
    const large = await create('Bigint');
    expect(large.chuyenKhoaId).toBe('9007199254740993');
    expect(
      (
        await service.update(system, actor, large.chuyenKhoaId, {
          ten: 'Bigint giữ',
        })
      ).chuyenKhoaId,
    ).toBe(large.chuyenKhoaId);
  });
});
