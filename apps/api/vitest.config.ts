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
      exclude: ['src/main.ts', 'src/**/*.spec.ts'],
    },
  },
});
