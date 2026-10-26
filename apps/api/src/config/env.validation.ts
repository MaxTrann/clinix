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
}

// Kiểm tra lúc khởi động: cấu hình sai thì dừng ngay thay vì chạy với giá trị bậy.
// Chỉ in tên biến và lý do, không in giá trị (đây là chỗ chứa mật khẩu DB).
export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const parsed = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(parsed);
  if (errors.length > 0) {
    const detail = errors
      .map(
        (e) =>
          `${e.property}: ${Object.values(e.constraints ?? {}).join('; ')}`,
      )
      .join(' | ');
    throw new Error(`Cấu hình môi trường không hợp lệ — ${detail}`);
  }
  return parsed;
}
