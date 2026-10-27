import { MailSendError, type MailSendErrorKind } from '../mail-send.error.js';
import { MailService, type MailMessage } from '../mail.service.js';

/**
 * MailService giả cho test của A2, A5, A11 và admin (test tự động KHÔNG gửi email thật).
 * Dùng: `{ provide: MailService, useValue: fake }` hoặc `.overrideProvider(MailService).useValue(fake)`.
 *
 * - `attempts`: mọi lần gọi `send` (kể cả lần lỗi): kiểm "MailService gọi đúng 1 lần" (DK-01).
 * - `sent`: chỉ những lần thành công (thư đã được "nhận").
 */
export class FakeMailService extends MailService {
  readonly attempts: MailMessage[] = [];
  readonly sent: MailMessage[] = [];
  private pendingFailures: MailSendErrorKind[] = [];
  private alwaysFailWith: MailSendErrorKind | null = null;

  send(message: MailMessage): Promise<void> {
    this.attempts.push(message);
    const kind = this.pendingFailures.shift() ?? this.alwaysFailWith;
    if (kind) return Promise.reject(new MailSendError(kind));
    this.sent.push(message);
    return Promise.resolve();
  }

  /** Lần gửi kế tiếp lỗi (DK-25, QM-09); các lần sau lại thành công. */
  failNextWith(kind: MailSendErrorKind = 'CONNECTION'): this {
    this.pendingFailures.push(kind);
    return this;
  }

  /** Mọi lần gửi đều lỗi cho tới khi gọi `reset()`. */
  failAllWith(kind: MailSendErrorKind = 'CONNECTION'): this {
    this.alwaysFailWith = kind;
    return this;
  }

  reset(): void {
    this.attempts.length = 0;
    this.sent.length = 0;
    this.pendingFailures = [];
    this.alwaysFailWith = null;
  }
}
