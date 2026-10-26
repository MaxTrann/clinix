import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      // Đo mọi file mã nguồn (kể cả file chưa được test chạm tới) để con số coverage không bị đẹp giả
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/**/*.test.{ts,tsx}', 'src/test/**'],
    },
  },
});
