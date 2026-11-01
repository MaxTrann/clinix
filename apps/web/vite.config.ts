import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Đích proxy đọc từ biến môi trường của tiến trình (không có tiền tố VITE_ nên không lọt vào bundle).
// Chạy `npm run dev` trên máy: localhost; trong container dev: docker-compose.yml đặt http://api:3000.
const apiProxyTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // API không có tiền tố /api nên phải gỡ. Khoá có dấu / cuối để không khớp nhầm /apifoo.
      // Không bật changeOrigin; header Origin và Set-Cookie giữ nguyên (đo thật: TRACKING auth P6).
      '/api/': {
        target: apiProxyTarget,
        rewrite: (path) => path.replace(/^\/api/, ''),
        xfwd: true,
      },
    },
  },
  test: {
    environment: 'happy-dom',
    environmentOptions: { happyDOM: { url: 'http://localhost/' } },
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
