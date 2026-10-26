import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMetadataArgsStorage } from 'typeorm';
import { ENTITIES } from './entities.js';
import { MIGRATIONS } from './migrations/index.js';

// Task P3 — không có mã test case riêng trong plan auth. Bắt lỗi quên đăng ký khi module khác thêm entity/migration.
const SRC = fileURLToPath(new URL('..', import.meta.url));

function filesUnder(dir: string, suffix: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(full, suffix);
    return entry.name.endsWith(suffix) ? [full] : [];
  });
}

describe('sổ đăng ký entity và migration', () => {
  it('mọi file *.entity.ts đều nằm trong ENTITIES và ngược lại', async () => {
    const files = filesUnder(SRC, '.entity.ts');
    expect(files.length).toBeGreaterThan(0);
    const registered = new Set<unknown>(ENTITIES);
    for (const file of files) {
      const module = (await import(/* @vite-ignore */ file)) as Record<
        string,
        unknown
      >;
      const entityClasses = Object.values(module).filter(
        (value) =>
          typeof value === 'function' &&
          getMetadataArgsStorage().tables.some(
            (table) => table.target === value,
          ),
      );
      expect(entityClasses.length, relative(SRC, file)).toBeGreaterThan(0);
      for (const entityClass of entityClasses) {
        expect(
          registered.has(entityClass),
          `${relative(SRC, file)} chưa có trong ENTITIES`,
        ).toBe(true);
      }
    }
    expect(new Set(ENTITIES).size).toBe(ENTITIES.length);
  });

  it('mọi file migration đều có trong MIGRATIONS, đúng thứ tự thời gian, tên lớp kết thúc bằng timestamp', () => {
    const files = filesUnder(join(SRC, 'database', 'migrations'), '.ts').filter(
      (f) => !f.endsWith('index.ts'),
    );
    const timestamps = files.map((f) =>
      Number(/(\d{13})-[\w-]+\.ts$/.exec(f)?.[1]),
    );
    expect(timestamps.every(Number.isFinite)).toBe(true);
    expect(MIGRATIONS).toHaveLength(files.length);
    const registeredTimestamps = MIGRATIONS.map((m) =>
      Number(/(\d{13})$/.exec(m.name)?.[1]),
    );
    expect(registeredTimestamps).toEqual([...timestamps].sort((a, b) => a - b));
    expect(new Set(registeredTimestamps).size).toBe(MIGRATIONS.length);
  });
});
