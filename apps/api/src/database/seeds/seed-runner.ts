import { createHash } from 'node:crypto';
import type { DataSource, EntityManager, QueryRunner } from 'typeorm';
import { SeedError } from './seed-error.js';

export function seedLockName(database: string): string {
  return `clinix-seed:${createHash('sha256').update(database).digest('hex').slice(0, 48)}`;
}

async function releaseLock(runner: QueryRunner, lock: string): Promise<void> {
  const rows: { released: number | string | null }[] = await runner.query(
    'SELECT RELEASE_LOCK(?) AS released',
    [lock],
  );
  if (Number(rows[0]?.released) !== 1)
    throw new SeedError('SEED_LOCK_RELEASE_FAILED');
}

// Named lock thuộc CONNECTION, không thuộc transaction. Giữ cùng QueryRunner đến sau commit/rollback.
export async function seedTransaction<T>(
  db: DataSource,
  work: (manager: EntityManager) => Promise<T>,
  timeoutSeconds = 10,
): Promise<T> {
  const runner = db.createQueryRunner();
  const lock = seedLockName(String(db.options.database));
  let acquired = false;
  try {
    await runner.connect();
    const rows: { acquired: number | string | null }[] = await runner.query(
      'SELECT GET_LOCK(?, ?) AS acquired',
      [lock, timeoutSeconds],
    );
    // TypeORM/mysql2 trả BIGINT expression như GET_LOCK thành chuỗi trong cấu hình hiện hữu.
    if (Number(rows[0]?.acquired) !== 1)
      throw new SeedError('SEED_LOCK_UNAVAILABLE');
    acquired = true;
    await runner.startTransaction();
    const result = await work(runner.manager);
    await runner.commitTransaction();
    return result;
  } catch (error) {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    throw error;
  } finally {
    try {
      if (acquired) {
        await releaseLock(runner, lock);
      }
    } finally {
      await runner.release();
    }
  }
}
