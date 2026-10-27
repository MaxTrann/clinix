import 'reflect-metadata'; // class-transformer cần Reflect.getMetadata, kể cả khi chạy ngoài Nest (ví dụ test)
import { Transform, plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

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
