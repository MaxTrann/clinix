import type { NestExpressApplication } from '@nestjs/platform-express';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import {
  UNVERIFIED_CLEANUP_CRON,
  UNVERIFIED_CLEANUP_JOB_NAME,
} from './../src/auth/auth.constants.js';
import { TaiKhoanRepository } from './../src/auth/repositories/tai-khoan.repository.js';
import { UnverifiedPatientCleanupJob } from './../src/auth/register/unverified-patient-cleanup.job.js';
import {
  DAY,
  GONE,
  INTACT,
  seedAccountWithChildren,
  stateOf,
} from './../src/auth/testing/cleanup-int-helpers.js';
import {
  allLines,
  captureLogsByLevel,
  type LogsByLevel,
} from './../src/auth/testing/log-levels.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import { REGISTER_PASSWORD } from './../src/auth/testing/register-int-helpers.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { MailService } from './../src/mail/mail.service.js';
import { FakeMailService } from './../src/mail/testing/fake-mail.service.js';

// Task A7 — job dọn trong AppModule THẬT (MySQL thật, configureApp như main.ts, MailService giả): đăng ký đúng một lần với bộ lập lịch, tắt ở NODE_ENV=test,
// chạy qua đúng đường của bộ lập lịch (hàm bọc của framework), và đăng ký lại cùng email qua HTTP sau khi dọn (DK-36). Mã E2E-Jnn là [đề xuất].
const mail = new FakeMailService();
let app: NestExpressApplication;
let db: DataSource;
let logs: LogsByLevel;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  db = app.get(DataSource);
});

beforeEach(async () => {
  await resetTables(db);
  mail.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  logs = captureLogsByLevel();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await app.close();
});

// Bộ lập lịch gọi hàm bọc trong try/catch rồi bỏ mặc kết quả (không đợi): test chờ kết quả thật trong DB
const fireScheduler = (): Promise<void> =>
  app
    .get(SchedulerRegistry)
    .getCronJob(UNVERIFIED_CLEANUP_JOB_NAME)
    .fireOnTick();

/** Số lần `ScheduleModule` được dựng trong cây import: mỗi lần gọi `forRoot()` là một module riêng nên job chạy gấp đôi mỗi nhịp. */
interface DynamicModuleLike {
  module: unknown;
  imports?: unknown[];
}
const isDynamic = (entry: unknown): entry is DynamicModuleLike =>
  typeof entry === 'object' && entry !== null && 'module' in entry;

function scheduleModuleInstances(
  entry: unknown,
  seen = new Set<unknown>(),
): number {
  if (seen.has(entry)) return 0;
  seen.add(entry);
  const moduleClass = isDynamic(entry) ? entry.module : entry;
  const staticImports = (Reflect.getMetadata(
    'imports',
    moduleClass as object,
  ) ?? []) as unknown[];
  const imports = [
    ...staticImports,
    ...(isDynamic(entry) ? (entry.imports ?? []) : []),
  ];
  return (
    (moduleClass === ScheduleModule ? 1 : 0) +
    imports.reduce<number>(
      (sum, child) => sum + scheduleModuleInstances(child, seen),
      0,
    )
  );
}

describe('đăng ký với bộ lập lịch', () => {
  it('(E2E-J01) job nằm trong registry ĐÚNG một lần với đúng biểu thức (phút 15 mỗi giờ) và đang TẮT vì NODE_ENV=test', () => {
    const registry = app.get(SchedulerRegistry);
    const names = [...registry.getCronJobs().keys()].filter(
      (name) => name === UNVERIFIED_CLEANUP_JOB_NAME,
    );
    expect(names).toEqual([UNVERIFIED_CLEANUP_JOB_NAME]);

    const cron = registry.getCronJob(UNVERIFIED_CLEANUP_JOB_NAME);
    expect(cron.cronTime.source).toBe(UNVERIFIED_CLEANUP_CRON);
    expect(cron.isActive).toBe(false);
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('(E2E-J02) cây import của AppModule có đúng MỘT ScheduleModule (UploadModule đã đăng ký toàn cục; gọi forRoot() thêm lần nữa làm mọi job chạy gấp đôi)', () => {
    expect(scheduleModuleInstances(AppModule)).toBe(1);
  });

  it('(E2E-J03) job là provider của AuthModule và có thể lấy từ ứng dụng thật', () => {
    expect(
      app.get(UnverifiedPatientCleanupJob, { strict: false }),
    ).toBeInstanceOf(UnverifiedPatientCleanupJob);
  });
});

describe('chạy qua đúng đường của bộ lập lịch', () => {
  it('(E2E-J04 / DK-33, DK-36) bộ lập lịch gọi job: tài khoản quá hạn bị xoá cùng hàng con, tài khoản chưa quá hạn còn; rồi đăng ký lại cùng email qua HTTP được 201', async () => {
    const old = await seedAccountWithChildren(db, DAY + 60, {
      email: 'qua.han@example.com',
    });
    const young = await seedAccountWithChildren(db, DAY - 60, {
      email: 'con.han@example.com',
    });

    void fireScheduler();
    await vi.waitFor(async () => {
      expect(await stateOf(db, old.taiKhoanId)).toBe(GONE);
    });
    expect(await stateOf(db, young.taiKhoanId)).toBe(INTACT);

    const res = await request(app.getHttpServer()).post('/auth/register').send({
      hoTen: 'Nguyễn Văn A',
      email: 'qua.han@example.com',
      soDienThoai: '0901234567',
      matKhau: REGISTER_PASSWORD,
      xacNhan: REGISTER_PASSWORD,
    });
    expect(res.status).toBe(201);
  });

  it('(E2E-J05 / SE-04) lỗi đọc danh sách ứng viên (message chứa email): hàm bọc của framework KHÔNG nhận lỗi nào để log nguyên văn; log chỉ có loại lỗi, không có email', async () => {
    const secret = 'bi.mat.e2e@example.com';
    vi.spyOn(
      app.get(TaiKhoanRepository, { strict: false }),
      'findExpiredUnverifiedPatientIds',
    ).mockRejectedValueOnce(new Error(`đọc lỗi ${secret}`));

    void fireScheduler();
    await vi.waitFor(() => {
      expect(logs.error).toEqual([
        'Dọn tài khoản chưa xác minh: không đọc được danh sách ứng viên (Error)',
      ]);
    });
    expect(allLines(logs).join('\n')).not.toContain(secret);
  });
});
