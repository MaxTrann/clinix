import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { PhienDangNhap } from '../entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import { TEST_AUTH_ENV } from '../testing/auth-test-env.js';
import {
  changeInput,
  changeServiceFor,
} from '../testing/change-password-helpers.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import {
  LOGIN_PASSWORD,
  WRONG_PASSWORD,
  createLoginFixture,
  newLoginAccount,
  type LoginFixture,
} from '../testing/login-int-helpers.js';
import { NEW_PASSWORD } from '../testing/reset-password-int-helpers.js';
import {
  exposedBy,
  expectNoSecrets,
  type Secrets,
} from '../testing/secret-scan.js';
import type { ChangePasswordService } from './change-password.service.js';

// Task A13 — DM-09: mật khẩu cũ, mật khẩu mới, mật khẩu đoán sai, băm (cũ và mới), refresh token (cũ và mới), access token, email và khoá KHÔNG lọt vào log, kết quả hay lỗi
// (inspect đủ nguyên nhân và stack) ở MỌI nhánh, kiểm bằng giá trị THẬT đọc trước VÀ sau. Quét lời gọi `Logger` THÔ (trước bộ che P5); stdout/stderr, thân và Set-Cookie:
// test/auth-change-password.e2e-spec.ts. Refresh token mới chỉ được đi ra ở kết quả cho controller đặt cookie, nên ca thành công chỉ quét log. Mã MD-Lnn là [đề xuất].
let db: DataSource;
let fx: LoginFixture<FakeMailService>;
let service: ChangePasswordService;
let logs: string[];
const tokens: string[] = [];

useIntegrationHooks((testDb, logLines) => {
  db = testDb;
  logs = logLines;
  tokens.length = 0;
  fx = createLoginFixture(testDb);
  service = changeServiceFor(testDb, fx);
});

async function secretsNow(): Promise<Secrets> {
  const accounts = await db.getRepository(TaiKhoan).find();
  const sessions = await db.getRepository(PhienDangNhap).find();
  return {
    literals: [
      NEW_PASSWORD,
      LOGIN_PASSWORD,
      WRONG_PASSWORD,
      TEST_AUTH_ENV.JWT_ACCESS_SECRET,
      TEST_AUTH_ENV.JWT_REFRESH_SECRET,
      ...accounts.flatMap((a) => [a.email, a.matKhauBam ?? '']),
      ...sessions.map((s) => s.refreshTokenBam),
      ...tokens,
    ].filter((value) => value.length > 5),
    codes: [],
  };
}

async function liveAccount() {
  const account = await newLoginAccount(db);
  const session = await fx.sessionService.create(account.taiKhoanId);
  tokens.push(session.refreshToken, session.accessToken);
  return { account, session };
}

/** Chạy `work`, kiểm kết quả hoặc lỗi và TOÀN BỘ log tích luỹ không chứa bí mật nào, lấy cả trước lẫn sau để có băm cũ và băm mới. */
async function scan(
  where: string,
  work: () => Promise<unknown>,
): Promise<string> {
  const before = await secretsNow();
  const exposed = await exposedBy(work);
  const after = await secretsNow();
  const secrets: Secrets = {
    literals: [...new Set([...before.literals, ...after.literals])],
    codes: [],
  };
  expectNoSecrets(`${where}: lỗi`, exposed, secrets);
  expectNoSecrets(`${where}: log`, logs.join('\n'), secrets);
  return exposed;
}

it('MD-L01 thành công: log có mã tài khoản, mã phiên, số phiên và KHÔNG có bí mật nào kể cả refresh token mới', async () => {
  const { account, session } = await liveAccount();
  await fx.sessionService.create(account.taiKhoanId);

  const result = await service.change(changeInput(account.taiKhoanId, session));
  tokens.push(result.refreshToken);

  expectNoSecrets('thành công: log', logs.join('\n'), await secretsNow());
  expect(logs.join('\n')).toContain(
    `Tài khoản ${account.taiKhoanId} đổi mật khẩu (phiên ${session.sessionId}): thu hồi 1 phiên khác`,
  );
});

it('MD-L02 sai mật khẩu cũ: lỗi và log sạch; log có mã tài khoản và mã phiên để chẩn đoán', async () => {
  const { account, session } = await liveAccount();

  const exposed = await scan('sai mật khẩu cũ', () =>
    service.change(changeInput(account.taiKhoanId, session, WRONG_PASSWORD)),
  );

  expect(exposed).toContain('MAT_KHAU_CU_SAI');
  expect(logs.join('\n')).toContain(
    `Tài khoản ${account.taiKhoanId} (phiên ${session.sessionId}) nhập sai mật khẩu hiện tại`,
  );
});

it('MD-L03 phiên đã thu hồi và tài khoản ngừng: lỗi và log sạch', async () => {
  const revoked = await liveAccount();
  await fx.sessionService.revoke(revoked.session.sessionId);
  const stopped = await liveAccount();
  await db
    .getRepository(TaiKhoan)
    .update(
      { taiKhoanId: stopped.account.taiKhoanId },
      { trangThai: 'NgungHoatDong' },
    );

  for (const [where, one] of [
    ['phiên đã thu hồi', revoked],
    ['tài khoản ngừng', stopped],
  ] as const) {
    const exposed = await scan(where, () =>
      service.change(changeInput(one.account.taiKhoanId, one.session)),
    );
    expect(exposed, where).toContain('PHIEN_HET_HIEU_LUC');
  }
});

it('MD-L04 lỗi DB giữa giao dịch: lỗi lan ra không mang mật khẩu hay băm', async () => {
  const { account, session } = await liveAccount();
  vi.spyOn(fx.accounts, 'setPasswordAfterChange').mockRejectedValueOnce(
    new Error('giả lập mất DB'),
  );

  const exposed = await scan('lỗi DB', () =>
    service.change(changeInput(account.taiKhoanId, session)),
  );

  expect(exposed).toContain('giả lập mất DB');
});
