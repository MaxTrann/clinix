import 'reflect-metadata'; // class-transformer cần Reflect.getMetadata, kể cả khi chạy ngoài Nest (ví dụ test)
import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, Max, Min, validateSync } from 'class-validator';

// Biến môi trường mà API đọc. Biến của các task sau (DB, JWT, SMTP…) được thêm khi task đó cần.
export class EnvironmentVariables {
  @IsIn(['development', 'test', 'staging', 'production'])
  NODE_ENV: string = 'development';

  @IsInt()
  @Min(1)
  @Max(65535)
  API_PORT: number = 3000;
}

// Kiểm tra lúc khởi động: cấu hình sai thì dừng ngay thay vì chạy với giá trị bậy.
// Chỉ in tên biến và lý do, không in giá trị (sau này có thể là bí mật).
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const parsed = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(parsed);
  if (errors.length > 0) {
    const detail = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join('; ')}`)
      .join(' | ');
    throw new Error(`Cấu hình môi trường không hợp lệ — ${detail}`);
  }
  return parsed;
}
