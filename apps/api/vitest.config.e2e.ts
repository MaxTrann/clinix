import { defineConfig } from 'vitest/config';
import { applyTestEnv } from './vitest.test-env.js';

// e2e dựng AppModule thật nên cần MySQL (xem vitest.config.integration.ts).
applyTestEnv();

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./src/database/testing/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
