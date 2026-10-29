import 'reflect-metadata';
import { ServiceUnavailableException } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { configureApp } from '../../../app.setup.js';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../../auth/guards/roles.guard.js';
import { SessionService } from '../../../auth/session/session.service.js';
import { TokenService } from '../../../auth/session/token.service.js';
import {
  UploadCapacityInterceptor,
  UploadController,
} from '../upload.controller.js';
import { UploadService } from '../upload.service.js';
import { AdminScopeService } from '../../../rbac/admin-scope.service.js';
import { AdminScopeGuard } from '../../../rbac/guards/admin-scope.guard.js';
import { SPECIALTY_IMAGE_POLICY as P } from '../upload-policy.js';

describe('CK-11/SE-A7 — HTTP multipart với JwtAuthGuard/RolesGuard thật', () => {
  let app: NestExpressApplication;
  const upload = vi.fn();
  const resolveScope = vi.fn();
  const sessions = { resolveActive: vi.fn() };
  const tokens = { verifyAccessToken: vi.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [
        AdminScopeGuard,
        UploadCapacityInterceptor,
        { provide: UploadService, useValue: { upload } },
        { provide: AdminScopeService, useValue: { resolve: resolveScope } },
        { provide: SessionService, useValue: sessions },
        { provide: TokenService, useValue: tokens },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    tokens.verifyAccessToken.mockResolvedValue({ sid: 's', sub: '1' });
    sessions.resolveActive.mockResolvedValue({
      accountId: '1',
      sessionId: 's',
      role: 'QuanTriVien',
    });
    resolveScope.mockResolvedValue({ kind: 'ToanHeThong' });
    upload.mockResolvedValue({
      uploadId: 'id',
      url: 'https://example.test/anh',
      expiresAt: new Date().toISOString(),
    });
  });
  const path = '/admin/uploads/specialty-image';
  const authenticated = () =>
    request(app.getHttpServer()).post(path).set('Authorization', 'Bearer test');

  it('chưa đăng nhập/sai role bị chặn trước upload', async () => {
    await request(app.getHttpServer()).post(path).expect(401);
    sessions.resolveActive.mockResolvedValue({
      accountId: '1',
      sessionId: 's',
      role: 'BenhNhan',
    });
    await authenticated()
      .attach('file', Buffer.from('anh'), 'anh.png')
      .expect(403);
    expect(upload).not.toHaveBeenCalled();
    expect(resolveScope).not.toHaveBeenCalled();
  });
  it('Admin Chi nhánh bị scope guard chặn trước khi xử lý file', async () => {
    resolveScope.mockResolvedValue({ kind: 'ChiNhanh', chiNhanhId: '2' });
    await authenticated()
      .attach('file', Buffer.from('anh'), 'anh.png')
      .expect(403);
    expect(upload).not.toHaveBeenCalled();
  });
  it('đúng multipart một file thì 201, thiếu file/sai field/nhiều file bị từ chối', async () => {
    const response = await authenticated()
      .attach('file', Buffer.from('anh'), 'anh.png')
      .expect(201);
    expect(response.body.uploadId).toBe('id');
    expect(upload).toHaveBeenCalledWith('1', Buffer.from('anh'), 'anh.png');
    await authenticated().expect(400);
    await authenticated()
      .attach('other', Buffer.from('anh'), 'anh.png')
      .expect(400);
    await authenticated()
      .attach('file', Buffer.from('a'), 'a.png')
      .attach('file', Buffer.from('b'), 'b.png')
      .expect(400);
  });
  it('file quá cỡ 413; provider 503 giữ envelope LOI_HE_THONG + requestId', async () => {
    await authenticated()
      .attach('file', Buffer.alloc(P.inputBytes), 'dung-bien.png')
      .expect(201);
    await authenticated()
      .attach('file', Buffer.alloc(P.inputBytes + 1), 'lon.png')
      .expect(413);
    upload.mockRejectedValue(new ServiceUnavailableException());
    const response = await authenticated()
      .attach('file', Buffer.from('a'), 'a.png')
      .expect(503);
    expect(response.body.maLoi).toBe('LOI_HE_THONG');
    expect(response.body.requestId).toEqual(expect.any(String));
  });
  it('chỉ hai request hoạt động; khi hoàn tất trả lại slot', async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    upload.mockImplementation(async () => {
      await waiting;
      return { uploadId: 'id' };
    });
    const first = authenticated()
      .attach('file', Buffer.from('a'), 'a.png')
      .then((response) => response);
    const second = authenticated()
      .attach('file', Buffer.from('b'), 'b.png')
      .then((response) => response);
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    try {
      await authenticated()
        .attach('file', Buffer.from('c'), 'c.png')
        .expect(503);
    } finally {
      release();
      await Promise.all([first, second]);
    }
    await authenticated().attach('file', Buffer.from('d'), 'd.png').expect(201);
  });
});
