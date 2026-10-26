import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`. Requires Vite 8, which ships this option.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    coverage: {
      // Đo mọi file mã nguồn (kể cả file chưa được test chạm tới) để con số coverage không bị đẹp giả
      include: ['src/**/*.ts'],
      // main.ts và migrate.ts là điểm vào (chạy thật ở bước kiểm tra docker/CI); testing/ là mã hỗ trợ test
      exclude: [
        'src/main.ts',
        'src/database/migrate.ts',
        'src/**/*spec.ts',
        'src/**/testing/**',
      ],
    },
  },
});
