import type { DataSource } from 'typeorm';

export interface MigrationStatus {
  name: string;
  executed: boolean;
}

async function executedNames(dataSource: DataSource): Promise<string[]> {
  const queryRunner = dataSource.createQueryRunner();
  try {
    if (!(await queryRunner.hasTable('migrations'))) return [];
    const rows: { name: string }[] = await queryRunner.query(
      'SELECT `name` FROM `migrations` ORDER BY `id`',
    );
    return rows.map((row) => row.name);
  } finally {
    await queryRunner.release();
  }
}

/** Áp dụng mọi migration chưa chạy; trả về tên các migration vừa chạy (rỗng nếu đã mới nhất). */
export async function runPendingMigrations(
  dataSource: DataSource,
): Promise<string[]> {
  const done = await dataSource.runMigrations();
  return done.map((migration) => migration.name);
}

/** Hoàn tác đúng MỘT migration (cái chạy gần nhất); trả về tên của nó, hoặc null nếu chưa có gì để hoàn tác. */
export async function revertLastMigration(
  dataSource: DataSource,
): Promise<string | null> {
  const names = await executedNames(dataSource);
  const last = names.at(-1) ?? null;
  if (last) await dataSource.undoLastMigration();
  return last;
}

export async function listMigrations(
  dataSource: DataSource,
): Promise<MigrationStatus[]> {
  const executed = new Set(await executedNames(dataSource));
  return dataSource.migrations.map((migration) => {
    const name = migration.name ?? migration.constructor.name;
    return { name, executed: executed.has(name) };
  });
}
