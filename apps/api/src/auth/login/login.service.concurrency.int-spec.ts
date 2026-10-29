import type { DataSource } from 'typeorm';
import { LOGIN_LOCK_MS } from '../auth.constants.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { FakeMailService } from '../../mail/testing/fake-mail.service.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import {
  LOGIN_PASSWORD,
  WRONG_PASSWORD,
  createLoginFixture,
  failureState,
  loginBody,
  newLoginAccount,
  sessionRowsOf,
  type LoginFixture,
} from '../testing/login-int-helpers.js';
import { at } from '../testing/otp-int-helpers.js';
import {
  serverDeadlocks,
  sessionCount,
  snapshotOf,
} from '../testing/verification-int-helpers.js';

// Task A8 — đăng nhập ĐỒNG THỜI cùng MỘT tài khoản trên MySQL 8.4 thật (nhiều tài khoản khác nhau: login.multi-account.int-spec.ts).
// Mã test case: DN-12 (10 yêu cầu sai song song: khoá đúng khi chạm 5, không mất lần đếm), hai đăng nhập đúng song song (mỗi yêu cầu một phiên,
// không lỗi UNIQUE hay deadlock). Mã LC-nn là [đề xuất]. Mỗi ca cũng khẳng định bộ đếm lock_deadlocks của máy chủ không tăng.
const LOCK = LOGIN_LOCK_MS / 1000;

let db: DataSource;
let fx: LoginFixture<FakeMailService>;

useIntegrationHooks((testDb) => {
  db = testDb;
  fx = createLoginFixture(testDb);
});

type Settled = PromiseSettledResult<unknown>;
const codeOf = (result: Settled): string => {
  if (result.status === 'fulfilled') return 'THANH_CONG';
  const reason: unknown = result.reason;
  return reason instanceof AppException
    ? reason.maLoi
    : `LOI_KHAC: ${reason instanceof Error ? reason.message : String(reason)}`;
};
const tally = (results: Settled[]): Record<string, number> =>
  results.reduce<Record<string, number>>((counts, result) => {
    const code = codeOf(result);
    counts[code] = (counts[code] ?? 0) + 1;
    return counts;
  }, {});

describe('cùng một tài khoản, nhiều yêu cầu đồng thời', () => {
  it('LC-01 (DN-12) 10 yêu cầu SAI song song: đúng 4 yêu cầu DANG_NHAP_SAI, 6 yêu cầu BI_KHOA_TAM; bộ đếm cuối đúng 5 (không mất lần đếm, không đếm quá), khoá đặt một lần', async () => {
    const account = await newLoginAccount(db);
    const deadlocksBefore = await serverDeadlocks(db);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        fx.login.login(loginBody(account, WRONG_PASSWORD)),
      ),
    );

    expect(tally(results)).toEqual({
      DANG_NHAP_SAI: 4,
      TAI_KHOAN_BI_KHOA_TAM: 6,
    });
    expect(await failureState(db, account.taiKhoanId)).toEqual({
      soLanDangNhapSai: 5,
      khoaDangNhapDen: at(LOCK),
    });
    expect(await sessionRowsOf(db, account.taiKhoanId)).toHaveLength(0);
    expect(await serverDeadlocks(db)).toBe(deadlocksBefore);
  });

  it('LC-02 5 yêu cầu ĐÚNG song song: cả 5 thành công, mỗi yêu cầu MỘT phiên với băm refresh khác nhau; không UNIQUE, không deadlock', async () => {
    const account = await newLoginAccount(db);
    const deadlocksBefore = await serverDeadlocks(db);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => fx.login.login(loginBody(account))),
    );

    expect(tally(results)).toEqual({ THANH_CONG: 5 });
    const rows = await sessionRowsOf(db, account.taiKhoanId);
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map((row) => row.refreshTokenBam)).size).toBe(5);
    const tokens = results.flatMap((result) =>
      result.status === 'fulfilled'
        ? [
            (result.value as { session: { refreshToken: string } }).session
              .refreshToken,
          ]
        : [],
    );
    expect(new Set(tokens).size).toBe(5);
    expect(await serverDeadlocks(db)).toBe(deadlocksBefore);
  });

  it('LC-03 đúng và sai song song (nhiều vòng): luôn đúng một phiên, không lỗi lạ; bộ đếm cuối là 0 hoặc 1 tuỳ ai giữ khoá trước, không bao giờ khác', async () => {
    const account = await newLoginAccount(db);
    const deadlocksBefore = await serverDeadlocks(db);
    const finals = new Set<number>();

    for (let round = 0; round < 6; round++) {
      const before = (await sessionRowsOf(db, account.taiKhoanId)).length;
      const results = await Promise.allSettled([
        fx.login.login(loginBody(account)),
        fx.login.login(loginBody(account, WRONG_PASSWORD)),
      ]);
      expect(tally(results)).toEqual({ THANH_CONG: 1, DANG_NHAP_SAI: 1 });
      expect(await sessionRowsOf(db, account.taiKhoanId)).toHaveLength(
        before + 1,
      );
      finals.add((await failureState(db, account.taiKhoanId)).soLanDangNhapSai);
    }

    expect([...finals].every((count) => count === 0 || count === 1)).toBe(true);
    expect(await serverDeadlocks(db)).toBe(deadlocksBefore);
  });

  it('LC-04 10 yêu cầu email lạ song song: tất cả DANG_NHAP_SAI, không ghi gì, không lỗi lạ', async () => {
    await newLoginAccount(db);
    const before = await snapshotOf(db);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        fx.login.login({
          email: 'khong.co@example.com',
          matKhau: LOGIN_PASSWORD,
        }),
      ),
    );

    expect(tally(results)).toEqual({ DANG_NHAP_SAI: 10 });
    expect(await snapshotOf(db)).toEqual(before);
    expect(await sessionCount(db)).toBe(0);
  });
});
