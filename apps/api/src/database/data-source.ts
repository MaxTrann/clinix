import mysql2 from 'mysql2';
import type { DataSourceOptions } from 'typeorm';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { ENTITIES } from './entities.js';
import { MIGRATIONS } from './migrations/index.js';

export interface DbSettings {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  /** Múi giờ dạng `+07:00`: dùng cho driver VÀ cho session MySQL (xem createMysqlDriver) */
  timezone: string;
}

const TIMEZONE_PATTERN = /^[+-]\d{2}:\d{2}$/;

// Bọc mysql2 để MỖI kết nối mới trong pool chạy `SET time_zone = ...`. Nếu chỉ đặt `timezone` của driver mà quên session,
// các cột DEFAULT CURRENT_TIMESTAMP (tao_luc, thoi_diem_tao…) lệch giờ so với mọi mốc thời gian do ứng dụng ghi.
export function createMysqlDriver(timezone: string): typeof mysql2 {
  if (!TIMEZONE_PATTERN.test(timezone)) {
    throw new Error(`Múi giờ không hợp lệ (cần dạng +07:00): ${timezone}`);
  }
  return {
    ...mysql2,
    createPool(config: string | mysql2.PoolOptions) {
      const pool =
        typeof config === 'string'
          ? mysql2.createPool(config)
          : mysql2.createPool(config);
      pool.on('connection', (connection) => {
        connection.query(`SET time_zone = '${timezone}'`, (error) => {
          // Không dùng kết nối sai múi giờ: hủy để pool tạo kết nối khác
          if (error) connection.destroy();
        });
      });
      return pool;
    },
  };
}

// Một nơi duy nhất dựng cấu hình kết nối: app (DatabaseModule), script migrate.ts và test cùng dùng.
export function buildDataSourceOptions(
  settings: DbSettings,
): DataSourceOptions {
  return {
    type: 'mysql',
    driver: createMysqlDriver(settings.timezone),
    host: settings.host,
    port: settings.port,
    username: settings.username,
    password: settings.password,
    database: settings.database,
    // utf8mb4 cho tiếng Việt có dấu và ký tự ngoài BMP; trùng collation của các bảng
    charset: 'utf8mb4_unicode_ci',
    timezone: settings.timezone,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: 'migrations',
    // Schema do migration viết tay quản lý; không bao giờ để TypeORM tự đồng bộ
    synchronize: false,
  };
}

export type DbEnv = Pick<
  EnvironmentVariables,
  | 'DB_HOST'
  | 'DB_PORT'
  | 'MYSQL_DATABASE'
  | 'MYSQL_USER'
  | 'MYSQL_PASSWORD'
  | 'DB_TIMEZONE'
>;

export function dbSettingsFromEnv(env: DbEnv): DbSettings {
  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.MYSQL_DATABASE,
    username: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    timezone: env.DB_TIMEZONE,
  };
}
