import { Logger, type LoggerService } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { vi } from 'vitest';
import { fakeSecretValue } from '../common/testing/sample-secrets.js';
import {
  buildSmtpTransportOptions,
  readMailConfig,
  type MailConfig,
  type SmtpTimeouts,
} from './mail-config.js';
import type { MailSendError } from './mail-send.error.js';
import { SmtpMailService } from './smtp-mail.service.js';
import type { MailMessage } from './mail.service.js';
import {
  startFakeSmtpServer,
  type FakeSmtpServer,
  type FakeSmtpServerOptions,
} from './testing/fake-smtp-server.js';

// Task P4. Truy vết ĐK b6, QMK b5. Mã nội bộ MAIL-19… là [đề xuất].
// Chạy nodemailer THẬT qua TCP tới máy chủ SMTP giả ở 127.0.0.1 (viết bằng node:net, không thêm gói). Máy chủ giả không nói TLS, nên với
// cấu hình thật (requireTLS) nodemailer phải dừng ở bước STARTTLS: đó chính là điều cần chứng minh (không hạ cấp, không gửi mật khẩu dạng rõ).
// Phần cần Gmail thật (chứng chỉ Gmail, đăng nhập bằng App Password, thư vào hộp thư) thuộc X1.
const PASS = fakeSecretValue('smtp');
const OTP = '482913';
const RECIPIENT = 'benh.nhan@example.test';
const MESSAGE: MailMessage = {
  to: RECIPIENT,
  subject: '[CLINIX] Mã OTP đặt lại mật khẩu',
  text: `Mã OTP của bạn là: ${OTP}\n`,
};
// Hạn chờ ngắn để test nhanh; mỗi test chỉ để MỘT hạn ngắn nhằm biết chính hạn đó đã kích hoạt
const LONG = 5_000;
const SHORT = 300;

let server: FakeSmtpServer | undefined;
beforeEach(() => {
  // Ca không tự bắt log thì tắt tiếng logger mặc định của Nest để đầu ra test không nhiễu
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await server?.close();
  server = undefined;
});

function config(port: number): MailConfig {
  const base = readMailConfig({
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: port,
    SMTP_USER: 'clinix@example.test',
    SMTP_PASS: PASS,
    MAIL_FROM_NAME: 'CLINIX',
    MAIL_FROM_ADDRESS: undefined,
    MAIL_SUPPORT_ADDRESS: undefined,
  });
  if (!base) throw new Error('cấu hình test phải đủ');
  return base;
}

function capturingLogger() {
  const lines: string[] = [];
  const logger: LoggerService = {
    log: (message: unknown) => void lines.push(String(message)),
    warn: (message: unknown) => void lines.push(String(message)),
    error: (message: unknown) => void lines.push(String(message)),
  };
  return { logger, lines };
}

async function serviceFor(
  serverOptions: FakeSmtpServerOptions,
  timeouts: Partial<SmtpTimeouts> = {},
  // Máy chủ giả không nói TLS: chỉ test "đăng nhập/gửi thành công" mới tắt requireTLS. Mọi tuỳ chọn khác vẫn là của mã thật.
  insecureForFakeServer = false,
) {
  server = await startFakeSmtpServer(serverOptions);
  const options = {
    ...buildSmtpTransportOptions(config(server.port), {
      connectionTimeout: LONG,
      greetingTimeout: LONG,
      socketTimeout: LONG,
      dnsTimeout: LONG,
      ...timeouts,
    }),
    ...(insecureForFakeServer ? { requireTLS: false } : {}),
  };
  const { logger, lines } = capturingLogger();
  const service = new SmtpMailService(
    config(server.port),
    nodemailer.createTransport(options),
    logger,
  );
  return { service, lines, fake: server };
}

async function failure(promise: Promise<unknown>): Promise<MailSendError> {
  try {
    await promise;
  } catch (error) {
    return error as MailSendError;
  }
  throw new Error('Mong đợi bị từ chối nhưng đã thành công');
}

describe('TLS không bị hạ cấp (MAIL-19)', () => {
  it('máy chủ KHÔNG quảng cáo STARTTLS: dừng với lỗi TLS, không bao giờ gửi AUTH/MAIL/RCPT/DATA', async () => {
    const { service, fake } = await serviceFor({ advertiseStartTls: false });

    const error = await failure(service.send(MESSAGE));

    expect(error.kind).toBe('TLS');
    expect(fake.verbs()).toEqual(['EHLO', 'STARTTLS']);
    for (const verb of ['AUTH', 'MAIL', 'RCPT', 'DATA']) {
      expect(fake.verbs()).not.toContain(verb);
    }
  });

  it('máy chủ quảng cáo rồi từ chối STARTTLS (454): vẫn dừng, không gửi mật khẩu', async () => {
    const { service, fake } = await serviceFor({ advertiseStartTls: true });

    const error = await failure(service.send(MESSAGE));

    expect(error.kind).toBe('TLS');
    expect(error.smtpCode).toBe(454);
    expect(fake.verbs()).not.toContain('AUTH');
  });

  it('ĐỐI CHỨNG: chính máy chủ đó, nếu KHÔNG đặt requireTLS thì nodemailer gửi AUTH và thư dạng rõ (đây là nguy cơ hạ cấp mà requireTLS chặn)', async () => {
    const { service, fake } = await serviceFor(
      { advertiseStartTls: false },
      {},
      true,
    );

    await expect(service.send(MESSAGE)).resolves.toBeUndefined();

    expect(fake.verbs()).toContain('AUTH');
    expect(fake.verbs()).toContain('DATA');
  });

  it('lỗi TLS không lộ mật khẩu, địa chỉ hay mã trong log', async () => {
    const { service, lines } = await serviceFor({ advertiseStartTls: false });
    await failure(service.send(MESSAGE));
    const logs = lines.join('\n');
    expect(logs).toContain('kind=TLS');
    for (const secret of [PASS, RECIPIENT, OTP, MESSAGE.subject]) {
      expect(logs).not.toContain(secret);
    }
  });
});

describe('Thời gian chờ có tác dụng thật (MAIL-20)', () => {
  it('máy chủ nhận kết nối nhưng không chào: TIMEOUT sau greetingTimeout, không treo', async () => {
    const { service } = await serviceFor(
      { greet: false },
      { greetingTimeout: SHORT },
    );
    const started = Date.now();

    const error = await failure(service.send(MESSAGE));

    expect(error.kind).toBe('TIMEOUT');
    expect(Date.now() - started).toBeLessThan(LONG / 2);
  });

  it('máy chủ im lặng giữa phiên: TIMEOUT sau socketTimeout, không treo', async () => {
    const { service } = await serviceFor(
      { silentAfter: 'EHLO' },
      { socketTimeout: SHORT },
    );
    const started = Date.now();

    const error = await failure(service.send(MESSAGE));

    expect(error.kind).toBe('TIMEOUT');
    expect(Date.now() - started).toBeLessThan(LONG / 2);
  });

  it('cổng đóng: lỗi kết nối ngay, kind CONNECTION', async () => {
    const closed = await startFakeSmtpServer();
    const closedPort = closed.port;
    await closed.close();
    const options = buildSmtpTransportOptions(config(closedPort));
    const service = new SmtpMailService(
      config(closedPort),
      nodemailer.createTransport(options),
    );

    const error = await failure(service.send(MESSAGE));

    expect(error.kind).toBe('CONNECTION');
  });
});

describe('Đăng nhập và gửi qua nodemailer thật (MAIL-21)', () => {
  it('đăng nhập bị từ chối (535): kind AUTH, mã 535, mật khẩu không xuất hiện ở lỗi hay log, không gửi MAIL', async () => {
    const { service, fake, lines } = await serviceFor(
      { rejectAuth: true },
      {},
      true,
    );

    const error = await failure(service.send(MESSAGE));

    expect(error.kind).toBe('AUTH');
    expect(error.smtpCode).toBe(535);
    expect(fake.verbs()).toContain('AUTH');
    expect(fake.verbs()).not.toContain('MAIL');
    const everything = [error.message, error.stack ?? '', ...lines].join('\n');
    expect(everything).not.toContain(PASS);
    expect(everything).not.toContain('Username and Password');
    expect(fake.commands.join('\n')).not.toContain(PASS);
  });

  it('gửi thành công: resolve; máy chủ nhận đúng một người nhận và đúng người gửi (không log gì)', async () => {
    const { service, fake, lines } = await serviceFor(
      { advertiseStartTls: false },
      {},
      true,
    );

    await expect(service.send(MESSAGE)).resolves.toBeUndefined();

    const rcpt = fake.commands.filter((c) => c.startsWith('RCPT TO:'));
    expect(rcpt).toEqual([`RCPT TO:<${RECIPIENT}>`]);
    expect(fake.commands.find((c) => c.startsWith('MAIL FROM:'))).toContain(
      '<clinix@example.test>',
    );
    expect(lines).toEqual([]);
  });
});
