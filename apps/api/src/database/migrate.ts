// Chạy migration bằng script riêng (không dùng TypeORM CLI, vì CLI với ESM chưa được thử):
//   node dist/database/migrate.js up       áp dụng mọi migration chưa chạy
//   node dist/database/migrate.js down     hoàn tác migration chạy gần nhất (chỉ một)
//   node dist/database/migrate.js status   liệt kê migration và trạng thái
// Đọc cấu hình DB từ biến môi trường như API (DB_HOST, DB_PORT, MYSQL_*, DB_TIMEZONE). Trong Docker:
//   docker compose exec api npm run migration:run
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation.js';
import { buildDataSourceOptions, dbSettingsFromEnv } from './data-source.js';
import {
  listMigrations,
  revertLastMigration,
  runPendingMigrations,
} from './migration-runner.js';

const COMMANDS = ['up', 'down', 'status'] as const;
type Command = (typeof COMMANDS)[number];

async function main(command: Command): Promise<void> {
  const env = validateEnv(process.env);
  const dataSource = new DataSource(
    buildDataSourceOptions(dbSettingsFromEnv(env)),
  );
  await dataSource.initialize();
  try {
    if (command === 'up') {
      const done = await runPendingMigrations(dataSource);
      console.log(
        done.length > 0
          ? `Đã áp dụng: ${done.join(', ')}`
          : 'Không có migration nào cần áp dụng.',
      );
    } else if (command === 'down') {
      const reverted = await revertLastMigration(dataSource);
      console.log(
        reverted
          ? `Đã hoàn tác: ${reverted}`
          : 'Chưa có migration nào để hoàn tác.',
      );
    } else {
      for (const item of await listMigrations(dataSource)) {
        console.log(`[${item.executed ? 'x' : ' '}] ${item.name}`);
      }
    }
  } finally {
    await dataSource.destroy();
  }
}

const command = process.argv[2] as Command | undefined;
if (!command || !COMMANDS.includes(command)) {
  console.error(
    `Cách dùng: node dist/database/migrate.js <${COMMANDS.join('|')}>`,
  );
  process.exit(2);
}
try {
  await main(command);
} catch (error) {
  // Không in cả đối tượng lỗi vì có thể chứa thông tin kết nối
  console.error(
    `Lỗi khi chạy migration: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
