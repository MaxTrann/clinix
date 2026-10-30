import {
  Body,
  Controller,
  Inject,
  Injectable,
  Module,
  Param,
  Post,
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { IsOptional, IsString } from 'class-validator';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AuditModule } from '../src/audit/audit.module.js';
import { AuditService } from '../src/audit/audit.service.js';
import { AuditRepository } from '../src/audit/audit.repository.js';
import { AdminFixtures } from '../src/admin/testing/admin-fixtures.js';
import { LeTan } from '../src/admin/entities/le-tan.entity.js';
import { NhatKyHanhDong } from '../src/admin/entities/nhat-ky-hanh-dong.entity.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../src/auth/decorators/current-user.decorator.js';
import { Roles } from '../src/auth/decorators/roles.decorator.js';
import { TaiKhoan } from '../src/auth/entities/tai-khoan.entity.js';
import { insertTaiKhoan } from '../src/auth/entities/testing/auth-fixtures.js';
import { SessionService } from '../src/auth/session/session.service.js';
import { AppException } from '../src/common/errors/app.exception.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';
import { MailService } from '../src/mail/mail.service.js';
import type { AdminScope } from '../src/rbac/admin-scope.js';
import { BranchAccessPolicy } from '../src/rbac/branch-access.policy.js';
import { AdminScopeCtx } from '../src/rbac/decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../src/rbac/decorators/require-admin-scope.decorator.js';
import { RbacModule } from '../src/rbac/rbac.module.js';

class ProbeDto {
  @IsOptional() @IsString() actorId?: string;
}

// Probe chỉ trong test: cố ý không thực hiện toàn bộ B18 (revoke phiên/ma trận quyền/điều kiện).
// Chứng minh caller chọn actor từ phiên và dùng audit trong transaction; không thay acceptance B18/TK-25.
@Injectable()
class ProbeService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(BranchAccessPolicy) private readonly policy: BranchAccessPolicy,
  ) {}
  suspend(id: string, actorId: string, scope: AdminScope) {
    return this.db.transaction(async (manager) => {
      const profile = await manager.getRepository(LeTan).findOne({
        where: { taiKhoanId: id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!profile) throw new AppException(404, 'KHONG_TIM_THAY');
      this.policy.assertCanSee(scope, profile.chiNhanhId);
      const account = await manager.getRepository(TaiKhoan).findOneOrFail({
        where: { taiKhoanId: id },
        lock: { mode: 'pessimistic_write' },
      });
      await manager.update(TaiKhoan, id, { trangThai: 'NgungHoatDong' });
      await this.audit.record(manager, {
        actorId,
        branchId: profile.chiNhanhId,
        action: 'KhoaTaiKhoan',
        targetType: 'tai_khoan',
        targetId: id,
        result: 'ThanhCong',
        changes: {
          truoc: { trang_thai: account.trangThai },
          sau: { trang_thai: 'NgungHoatDong' },
          phien_thu_hoi: 0,
        },
      });
      return { id };
    });
  }
}

@Controller('admin/c2-probe')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
class ProbeController {
  constructor(@Inject(ProbeService) private readonly service: ProbeService) {}
  @Post('accounts/:id/suspend') suspend(
    @Param('id') id: string,
    @Body() _body: ProbeDto,
    @CurrentUser() user: AuthenticatedUser,
    @AdminScopeCtx() scope: AdminScope,
  ) {
    return this.service.suspend(id, user.accountId, scope);
  }
}
@Module({
  imports: [AuditModule, RbacModule],
  controllers: [ProbeController],
  providers: [ProbeService],
})
class ProbeModule {}

describe('C2-07 PQ-15 — probe HTTP/auth/C1/MySQL thật, không phải B18 acceptance', () => {
  let app: NestExpressApplication;
  let db: DataSource;
  let fixtures: AdminFixtures;
  let sessions: SessionService;
  const mail = { send: vi.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule, ProbeModule],
    })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    fixtures = new AdminFixtures(db);
    sessions = app.get(SessionService);
  });
  beforeEach(async () => {
    await resetTables(db);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await app?.close();
  });
  const call = (id: string, token?: string, actorId?: string) => {
    const req = request(app.getHttpServer()).post(
      `/admin/c2-probe/accounts/${id}/suspend`,
    );
    return (token ? req.set('Authorization', `Bearer ${token}`) : req).send(
      actorId ? { actorId } : {},
    );
  };

  it('C2-07 thiếu token thì401, không có audit', async () => {
    expectErrorResponse(await call('1'), 401, 'CHUA_DANG_NHAP');
    expect(await db.getRepository(NhatKyHanhDong).count()).toBe(0);
  });
  it.each(['BenhNhan', 'BacSi', 'LeTan'] as const)(
    'C2-07 role %s bị403 bởi guard thật',
    async (role) => {
      const account = await insertTaiKhoan(db, {
        loaiTaiKhoan: role,
        daXacMinhEmail: true,
      });
      const session = await sessions.create(account.taiKhoanId);
      expectErrorResponse(
        await call('1', session.accessToken),
        403,
        'KHONG_DU_QUYEN',
      );
      expect(await db.getRepository(NhatKyHanhDong).count()).toBe(0);
    },
  );
  it.each([false, true])(
    'C2-07 actor lấy từ phiên, bỏ actor body; Admin Chi nhánh=%s',
    async (branchScope) => {
      const branch = await fixtures.branch();
      const admin = await fixtures.admin(branchScope ? branch : undefined);
      const forged = await fixtures.admin();
      const target = await fixtures.receptionist(branch);
      const session = await sessions.create(admin.account.taiKhoanId);
      expect(
        (
          await call(
            target.account.taiKhoanId,
            session.accessToken,
            forged.account.taiKhoanId,
          )
        ).status,
      ).toBe(201);
      const rows = await db.getRepository(NhatKyHanhDong).find();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        taiKhoanId: admin.account.taiKhoanId,
        maDoiTuong: target.account.taiKhoanId,
        chiNhanhId: branch.chiNhanhId,
        hanhDong: 'KhoaTaiKhoan',
      });
      expect(mail.send).not.toHaveBeenCalled();
    },
  );
  it('C2-07 Admin Chi nhánh ngoài phạm vi thì404 và không đổi target/audit', async () => {
    const own = await fixtures.branch();
    const other = await fixtures.branch();
    const admin = await fixtures.admin(own);
    const target = await fixtures.receptionist(other);
    const session = await sessions.create(admin.account.taiKhoanId);
    expectErrorResponse(
      await call(target.account.taiKhoanId, session.accessToken),
      404,
      'KHONG_TIM_THAY',
    );
    expect(
      (
        await db
          .getRepository(TaiKhoan)
          .findOneByOrFail({ taiKhoanId: target.account.taiKhoanId })
      ).trangThai,
    ).toBe('DangHoatDong');
    expect(await db.getRepository(NhatKyHanhDong).count()).toBe(0);
  });
  it('C2-04/07 audit lỗi →500 chuẩn hóa, rollback target và không lưu log một phần', async () => {
    const admin = await fixtures.admin();
    const branch = await fixtures.branch();
    const target = await fixtures.receptionist(branch);
    const session = await sessions.create(admin.account.taiKhoanId);
    vi.spyOn(app.get(AuditRepository), 'insert').mockRejectedValueOnce(
      new Error('simulated driver failure'),
    );
    expectErrorResponse(
      await call(target.account.taiKhoanId, session.accessToken),
      500,
      'LOI_HE_THONG',
    );
    expect(
      (
        await db
          .getRepository(TaiKhoan)
          .findOneByOrFail({ taiKhoanId: target.account.taiKhoanId })
      ).trangThai,
    ).toBe('DangHoatDong');
    expect(await db.getRepository(NhatKyHanhDong).count()).toBe(0);
  });
});
