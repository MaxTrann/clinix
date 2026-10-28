import mysql from 'mysql2/promise';
import {
  createTestDataSource,
  readTestDbSettings,
} from '../../../database/testing/test-database.js';
import { runPendingMigrations } from '../../../database/migration-runner.js';

export default async function setup(): Promise<void> {
  const settings = readTestDbSettings();
  if (!/^clinix_p7_\d+_test$/.test(settings.database))
    throw new Error('P7 chỉ được tạo DB test mới có timestamp');
  const server = await mysql.createConnection({
    host: settings.host,
    port: settings.port,
    user: settings.username,
    password: settings.password,
  });
  try {
    // Không IF NOT EXISTS: tên trùng phải dừng, không dùng nhầm dữ liệu cũ.
    await server.query(
      `CREATE DATABASE \`${settings.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await server.end();
  }
  const db = await createTestDataSource(settings);
  try {
    await runPendingMigrations(db);
  } finally {
    await db.destroy();
  }
}
