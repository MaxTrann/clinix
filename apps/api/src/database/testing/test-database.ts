// Hạ tầng dùng chung cho TEST TÍCH HỢP với MySQL thật (module admin xây fixture/factory lên trên các hàm này).
// Quy ước: test chỉ chạy trên DB có tên kết thúc bằng `_test` và chạy TUẦN TỰ (fileParallelism: false).
import 'reflect-metadata';
import mysql from 'mysql2/promise';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions, type DbSettings } from '../data-source.js';
import { runPendingMigrations } from '../migration-runner.js';

export const TEST_DB_DEFAULT_NAME = 'clinix_test';

/** Chặn lỡ tay chạy test (có TRUNCATE/DROP) lên DB dev hoặc staging. */
export function assertTestDatabaseName(name: string): void {
  if (!/^[a-z][a-z0-9_]*_test$/.test(name)) {
    throw new Error(
      `Từ chối dùng DB "${name}" cho test: tên DB test phải viết thường và kết thúc bằng "_test".`,
    );
  }
}

type Env = Record<string, string | undefined>;

/** Cấu hình DB test từ TEST_DB_*; mặc định trỏ vào MySQL của `docker compose` qua cổng đã publish. */
export function readTestDbSettings(
  env: Env = process.env,
  database?: string,
): DbSettings {
  const name = database ?? env.TEST_DB_NAME ?? TEST_DB_DEFAULT_NAME;
  assertTestDatabaseName(name);
  return {
    host: env.TEST_DB_HOST ?? '127.0.0.1',
    port: Number(env.TEST_DB_PORT ?? '3306'),
    username: env.TEST_DB_USER ?? 'root',
    password: env.TEST_DB_PASSWORD ?? '',
    database: name,
    timezone: env.DB_TIMEZONE ?? '+07:00',
  };
}

async function withServerConnection<T>(
  settings: DbSettings,
  work: (connection: mysql.Connection) => Promise<T>,
): Promise<T> {
  // Kết nối vào server (chưa chọn DB) để tạo/xóa DB; chờ MySQL khởi động xong (container mới bật)
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const connection = await mysql.createConnection({
        host: settings.host,
        port: settings.port,
        user: settings.username,
        password: settings.password,
      });
      try {
        return await work(connection);
      } finally {
        await connection.end();
      }
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

/** Xóa rồi tạo lại DB test (utf8mb4, đúng collation của schema). */
export async function recreateDatabase(settings: DbSettings): Promise<void> {
  assertTestDatabaseName(settings.database);
  await withServerConnection(settings, async (connection) => {
    await connection.query(`DROP DATABASE IF EXISTS \`${settings.database}\``);
    await connection.query(
      `CREATE DATABASE \`${settings.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  });
}

export async function createTestDataSource(
  settings: DbSettings,
): Promise<DataSource> {
  assertTestDatabaseName(settings.database);
  const dataSource = new DataSource(buildDataSourceOptions(settings));
  await dataSource.initialize();
  return dataSource;
}

/** DB test mới tinh đã áp dụng mọi migration. */
export async function createMigratedTestDatabase(
  settings: DbSettings,
): Promise<DataSource> {
  await recreateDatabase(settings);
  const dataSource = await createTestDataSource(settings);
  await runPendingMigrations(dataSource);
  return dataSource;
}

/** Tên các bảng hiện có trong DB (có cả bảng `migrations`), sắp xếp theo tên. */
export async function listTables(dataSource: DataSource): Promise<string[]> {
  const rows: { name: string }[] = await dataSource.query(
    'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name',
  );
  return rows.map((row) => row.name);
}

/** Xóa sạch dữ liệu mọi bảng (trừ bảng `migrations`) để các test không ảnh hưởng nhau. */
export async function resetTables(dataSource: DataSource): Promise<void> {
  assertTestDatabaseName(String(dataSource.options.database));
  // Cần đúng MỘT kết nối cho cả chuỗi lệnh vì FOREIGN_KEY_CHECKS là biến của session
  const queryRunner = dataSource.createQueryRunner();
  try {
    const rows: { name: string }[] = await queryRunner.query(
      'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> ?',
      ['migrations'],
    );
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
      for (const { name } of rows)
        await queryRunner.query(`TRUNCATE TABLE \`${name}\``);
    } finally {
      await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
    }
  } finally {
    await queryRunner.release();
  }
}
