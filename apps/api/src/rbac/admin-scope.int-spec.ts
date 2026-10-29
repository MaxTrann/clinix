import { DataSource } from 'typeorm';
import { AdminFixtures } from '../admin/testing/admin-fixtures.js';
import { BacSi } from '../admin/entities/bac-si.entity.js';
import { ChiNhanh } from '../admin/entities/chi-nhanh.entity.js';
import { BenhNhan } from '../auth/entities/benh-nhan.entity.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from '../database/testing/test-database.js';
import { AdminScopeRepository } from './admin-scope.repository.js';
import { AdminScopeService } from './admin-scope.service.js';
import { BranchAccessPolicy } from './branch-access.policy.js';
import type { AdminScope } from './admin-scope.js';

describe('C1 PQ-07/08/09 — repository và query phạm vi trên MySQL thật', () => {
  let db: DataSource;
  let fixtures: AdminFixtures;
  let service: AdminScopeService;
  const policy = new BranchAccessPolicy();
  beforeAll(async () => {
    db = await createTestDataSource(readTestDbSettings());
    fixtures = new AdminFixtures(db);
    service = new AdminScopeService(new AdminScopeRepository(db));
  });
  beforeEach(async () => resetTables(db));
  afterAll(async () => db?.destroy());

  it('resolve từ bảng thật và /me chỉ đọc tên/id; thiếu hồ sơ 403', async () => {
    const branch = await fixtures.branch();
    const admin = await fixtures.admin(branch);
    const scope = await service.resolve(admin.account.taiKhoanId);
    expect(scope).toEqual({ kind: 'ChiNhanh', chiNhanhId: branch.chiNhanhId });
    expect(await service.describe(scope)).toEqual({
      phamVi: 'ChiNhanh',
      chiNhanh: { id: branch.chiNhanhId, ten: branch.ten },
    });
    await expect(service.resolve('999999')).rejects.toThrow('KHONG_DU_QUYEN');
  });

  it('filter SELECT/COUNT trước phân trang: CN không lấy được branch giả; TH lọc/tất cả', async () => {
    const a = await fixtures.branch();
    const b = await fixtures.branch();
    const list = async (scope: AdminScope, requested?: string) => {
      const query = db.getRepository(ChiNhanh).createQueryBuilder('branch');
      const filter = policy.branchFilter(scope, requested);
      if (filter !== undefined)
        query.where('branch.chi_nhanh_id = :id', { id: filter });
      return query.orderBy('branch.chi_nhanh_id').take(1).getManyAndCount();
    };
    const [rows, total] = await list(
      { kind: 'ChiNhanh', chiNhanhId: a.chiNhanhId },
      b.chiNhanhId,
    );
    expect(rows.map((item) => item.chiNhanhId)).toEqual([a.chiNhanhId]);
    expect(total).toBe(1);
    expect((await list({ kind: 'ToanHeThong' }))[1]).toBe(2);
    expect(
      (await list({ kind: 'ToanHeThong' }, b.chiNhanhId))[0][0].chiNhanhId,
    ).toBe(b.chiNhanhId);
  });

  it('patient EXISTS không nhân đôi bệnh nhân có nhiều lịch, total không lộ người ngoài scope', async () => {
    const a = await fixtures.branch();
    const b = await fixtures.branch();
    const da = await fixtures.doctor(a);
    const dbDoctor = await fixtures.doctor(b);
    const pa = await fixtures.patient();
    const pb = await fixtures.patient();
    await fixtures.patient(); // Không có lịch: CN không được thấy, TH vẫn thấy.
    for (const [doctor, patient, day] of [
      [da.profile, pa, '2026-11-02'],
      [da.profile, pa, '2026-11-03'],
      [dbDoctor.profile, pb, '2026-11-02'],
    ] as const) {
      const shift = await fixtures.shift(doctor, { ngay: day });
      const slot = await fixtures.slot(shift);
      await fixtures.appointment(doctor, slot, patient.account.taiKhoanId);
    }
    const list = (scope: AdminScope) => {
      const predicate = policy.patientVisibilityFilter(scope, 'p');
      return db
        .getRepository(BenhNhan)
        .createQueryBuilder('p')
        .where(predicate.sql, predicate.parameters)
        .take(1)
        .getManyAndCount();
    };
    const [rows, total] = await list({
      kind: 'ChiNhanh',
      chiNhanhId: a.chiNhanhId,
    });
    expect(rows.map((item) => item.taiKhoanId)).toEqual([
      pa.account.taiKhoanId,
    ]);
    expect(total).toBe(1);
    expect((await list({ kind: 'ToanHeThong' }))[1]).toBe(3);
  });

  it('TOCTOU: sau chuyển chi nhánh, đọc khóa trong transaction phải từ chối scope cũ', async () => {
    const a = await fixtures.branch();
    const b = await fixtures.branch();
    const doctor = await fixtures.doctor(a);
    const scope: AdminScope = { kind: 'ChiNhanh', chiNhanhId: a.chiNhanhId };
    // Snapshot đọc trước transaction vẫn là A; không dùng snapshot này để cấp quyền ghi.
    const stale = await db
      .getRepository(BacSi)
      .findOneByOrFail({ taiKhoanId: doctor.account.taiKhoanId });
    const mover = db.createQueryRunner();
    await mover.connect();
    await mover.startTransaction();
    try {
      await mover.manager
        .getRepository(BacSi)
        .update(doctor.account.taiKhoanId, { chiNhanhId: b.chiNhanhId });
      let signal!: () => void;
      const started = new Promise<void>((resolve) => {
        signal = resolve;
      });
      const write = db.transaction(async (manager) => {
        signal();
        const repo = manager.getRepository(BacSi);
        const row = await repo.findOneOrFail({
          where: { taiKhoanId: doctor.account.taiKhoanId },
          lock: { mode: 'pessimistic_write' },
        });
        policy.assertCanSee(scope, row.chiNhanhId);
        await repo.update(row.taiKhoanId, { hocVi: 'TS', chucDanh: 'TS_BS' });
      });
      const rejected = expect(write).rejects.toThrow('KHONG_TIM_THAY');
      await started;
      await mover.commitTransaction();
      await rejected;
      expect(stale.chiNhanhId).toBe(a.chiNhanhId);
      expect(
        (
          await db
            .getRepository(BacSi)
            .findOneByOrFail({ taiKhoanId: doctor.account.taiKhoanId })
        ).hocVi,
      ).toBe('BS');
    } finally {
      if (mover.isTransactionActive) await mover.rollbackTransaction();
      await mover.release();
    }
  });
});
