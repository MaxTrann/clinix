import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { MailService } from '../src/mail/mail.service.js';
import {
  resetTables,
  readTestDbSettings,
} from '../src/database/testing/test-database.js';
import { runSeed } from '../src/database/seeds/seed.service.js';
import { DEV_ACCOUNTS } from '../src/database/seeds/dev-account-data.js';

describe('C5 SD-05 — HTTP login thật cho dữ liệu seed (manual riêng)', () => {
  let app: NestExpressApplication;
  const password = `${randomBytes(16).toString('hex')}1!`;
  const mail = { send: vi.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue(mail)
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    const db = app.get(DataSource);
    await resetTables(db);
    const database = readTestDbSettings();
    await runSeed(db, { command: 'catalog', database });
    await runSeed(db, { command: 'dev-accounts', database, password });
  });
  afterAll(async () => {
    await app?.close();
  });

  it.each(DEV_ACCOUNTS)(
    'SD-05 đăng nhập $role/$email đúng vai trò và phạm vi',
    async (account) => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: account.email, matKhau: password });
      // Không snapshot/in body chứa token hoặc cookie kể cả khi assertion lỗi.
      expect(response.status).toBe(200);
      expect(response.body.vaiTro).toBe(account.role);
      expect(typeof response.body.accessToken).toBe('string');
      if (account.role === 'QuanTriVien') {
        const me = await request(app.getHttpServer())
          .get('/admin/me')
          .set('Authorization', `Bearer ${response.body.accessToken}`);
        expect(me.status).toBe(200);
        expect(me.body.phamVi).toBe(account.scope);
        if (account.scope === 'ChiNhanh')
          expect(me.body.chiNhanh.ten).toBe('CLINIX Mẫu 1');
        else expect(Object.hasOwn(me.body, 'chiNhanh')).toBe(false);
      }
      expect(mail.send).not.toHaveBeenCalled();
    },
  );
});
