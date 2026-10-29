import type { DataSource } from 'typeorm';
import { PasswordHasher } from '../../auth/password/password-hasher.service.js';
import { checkPassword } from '../../auth/password/password-policy.js';
import { isValidEmail } from '../../auth/validation/email-policy.js';
import { isValidFullName } from '../../auth/validation/full-name-policy.js';
import { normalizePhone } from '../../auth/validation/phone-policy.js';
import { CONFIG_DEMO } from './catalog-data.js';
import { DEV_ACCOUNTS } from './dev-account-data.js';
import type { SeedConfig } from './seed-config.js';
import { SeedError } from './seed-error.js';
import { SeedRepository, type SeedCounts } from './seed.repository.js';
import { seedTransaction } from './seed-runner.js';

// Miền kỹ thuật Q34, kiểm trước insert: không dùng lỗi CHECK làm validation.
export function validateDemoConfig(): void {
  const c = CONFIG_DEMO;
  const ranges = [
    [c.thoiGianGiuCho, 1, 60],
    [c.soLichHenToiDaMoiHoSo, 1, 20],
    [c.soLanTuDoiLichToiDa, 0, 10],
    [c.checkInTruocPhut, 0, 240],
    [c.checkInSauPhut, 0, 240],
    [c.thoiHanPhanHoiLoiMoi, 1, 1440],
    [c.soMucChoToiDa, 0, 10],
    [c.nguongNoShow, 1, 10],
    [c.soNgayBaoTruocDoiGioLam, 1, 60],
  ];
  const reminders = c.thoiDiemNhacLich;
  const weights = [c.trongSoW1, c.trongSoW2];
  if (
    ranges.some(
      ([value, min, max]) =>
        !Number.isInteger(value) || value! < min! || value! > max!,
    ) ||
    reminders.length < 1 ||
    reminders.length > 5 ||
    new Set(reminders).size !== reminders.length ||
    reminders.some((n) => !Number.isInteger(n) || n < 1 || n > 720) ||
    weights.some((n) => !/^(0\.\d{2}|1\.00)$/.test(n)) ||
    Math.round(Number(weights[0]) * 100) +
      Math.round(Number(weights[1]) * 100) !==
      100
  ) {
    throw new SeedError('SEED_CONFIG_INVALID');
  }
}

export async function runSeed(
  db: DataSource,
  config: SeedConfig,
): Promise<SeedCounts> {
  let hash: string | undefined;
  if (config.command === 'first-admin' || config.command === 'dev-accounts') {
    if (!config.password || checkPassword(config.password))
      throw new SeedError('SEED_PASSWORD_INVALID');
    const profiles =
      config.command === 'first-admin' ? [config.admin] : DEV_ACCOUNTS;
    for (const input of profiles) {
      if (
        !input ||
        !isValidEmail(input.email) ||
        !isValidFullName(input.name) ||
        normalizePhone(input.phone) !== input.phone
      )
        throw new SeedError('SEED_ADMIN_INVALID');
    }
    // Không giữ connection/transaction/lock trong lúc băm Argon2id.
    hash = await new PasswordHasher().hash(config.password);
  }
  if (config.command === 'config-dev') validateDemoConfig();
  return seedTransaction(db, async (manager) => {
    const repository = new SeedRepository(manager);
    if (config.command === 'catalog') await repository.catalog();
    else if (config.command === 'config-dev') await repository.config();
    else if (config.command === 'first-admin')
      await repository.createFirstAdmin(config.admin!, hash!);
    else {
      const links = await repository.accountRelations();
      for (const definition of DEV_ACCOUNTS)
        await repository.devAccount(definition, hash!, links);
    }
    return repository.counts;
  });
}
