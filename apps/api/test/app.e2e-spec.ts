import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';

// Task P1/P3 — không có mã test case riêng trong plan auth.
// AppModule nay nối MySQL thật (DB test đã chạy migration ở globalSetup), nên chạy bằng `npm run test:e2e`.
describe('Health (e2e)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app); // đúng cấu hình như main.ts
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health → 200 { status: "ok" }', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('không có global prefix: /api/health và / đều 404', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(404);
    await request(app.getHttpServer()).get('/').expect(404);
  });

  it('AppModule nối đúng DB test, đã có 5 bảng auth và múi giờ session +07:00', async () => {
    const dataSource = app.get(DataSource);
    expect(dataSource.isInitialized).toBe(true);
    expect(dataSource.options.synchronize).toBe(false);

    const [dbRow] = await dataSource.query(
      'SELECT DATABASE() AS ten, @@session.time_zone AS tz',
    );
    expect(dbRow.ten).toBe('clinix_test');
    expect(dbRow.tz).toBe('+07:00');

    const tables: { name: string }[] = await dataSource.query(
      'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()',
    );
    expect(tables.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        'tai_khoan',
        'benh_nhan',
        'ma_xac_thuc',
        'phien_dang_nhap',
        'vi_noi_bo',
      ]),
    );
  });
});
