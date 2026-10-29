import {
  normalizeEmail,
  isValidEmail,
} from '../../auth/validation/email-policy.js';
import {
  normalizeFullName,
  isValidFullName,
} from '../../auth/validation/full-name-policy.js';
import { normalizePhone } from '../../auth/validation/phone-policy.js';
import { checkPassword } from '../../auth/password/password-policy.js';
import type { DbSettings } from '../data-source.js';
import { SeedError } from './seed-error.js';

export const SEED_COMMANDS = [
  'catalog',
  'dev-accounts',
  'first-admin',
  'config-dev',
] as const;
export type SeedCommand = (typeof SEED_COMMANDS)[number];
export type SeedEnv = Record<string, string | undefined>;
export interface AdminInput {
  email: string;
  name: string;
  phone: string;
}
export interface SeedConfig {
  command: SeedCommand;
  database: DbSettings;
  password?: string;
  admin?: AdminInput;
}

function required(env: SeedEnv, key: string): string {
  const value = env[key];
  if (typeof value !== 'string' || !value.trim())
    throw new SeedError('SEED_ENV_INVALID');
  return value;
}

// Đọc đúng nhóm biến của CLI, không buộc SMTP/JWT/Cloudinary và không in giá trị lỗi.
export function readSeedConfig(
  command: string | undefined,
  env: SeedEnv,
): SeedConfig {
  if (!SEED_COMMANDS.includes(command as SeedCommand))
    throw new SeedError('SEED_COMMAND_INVALID');
  const selected = command as SeedCommand;
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'staging', 'production'].includes(nodeEnv))
    throw new SeedError('SEED_ENV_INVALID');
  if (nodeEnv === 'production' && selected !== 'first-admin')
    throw new SeedError('SEED_PRODUCTION_FORBIDDEN');
  if (env.TZ !== undefined && env.TZ !== 'Asia/Ho_Chi_Minh')
    throw new SeedError('SEED_ENV_INVALID');
  if (env.DB_TIMEZONE !== undefined && env.DB_TIMEZONE !== '+07:00')
    throw new SeedError('SEED_ENV_INVALID');
  const port = env.DB_PORT ?? '3306';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new SeedError('SEED_ENV_INVALID');
  const config: SeedConfig = {
    command: selected,
    database: {
      host: env.DB_HOST === undefined ? '127.0.0.1' : required(env, 'DB_HOST'),
      port: Number(port),
      database: required(env, 'MYSQL_DATABASE'),
      username: required(env, 'MYSQL_USER'),
      password: required(env, 'MYSQL_PASSWORD'),
      timezone: '+07:00',
    },
  };
  if (selected === 'dev-accounts' || selected === 'first-admin') {
    config.password = required(
      env,
      selected === 'first-admin' ? 'SEED_ADMIN_PASSWORD' : 'SEED_DEV_PASSWORD',
    );
    if (checkPassword(config.password))
      throw new SeedError('SEED_PASSWORD_INVALID');
  }
  if (selected === 'first-admin') {
    const email = normalizeEmail(required(env, 'SEED_ADMIN_EMAIL'));
    const name = normalizeFullName(required(env, 'SEED_ADMIN_FULL_NAME'));
    const phone = normalizePhone(required(env, 'SEED_ADMIN_PHONE'));
    if (!isValidEmail(email) || !isValidFullName(name) || !phone)
      throw new SeedError('SEED_ADMIN_INVALID');
    config.admin = { email, name, phone };
  }
  return config;
}
