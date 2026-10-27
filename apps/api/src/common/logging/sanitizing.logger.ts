import { ConsoleLogger, type ConsoleLoggerOptions } from '@nestjs/common';
import { collectSecretValues, sanitizeLogArgs } from './sanitize.js';

export interface SanitizingLoggerOptions extends ConsoleLoggerOptions {
  /** Giá trị bí mật của cấu hình cần che nếu lọt vào log nguyên văn */
  secrets?: readonly string[];
}

type LogArgs = [unknown, ...unknown[]];

// Logger của ứng dụng: giống ConsoleLogger của Nest nhưng che mật khẩu/token/OTP/mã băm trong MỌI đối số (chuỗi, đối tượng, Error,
// stack) trước khi ghi. Nest có sẵn tuỳ chọn `redact` nhưng chỉ che theo tên khoá chính xác trong đối tượng, còn chuỗi, thông điệp
// lỗi và stack "được in nguyên" (theo chính tài liệu của nó), mà đó lại là chỗ rò chính (vd. "Duplicate entry '<băm>'").
// Mọi lời gọi `new Logger(...)` của app và log nội bộ của Nest đều đi qua logger này khi nó được đặt bằng NestFactory/useLogger.
export class SanitizingLogger extends ConsoleLogger {
  private readonly secrets: readonly string[];

  constructor(options: SanitizingLoggerOptions = {}) {
    const { secrets = [], ...consoleOptions } = options;
    super(consoleOptions);
    this.secrets = secrets;
  }

  private clean(message: unknown, params: unknown[]): LogArgs {
    const [first, ...rest] = sanitizeLogArgs(
      [message, ...params],
      this.secrets,
    );
    return [first, ...rest];
  }

  override log(message: unknown, ...optionalParams: unknown[]): void {
    super.log(...this.clean(message, optionalParams));
  }

  override error(message: unknown, ...optionalParams: unknown[]): void {
    super.error(...this.clean(message, optionalParams));
  }

  override warn(message: unknown, ...optionalParams: unknown[]): void {
    super.warn(...this.clean(message, optionalParams));
  }

  override debug(message: unknown, ...optionalParams: unknown[]): void {
    super.debug(...this.clean(message, optionalParams));
  }

  override verbose(message: unknown, ...optionalParams: unknown[]): void {
    super.verbose(...this.clean(message, optionalParams));
  }

  override fatal(message: unknown, ...optionalParams: unknown[]): void {
    super.fatal(...this.clean(message, optionalParams));
  }
}

// Logger cho app thật và test: che thêm các giá trị bí mật lấy từ biến môi trường (khoá JWT, mật khẩu DB…)
export function createAppLogger(
  env: Readonly<Record<string, string | undefined>> = process.env,
): SanitizingLogger {
  return new SanitizingLogger({ secrets: collectSecretValues(env) });
}
