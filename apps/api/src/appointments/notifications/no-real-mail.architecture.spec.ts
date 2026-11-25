import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// notification B4 — EMT-11 (không gửi thư thật trong test): quét MỌI file test của API (`src/**` và `test/**`, kể cả thư mục `testing/`). Ngoài `src/mail/` (nơi kiểm chính `SmtpMailService` bằng
// transport không mạng của nodemailer và máy chủ SMTP giả), không file test nào được import `nodemailer`, gọi `createTransport` hay ĐỌC `process.env.SMTP_*` (các bài kiểm cấu hình chỉ dùng tên biến với giá trị giả): mọi luồng thư khác phải đi qua `FakeMailService`.
// `NODE_ENV=test` tắt `EmailOutboxJob` đã có ca riêng (OBX-09 ở email-outbox.job.spec.ts và AppModule thật ở các e2e).
const API_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const MAIL_DIR = join(API_ROOT, 'src', 'mail');
// Bỏ chính file này (chứa các mẫu cần tìm)
const SELF = fileURLToPath(import.meta.url);

function testFiles(dir: string, inTesting = false): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === 'node_modules'
        ? []
        : testFiles(full, inTesting || entry.name === 'testing');
    const isTest = /\.(spec|int-spec|e2e-spec)\.ts$/.test(entry.name);
    return entry.name.endsWith('.ts') && (isTest || inTesting) ? [full] : [];
  });
}

const files = [
  ...testFiles(join(API_ROOT, 'src')),
  ...testFiles(join(API_ROOT, 'test')),
].filter((file) => !file.startsWith(MAIL_DIR) && file !== SELF);

describe('EMT-11 không có đường gửi thư thật trong mã test ngoài src/mail/', () => {
  it('có đủ file để quét', () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it('không import nodemailer, không createTransport, không đọc process.env.SMTP_*', () => {
    const offenders = files
      .filter((file) =>
        /from ['"]nodemailer['"]|\bcreateTransport\s*\(|process\.env(?:\.|\[['"])SMTP_/.test(
          readFileSync(file, 'utf8'),
        ),
      )
      .map((file) => relative(API_ROOT, file).replaceAll('\\', '/'));
    expect(offenders).toEqual([]);
  });
});
