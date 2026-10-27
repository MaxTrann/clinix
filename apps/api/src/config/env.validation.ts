import 'reflect-metadata'; // class-transformer cần Reflect.getMetadata, kể cả khi chạy ngoài Nest (ví dụ test)
import { Transform, plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';
import { isSafeMailAddress } from '../mail/mail-safety.js';

// Biến môi trường mà API đọc. Biến của các task sau (JWT, SMTP…) được thêm khi task đó cần.
export class EnvironmentVariables {
  @IsIn(['development', 'test', 'staging', 'production'])
  NODE_ENV: string = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  API_PORT: number = 3000;

  // --- Kết nối MySQL. Tái dùng tên biến của container db trong .env để không nhân đôi mật khẩu.
  @IsString()
  @IsNotEmpty()
  DB_HOST: string = '127.0.0.1';

  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT: number = 3306;

  @IsString()
  @IsNotEmpty()
  MYSQL_DATABASE!: string;

  @IsString()
  @IsNotEmpty()
  MYSQL_USER!: string;

  @IsString()
  @IsNotEmpty()
  MYSQL_PASSWORD!: string;

  // Múi giờ của driver VÀ của session MySQL (Q43 của module admin): giờ Việt Nam
  @Matches(/^[+-]\d{2}:\d{2}$/, { message: 'DB_TIMEZONE phải có dạng +07:00' })
  DB_TIMEZONE: string = '+07:00';

  // true thì API tự chạy các migration chưa áp dụng khi khởi động (tiện cho dev/demo, xem docs/TECH_DEBT.md)
  // Lấy giá trị gốc (obj[key]) vì chuyển kiểu ngầm sẽ biến chuỗi 'false' thành true.
  @Transform(
    ({ obj, key }: { obj: Record<string, unknown>; key: string }) =>
      obj[key] === true || obj[key] === 'true',
  )
  @IsBoolean()
  DB_MIGRATIONS_RUN: boolean = false;

  // --- Xác thực (task A3). Mỗi loại token một khoá riêng (SE-06); ràng buộc "khác nhau" nằm ở crossFieldProblems.
  // Ký access token (JWT, HS256). Tối thiểu 32 ký tự để không dùng nhầm chuỗi quá ngắn.
  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  // Ký (HMAC) refresh token, không dùng cho JWT
  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  // Cookie refresh token có thuộc tính Secure hay không. Mặc định BẬT; chỉ tắt được khi NODE_ENV=development (N5, SE-09).
  // Chỉ nhận đúng 'true'/'false': gõ nhầm thì báo lỗi chứ không lặng lẽ thành giá trị khác.
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === undefined || raw === '' || raw === true || raw === 'true')
      return true;
    if (raw === false || raw === 'false') return false;
    return raw;
  })
  @IsBoolean()
  COOKIE_SECURE: boolean = true;

  // Origin của web, ví dụ http://localhost:5173. /auth/refresh và /auth/logout chỉ nhận request có header Origin đúng bằng giá trị này.
  @IsString()
  @IsNotEmpty()
  WEB_ORIGIN!: string;

  // --- Gửi email (task P4). Dev/test: bỏ trống cả ba SMTP_HOST/SMTP_USER/SMTP_PASS thì MailService báo NOT_CONFIGURED khi gửi.
  // Staging/production: bắt buộc (kiểm ở crossFieldProblems), thiếu thì API không khởi động. Biến để trống ('') coi như không đặt.
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9.-]+$/, {
    message:
      'SMTP_HOST phải là tên máy chủ (chữ, số, dấu chấm, gạch ngang), không kèm cổng hay đường dẫn',
  })
  SMTP_HOST?: string;

  // 465 = TLS ngay từ đầu; cổng khác (587…) bắt buộc STARTTLS. Không có chế độ không mã hoá (mail/mail-config.ts)
  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    return raw === undefined || raw === '' ? 465 : Number(raw);
  })
  @IsInt()
  @Min(1)
  @Max(65535)
  SMTP_PORT: number = 465;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @Matches(/^[^\r\n\0]+$/, {
    message: 'SMTP_USER không được chứa ký tự xuống dòng',
  })
  SMTP_USER?: string;

  // Mật khẩu ứng dụng Gmail (App Password). Tên biến khớp quy tắc của logger P5 (collectSecretValues) nên được che khỏi log.
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @Matches(/^[^\r\n\0]+$/, {
    message: 'SMTP_PASS không được chứa ký tự xuống dòng',
  })
  SMTP_PASS?: string;

  @Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    return raw === undefined || raw === '' ? 'CLINIX' : raw;
  })
  @IsString()
  @Length(1, 100)
  @Matches(/^[^\p{Cc}\p{Zl}\p{Zp}]+$/u, {
    message: 'MAIL_FROM_NAME không được chứa ký tự điều khiển',
  })
  MAIL_FROM_NAME: string = 'CLINIX';

  // Mặc định bằng SMTP_USER (Gmail gửi bằng đúng tài khoản đã đăng nhập). Kiểm ở crossFieldProblems.
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  MAIL_FROM_ADDRESS?: string;

  // Địa chỉ hỗ trợ in trong thư (N8, G4). Không đặt thì mẫu thư bỏ dòng hỗ trợ.
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  MAIL_SUPPORT_ADDRESS?: string;
}

// Biến môi trường để trống (SMTP_HOST=) là "không đặt", không phải chuỗi rỗng
function emptyToUndefined({
  obj,
  key,
}: {
  obj: Record<string, unknown>;
  key: string;
}): unknown {
  return obj[key] === '' ? undefined : obj[key];
}

// Một origin chuẩn: http(s)://host[:port], không đường dẫn, không dấu / ở cuối
function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.origin === value
    );
  } catch {
    return false;
  }
}

// Các ràng buộc liên quan nhiều biến, chỉ kiểm khi các biến đó đã đúng kiểu (lỗi từng biến đã được báo riêng)
function crossFieldProblems(env: EnvironmentVariables): string[] {
  const problems: string[] = [];
  const { JWT_ACCESS_SECRET: access, JWT_REFRESH_SECRET: refresh } = env;
  if (typeof access === 'string' && access !== '' && access === refresh) {
    problems.push(
      'JWT_REFRESH_SECRET: phải khác JWT_ACCESS_SECRET (mỗi loại token một khoá riêng)',
    );
  }
  if (env.COOKIE_SECURE === false && env.NODE_ENV !== 'development') {
    problems.push(
      'COOKIE_SECURE: chỉ được đặt false khi NODE_ENV=development (cookie đăng nhập phải Secure ở môi trường khác)',
    );
  }
  if (
    typeof env.WEB_ORIGIN === 'string' &&
    env.WEB_ORIGIN !== '' &&
    !isOrigin(env.WEB_ORIGIN)
  ) {
    problems.push(
      'WEB_ORIGIN: phải là một origin dạng http(s)://host[:port], không có đường dẫn hay dấu / ở cuối',
    );
  }
  problems.push(...mailProblems(env));
  return problems;
}

// Cấu hình gửi email (task P4). Thông báo chỉ nêu TÊN biến, không bao giờ in giá trị (SMTP_PASS là mật khẩu ứng dụng).
function mailProblems(env: EnvironmentVariables): string[] {
  const problems: string[] = [];
  const credentials = {
    SMTP_HOST: env.SMTP_HOST,
    SMTP_USER: env.SMTP_USER,
    SMTP_PASS: env.SMTP_PASS,
  };
  const missing = Object.entries(credentials)
    .filter(([, value]) => typeof value !== 'string' || value === '')
    .map(([name]) => name);

  if (env.NODE_ENV === 'staging' || env.NODE_ENV === 'production') {
    // Thiếu thì OTP không bao giờ gửi được: dừng ngay lúc khởi động thay vì chờ tới lần đăng ký đầu tiên
    for (const name of missing) {
      problems.push(
        `${name}: bắt buộc khi NODE_ENV=${env.NODE_ENV} (cần để gửi email OTP)`,
      );
    }
  } else if (missing.length > 0 && missing.length < 3) {
    problems.push(
      `${missing.join(', ')}: SMTP_HOST, SMTP_USER và SMTP_PASS phải đặt đủ cả ba hoặc bỏ trống cả ba`,
    );
  }

  // Địa chỉ gửi: đặt tường minh thì luôn phải hợp lệ; không đặt thì dùng SMTP_USER nên SMTP_USER phải là địa chỉ email
  if (env.MAIL_FROM_ADDRESS !== undefined) {
    if (!isSafeMailAddress(env.MAIL_FROM_ADDRESS)) {
      problems.push('MAIL_FROM_ADDRESS: phải là một địa chỉ email hợp lệ');
    }
  } else if (missing.length === 0 && !isSafeMailAddress(env.SMTP_USER)) {
    problems.push(
      'MAIL_FROM_ADDRESS: bắt buộc khi SMTP_USER không phải địa chỉ email (mặc định địa chỉ gửi là SMTP_USER)',
    );
  }
  if (
    env.MAIL_SUPPORT_ADDRESS !== undefined &&
    !isSafeMailAddress(env.MAIL_SUPPORT_ADDRESS)
  ) {
    problems.push('MAIL_SUPPORT_ADDRESS: phải là một địa chỉ email hợp lệ');
  }
  return problems;
}

// Kiểm tra lúc khởi động: cấu hình sai thì dừng ngay thay vì chạy với giá trị bậy.
// Chỉ in tên biến và lý do, không in giá trị (đây là chỗ chứa mật khẩu DB và khoá ký token).
export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const parsed = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const problems = validateSync(parsed).map(
    (e) => `${e.property}: ${Object.values(e.constraints ?? {}).join('; ')}`,
  );
  problems.push(...crossFieldProblems(parsed));
  if (problems.length > 0) {
    throw new Error(
      `Cấu hình môi trường không hợp lệ — ${problems.join(' | ')}`,
    );
  }
  return parsed;
}
