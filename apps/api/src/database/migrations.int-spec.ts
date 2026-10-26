import type { DataSource } from 'typeorm';
import {
  listMigrations,
  revertLastMigration,
  runPendingMigrations,
} from './migration-runner.js';
import { MIGRATIONS } from './migrations/index.js';
import {
  createTestDataSource,
  listTables,
  readTestDbSettings,
  recreateDatabase,
} from './testing/test-database.js';

// Task P3 — không có mã test case riêng trong plan auth. Vòng đời migration trên một DB riêng (clinix_migration_test)
// để không làm hỏng DB dùng chung của các file test khác.
const AUTH_TABLES = [
  'benh_nhan',
  'ma_xac_thuc',
  'phien_dang_nhap',
  'tai_khoan',
  'vi_noi_bo',
];
const settings = readTestDbSettings(process.env, 'clinix_migration_test');
let dataSource: DataSource;

beforeAll(async () => {
  await recreateDatabase(settings);
  dataSource = await createTestDataSource(settings);
});

afterAll(async () => {
  await dataSource?.destroy();
});

describe('vòng đời migration', () => {
  it('DB mới tinh: chưa có bảng nào và mọi migration ở trạng thái chưa áp dụng', async () => {
    expect(await listTables(dataSource)).toEqual([]);
    const status = await listMigrations(dataSource);
    expect(status).toHaveLength(MIGRATIONS.length);
    expect(status.every((item) => !item.executed)).toBe(true);
  });

  it('up: áp dụng migration và tạo đủ 5 bảng của auth', async () => {
    const done = await runPendingMigrations(dataSource);
    expect(done).toEqual(MIGRATIONS.map((migration) => migration.name));
    expect(await listTables(dataSource)).toEqual(
      expect.arrayContaining(AUTH_TABLES),
    );
    expect(
      (await listMigrations(dataSource)).every((item) => item.executed),
    ).toBe(true);
  });

  it('up lần hai không làm gì', async () => {
    expect(await runPendingMigrations(dataSource)).toEqual([]);
  });

  it('down hoàn tác đúng migration cuối: xóa các bảng của nó, rồi up lại được', async () => {
    const last = MIGRATIONS.at(-1)?.name;
    expect(await revertLastMigration(dataSource)).toBe(last);
    const tables = await listTables(dataSource);
    for (const table of AUTH_TABLES) expect(tables).not.toContain(table);
    expect((await listMigrations(dataSource)).at(-1)?.executed).toBe(false);

    expect(await runPendingMigrations(dataSource)).toEqual([last]);
    expect(await listTables(dataSource)).toEqual(
      expect.arrayContaining(AUTH_TABLES),
    );
  });

  it('hoàn tác hết rồi hoàn tác tiếp: trả về null, không lỗi', async () => {
    for (let i = 0; i < MIGRATIONS.length; i++)
      await revertLastMigration(dataSource);
    expect(await revertLastMigration(dataSource)).toBeNull();
    expect(await runPendingMigrations(dataSource)).toHaveLength(
      MIGRATIONS.length,
    );
  });
});
