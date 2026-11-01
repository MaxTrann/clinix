import type { DataSource } from 'typeorm';
import { PasswordHasher } from '../password/password-hasher.service.js';
import {
  LOGIN_PASSWORD,
  loginPasswordHash,
} from '../testing/login-int-helpers.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import { newLoginAccount } from '../testing/login-int-helpers.js';
import { freshFixture } from '../testing/multi-account-helpers.js';

// Task A13 — số đo cho báo cáo, không phải khẳng định: thời gian của 20 yêu cầu đăng xuất đồng thời (cùng tài khoản và khác tài khoản). Đăng xuất từ một câu UPDATE thành
// một giao dịch ba câu (đọc mã tài khoản, FOR SHARE hàng tài khoản, UPDATE) nên cần biết cái giá. Số vòng REVOKE_LATENCY_ROUNDS (mặc định 3; đo thật dùng 30). Mã RV-11 là [đề xuất].
const ROUNDS = Number(process.env['REVOKE_LATENCY_ROUNDS'] ?? 3);
const PARALLEL = 20;

let db: DataSource;

useIntegrationHooks((testDb) => {
  db = testDb;
});

const percentile = (sorted: number[], ratio: number): number =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;

it('RV-16 (đo) hai lần băm của đổi mật khẩu (một verify và một hash Argon2id) nằm ngoài giao dịch', async () => {
  const hasher = new PasswordHasher();
  const hash = await loginPasswordHash();
  const waits: number[] = [];
  for (let i = 0; i < Math.max(20, ROUNDS * 7); i++) {
    const started = performance.now();
    await hasher.verify(hash, LOGIN_PASSWORD);
    await hasher.hash('Mat-Khau-Moi-8!');
    waits.push(performance.now() - started);
  }
  const sorted = waits.toSorted((a, b) => a - b);
  console.info(
    `[RV-16] ${String(waits.length)} lần: trung vị ${percentile(sorted, 0.5).toFixed(1)} ms, p95 ${percentile(sorted, 0.95).toFixed(1)} ms, lớn nhất ${(sorted.at(-1) ?? 0).toFixed(1)} ms`,
  );
}, 60_000);

describe('thời gian đăng xuất đồng thời', () => {
  it.each(['cùng tài khoản', 'khác tài khoản'] as const)(
    'RV-11 (đo) %s',
    async (scope) => {
      const waits: number[] = [];
      for (let round = 0; round < ROUNDS; round++) {
        const fx = await freshFixture(db);
        const shared = await newLoginAccount(db);
        const tokens: string[] = [];
        for (let i = 0; i < PARALLEL; i++) {
          const owner =
            scope === 'cùng tài khoản' ? shared : await newLoginAccount(db);
          const session = await fx.sessionService.create(owner.taiKhoanId);
          tokens.push(session.refreshToken);
        }

        const outcomes = await Promise.all(
          tokens.map(async (token) => {
            const started = performance.now();
            const revoked = await fx.sessionService.revokeByRefreshToken(token);
            waits.push(performance.now() - started);
            return revoked;
          }),
        );
        expect(outcomes.every(Boolean)).toBe(true);
      }
      const sorted = waits.toSorted((a, b) => a - b);
      console.info(
        `[RV-11] ${scope}: ${String(waits.length)} yêu cầu, trung vị ${percentile(sorted, 0.5).toFixed(1)} ms, p95 ${percentile(sorted, 0.95).toFixed(1)} ms, lớn nhất ${(sorted.at(-1) ?? 0).toFixed(1)} ms`,
      );
    },
    120_000,
  );
});
