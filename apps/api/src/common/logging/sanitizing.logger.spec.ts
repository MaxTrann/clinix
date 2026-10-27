import { ConsoleLogger, Logger, type LoggerService } from '@nestjs/common';
import { fakeJwt, fakeSecretValue } from '../testing/sample-secrets.js';
import { REDACTED } from './sanitize.js';
import { SanitizingLogger, createAppLogger } from './sanitizing.logger.js';

// Task P5. Test case: SE-04, DM-09 ở mức logger (quét toàn luồng HTTP ở test/log-masking.e2e-spec.ts).
// Bắt đúng thứ Nest ghi ra stdout/stderr (ConsoleLogger ghi bằng process.stdout/stderr.write), không giả lập logger.
const JWT = fakeJwt('logger');
const PLAIN_OPTIONS = { colors: false, timestamp: false };

let written: string[];

beforeEach(() => {
  written = [];
  const capture = (chunk: unknown) => {
    written.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stdout, 'write').mockImplementation(capture);
  vi.spyOn(process.stderr, 'write').mockImplementation(capture);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const output = () => written.join('');

describe('SanitizingLogger', () => {
  it('log/warn/debug/verbose: che chuỗi có bí mật nhưng vẫn in phần còn lại và context', () => {
    const logger = new SanitizingLogger(PLAIN_OPTIONS);

    logger.log(`đăng nhập password=Bi-mat-1! xong`, 'AuthCtx');
    logger.warn(`Bearer ${JWT}`, 'AuthCtx');
    logger.debug('otp: 123456', 'AuthCtx');
    logger.verbose(`token=${JWT}`, 'AuthCtx');

    const out = output();
    expect(out).not.toContain('Bi-mat-1!');
    expect(out).not.toContain(JWT);
    expect(out).not.toContain('123456');
    expect(out).toContain('đăng nhập');
    expect(out).toContain('xong');
    expect(out).toContain('AuthCtx');
    expect(out).toContain(REDACTED);
  });

  it('error/fatal: che cả thông điệp lẫn stack (đối số thứ hai), giữ context', () => {
    const logger = new SanitizingLogger(PLAIN_OPTIONS);
    const stack = `Error: boom password=Bi-mat-1!\n    at ham (D:\\du_lieu\\app.ts:1:1)`;

    logger.error(`[id] lỗi ${JWT}`, stack, 'ExceptionFilter');
    logger.fatal('chết otp=999999', stack, 'Boot');

    const out = output();
    expect(out).not.toContain('Bi-mat-1!');
    expect(out).not.toContain(JWT);
    expect(out).not.toContain('999999');
    expect(out).toContain('ham (D:\\du_lieu\\app.ts:1:1)'); // đường dẫn trong stack còn nguyên để chẩn đoán
    expect(out).toContain('ExceptionFilter');
  });

  it('đối tượng và Error được truyền thẳng cũng bị che', () => {
    const logger = new SanitizingLogger(PLAIN_OPTIONS);
    const error = new Error('hỏng: refresh_token=abc.def');
    Object.assign(error, { sql: "SELECT 'bi-mat-sql'" });

    logger.log({ matKhau: 'Bi-mat-1!', soLan: 3 });
    logger.error(error);

    const out = output();
    expect(out).not.toContain('Bi-mat-1!');
    expect(out).not.toContain('abc.def');
    expect(out).not.toContain('bi-mat-sql');
    expect(out).toContain('soLan');
  });

  it('secrets truyền vào bị che nguyên văn dù không có khoá hay mẫu nào gợi ý', () => {
    const logger = new SanitizingLogger({
      ...PLAIN_OPTIONS,
      secrets: ['gia-tri-cau-hinh-0001'],
    });

    logger.log('kết nối tới gia-tri-cau-hinh-0001 thất bại');

    expect(output()).not.toContain('gia-tri-cau-hinh-0001');
    expect(output()).toContain('kết nối tới');
  });

  it('createAppLogger che giá trị bí mật lấy từ biến môi trường', () => {
    const secret = fakeSecretValue('truy-cap');
    const logger = createAppLogger({ JWT_ACCESS_SECRET: secret });

    logger.warn(`ký bằng ${secret}`);

    expect(output()).not.toContain(secret);
  });

  it('đối chứng: ConsoleLogger thường của Nest KHÔNG che (để biết phép bắt đầu ra không mù)', () => {
    new ConsoleLogger(PLAIN_OPTIONS).log('password=Bi-mat-1! otp: 123456');

    expect(output()).toContain('Bi-mat-1!');
    expect(output()).toContain('123456');
  });
});

describe('Logger tĩnh của Nest dùng SanitizingLogger sau khi được đặt', () => {
  // staticInstanceRef là protected trong kiểu của Nest nên đọc/ghi bằng Reflect để trả logger tĩnh về như cũ sau mỗi ca
  let previous: LoggerService | undefined;

  beforeEach(() => {
    previous = Reflect.get(Logger, 'staticInstanceRef') as
      LoggerService | undefined;
    Logger.overrideLogger(new SanitizingLogger(PLAIN_OPTIONS));
  });

  afterEach(() => {
    Reflect.set(Logger, 'staticInstanceRef', previous);
  });

  it('new Logger("Ten").warn(...) của app đi qua bộ che (kể cả instance tạo TRƯỚC khi đặt logger)', () => {
    const early = new Logger('SessionService');
    early.warn('Phát hiện dùng lại refresh token; password=Bi-mat-1!');

    const out = output();
    expect(out).not.toContain('Bi-mat-1!');
    expect(out).toContain('Phát hiện dùng lại refresh token');
    expect(out).toContain('SessionService');
  });
});
