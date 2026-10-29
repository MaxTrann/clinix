import { randomBytes } from 'node:crypto';
import { readSeedConfig, type SeedEnv } from './seed-config.js';
import { seedCli } from './seed-cli.js';
import { CONFIG_DEMO } from './catalog-data.js';
import { validateDemoConfig } from './seed.service.js';

const password = () => `${randomBytes(16).toString('hex')}1!`;
const environment = (): SeedEnv => ({
  NODE_ENV: 'test',
  MYSQL_DATABASE: 'clinix_c5_test',
  MYSQL_USER: 'sample',
  MYSQL_PASSWORD: randomBytes(16).toString('hex'),
  SEED_ADMIN_EMAIL: ' admin@EXAMPLE.INVALID ',
  SEED_ADMIN_FULL_NAME: ' Quản trị mẫu ',
  SEED_ADMIN_PHONE: '090 000 0001',
  SEED_ADMIN_PASSWORD: password(),
  SEED_DEV_PASSWORD: password(),
});

describe('C5 SD-03/04 — validation và lỗi CLI trước khi kết nối', () => {
  it.each(['catalog', 'dev-accounts', 'config-dev'])(
    'SD-03 chặn production %s ngay cả khi chưa có cấu hình DB',
    async (command) => {
      const output = { log: vi.fn(), error: vi.fn() };
      expect(await seedCli([command], { NODE_ENV: 'production' }, output)).toBe(
        1,
      );
      expect(output.error).toHaveBeenCalledExactlyOnceWith(
        'SEED_PRODUCTION_FORBIDDEN',
      );
      expect(output.log).not.toHaveBeenCalled();
    },
  );
  it('SD-04 first-admin được phép production và chuẩn hóa hồ sơ bằng policy auth', () => {
    const env: SeedEnv = { ...environment(), NODE_ENV: 'production' };
    const config = readSeedConfig('first-admin', env);
    expect(config.admin).toEqual({
      email: 'admin@example.invalid',
      name: 'Quản trị mẫu',
      phone: '0900000001',
    });
    expect(config.password === env.SEED_ADMIN_PASSWORD).toBe(true);
    expect(config.database.timezone).toBe('+07:00');
  });
  it.each(['NODE_ENV', 'TZ', 'DB_TIMEZONE', 'DB_PORT'])(
    'SD-03 từ chối biến %s không hợp lệ',
    (key) => {
      expect(() =>
        readSeedConfig('catalog', { ...environment(), [key]: 'invalid' }),
      ).toThrow('SEED_ENV_INVALID');
    },
  );
  it.each([
    'MYSQL_DATABASE',
    'MYSQL_USER',
    'MYSQL_PASSWORD',
    'SEED_ADMIN_FULL_NAME',
    'SEED_ADMIN_PHONE',
    'SEED_ADMIN_EMAIL',
    'SEED_ADMIN_PASSWORD',
  ])('SD-04 thiếu %s không in giá trị đầu vào', (key) => {
    expect(() =>
      readSeedConfig('first-admin', { ...environment(), [key]: '' }),
    ).toThrow('SEED_ENV_INVALID');
  });
  it('SD-04 mật khẩu không bị trim; sai policy bị từ chối', () => {
    const env = environment();
    env.SEED_ADMIN_PASSWORD = ` ${password()} `;
    expect(
      readSeedConfig('first-admin', env).password === env.SEED_ADMIN_PASSWORD,
    ).toBe(true);
    expect(() =>
      readSeedConfig('first-admin', {
        ...env,
        SEED_ADMIN_PASSWORD: randomBytes(2).toString('hex'),
      }),
    ).toThrow('SEED_PASSWORD_INVALID');
  });
  it.each(['SEED_ADMIN_EMAIL', 'SEED_ADMIN_PHONE', 'SEED_ADMIN_FULL_NAME'])(
    'SD-04 từ chối hồ sơ %s sai',
    (key) => {
      expect(() =>
        readSeedConfig('first-admin', { ...environment(), [key]: '\u0000' }),
      ).toThrow('SEED_ADMIN_INVALID');
    },
  );
  it('SD-03 không yêu cầu biến mật khẩu seed/SMTP/JWT cho catalog', () => {
    const env = environment();
    delete env.SEED_ADMIN_PASSWORD;
    delete env.SEED_DEV_PASSWORD;
    expect(readSeedConfig('catalog', env).password).toBeUndefined();
  });
  it('SD-03 command lạ/thừa tham số chỉ in mã cố định, không lộ đầu vào', async () => {
    const input = randomBytes(24).toString('hex');
    const output = { log: vi.fn(), error: vi.fn() };
    expect(await seedCli([input], {}, output)).toBe(1);
    expect(await seedCli(['catalog', input], {}, output)).toBe(1);
    expect(output.error.mock.calls).toEqual([
      ['SEED_COMMAND_INVALID'],
      ['SEED_COMMAND_INVALID'],
    ]);
  });
  it('SD-06 toàn bộ giá trị thử đúng Q34, nhắc trùng/sai trọng số bị chặn', () => {
    expect(validateDemoConfig).not.toThrow();
    const old = CONFIG_DEMO.trongSoW2;
    try {
      CONFIG_DEMO.trongSoW2 = '0.41';
      expect(validateDemoConfig).toThrow('SEED_CONFIG_INVALID');
    } finally {
      CONFIG_DEMO.trongSoW2 = old;
    }
    CONFIG_DEMO.thoiDiemNhacLich.push(24);
    try {
      expect(validateDemoConfig).toThrow('SEED_CONFIG_INVALID');
    } finally {
      CONFIG_DEMO.thoiDiemNhacLich.pop();
    }
  });
});
