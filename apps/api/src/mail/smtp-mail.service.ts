import { Logger, type LoggerService, type OnModuleInit } from '@nestjs/common';
import nodemailer, { type SendMailOptions } from 'nodemailer';
import {
  IMPLICIT_TLS_PORT,
  buildSmtpTransportOptions,
  readMailConfig,
  type MailConfig,
  type MailEnv,
} from './mail-config.js';
import { MailSendError, type MailSendErrorKind } from './mail-send.error.js';
import {
  MAIL_SUBJECT_MAX_LENGTH,
  isSafeBodyText,
  isSafeHeaderText,
  isSafeMailAddress,
} from './mail-safety.js';
import { MailService, type MailMessage } from './mail.service.js';

/** Phần của transporter nodemailer mà MailService dùng; test thay bằng jsonTransport, streamTransport hoặc giả. */
export interface MailTransport {
  sendMail(options: SendMailOptions): Promise<unknown>;
}

// Mã lỗi của nodemailer (dist/cjs/errors.js) → loại lỗi của mình. Mã lạ là UNKNOWN.
const KIND_BY_CODE: Readonly<Record<string, MailSendErrorKind>> = {
  ETLS: 'TLS',
  EREQUIRETLS: 'TLS',
  EAUTH: 'AUTH',
  ENOAUTH: 'AUTH',
  EENVELOPE: 'REJECTED',
  ETIMEDOUT: 'TIMEOUT',
  ECONNECTION: 'CONNECTION',
  ESOCKET: 'CONNECTION',
  EDNS: 'CONNECTION',
  EPROTOCOL: 'CONNECTION',
};

// Chỉ ghi vào log những giá trị nằm trong từ vựng cố định của nodemailer, không bao giờ chữ tự do từ máy chủ SMTP
const LOGGABLE_CODE = /^[A-Z_]{1,32}$/;
const LOGGABLE_COMMAND = /^[A-Z ]{1,32}$/;

function readField(error: unknown, field: string): unknown {
  return typeof error === 'object' && error !== null
    ? (error as Record<string, unknown>)[field]
    : undefined;
}

function fixedVocabulary(value: unknown, pattern: RegExp): string {
  return typeof value === 'string' && pattern.test(value) ? value : '-';
}

export class SmtpMailService extends MailService implements OnModuleInit {
  constructor(
    private readonly config: MailConfig | null,
    private readonly transport: MailTransport | null,
    private readonly logger: LoggerService = new Logger(SmtpMailService.name),
  ) {
    super();
  }

  onModuleInit(): void {
    if (!this.config) {
      this.logger.warn(
        'Chưa cấu hình SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS): mọi lần gửi email sẽ báo lỗi NOT_CONFIGURED',
      );
      return;
    }
    const mode =
      this.config.port === IMPLICIT_TLS_PORT
        ? 'TLS ngay từ đầu'
        : 'STARTTLS bắt buộc';
    this.logger.log(
      `SMTP đã cấu hình: ${this.config.host}:${String(this.config.port)} (${mode})`,
    );
  }

  async send(message: MailMessage): Promise<void> {
    const invalid = this.findInvalidField(message);
    if (invalid) {
      this.logger.warn(
        `Email bị từ chối trước khi gửi: trường ${invalid} không an toàn`,
      );
      throw new MailSendError('INVALID_MESSAGE', { field: invalid });
    }
    if (!this.config || !this.transport) {
      this.logger.warn('Không gửi được email: chưa cấu hình SMTP');
      throw new MailSendError('NOT_CONFIGURED');
    }

    let info: unknown;
    try {
      info = await this.transport.sendMail({
        from: { name: this.config.fromName, address: this.config.fromAddress },
        to: message.to,
        subject: message.subject,
        text: message.text,
        // Phong bì SMTP (RCPT TO) lấy THẲNG từ giá trị đã kiểm, không qua bộ phân tích địa chỉ của thư viện
        envelope: { from: this.config.fromAddress, to: [message.to] },
      });
    } catch (error) {
      throw this.toSendError(error);
    }

    // Phòng thủ: nếu thư viện báo còn người nhận bị từ chối/đang chờ thì KHÔNG coi là đã gửi
    const rejected = readField(info, 'rejected');
    const pending = readField(info, 'pending');
    if (
      (Array.isArray(rejected) && rejected.length > 0) ||
      (Array.isArray(pending) && pending.length > 0)
    ) {
      this.logger.warn('Gửi email thất bại: kind=REJECTED');
      throw new MailSendError('REJECTED');
    }
  }

  private findInvalidField(message: MailMessage): MailSendError['field'] {
    if (!isSafeMailAddress(message.to)) return 'to';
    if (!isSafeHeaderText(message.subject, MAIL_SUBJECT_MAX_LENGTH))
      return 'subject';
    if (!isSafeBodyText(message.text)) return 'text';
    return undefined;
  }

  private toSendError(error: unknown): MailSendError {
    const code = readField(error, 'code');
    const kind = (typeof code === 'string' && KIND_BY_CODE[code]) || 'UNKNOWN';
    const responseCode = readField(error, 'responseCode');
    const smtpCode =
      typeof responseCode === 'number' && Number.isInteger(responseCode)
        ? responseCode
        : undefined;

    // Không ghi địa chỉ, tiêu đề, nội dung, OTP hay chữ tự do của máy chủ: chỉ loại lỗi và vài mã trong từ vựng cố định
    this.logger.warn(
      `Gửi email thất bại: kind=${kind} code=${fixedVocabulary(code, LOGGABLE_CODE)} ` +
        `command=${fixedVocabulary(readField(error, 'command'), LOGGABLE_COMMAND)} smtp=${smtpCode === undefined ? '-' : String(smtpCode)}`,
    );
    return new MailSendError(kind, smtpCode === undefined ? {} : { smtpCode });
  }
}

/** Dựng MailService từ biến môi trường đã qua validateEnv. Không cấu hình SMTP thì không có transport (NOT_CONFIGURED). */
export function createMailService(env: MailEnv): SmtpMailService {
  const config = readMailConfig(env);
  const transport = config
    ? nodemailer.createTransport(buildSmtpTransportOptions(config))
    : null;
  return new SmtpMailService(config, transport);
}
