import { defineConfig } from 'vitest/config';
import { applyTestEnv } from './vitest.test-env.js';

// Test tích hợp với MySQL thật (cần `docker compose up -d db` hoặc service MySQL trên CI).
// Chạy TUẦN TỰ vì mọi file dùng chung một DB test.
applyTestEnv();

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.int-spec.ts'],
    globalSetup: ['./src/database/testing/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    coverage: {
      // Phần DB (data-source, migration, entity) chỉ được test tích hợp chạm tới nên báo coverage riêng ở coverage/int
      include: ['src/**/*.ts'],
      exclude: [
        'src/main.ts',
        'src/database/migrate.ts',
        'src/**/*spec.ts',
        'src/**/testing/**',
      ],
      reportsDirectory: './coverage/int',
    },
  },
});
