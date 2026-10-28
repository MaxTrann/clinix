import { defineConfig } from 'vitest/config';
import { applyTestEnv } from './vitest.test-env.js';

// P7 chỉ TẠO DB mới có tên riêng, không DROP/reset DB hiện có.
applyTestEnv();
process.env.TEST_DB_NAME = `clinix_p7_${Date.now()}_test`;
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    include: ['src/common/upload/test/upload.int-spec.ts'],
    globalSetup: ['./src/common/upload/testing/p7-global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
