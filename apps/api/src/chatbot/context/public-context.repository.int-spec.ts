import { ChuyenKhoa } from '../../admin/entities/chuyen-khoa.entity.js';
import { ChiNhanhDichVuKham } from '../../admin/entities/chi-nhanh-dich-vu-kham.entity.js';
import { resetTables } from '../../database/testing/test-database.js';
import {
  openWorld,
  seedBranch,
  seedClinic,
  seedDoctor,
  seedRefundTiers,
  type World,
} from '../answer/testing/b2-world.js';
import type { EntityNeeds } from './public-context.repository.js';

// chatbot B2 — truy vấn công khai trên MySQL thật. Mã test: NGC-01 (chuyên khoa ngừng), NGC-02 (dịch vụ không chi nhánh nào cung cấp), ANX-02 (đọc lại chuyên khoa đang hoạt động),
// DCR-11 (đọc lại thực thể), cộng ca `B2-nn`: mọi câu nằm trong MỘT giao dịch chỉ đọc (ràng buộc 8).
let world: World;
beforeAll(async () => {
  world = await openWorld();
});
beforeEach(async () => {
  await resetTables(world.db);
});
afterAll(async () => {
  await world?.close();
});

const NO_NEEDS: EntityNeeds = {
  specialtyIds: [],
  branchIds: [],
  serviceIds: [],
  refundServiceIds: [],
  clinic: false,
};

describe('PublicContextRepository.loadBase (MySQL thật)', () => {
  it('NGC-01: chỉ chuyên khoa đang hoạt động, sắp theo tên, kèm mô tả', async () => {
    const admin = world.fixtures.admin;
    const a = await admin.catalog();
    const b = await admin.catalog();
    const c = await admin.catalog();
    await world.db.query(
      'UPDATE chuyen_khoa SET ten = ?, mo_ta = ? WHERE chuyen_khoa_id = ?',
      ['Nhi khoa', 'Khám trẻ em', a.specialty.chuyenKhoaId],
    );
    await world.db.query(
      'UPDATE chuyen_khoa SET ten = ?, mo_ta = NULL WHERE chuyen_khoa_id = ?',
      ['Da liễu', b.specialty.chuyenKhoaId],
    );
    await world.db.query(
      'UPDATE chuyen_khoa SET ten = ?, trang_thai_hoat_dong = ? WHERE chuyen_khoa_id = ?',
      ['Khoa đã ngừng', 'NgungHoatDong', c.specialty.chuyenKhoaId],
    );

    const base = await world.repository.loadBase();
    expect(base.specialties).toEqual([
      { id: b.specialty.chuyenKhoaId, ten: 'Da liễu', moTa: null },
      { id: a.specialty.chuyenKhoaId, ten: 'Nhi khoa', moTa: 'Khám trẻ em' },
    ]);
    expect(typeof base.specialties[0]?.id).toBe('string');
  });

  it('NGC-02: dịch vụ chỉ có mặt khi ÍT NHẤT MỘT chi nhánh cung cấp; bị gỡ khỏi mọi chi nhánh thì biến mất', async () => {
    const admin = world.fixtures.admin;
    const branch1 = await seedBranch(world);
    const branch2 = await seedBranch(world);
    const offered = await admin.catalog();
    const unlinked = await admin.catalog();
    const removed = await admin.catalog();
    const links = world.db.getRepository(ChiNhanhDichVuKham);
    await links.save([
      links.create({
        chiNhanhId: branch1.chiNhanhId,
        dichVuKhamId: offered.service.dichVuKhamId,
      }),
      links.create({
        chiNhanhId: branch2.chiNhanhId,
        dichVuKhamId: offered.service.dichVuKhamId,
      }),
      links.create({
        chiNhanhId: branch1.chiNhanhId,
        dichVuKhamId: removed.service.dichVuKhamId,
      }),
    ]);
    await links.delete({
      chiNhanhId: branch1.chiNhanhId,
      dichVuKhamId: removed.service.dichVuKhamId,
    });

    const { services } = await world.repository.loadBase();
    // dịch vụ có ở HAI chi nhánh chỉ xuất hiện MỘT lần
    expect(services.map((service) => service.id)).toEqual([
      offered.service.dichVuKhamId,
    ]);
    expect(unlinked.service.dichVuKhamId).not.toBe(
      offered.service.dichVuKhamId,
    );
  });

  it('B2-71: chi nhánh sắp theo tên; thông tin phòng khám trống hay toàn khoảng trắng là null', async () => {
    const b = await seedBranch(world, { ten: 'Chi nhánh B' });
    const a = await seedBranch(world, { ten: 'Chi nhánh A' });
    const empty = await world.repository.loadBase();
    expect(empty.clinic).toEqual({ ten: null, hotline: null, email: null });
    expect(empty.branches.map((branch) => branch.id)).toEqual([
      a.chiNhanhId,
      b.chiNhanhId,
    ]);

    await seedClinic(world.db, {
      tenThuongHieu: 'Phòng khám X',
      duongDayNong: '   ',
      email: '',
    });
    const blank = await world.repository.loadBase();
    expect(blank.clinic).toEqual({
      ten: 'Phòng khám X',
      hotline: null,
      email: null,
    });

    await seedClinic(world.db, {
      tenThuongHieu: null,
      duongDayNong: '1900 1234',
      email: 'a@example.invalid',
    });
    expect((await world.repository.loadBase()).clinic).toEqual({
      ten: null,
      hotline: '1900 1234',
      email: 'a@example.invalid',
    });
  });

  it('B2-72: mọi câu của loadBase nằm trong MỘT giao dịch chỉ đọc và chỉ có SELECT (ràng buộc 8)', async () => {
    await seedClinic(world.db);
    const statements: string[] = [];
    const original = world.db.createQueryRunner.bind(world.db);
    let runners = 0;
    const spy = vi
      .spyOn(world.db, 'createQueryRunner')
      .mockImplementation((...args) => {
        runners += 1;
        const runner = original(...args);
        const query = runner.query.bind(runner);
        runner.query = ((sql: string, params?: unknown[]) => {
          statements.push(sql.trim().replace(/\s+/g, ' '));
          return query(sql, params);
        }) as typeof runner.query;
        return runner;
      });
    try {
      await world.repository.loadBase();
    } finally {
      spy.mockRestore();
    }
    expect(runners).toBe(1);
    expect(statements[0]).toBe('SET TRANSACTION READ ONLY');
    // TypeORM tự thêm câu điều khiển giao dịch (mức cô lập, START TRANSACTION, COMMIT); ngoài ra chỉ được có SELECT
    const rest = statements
      .slice(1)
      .filter(
        (sql) => !/^(SET TRANSACTION|START TRANSACTION|COMMIT)/.test(sql),
      );
    expect(rest.length).toBeGreaterThanOrEqual(4);
    for (const sql of rest) {
      expect(sql).toMatch(/^SELECT /);
    }
    expect(statements).toContain('START TRANSACTION');
    expect(statements).toContain('COMMIT');
    for (const sql of statements) {
      expect(sql).not.toMatch(
        /\b(INSERT|UPDATE|DELETE|REPLACE|FOR UPDATE|FOR SHARE)\b/i,
      );
    }
  });
});

describe('PublicContextRepository.findActiveSpecialties (MySQL thật)', () => {
  it('ANX-02: chỉ trả chuyên khoa đang hoạt động; id đã ngừng hay không tồn tại vắng mặt; tên lấy từ DB', async () => {
    const admin = world.fixtures.admin;
    const active = await admin.catalog();
    const stopped = await admin.catalog();
    await world.db
      .getRepository(ChuyenKhoa)
      .update(stopped.specialty.chuyenKhoaId, {
        trangThaiHoatDong: 'NgungHoatDong',
      });
    const result = await world.repository.findActiveSpecialties([
      active.specialty.chuyenKhoaId,
      stopped.specialty.chuyenKhoaId,
      '999999999',
    ]);
    expect([...result.keys()]).toEqual([active.specialty.chuyenKhoaId]);
    expect(result.get(active.specialty.chuyenKhoaId)).toBe(
      active.specialty.ten,
    );
  });

  it('B2-73: danh sách rỗng thì không chạm DB', async () => {
    const spy = vi.spyOn(world.db, 'createQueryRunner');
    try {
      expect((await world.repository.findActiveSpecialties([])).size).toBe(0);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('PublicContextRepository.readEntities (MySQL thật)', () => {
  it('DCR-01, DCR-11: đọc lại đúng chuyên khoa, chi nhánh (kèm giờ), dịch vụ (kèm mốc hoàn) và phòng khám', async () => {
    await seedClinic(world.db);
    const branch = await seedBranch(world, {
      ten: 'Chi nhánh Một',
      diaChi: '12 Đường A',
    });
    const doctor = await seedDoctor(world, branch, {
      hoTen: 'Nguyễn Minh Anh',
      chuyenKhoaTen: 'Tim mạch',
      dichVuTen: 'Khám tim',
      giaMacDinh: '200000.00',
      mucDatCoc: '100000.00',
    });
    await seedRefundTiers(world.db, doctor.dichVuKhamId, [
      [2, 50],
      [24, 100],
      [0, 0],
    ]);

    const got = await world.repository.readEntities({
      specialtyIds: [doctor.chuyenKhoaId],
      branchIds: [branch.chiNhanhId],
      serviceIds: [doctor.dichVuKhamId],
      refundServiceIds: [doctor.dichVuKhamId],
      clinic: true,
    });
    expect(got.specialties.get(doctor.chuyenKhoaId)).toBe('Tim mạch');
    const read = got.branches.get(branch.chiNhanhId);
    expect(read).toMatchObject({ ten: 'Chi nhánh Một', diaChi: '12 Đường A' });
    expect(read?.schedule).toHaveLength(7);
    // TINYINT(1) của mysql2 đã đổi sang boolean
    expect(read?.schedule.every((day) => day.hoatDong === true)).toBe(true);
    expect(got.services.get(doctor.dichVuKhamId)).toEqual({
      ten: 'Khám tim',
      giaMacDinh: '200000.00',
      mucDatCoc: '100000.00',
      thoiLuong: 30,
      refund: [
        { soGioTruocToiThieu: 24, tyLeHoan: 100 },
        { soGioTruocToiThieu: 2, tyLeHoan: 50 },
        { soGioTruocToiThieu: 0, tyLeHoan: 0 },
      ],
    });
    expect(got.clinic).toEqual({
      ten: 'Phòng khám mẫu CLINIX',
      hotline: '1900 0000',
      email: 'lienhe@example.invalid',
    });
  });

  it('B2-74: cọc 0 thì không có chính sách hoàn (null); cọc > 0 chưa có mốc thì mảng rỗng; không đòi mốc thì không đọc', async () => {
    const branch = await seedBranch(world);
    const free = await seedDoctor(world, branch, {
      hoTen: 'A B',
      chuyenKhoaTen: 'Khoa 1',
      dichVuTen: 'Dịch vụ không cọc',
      mucDatCoc: '0.00',
    });
    const paid = await seedDoctor(world, branch, {
      hoTen: 'C D',
      chuyenKhoaTen: 'Khoa 2',
      dichVuTen: 'Dịch vụ có cọc',
      mucDatCoc: '50000.00',
    });
    const got = await world.repository.readEntities({
      ...NO_NEEDS,
      serviceIds: [free.dichVuKhamId, paid.dichVuKhamId],
      refundServiceIds: [free.dichVuKhamId, paid.dichVuKhamId],
    });
    expect(got.services.get(free.dichVuKhamId)?.refund).toBeNull();
    expect(got.services.get(paid.dichVuKhamId)?.refund).toEqual([]);

    await seedRefundTiers(world.db, paid.dichVuKhamId, [[24, 100]]);
    const notAsked = await world.repository.readEntities({
      ...NO_NEEDS,
      serviceIds: [paid.dichVuKhamId],
    });
    // không nằm trong refundServiceIds nên không đọc mốc (giá trị không có nghĩa)
    expect(notAsked.services.get(paid.dichVuKhamId)?.refund).toBeNull();
  });

  it('DCR-11: chuyên khoa ngừng, chi nhánh không có, dịch vụ không còn chi nhánh nào, phòng khám không có dòng đều vắng mặt', async () => {
    const branch = await seedBranch(world);
    const doctor = await seedDoctor(world, branch, {
      hoTen: 'A B',
      chuyenKhoaTen: 'Khoa 1',
      dichVuTen: 'Dịch vụ 1',
    });
    await world.db.getRepository(ChuyenKhoa).update(doctor.chuyenKhoaId, {
      trangThaiHoatDong: 'NgungHoatDong',
    });
    await world.db.getRepository(ChiNhanhDichVuKham).delete({
      chiNhanhId: branch.chiNhanhId,
      dichVuKhamId: doctor.dichVuKhamId,
    });
    const got = await world.repository.readEntities({
      specialtyIds: [doctor.chuyenKhoaId, '999999'],
      branchIds: ['999999'],
      serviceIds: [doctor.dichVuKhamId],
      refundServiceIds: [],
      clinic: true,
    });
    expect(got.specialties.size).toBe(0);
    expect(got.branches.size).toBe(0);
    expect(got.services.size).toBe(0);
    expect(got.clinic).toEqual({ ten: null, hotline: null, email: null });
  });

  it('B2-75: không cần gì thì kết quả rỗng; clinic không đòi thì là null', async () => {
    const got = await world.repository.readEntities(NO_NEEDS);
    expect(got.specialties.size + got.branches.size + got.services.size).toBe(
      0,
    );
    expect(got.clinic).toBeNull();
  });
});
