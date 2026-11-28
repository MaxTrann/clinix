import { defineConfig } from 'vitest/config';
import { applyTestEnv } from './vitest.test-env.js';

// dashboard X1: phép đo thật M1 đến M4 (PLAN dashboard 5.14). KHÔNG thuộc `test`, `test:int` hay CI; chạy tay bằng `npm run perf:dashboard`.
// Không có globalSetup: KHÔNG đụng `clinix_test`. Spec tự tạo (hoặc dùng lại) DB tạm riêng `clinix_dashboard_perf_test`.
applyTestEnv();
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['src/dashboard/testing/*.perf-spec.ts'],
    fileParallelism: false,
    testTimeout: 1_800_000,
    hookTimeout: 1_800_000,
  },
});
