import 'reflect-metadata';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { configureApp } from '../../app.setup.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { SessionService } from '../../auth/session/session.service.js';
import { TokenService } from '../../auth/session/token.service.js';
import { AdminScopeService } from '../admin-scope.service.js';
import type { AdminScope } from '../admin-scope.js';
import { AdminScopeCtx } from '../decorators/admin-scope-ctx.decorator.js';
import { RequireAdminScope } from '../decorators/require-admin-scope.decorator.js';
import { AdminScopeGuard } from './admin-scope.guard.js';

@Controller('admin/guard-test')
@Roles('QuanTriVien')
@RequireAdminScope('Any')
class GuardController {
  @Get() read(@AdminScopeCtx() scope: AdminScope) {
    return scope;
  }
  @Get('system') @RequireAdminScope('ToanHeThong') system(
    @AdminScopeCtx() scope: AdminScope,
  ) {
    return scope;
  }
}

// Cố ý thiếu guard để chứng minh decorator tham số không tự tạo scope.
@Controller('admin/no-scope-context')
class MissingContextController {
  @Get() read(@AdminScopeCtx() scope: AdminScope) {
    return scope;
  }
}

@Controller('admin/no-scope-metadata')
@Roles('QuanTriVien')
@UseGuards(AdminScopeGuard)
class MissingMetadataController {
  @Get() read() {
    return { unsafe: true };
  }
}

describe('C1 PQ-03/07/10 — HTTP guard/context', () => {
  let app: NestExpressApplication;
  const resolve = vi.fn();
  const active = vi.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        GuardController,
        MissingContextController,
        MissingMetadataController,
      ],
      providers: [
        AdminScopeGuard,
        { provide: AdminScopeService, useValue: { resolve } },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        {
          provide: TokenService,
          useValue: {
            verifyAccessToken: vi
              .fn()
              .mockResolvedValue({ sub: '1', sid: '1' }),
          },
        },
        { provide: SessionService, useValue: { resolveActive: active } },
      ],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    vi.clearAllMocks();
    active.mockResolvedValue({
      accountId: '1',
      sessionId: '1',
      role: 'QuanTriVien',
    });
    resolve.mockResolvedValue({ kind: 'ChiNhanh', chiNhanhId: '2' });
  });
  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', 'Bearer test');

  it('query giả không đổi context; duplicate class/method guard chỉ resolve một lần', async () => {
    const response = await get(
      '/admin/guard-test?chiNhanhId=3&adminScope=ToanHeThong',
    ).expect(200);
    expect(response.body).toEqual({ kind: 'ChiNhanh', chiNhanhId: '2' });
    expect(resolve).toHaveBeenCalledExactlyOnceWith('1');
    await get('/admin/guard-test/system').expect(403);
    resolve.mockClear().mockResolvedValue({ kind: 'ToanHeThong' });
    await get('/admin/guard-test/system').expect(200);
    expect(resolve).toHaveBeenCalledTimes(1);
  });
  it('context thiếu bị chặn; vai trò sai không gọi resolver', async () => {
    await get('/admin/no-scope-context').expect(403);
    await get('/admin/no-scope-metadata').expect(403);
    active.mockResolvedValue({
      accountId: '1',
      sessionId: '1',
      role: 'BenhNhan',
    });
    await get('/admin/guard-test').expect(403);
    expect(resolve).not.toHaveBeenCalled();
  });
});
