import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../../../database/testing/test-database.js';
import { todayVN } from '../../../common/time/time.js';
import { AdminFixtures } from '../../testing/admin-fixtures.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { ServiceListDto } from '../service.dto.js';
import { ServiceRepository } from '../service.repository.js';
import { ServiceService } from '../service.service.js';

describe('B3 DV — MySQL thật', () => {
  let db: DataSource;
  let repo: ServiceRepository;
  let service: ServiceService;
  let fixtures: AdminFixtures;
  let groupId: string;
  const system = { kind: 'ToanHeThong' } as const;
  const query = (values: Partial<ServiceListDto> = {}) =>
    Object.assign(new ServiceListDto(), values);
  const create = (
    ten: string,
    nhomDichVuId = groupId,
    overrides: Partial<{
      thoiLuong: number;
      giaMacDinh: string;
    }> = {},
  ) =>
    service.create(system, {
      nhomDichVuId,
      ten,
      thoiLuong: 30,
      giaMacDinh: '100.00',
      ...overrides,
    });
  const shiftedDay = (offset: number): string => {
    const [year, month, day] = todayVN().split('-').map(Number);
    const date = new Date(Date.UTC(year!, month! - 1, day! + offset));
    return date.toISOString().slice(0, 10);
  };

  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    repo = new ServiceRepository(db);
    service = new ServiceService(repo, new BranchAccessPolicy());
  });
  beforeEach(async () => {
    await resetTables(db);
    fixtures = new AdminFixtures(db);
    groupId = (await fixtures.catalog()).group.nhomDichVuId;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => db?.destroy());

  it('DV-07/08/09/10/11: tạo đủ field, nhóm không tồn tại trả400', async () => {
    const row = await create(' Khám\t tổng quát ', groupId, {
      thoiLuong: 45,
      giaMacDinh: '250.50',
    });
    expect(row).toMatchObject({
      dichVuKhamId: expect.any(String),
      nhomDichVuId: groupId,
      tenNhom: expect.any(String),
      ten: 'Khám tổng quát',
      thoiLuong: 45,
      giaMacDinh: '250.50',
    });
    await expect(
      create('Nhóm thiếu', '9223372036854775807'),
    ).rejects.toMatchObject({
      status: 400,
      maLoi: 'NHOM_DICH_VU_KHONG_TON_TAI',
    });
  });

  it('DV-15: chuẩn hóa và collation chặn trùng cùng nhóm, cho phép nhóm khác', async () => {
    await create('Khám tổng quát');
    await expect(create(' KHAM  TONG QUAT ')).rejects.toMatchObject({
      status: 409,
      maLoi: 'TEN_DICH_VU_TRUNG',
    });
    const other = await fixtures.catalog();
    await expect(
      create('Kham tong quat', other.group.nhomDichVuId),
    ).resolves.toMatchObject({ ten: 'Kham tong quat' });
  });

  it('DV-13/15/20: đổi nhóm, tên tự sửa và race UNIQUE thật', async () => {
    const first = await create('Tên đầu');
    const secondGroup = await fixtures.catalog();
    await expect(
      service.update(system, first.dichVuKhamId, {
        nhomDichVuId: secondGroup.group.nhomDichVuId,
        ten: 'Tên đầu',
      }),
    ).resolves.toMatchObject({
      nhomDichVuId: secondGroup.group.nhomDichVuId,
      ten: 'Tên đầu',
    });

    const original = repo.nameExists.bind(repo);
    vi.spyOn(repo, 'nameExists').mockImplementation(async (...args) => {
      if (args[1] === 'Race') return false;
      return original(...args);
    });
    const results = await Promise.allSettled([create('Race'), create('Race')]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === 'rejected'),
    ).toMatchObject({
      reason: { status: 409, maLoi: 'TEN_DICH_VU_TRUNG' },
    });
  });

  it('DV-07/12/13/16: GET detail/list, paging, group sort, escaped search, scope chung', async () => {
    const second = await fixtures.catalog();
    await db.query(
      'UPDATE nhom_dich_vu SET thu_tu_hien_thi=1 WHERE nhom_dich_vu_id=?',
      [second.group.nhomDichVuId],
    );
    await create('B');
    await create('A');
    const special = await create('C 50%_!', second.group.nhomDichVuId);
    const page = await service.list(system, query({ page: 2, pageSize: 1 }));
    expect(page).toMatchObject({
      page: 2,
      pageSize: 1,
      items: [{ ten: 'B' }],
    });
    expect(page.total).toBe(5);
    for (const q of ['%', '_', '!'])
      expect(await service.list(system, query({ q }))).toMatchObject({
        total: 1,
        items: [{ dichVuKhamId: special.dichVuKhamId }],
      });
    expect(
      (await service.list(system, query({ q: "' OR 1=1 --" }))).total,
    ).toBe(0);
    await expect(service.get(system, special.dichVuKhamId)).resolves.toEqual(
      special,
    );
    await expect(
      service.get(
        { kind: 'ChiNhanh', chiNhanhId: '999' },
        special.dichVuKhamId,
      ),
    ).resolves.toEqual(special);
    await expect(
      service.list({ kind: 'ChiNhanh', chiNhanhId: '999' }, query()),
    ).resolves.toEqual(await service.list(system, query()));
  });

  it('DV-14: chặn đổi thời lượng khi còn lịch hẹn hoạt động; tên/giá vẫn được sửa', async () => {
    const branch = await fixtures.branch();
    const doctor = await fixtures.doctor(branch);
    const patient = await fixtures.patient();
    const shift = await fixtures.shift(doctor.profile, {
      ngay: shiftedDay(-2),
    });
    const slot = await fixtures.slot(shift, {
      ngayGio: new Date(`${shiftedDay(-2)}T08:00:00+07:00`),
    });
    const appointment = await fixtures.appointment(
      doctor.profile,
      slot,
      patient.profile.taiKhoanId,
      { giaSnapshot: '123.45', trangThai: 'DaXacNhan' },
    );

    await expect(
      service.update(system, doctor.profile.dichVuKhamId, { thoiLuong: 45 }),
    ).rejects.toMatchObject({ status: 409, maLoi: 'THOI_LUONG_DANG_DUNG' });
    await expect(
      service.update(system, doctor.profile.dichVuKhamId, {
        ten: 'Tên được sửa',
        giaMacDinh: '200.00',
      }),
    ).resolves.toMatchObject({ ten: 'Tên được sửa', giaMacDinh: '200.00' });
    const snapshots: { giaSnapshot: string; giaMacDinh: string }[] =
      await db.query(
        'SELECT h.gia_snapshot AS giaSnapshot, s.gia_mac_dinh AS giaMacDinh FROM lich_hen h INNER JOIN dich_vu_kham s ON s.dich_vu_kham_id=h.dich_vu_kham_id WHERE h.lich_hen_id=?',
        [appointment.lichHenId],
      );
    expect(snapshots[0]).toEqual({
      giaSnapshot: '123.45',
      giaMacDinh: '200.00',
    });
  });

  it('DV-14: chặn đổi thời lượng khi bác sĩ có khung giờ tương lai', async () => {
    const branch = await fixtures.branch();
    const doctor = await fixtures.doctor(branch);
    const shift = await fixtures.shift(doctor.profile, { ngay: shiftedDay(1) });
    await fixtures.slot(shift);
    await expect(
      service.update(system, doctor.profile.dichVuKhamId, { thoiLuong: 45 }),
    ).rejects.toMatchObject({ status: 409, maLoi: 'THOI_LUONG_DANG_DUNG' });
  });

  it('DV-14: lịch đã hoàn tất và khung giờ quá khứ không chặn đổi thời lượng', async () => {
    const branch = await fixtures.branch();
    const doctor = await fixtures.doctor(branch);
    const patient = await fixtures.patient();
    const shift = await fixtures.shift(doctor.profile, {
      ngay: shiftedDay(-2),
    });
    const slot = await fixtures.slot(shift, {
      ngayGio: new Date(`${shiftedDay(-2)}T08:00:00+07:00`),
    });
    await fixtures.appointment(
      doctor.profile,
      slot,
      patient.profile.taiKhoanId,
      { trangThai: 'HoanThanh' },
    );
    await expect(
      service.update(system, doctor.profile.dichVuKhamId, { thoiLuong: 45 }),
    ).resolves.toMatchObject({ thoiLuong: 45 });
  });

  it('DV-14: lỗi sau UPDATE rollback toàn bộ dịch vụ', async () => {
    const row = await create('Giữ nguyên');
    const update = repo.update.bind(repo);
    vi.spyOn(repo, 'update').mockImplementation(async (...args) => {
      await update(...args);
      throw new Error('B3 rollback');
    });
    await expect(
      service.update(system, row.dichVuKhamId, {
        ten: 'Không lưu',
        giaMacDinh: '999.00',
      }),
    ).rejects.toThrow('B3 rollback');
    await expect(service.get(system, row.dichVuKhamId)).resolves.toMatchObject({
      ten: 'Giữ nguyên',
      giaMacDinh: '100.00',
    });
  });

  it('DV-07/13: bigint ID lớn hơn Number.MAX_SAFE_INTEGER được giữ nguyên', async () => {
    await db.query('ALTER TABLE dich_vu_kham AUTO_INCREMENT=9007199254740993');
    const row = await create('Bigint');
    expect(row.dichVuKhamId).toBe('9007199254740993');
    await expect(
      service.update(system, row.dichVuKhamId, { ten: 'Bigint sửa' }),
    ).resolves.toMatchObject({ dichVuKhamId: row.dichVuKhamId });
  });
});
