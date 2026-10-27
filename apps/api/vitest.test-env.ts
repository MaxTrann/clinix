import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { TEST_AUTH_ENV } from './src/auth/testing/auth-test-env.js';

// Biến môi trường cho test tích hợp/e2e. Thứ tự ưu tiên: biến môi trường của tiến trình (CI) > file .env ở GỐC repo > mặc định.
// Mặc định trỏ vào MySQL của `docker compose` qua cổng đã publish, dùng tài khoản root để được phép tạo/xóa DB test.
export function applyTestEnv(): void {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
  const fileEnv = loadEnv('test', repoRoot, '');
  const get = (key: string, fallback = ''): string =>
    process.env[key] ?? fileEnv[key] ?? fallback;

  const host = get('TEST_DB_HOST', '127.0.0.1');
  const port = get('TEST_DB_PORT', '3306');
  const user = get('TEST_DB_USER', 'root');
  const password = get('TEST_DB_PASSWORD', get('MYSQL_ROOT_PASSWORD'));
  const name = get('TEST_DB_NAME', 'clinix_test');

  Object.assign(process.env, {
    TEST_DB_HOST: host,
    TEST_DB_PORT: port,
    TEST_DB_USER: user,
    TEST_DB_PASSWORD: password,
    TEST_DB_NAME: name,
    DB_TIMEZONE: get('DB_TIMEZONE', '+07:00'),
    // Cho AppModule (e2e) dùng đúng DB test
    NODE_ENV: 'test',
    DB_HOST: host,
    DB_PORT: port,
    MYSQL_DATABASE: name,
    MYSQL_USER: user,
    MYSQL_PASSWORD: password,
    DB_MIGRATIONS_RUN: 'false',
    // Khoá xác thực GIẢ cho test, ghi đè cả biến môi trường lẫn file .env: test không phụ thuộc cấu hình của từng máy
    ...TEST_AUTH_ENV,
  });
}
