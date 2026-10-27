import type { SMTPTransportOptions } from 'nodemailer/lib/smtp-transport/index.js';
import type { EnvironmentVariables } from '../config/env.validation.js';

// Cấu hình SMTP đã qua validateEnv (config/env.validation.ts). Dev/test có thể không cấu hình: khi đó readMailConfig trả null
// và MailService từ chối mọi lần gửi bằng NOT_CONFIGURED (không giả vờ thành công, không in OTP ra log). Staging/production
// bắt buộc có cấu hình, thiếu thì API không khởi động.
export interface MailConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly pass: string;
  readonly fromName: string;
  readonly fromAddress: string;
  /** Địa chỉ hỗ trợ in trong thư (N8, G4); không có thì mẫu bỏ dòng hỗ trợ. */
  readonly supportAddress?: string;
}

export type MailEnv = Pick<
  EnvironmentVariables,
  | 'SMTP_HOST'
  | 'SMTP_PORT'
  | 'SMTP_USER'
  | 'SMTP_PASS'
  | 'MAIL_FROM_NAME'
  | 'MAIL_FROM_ADDRESS'
  | 'MAIL_SUPPORT_ADDRESS'
>;

export function readMailConfig(env: MailEnv): MailConfig | null {
  const { SMTP_HOST: host, SMTP_USER: user, SMTP_PASS: pass } = env;
  if (!host || !user || !pass) return null;
  return {
    host,
    port: env.SMTP_PORT,
    user,
    pass,
    fromName: env.MAIL_FROM_NAME,
    // Gmail gửi bằng đúng tài khoản đã đăng nhập, nên mặc định địa chỉ gửi = SMTP_USER
    fromAddress: env.MAIL_FROM_ADDRESS ?? user,
    ...(env.MAIL_SUPPORT_ADDRESS
      ? { supportAddress: env.MAIL_SUPPORT_ADDRESS }
      : {}),
  };
}

/** Cổng dành cho TLS ngay từ đầu (SMTPS). Cổng khác (587…) dùng STARTTLS và BẮT BUỘC nâng cấp. */
export const IMPLICIT_TLS_PORT = 465;

// [đề xuất] Giá trị thời gian chờ (mili giây). Mặc định của nodemailer là kết nối 2 phút, chào 30 giây, im lặng 10 phút, DNS 30 giây:
// quá dài cho một request đăng ký. Không có hạn tổng cho cả lần gửi (nodemailer chỉ có hạn theo từng pha), xem docs/TECH_DEBT.md.
export interface SmtpTimeouts {
  readonly connectionTimeout: number;
  readonly greetingTimeout: number;
  readonly socketTimeout: number;
  readonly dnsTimeout: number;
}

export const SMTP_TIMEOUTS: SmtpTimeouts = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
  dnsTimeout: 10_000,
};

/**
 * Tuỳ chọn transport SMTP. Không có chế độ "không mã hoá":
 * - Cổng 465: TLS ngay từ đầu (`secure`).
 * - Cổng khác: `requireTLS`. Thiếu nó, nodemailer chỉ nâng cấp STARTTLS khi máy chủ QUẢNG CÁO; nếu kẻ ở giữa gỡ dòng STARTTLS
 *   khỏi phản hồi EHLO thì nó vẫn gửi mật khẩu và thư dạng rõ (đã chạy thật, TRACKING P4-C). Với `requireTLS` nó dừng với lỗi ETLS
 *   trước khi gửi AUTH.
 * - KHÔNG BAO GIỜ đặt `tls.rejectUnauthorized`: mặc định của Node là kiểm chứng chỉ. `minVersion` đặt rõ cho khỏi phụ thuộc mặc định.
 * - Không đặt `logger`/`debug` (sẽ in lưu lượng SMTP, gồm cả AUTH), `ignoreTLS`, `opportunisticTLS`.
 */
export function buildSmtpTransportOptions(
  config: MailConfig,
  timeouts: SmtpTimeouts = SMTP_TIMEOUTS,
): SMTPTransportOptions {
  const implicitTls = config.port === IMPLICIT_TLS_PORT;
  return {
    host: config.host,
    port: config.port,
    secure: implicitTls,
    requireTLS: !implicitTls,
    auth: { user: config.user, pass: config.pass },
    tls: { minVersion: 'TLSv1.2' },
    ...timeouts,
  };
}
