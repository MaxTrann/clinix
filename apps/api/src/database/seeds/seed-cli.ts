import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../data-source.js';
import { readSeedConfig, type SeedEnv } from './seed-config.js';
import { SeedError } from './seed-error.js';
import { runSeed } from './seed.service.js';

interface SeedOutput {
  log: (message: string) => void;
  error: (message: string) => void;
}

// Một biên lỗi cho toàn CLI: không đưa raw exception/driver.message ra stdout/stderr.
export async function seedCli(
  args: string[],
  env: SeedEnv,
  output: SeedOutput = console,
): Promise<number> {
  let db: DataSource | undefined;
  let exitCode = 1;
  try {
    if (args.length !== 1) throw new SeedError('SEED_COMMAND_INVALID');
    const config = readSeedConfig(args[0], env);
    db = new DataSource(buildDataSourceOptions(config.database));
    await db.initialize();
    const check = db.createQueryRunner();
    try {
      if (!(await check.hasTable('migrations')))
        throw new SeedError('SEED_MIGRATIONS_REQUIRED');
    } finally {
      await check.release();
    }
    if (await db.showMigrations())
      throw new SeedError('SEED_MIGRATIONS_REQUIRED');
    const counts = await runSeed(db, config);
    output.log(
      `Seed ${config.command}: created=${counts.created}, skipped=${counts.skipped}.`,
    );
    if (config.command !== 'first-admin')
      output.log(
        'Dữ liệu minh họa/dev; không phải quyết định nghiệp vụ chính thức.',
      );
    exitCode = 0;
  } catch (error) {
    output.error(error instanceof SeedError ? error.code : 'SEED_FAILED');
  } finally {
    if (db?.isInitialized) {
      // Không để lỗi destroy làm Node in unhandled rejection chứa thông tin driver.
      await db.destroy().catch(() => {
        output.error('SEED_CLOSE_FAILED');
        exitCode = 1;
      });
    }
  }
  return exitCode;
}
