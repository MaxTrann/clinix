import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { LeTan } from '../admin/entities/le-tan.entity.js';
import { AdminFixtures } from '../admin/testing/admin-fixtures.js';
import { TaiKhoan } from '../auth/entities/tai-khoan.entity.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../database/testing/test-database.js';
import { AdminScopeService } from './admin-scope.service.js';
import { BranchAccessPolicy } from './branch-access.policy.js';
import { AdminScopeGuard } from './guards/admin-scope.guard.js';
import { RbacModule } from './rbac.module.js';
import { ReceptionScopeRepository } from './reception-scope.repository.js';
import { ReceptionScopeService } from './reception-scope.service.js';

// Booking P4 (PLAN 7.20): RSC-08…RSC-12 trên MySQL thật (DB `*_test`, chạy tuần tự).
describe('Booking P4 RSC-08…12 — ReceptionScopeService trên MySQL thật', () => {
  let db: DataSource;
  let fixtures: AdminFixtures;
  let service: ReceptionScopeService;
  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    fixtures = new AdminFixtures(db);
    service = new ReceptionScopeService(new ReceptionScopeRepository(db));
  });
  beforeEach(async () => resetTables(db));
  afterAll(async () => db?.destroy());

  it('RSC-08: hai Lễ tân ở hai chi nhánh gọi song song, mỗi người đúng chi nhánh của mình (chuỗi)', async () => {
    const a = await fixtures.branch();
    const b = await fixtures.branch();
    const ra = await fixtures.receptionist(a);
    const rb = await fixtures.receptionist(b);
    const [scopeA, scopeB] = await Promise.all([
      service.resolve(ra.account.taiKhoanId),
      service.resolve(rb.account.taiKhoanId),
    ]);
    expect(scopeA).toEqual({ kind: 'ChiNhanh', chiNhanhId: a.chiNhanhId });
    expect(scopeB).toEqual({ kind: 'ChiNhanh', chiNhanhId: b.chiNhanhId });
    expect(typeof scopeA.chiNhanhId).toBe('string');
  });

  it('RSC-09: đổi chi nhánh thấy ngay ở lần gọi sau (không cache); xoá dòng le_tan ⇒ 403', async () => {
    const a = await fixtures.branch();
    const b = await fixtures.branch();
    const receptionist = await fixtures.receptionist(a);
    const id = receptionist.account.taiKhoanId;
    expect(await service.resolve(id)).toEqual({
      kind: 'ChiNhanh',
      chiNhanhId: a.chiNhanhId,
    });
    await db.getRepository(LeTan).update(id, { chiNhanhId: b.chiNhanhId });
    expect(await service.resolve(id)).toEqual({
      kind: 'ChiNhanh',
      chiNhanhId: b.chiNhanhId,
    });
    await db.getRepository(LeTan).delete(id);
    await expect(service.resolve(id)).rejects.toMatchObject({
      status: 403,
      maLoi: 'KHONG_DU_QUYEN',
    });
  });

  it('RSC-10: Bệnh nhân, Bác sĩ, Quản trị viên (hai phạm vi) và id không tồn tại ⇒ 403', async () => {
    const branch = await fixtures.branch();
    const accounts = [
      (await fixtures.patient()).account,
      (await fixtures.doctor(branch)).account,
      (await fixtures.admin(branch)).account,
      (await fixtures.admin()).account,
    ];
    for (const id of [
      ...accounts.map((account) => account.taiKhoanId),
      '999999',
    ])
      await expect(service.resolve(id)).rejects.toMatchObject({
        status: 403,
        maLoi: 'KHONG_DU_QUYEN',
      });
  });

  it('RSC-11: NgungHoatDong rồi ChoKichHoat ⇒ 403; về DangHoatDong ⇒ có phạm vi lại', async () => {
    const branch = await fixtures.branch();
    const receptionist = await fixtures.receptionist(branch);
    const id = receptionist.account.taiKhoanId;
    const hash = receptionist.account.matKhauBam;
    const setAccount = (data: Partial<TaiKhoan>) =>
      db.getRepository(TaiKhoan).update(id, data);
    const expected = { kind: 'ChiNhanh', chiNhanhId: branch.chiNhanhId };
    expect(await service.resolve(id)).toEqual(expected);
    // chk_tai_khoan_mat_khau: ChoKichHoat phải chưa có mật khẩu, DangHoatDong phải có.
    for (const data of [
      { trangThai: 'NgungHoatDong' },
      { trangThai: 'ChoKichHoat', matKhauBam: null },
    ] as const) {
      await setAccount(data);
      await expect(service.resolve(id)).rejects.toMatchObject({
        status: 403,
        maLoi: 'KHONG_DU_QUYEN',
      });
    }
    await setAccount({ trangThai: 'DangHoatDong', matKhauBam: hash });
    expect(await service.resolve(id)).toEqual(expected);
  });

  it('RSC-12: RbacModule xuất ReceptionScopeService; module khác nhập RbacModule dùng được trên DB thật', async () => {
    // DataSource là provider toàn cục của DatabaseModule ở app thật; ở đây thay bằng kết nối test.
    @Global()
    @Module({
      providers: [{ provide: DataSource, useValue: db }],
      exports: [DataSource],
    })
    class TestDatabaseModule {}
    // Nếu RbacModule không `exports` một provider, việc inject ở đây làm compile() ném lỗi.
    @Module({
      imports: [RbacModule],
      providers: [
        {
          provide: 'PROBE',
          inject: [
            ReceptionScopeService,
            AdminScopeService,
            AdminScopeGuard,
            BranchAccessPolicy,
          ],
          useFactory: (
            reception: ReceptionScopeService,
            admin: AdminScopeService,
            guard: AdminScopeGuard,
            policy: BranchAccessPolicy,
          ) => ({ reception, admin, guard, policy }),
        },
      ],
    })
    class ConsumerModule {}
    const moduleRef = await Test.createTestingModule({
      imports: [TestDatabaseModule, ConsumerModule],
    }).compile();
    try {
      const probe = moduleRef.select(ConsumerModule).get<{
        reception: ReceptionScopeService;
        admin: AdminScopeService;
        guard: AdminScopeGuard;
        policy: BranchAccessPolicy;
      }>('PROBE', { strict: true });
      expect(probe.reception).toBeInstanceOf(ReceptionScopeService);
      expect(probe.admin).toBeInstanceOf(AdminScopeService);
      expect(probe.guard).toBeInstanceOf(AdminScopeGuard);
      expect(probe.policy).toBeInstanceOf(BranchAccessPolicy);
      const branch = await fixtures.branch();
      const receptionist = await fixtures.receptionist(branch);
      expect(
        await probe.reception.resolve(receptionist.account.taiKhoanId),
      ).toEqual({ kind: 'ChiNhanh', chiNhanhId: branch.chiNhanhId });
    } finally {
      await moduleRef.close();
    }
  });
});
