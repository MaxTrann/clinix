import {
  Body,
  Controller,
  Get,
  Inject,
  Injectable,
  Module,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ModulesContainer } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { HOC_VI_BAC_SI, type HocViBacSi } from '../src/admin/entities/enums.js';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { BacSi } from '../src/admin/entities/bac-si.entity.js';
import { ChiNhanh } from '../src/admin/entities/chi-nhanh.entity.js';
import { QuanTriVien } from '../src/admin/entities/quan-tri-vien.entity.js';
import { AdminFixtures } from '../src/admin/testing/admin-fixtures.js';
import { Roles } from '../src/auth/decorators/roles.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../src/auth/decorators/current-user.decorator.js';
import { TaiKhoan } from '../src/auth/entities/tai-khoan.entity.js';
import { insertTaiKhoan } from '../src/auth/entities/testing/auth-fixtures.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { AppException } from '../src/common/errors/app.exception.js';
import { resetTables } from '../src/database/testing/test-database.js';
import type { AdminScope } from '../src/rbac/admin-scope.js';
import { BranchAccessPolicy } from '../src/rbac/branch-access.policy.js';
import { AdminScopeCtx } from '../src/rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../src/rbac/decorators/require-admin-scope.decorator.js';
import { RbacModule } from '../src/rbac/rbac.module.js';
import { auditAdminControllers } from '../src/rbac/testing/admin-route-audit.js';

// Probe chỉ trong test: kiểm cơ chế dùng chung, không đại diện acceptance các B-task/C2.
class ProbeUpdateDto {
  @IsIn(HOC_VI_BAC_SI) hocVi!: HocViBacSi;
  @IsOptional() @IsString() actorId?: string;
}

@Injectable()
class ProbeService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
  ) {}

  async list(scope: AdminScope, requested?: string) {
    const query = this.db.getRepository(ChiNhanh).createQueryBuilder('branch');
    const filter = this.policy.branchFilter(scope, requested);
    if (filter !== undefined)
      query.where('branch.chi_nhanh_id = :branch', { branch: filter });
    const [items, total] = await query
      .orderBy('branch.chi_nhanh_id')
      .getManyAndCount();
    return { items: items.map((item) => ({ id: item.chiNhanhId })), total };
  }

  async doctor(scope: AdminScope, id: string) {
    const row = await this.db
      .getRepository(BacSi)
      .findOneBy({ taiKhoanId: id });
    if (!row) throw new AppException(404, 'KHONG_TIM_THAY');
    this.policy.assertCanSee(scope, row.chiNhanhId);
    return { id: row.taiKhoanId, hocVi: row.hocVi };
  }

  update(
    scope: AdminScope,
    id: string,
    input: ProbeUpdateDto,
    actorId: string,
  ) {
    return this.db.transaction(async (manager) => {
      const repo = manager.getRepository(BacSi);
      const row = await repo.findOne({
        where: { taiKhoanId: id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) throw new AppException(404, 'KHONG_TIM_THAY');
      this.policy.assertCanAct(scope, row.chiNhanhId, true);
      const titles = {
        BS: 'BS',
        ThS: 'ThS_BS',
        TS: 'TS_BS',
        PGS: 'PGS_TS_BS',
        GS: 'GS_TS_BS',
      } as const;
      await repo.update(id, {
        hocVi: input.hocVi,
        chucDanh: titles[input.hocVi],
      });
      return { id, actorId };
    });
  }
}

@Controller('admin/c1-probe')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
class ProbeController {
  constructor(@Inject(ProbeService) private readonly service: ProbeService) {}
  @Get('branches') list(
    @AdminScopeCtx() scope: AdminScope,
    @Query('chiNhanhId') requested?: string,
  ) {
    return this.service.list(scope, requested);
  }
  @Get('doctors/:id') doctor(
    @AdminScopeCtx() scope: AdminScope,
    @Param('id') id: string,
  ) {
    return this.service.doctor(scope, id);
  }
  @Patch('doctors/:id') update(
    @AdminScopeCtx() scope: AdminScope,
    @Param('id') id: string,
    @Body() input: ProbeUpdateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(scope, id, input, user.accountId);
  }
}
@Module({
  imports: [RbacModule],
  controllers: [ProbeController],
  providers: [ProbeService],
})
class ProbeModule {}

describe('C1 PQ-01…15 — HTTP với AppModule/auth/MySQL thật', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fixtures: AdminFixtures;
  let sessions: SessionService;
  const now = new Date('2026-10-29T02:00:00Z');
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule, ProbeModule],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    fixtures = new AdminFixtures(db);
    sessions = app.get(SessionService);
  });
  beforeEach(async () => {
    await resetTables(db);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => app?.close());
  const get = (path: string, token: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token}`);
  const patch = (id: string, token: string) =>
    request(app.getHttpServer())
      .patch(`/admin/c1-probe/doctors/${id}`)
      .set('Authorization', `Bearer ${token}`);
  const upload = (token?: string) => {
    const req = request(app.getHttpServer()).post(
      '/admin/uploads/specialty-image',
    );
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  it('PQ-11: kiểm toàn bộ controller được đăng ký trong app thật', () => {
    const controllers = [...app.get(ModulesContainer).values()].flatMap(
      (module) =>
        [...module.controllers.values()].flatMap((wrapper) =>
          wrapper.metatype ? [wrapper.metatype] : [],
        ),
    );
    expect(controllers.map((item) => item.name)).toContain('UploadController');
    expect(controllers.map((item) => item.name)).toContain('AdminMeController');
    expect(auditAdminControllers(controllers)).toEqual([]);
  });

  it('PQ-01: thiếu/hết hạn token → 401, kể cả upload có multipart sai', async () => {
    await request(app.getHttpServer()).get('/admin/me').expect(401);
    await upload().expect(401);
    const admin = await fixtures.admin();
    const session = await sessions.create(admin.account.taiKhoanId);
    vi.setSystemTime(new Date(now.getTime() + 15 * 60 * 1000));
    await get('/admin/me', session.accessToken).expect(401);
    await upload(session.accessToken).expect(401);
  });

  it.each(['BenhNhan', 'BacSi', 'LeTan'] as const)(
    'PQ-02: vai trò %s → 403',
    async (role) => {
      const account = await insertTaiKhoan(db, {
        loaiTaiKhoan: role,
        daXacMinhEmail: true,
      });
      const session = await sessions.create(account.taiKhoanId);
      await get('/admin/me', session.accessToken).expect(403);
      await upload(session.accessToken).expect(403);
    },
  );

  it('PQ-04/05: /me trả allowlist đúng TH/CN và bỏ qua query giả', async () => {
    const branch = await fixtures.branch();
    for (const [admin, expected] of [
      [await fixtures.admin(), { phamVi: 'ToanHeThong' }],
      [
        await fixtures.admin(branch),
        {
          phamVi: 'ChiNhanh',
          chiNhanh: { id: branch.chiNhanhId, ten: branch.ten },
        },
      ],
    ] as const) {
      const session = await sessions.create(admin.account.taiKhoanId);
      const response = await get(
        '/admin/me?phamVi=ToanHeThong&chiNhanhId=999',
        session.accessToken,
      ).expect(200);
      expect(response.body).toEqual(expected);
    }
  });

  it('PQ-03: upload từ CN →403 trước multipart; TH đi tiếp đến kiểm file →400', async () => {
    const branch = await fixtures.branch();
    const local = await fixtures.admin(branch);
    const system = await fixtures.admin();
    const localSession = await sessions.create(local.account.taiKhoanId);
    const systemSession = await sessions.create(system.account.taiKhoanId);
    await upload(localSession.accessToken)
      .attach('wrong', Buffer.from('mẫu'), 'test.png')
      .expect(403);
    await upload(systemSession.accessToken).expect(400);
    const [{ total }] = await db.query<{ total: string }[]>(
      'SELECT COUNT(*) AS total FROM anh_tai_len',
    );
    expect(Number(total)).toBe(0);
  });

  it('PQ-09/10: cùng JWT dùng scope mới ở request kế tiếp; xóa hồ sơ →403', async () => {
    const a = await fixtures.branch();
    const b = await fixtures.branch();
    const admin = await fixtures.admin(a);
    const session = await sessions.create(admin.account.taiKhoanId);
    const first = await get('/admin/me', session.accessToken).expect(200);
    expect(first.body.chiNhanh.id).toBe(a.chiNhanhId);
    await db
      .getRepository(QuanTriVien)
      .update(admin.account.taiKhoanId, { chiNhanhId: b.chiNhanhId });
    const second = await get('/admin/me', session.accessToken).expect(200);
    expect(second.body.chiNhanh.id).toBe(b.chiNhanhId);
    await db.getRepository(QuanTriVien).delete(admin.account.taiKhoanId);
    await get('/admin/me', session.accessToken).expect(403);
  });

  it('PQ-12: ngừng tài khoản hoặc thu hồi phiên có hiệu lực ngay', async () => {
    const admin = await fixtures.admin();
    const first = await sessions.create(admin.account.taiKhoanId);
    await sessions.revoke(first.sessionId);
    await get('/admin/me', first.accessToken).expect(401);
    const second = await sessions.create(admin.account.taiKhoanId);
    await db
      .getRepository(TaiKhoan)
      .update(admin.account.taiKhoanId, { trangThai: 'NgungHoatDong' });
    await get('/admin/me', second.accessToken).expect(401);
  });

  it('PQ-06/07/08/13: IDOR, lọc/total đúng scope; 404 như id không tồn tại, không ghi', async () => {
    const a = await fixtures.branch();
    const b = await fixtures.branch();
    const doctor = await fixtures.doctor(b);
    const admin = await fixtures.admin(a);
    const session = await sessions.create(admin.account.taiKhoanId);
    const list = await get(
      `/admin/c1-probe/branches?chiNhanhId=${b.chiNhanhId}`,
      session.accessToken,
    ).expect(200);
    expect(list.body).toEqual({ items: [{ id: a.chiNhanhId }], total: 1 });
    const hidden = await get(
      `/admin/c1-probe/doctors/${doctor.account.taiKhoanId}`,
      session.accessToken,
    ).expect(404);
    const missing = await get(
      '/admin/c1-probe/doctors/999999',
      session.accessToken,
    ).expect(404);
    expect(hidden.body).toEqual(missing.body);
    await patch(doctor.account.taiKhoanId, session.accessToken)
      .send({ hocVi: 'TS' })
      .expect(404);
    const unchanged = await db
      .getRepository(BacSi)
      .findOneByOrFail({ taiKhoanId: doctor.account.taiKhoanId });
    expect(unchanged.hocVi).toBe('BS');
  });

  it('PQ-14/15: hai CN song song không lẫn scope; actor lấy từ phiên', async () => {
    const a = await fixtures.branch();
    const b = await fixtures.branch();
    const da = await fixtures.doctor(a);
    const dbDoctor = await fixtures.doctor(b);
    const aa = await fixtures.admin(a);
    const ab = await fixtures.admin(b);
    const sa = await sessions.create(aa.account.taiKhoanId);
    const sb = await sessions.create(ab.account.taiKhoanId);
    const results = await Promise.all([
      patch(da.account.taiKhoanId, sa.accessToken).send({
        hocVi: 'TS',
        actorId: ab.account.taiKhoanId,
      }),
      patch(dbDoctor.account.taiKhoanId, sb.accessToken).send({
        hocVi: 'TS',
        actorId: aa.account.taiKhoanId,
      }),
      patch(dbDoctor.account.taiKhoanId, sa.accessToken).send({ hocVi: 'GS' }),
      patch(da.account.taiKhoanId, sb.accessToken).send({ hocVi: 'GS' }),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      200, 200, 404, 404,
    ]);
    expect(results[0].body.actorId).toBe(aa.account.taiKhoanId);
    expect(results[1].body.actorId).toBe(ab.account.taiKhoanId);
  });
});
