import { vi } from 'vitest';
import { REDACTED, collectSecretValues } from '../common/logging/sanitize.js';
import { createAppLogger } from '../common/logging/sanitizing.logger.js';
import { fakeSecretValue } from '../common/testing/sample-secrets.js';
import { readMailConfig } from './mail-config.js';
import { SmtpMailService } from './smtp-mail.service.js';

// Task P4. Mật khẩu ứng dụng Gmail nằm ở SMTP_PASS và phải được logger của P5 che (collectSecretValues theo tên biến). Đây là lớp phòng thủ
// THỨ HAI: lớp thứ nhất là mã mail không bao giờ ghi nó ra log (smtp-mail.service.spec.ts). Mã nội bộ MAIL-27… là [đề xuất].
const PASS = fakeSecretValue('smtp');
const RECIPIENT = 'benh.nhan@example.test';
const OTP = '482913';

function captureOutput(): () => string {
  const chunks: string[] = [];
  const capture = (chunk: unknown): boolean => {
    chunks.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stdout, 'write').mockImplementation(capture);
  vi.spyOn(process.stderr, 'write').mockImplementation(capture);
  return () => chunks.join('');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Che SMTP_PASS khỏi log (MAIL-27)', () => {
  it('collectSecretValues lấy SMTP_PASS (khớp quy tắc tên biến) nhưng không lấy SMTP_USER hay SMTP_HOST', () => {
    const secrets = collectSecretValues({
      SMTP_HOST: 'smtp.example.test',
      SMTP_USER: 'clinix@example.test',
      SMTP_PASS: PASS,
      MAIL_FROM_ADDRESS: 'clinix@example.test',
    });
    expect(secrets).toEqual([PASS]);
  });

  it('logger của ứng dụng (createAppLogger) che SMTP_PASS trong chuỗi, đối tượng và Error', () => {
    const output = captureOutput();
    const logger = createAppLogger({ SMTP_PASS: PASS });

    logger.warn(`đăng nhập SMTP lỗi với ${PASS}`);
    logger.error(new Error(`AUTH thất bại, mật khẩu ${PASS}`));
    logger.log({ ghiChu: `mật khẩu là ${PASS}` });

    expect(output()).not.toContain(PASS);
    expect(output()).toContain(REDACTED);
  });

  it('SmtpMailService dùng logger thật của ứng dụng: gửi lỗi mà thông điệp lỗi gốc chứa mật khẩu thì log vẫn sạch (cả địa chỉ và mã)', async () => {
    const output = captureOutput();
    const config = readMailConfig({
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: 465,
      SMTP_USER: 'clinix@example.test',
      SMTP_PASS: PASS,
      MAIL_FROM_NAME: 'CLINIX',
      MAIL_FROM_ADDRESS: undefined,
      MAIL_SUPPORT_ADDRESS: undefined,
    });
    const service = new SmtpMailService(
      config,
      {
        sendMail: () =>
          Promise.reject(
            Object.assign(new Error(`lỗi ${PASS} ${RECIPIENT} ${OTP}`), {
              code: 'EAUTH',
              command: 'AUTH PLAIN',
              responseCode: 535,
            }),
          ),
      },
      createAppLogger({ SMTP_PASS: PASS }),
    );

    await expect(
      service.send({ to: RECIPIENT, subject: 'Tiêu đề', text: `Mã ${OTP}` }),
    ).rejects.toMatchObject({ kind: 'AUTH' });

    const logs = output();
    expect(logs).toContain('kind=AUTH');
    for (const secret of [PASS, RECIPIENT, OTP]) {
      expect(logs).not.toContain(secret);
    }
  });

  it('GIỚI HẠN ĐÃ BIẾT: bộ che so khớp nguyên văn giá trị trong .env, nên dạng Google hiển thị (4 nhóm cách nhau dấu cách) dán vào .env thì biến thể bỏ dấu cách KHÔNG được che', () => {
    const groups = ['abcd', 'efgh', 'ijkl', 'mnop'];
    const spaced = groups.join(' ');
    const compact = groups.join('');
    const output = captureOutput();
    const logger = createAppLogger({ SMTP_PASS: spaced });

    logger.warn(`dạng gốc ${spaced}`);
    logger.warn(`dạng liền ${compact}`);

    expect(output()).not.toContain(spaced);
    expect(output()).toContain(compact);
    // Vì vậy docs/DEV_SETUP.md dặn gõ mật khẩu ứng dụng LIỀN 16 ký tự, không dấu cách [cần kiểm khi tạo Gmail thật, N8]
  });
});
