import { Logger, type LoggerService } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { vi } from 'vitest';
import { fakeSecretValue } from '../common/testing/sample-secrets.js';
import { readMailConfig, type MailConfig } from './mail-config.js';
import { MailSendError, type MailSendErrorKind } from './mail-send.error.js';
import { SmtpMailService, type MailTransport } from './smtp-mail.service.js';
import type { MailMessage } from './mail.service.js';

// Task P4. Truy vết ĐK b6, QMK b5 (gửi OTP); hợp đồng cho N1 (A2): resolve = đã gửi, mọi thứ khác = reject. Mã nội bộ MAIL-13… là [đề xuất].
// Dùng jsonTransport/streamTransport của nodemailer (không có mạng) và transport giả. Phần qua TCP: smtp-mail.service.tcp.spec.ts.
const PASS = fakeSecretValue('smtp');
const OTP = '482913';
const RECIPIENT = 'benh.nhan@example.test';
const SUBJECT = '[CLINIX] Mã xác minh OTP đăng ký tài khoản';
const TEXT = `Xin chào,\n\nMã OTP của bạn là: ${OTP}\n`;
const MESSAGE: MailMessage = { to: RECIPIENT, subject: SUBJECT, text: TEXT };

// Các ca không tự bắt log thì tắt tiếng logger mặc định của Nest để đầu ra test không nhiễu
beforeEach(() => {
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

function config(overrides: Partial<MailConfig> = {}): MailConfig {
  const base = readMailConfig({
    SMTP_HOST: 'smtp.example.test',
    SMTP_PORT: 465,
    SMTP_USER: 'clinix@example.test',
    SMTP_PASS: PASS,
    MAIL_FROM_NAME: 'CLINIX',
    MAIL_FROM_ADDRESS: undefined,
    MAIL_SUPPORT_ADDRESS: undefined,
  });
  if (!base) throw new Error('cấu hình test phải đủ');
  return { ...base, ...overrides };
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

function stubTransport(result: () => Promise<unknown>) {
  const sendMail = vi.fn<MailTransport['sendMail']>(() => result());
  return { transport: { sendMail } satisfies MailTransport, sendMail };
}

// Lỗi giống nodemailer: có code, command, responseCode và cả đoạn chữ của máy chủ (chứa địa chỉ và mã, để kiểm không bị lộ)
function smtpError(code: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(`Lỗi gốc ${RECIPIENT} ${OTP} ${PASS}`), {
    code,
    command: 'AUTH PLAIN',
    response: `535 5.7.8 chu-cua-may-chu-smtp <${RECIPIENT}> ${OTP}`,
    ...extra,
  });
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Mong đợi bị từ chối nhưng đã thành công');
}

function parseHeaders(raw: string): { name: string; value: string }[] {
  const head = raw.split('\n\n')[0] ?? '';
  const unfolded = head.replace(/\n[ \t]+/g, ' ');
  return unfolded.split('\n').map((line) => {
    const colon = line.indexOf(':');
    return { name: line.slice(0, colon), value: line.slice(colon + 1).trim() };
  });
}

describe('SmtpMailService.send — thành công (MAIL-13, ĐK b6, QMK b5)', () => {
  it('resolve và dựng đúng thư (jsonTransport): người gửi, người nhận, tiêu đề, nội dung', async () => {
    const json = nodemailer.createTransport({ jsonTransport: true });
    const sendMail = vi.spyOn(json, 'sendMail');
    const service = new SmtpMailService(config(), json);

    await expect(service.send(MESSAGE)).resolves.toBeUndefined();

    expect(sendMail).toHaveBeenCalledTimes(1);
    const info = (await sendMail.mock.results[0]?.value) as { message: string };
    const sent = JSON.parse(info.message) as {
      from: { name: string; address: string };
      to: { address: string }[];
      subject: string;
      text: string;
    };
    expect(sent.from).toEqual({
      name: 'CLINIX',
      address: 'clinix@example.test',
    });
    expect(sent.to.map((t) => t.address)).toEqual([RECIPIENT]);
    expect(sent.subject).toBe(SUBJECT);
    expect(sent.text).toBe(TEXT);
  });

  it('phong bì SMTP lấy thẳng từ giá trị đã kiểm: from = địa chỉ gửi, to = đúng một người nhận', async () => {
    const { transport, sendMail } = stubTransport(() => Promise.resolve({}));
    await new SmtpMailService(config(), transport).send(MESSAGE);

    const options = sendMail.mock.calls[0]?.[0];
    expect(options?.envelope).toEqual({
      from: 'clinix@example.test',
      to: [RECIPIENT],
    });
  });

  it('thư dựng ra (streamTransport) có đúng một To/From/Subject, không có Bcc/Cc, người nhận trong phong bì chỉ có một', async () => {
    const stream = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'unix',
    });
    const sendMail = vi.spyOn(stream, 'sendMail');
    await new SmtpMailService(config(), stream).send(MESSAGE);

    const info = (await sendMail.mock.results[0]?.value) as {
      envelope: { from: string; to: string[] };
      message: Buffer;
    };
    expect(info.envelope).toEqual({
      from: 'clinix@example.test',
      to: [RECIPIENT],
    });
    const names = parseHeaders(info.message.toString('utf8')).map((h) =>
      h.name.toLowerCase(),
    );
    expect(names.filter((n) => n === 'to')).toHaveLength(1);
    expect(names.filter((n) => n === 'from')).toHaveLength(1);
    expect(names.filter((n) => n === 'subject')).toHaveLength(1);
    expect(names).not.toContain('bcc');
    expect(names).not.toContain('cc');
  });

  it('nodemailer báo thêm kết quả (accepted) vẫn là thành công', async () => {
    const { transport } = stubTransport(() =>
      Promise.resolve({ accepted: [RECIPIENT], rejected: [], pending: [] }),
    );
    await expect(
      new SmtpMailService(config(), transport).send(MESSAGE),
    ).resolves.toBeUndefined();
  });

  it('không ghi log khi gửi thành công (không có thông tin nào đáng ghi, càng không phải nội dung)', async () => {
    const { logger, lines } = capturingLogger();
    const { transport } = stubTransport(() => Promise.resolve({}));
    await new SmtpMailService(config(), transport, logger).send(MESSAGE);
    expect(lines).toEqual([]);
  });
});

describe('SmtpMailService.send — lỗi KHÔNG bị nuốt (MAIL-14, hợp đồng N1)', () => {
  it.each<[string, MailSendErrorKind]>([
    ['ETLS', 'TLS'],
    ['EREQUIRETLS', 'TLS'],
    ['EAUTH', 'AUTH'],
    ['ENOAUTH', 'AUTH'],
    ['EENVELOPE', 'REJECTED'],
    ['ETIMEDOUT', 'TIMEOUT'],
    ['ECONNECTION', 'CONNECTION'],
    ['ESOCKET', 'CONNECTION'],
    ['EDNS', 'CONNECTION'],
    ['EPROTOCOL', 'CONNECTION'],
    ['EMESSAGE', 'UNKNOWN'],
    ['MA_LA_CHUA_TUNG_THAY', 'UNKNOWN'],
  ])('mã nodemailer %s → reject MailSendError kind %s', async (code, kind) => {
    const { transport } = stubTransport(() => Promise.reject(smtpError(code)));
    const error = await rejection(
      new SmtpMailService(config(), transport).send(MESSAGE),
    );
    expect(error).toBeInstanceOf(MailSendError);
    expect((error as MailSendError).kind).toBe(kind);
  });

  it.each([
    ['một Error không có code', new Error('x')],
    ['một chuỗi', 'loi dang chuoi'],
    ['null', null],
    ['undefined', undefined],
    ['một số', 42],
  ])(
    'lỗi lạ (%s) vẫn là reject UNKNOWN, không thành công giả',
    async (_name, thrown) => {
      const { transport } = stubTransport(() => Promise.reject(thrown));
      const error = await rejection(
        new SmtpMailService(config(), transport).send(MESSAGE),
      );
      expect((error as MailSendError).kind).toBe('UNKNOWN');
    },
  );

  it('mang theo mã trả lời SMTP để chẩn đoán (535), bỏ qua giá trị không phải số nguyên', async () => {
    const withCode = stubTransport(() =>
      Promise.reject(smtpError('EAUTH', { responseCode: 535 })),
    );
    const error = await rejection(
      new SmtpMailService(config(), withCode.transport).send(MESSAGE),
    );
    expect((error as MailSendError).smtpCode).toBe(535);

    const bad = stubTransport(() =>
      Promise.reject(smtpError('EAUTH', { responseCode: '535 <evil>' })),
    );
    const error2 = await rejection(
      new SmtpMailService(config(), bad.transport).send(MESSAGE),
    );
    expect((error2 as MailSendError).smtpCode).toBeUndefined();
  });

  it('người nhận bị từ chối / còn chờ trong kết quả của thư viện cũng là lỗi REJECTED', async () => {
    for (const result of [
      { accepted: [], rejected: [RECIPIENT] },
      { accepted: [RECIPIENT], rejected: [RECIPIENT] },
      { pending: [RECIPIENT] },
    ]) {
      const { transport } = stubTransport(() => Promise.resolve(result));
      const error = await rejection(
        new SmtpMailService(config(), transport).send(MESSAGE),
      );
      expect((error as MailSendError).kind).toBe('REJECTED');
    }
  });

  it('lỗi không lộ gì: thông điệp cố định, không giữ lỗi gốc làm cause, không có chữ của máy chủ, địa chỉ, mã hay mật khẩu', async () => {
    const { transport } = stubTransport(() =>
      Promise.reject(smtpError('EAUTH')),
    );
    const error = (await rejection(
      new SmtpMailService(config(), transport).send(MESSAGE),
    )) as MailSendError;

    expect(error.message).toBe('Máy chủ SMTP từ chối đăng nhập');
    expect(error).not.toHaveProperty('cause');
    const everything = [
      error.message,
      error.stack ?? '',
      JSON.stringify(error),
      ...Object.getOwnPropertyNames(error).map((name) =>
        String((error as unknown as Record<string, unknown>)[name]),
      ),
    ].join('\n');
    for (const secret of [
      RECIPIENT,
      OTP,
      PASS,
      'chu-cua-may-chu-smtp',
      SUBJECT,
    ]) {
      expect(everything).not.toContain(secret);
    }
  });
});

describe('SmtpMailService.send — chống chèn người nhận và header (MAIL-15)', () => {
  const CR = String.fromCharCode(13);
  const LF = String.fromCharCode(10);

  it.each([
    `a@example.test${CR}${LF}Bcc: evil@example.test`,
    'a@example.test,evil@example.test',
    'a@example.test; evil@example.test',
    'a@example.test evil@example.test',
    'Ten <a@example.test>',
    '"a b"@example.test',
    'a@example.test(evil@example.test)',
    '',
    'khong-phai-email',
  ])(
    'người nhận không an toàn %j bị từ chối TRƯỚC khi chạm transport',
    async (to) => {
      const { transport, sendMail } = stubTransport(() => Promise.resolve({}));
      const error = (await rejection(
        new SmtpMailService(config(), transport).send({ ...MESSAGE, to }),
      )) as MailSendError;

      expect(error).toBeInstanceOf(MailSendError);
      expect(error.kind).toBe('INVALID_MESSAGE');
      expect(error.field).toBe('to');
      expect(sendMail).not.toHaveBeenCalled();
    },
  );

  it('tiêu đề có xuống dòng bị từ chối trước khi chạm transport', async () => {
    const { transport, sendMail } = stubTransport(() => Promise.resolve({}));
    const error = (await rejection(
      new SmtpMailService(config(), transport).send({
        ...MESSAGE,
        subject: `Chao${CR}${LF}Bcc: evil@example.test`,
      }),
    )) as MailSendError;
    expect(error.kind).toBe('INVALID_MESSAGE');
    expect(error.field).toBe('subject');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('nội dung rỗng hoặc có NUL bị từ chối', async () => {
    const { transport, sendMail } = stubTransport(() => Promise.resolve({}));
    const service = new SmtpMailService(config(), transport);
    for (const text of ['', `a${String.fromCharCode(0)}b`]) {
      const error = (await rejection(
        service.send({ ...MESSAGE, text }),
      )) as MailSendError;
      expect(error.field).toBe('text');
    }
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('dữ liệu không đúng kiểu (JS thuần, bỏ qua TypeScript) cũng bị từ chối, không ném lỗi lạ', async () => {
    const { transport, sendMail } = stubTransport(() => Promise.resolve({}));
    const service = new SmtpMailService(config(), transport);
    const bad = [
      { to: ['a@example.test'], subject: SUBJECT, text: TEXT },
      { to: RECIPIENT, subject: undefined, text: TEXT },
      { to: RECIPIENT, subject: SUBJECT, text: null },
    ] as unknown as MailMessage[];
    for (const message of bad) {
      const error = await rejection(service.send(message));
      expect((error as MailSendError).kind).toBe('INVALID_MESSAGE');
    }
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('streamTransport: người nhận độc hại không bao giờ tới được tầng dựng thư (không có thư nào được dựng)', async () => {
    const stream = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'unix',
    });
    const sendMail = vi.spyOn(stream, 'sendMail');
    const service = new SmtpMailService(config(), stream);
    await rejection(
      service.send({
        ...MESSAGE,
        to: `a@example.test${CR}${LF}Bcc: evil@example.test`,
      }),
    );
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe('SmtpMailService — chưa cấu hình SMTP (MAIL-16)', () => {
  it('reject NOT_CONFIGURED, không giả vờ thành công, và ghi cảnh báo không kèm địa chỉ', async () => {
    const { logger, lines } = capturingLogger();
    const error = (await rejection(
      new SmtpMailService(null, null, logger).send(MESSAGE),
    )) as MailSendError;

    expect(error.kind).toBe('NOT_CONFIGURED');
    expect(lines).toHaveLength(1);
    expect(lines.join('\n')).not.toContain(RECIPIENT);
  });

  it('kiểm nội dung xảy ra trước: thư hỏng vẫn báo INVALID_MESSAGE dù chưa cấu hình', async () => {
    const error = (await rejection(
      new SmtpMailService(null, null).send({ ...MESSAGE, to: 'a@b@c' }),
    )) as MailSendError;
    expect(error.kind).toBe('INVALID_MESSAGE');
  });
});

describe('SmtpMailService — không bao giờ ghi nội dung thư, OTP, địa chỉ, mật khẩu vào log (MAIL-17)', () => {
  async function failAndCollectLogs(
    transportError: unknown,
    message: MailMessage = MESSAGE,
  ): Promise<string> {
    const { logger, lines } = capturingLogger();
    const { transport } = stubTransport(() => Promise.reject(transportError));
    await rejection(
      new SmtpMailService(config(), transport, logger).send(message),
    );
    return lines.join('\n');
  }

  it('lỗi gửi chỉ ghi loại lỗi và vài mã trong từ vựng cố định', async () => {
    const logs = await failAndCollectLogs(
      smtpError('EAUTH', { responseCode: 535 }),
    );
    expect(logs).toBe(
      'Gửi email thất bại: kind=AUTH code=EAUTH command=AUTH PLAIN smtp=535',
    );
  });

  it('log không chứa địa chỉ người nhận, tiêu đề, nội dung, OTP, mật khẩu hay chữ tự do của máy chủ', async () => {
    const logs = await failAndCollectLogs(
      smtpError('EAUTH', { responseCode: 535 }),
    );
    for (const secret of [
      RECIPIENT,
      SUBJECT,
      'Xin chào',
      OTP,
      PASS,
      'chu-cua-may-chu-smtp',
      'Lỗi gốc',
    ]) {
      expect(logs).not.toContain(secret);
    }
  });

  it('giá trị ngoài từ vựng cố định (code, command chứa xuống dòng hoặc chữ tự do) bị thay bằng "-"', async () => {
    const logs = await failAndCollectLogs(
      smtpError('EAUTH\nGia mao dong log', {
        command: `AUTH ${PASS}\nfake`,
        responseCode: undefined,
      }),
    );
    expect(logs).toBe(
      'Gửi email thất bại: kind=UNKNOWN code=- command=- smtp=-',
    );
  });

  it('thư bị từ chối vì không an toàn: log nêu tên trường, không lặp lại giá trị sai', async () => {
    const { logger, lines } = capturingLogger();
    const hostile = 'a@example.test,evil@example.test';
    await rejection(
      new SmtpMailService(
        config(),
        stubTransport(() => Promise.resolve({})).transport,
        logger,
      ).send({
        ...MESSAGE,
        to: hostile,
      }),
    );
    const logs = lines.join('\n');
    expect(logs).toContain('trường to');
    expect(logs).not.toContain('evil@example.test');
    expect(logs).not.toContain(hostile);
  });
});

describe('SmtpMailService.onModuleInit (MAIL-18)', () => {
  it('cổng 465: ghi máy chủ, cổng và chế độ TLS, KHÔNG ghi tài khoản hay mật khẩu', () => {
    const { logger, lines } = capturingLogger();
    new SmtpMailService(config({ port: 465 }), null, logger).onModuleInit();
    expect(lines).toEqual([
      'SMTP đã cấu hình: smtp.example.test:465 (TLS ngay từ đầu)',
    ]);
    expect(lines.join('')).not.toContain(PASS);
    expect(lines.join('')).not.toContain('clinix@example.test');
  });

  it('cổng 587: nêu STARTTLS bắt buộc', () => {
    const { logger, lines } = capturingLogger();
    new SmtpMailService(config({ port: 587 }), null, logger).onModuleInit();
    expect(lines[0]).toContain('smtp.example.test:587 (STARTTLS bắt buộc)');
  });

  it('chưa cấu hình: cảnh báo rõ biến nào cần đặt', () => {
    const { logger, lines } = capturingLogger();
    new SmtpMailService(null, null, logger).onModuleInit();
    expect(lines[0]).toContain('SMTP_HOST');
    expect(lines[0]).toContain('NOT_CONFIGURED');
  });
});
