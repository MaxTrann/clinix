import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { LOGIN_LOCK_MS } from '../auth.constants.js';
import { AppException } from '../../common/errors/app.exception.js';
import { resetTables } from '../../database/testing/test-database.js';
import { PhienDangNhap } from '../entities/phien-dang-nhap.entity.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import {
  REGISTER_PASSWORD,
  accountByEmail,
  registerBody,
} from '../testing/register-int-helpers.js';
import {
  LOGIN_PASSWORD,
  WRONG_PASSWORD,
  createLoginFixture,
  failureState,
  loginBody,
  newLoginAccount,
  sessionRowsOf,
  setFailureState,
  type LoginFixture,
} from '../testing/login-int-helpers.js';
import { at, wrongCodeFor } from '../testing/otp-int-helpers.js';
import {
  SelectiveMail,
  barrier,
  classify,
  describeTally,
  type Tally,
} from '../testing/otp-multi-account.js';
import {
  patientRows,
  registerPatient,
  resendBody,
  serverDeadlocks,
  verifyBody,
  walletRows,
} from '../testing/verification-int-helpers.js';

// Task A8 — NHIỀU tài khoản KHÁC NHAU cùng lúc, mỗi tài khoản một giao dịch riêng, trên MySQL 8.4 thật (bài học A5-C: test cùng một tài khoản không
// thấy deadlock chéo tài khoản vì khoá hàng đã xếp hàng sẵn). Đăng nhập đúng, sai, bị khoá và chưa xác minh chạy ĐỒNG THỜI với đăng ký, verify-otp
// và resend-otp của tài khoản KHÁC. Đo bằng số lỗi MySQL THẬT: lỗi trả ra (1213, 1205) VÀ bộ đếm `lock_deadlocks` của máy chủ (bắt cả deadlock bị
// thử lại âm thầm); khẳng định đều bằng 0. Mã LM-nn là [đề xuất]. Số vòng chỉnh bằng biến môi trường LOGIN_MULTI_ROUNDS (mặc định 8; đo kỹ dùng 50
// và chạy với --reporter=verbose để thấy dòng "[LM]").
const ROUNDS = Number(process.env['LOGIN_MULTI_ROUNDS'] ?? 8);
const LOCK = LOGIN_LOCK_MS / 1000;

let db: DataSource;
let fx: LoginFixture<SelectiveMail>;

useIntegrationHooks((testDb) => {
  db = testDb;
});

/** Từ chối nghiệp vụ DỰ KIẾN của kịch bản (sai mật khẩu, khoá, chưa xác minh, mã OTP sai) tính là kết quả đúng, không phải lỗi. */
const EXPECTED = new Set([
  'DANG_NHAP_SAI',
  'TAI_KHOAN_BI_KHOA_TAM',
  'EMAIL_CHUA_XAC_MINH',
  'OTP_SAI',
]);
const tolerate =
  (work: () => Promise<unknown>) => async (): Promise<unknown> => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof AppException && EXPECTED.has(error.maLoi)) return;
      throw error;
    }
  };

async function runConcurrently(
  actions: (() => Promise<unknown>)[],
  tally: Tally,
): Promise<void> {
  const wait = barrier(actions.length);
  const results = await Promise.allSettled(
    actions.map(async (action) => {
      await wait();
      return action();
    }),
  );
  for (const result of results) classify(tally, result);
}

const newTally = (): Tally => ({
  requests: 0,
  ok: 0,
  deadlock1213: 0,
  lockTimeout1205: 0,
  other: {},
});

describe('nhiều tài khoản khác nhau cùng lúc', () => {
  it(`LM-01 hỗn hợp: ${String(ROUNDS)} vòng × (2 đăng nhập đúng, 2 sai, 1 sai chạm khoá, 1 chưa xác minh) cùng đăng ký ×2, verify-otp ×2, resend-otp ×1 của tài khoản khác: kết quả nhất quán; 0 lỗi 1213 và 1205, 0 deadlock phía máy chủ`, async () => {
    const tally = newTally();
    const inconsistent: string[] = [];
    const deadlocksBefore = await serverDeadlocks(db);

    for (let round = 0; round < ROUNDS; round++) {
      await resetTables(db);
      vi.setSystemTime(at(0));
      const mail = new SelectiveMail();
      fx = createLoginFixture(db, mail);

      const right = [await newLoginAccount(db), await newLoginAccount(db)];
      const wrong = [await newLoginAccount(db), await newLoginAccount(db)];
      const locking = await newLoginAccount(db);
      await setFailureState(db, locking.taiKhoanId, {
        soLanDangNhapSai: 4,
        khoaDangNhapDen: null,
      });
      const unverified = await registerPatient(db, fx, {
        email: 'chua.xac.minh@example.com',
      });
      const verifying = [
        await registerPatient(db, fx, { email: 'xac.minh.1@example.com' }),
        await registerPatient(db, fx, { email: 'xac.minh.2@example.com' }),
      ];
      const resending = await registerPatient(db, fx, {
        email: 'gui.lai@example.com',
      });
      vi.setSystemTime(at(61)); // qua mốc 60 giây để gửi lại được

      const actions: (() => Promise<unknown>)[] = [
        ...right.map((a) => () => fx.login.login(loginBody(a))),
        ...wrong.map((a) =>
          tolerate(() => fx.login.login(loginBody(a, WRONG_PASSWORD))),
        ),
        tolerate(() => fx.login.login(loginBody(locking, WRONG_PASSWORD))),
        tolerate(() =>
          fx.login.login({
            email: unverified.email,
            matKhau: REGISTER_PASSWORD,
          }),
        ),
        // tài khoản KHÁC đang đăng ký, xác minh (một đúng, một sai) và gửi lại cùng lúc
        () =>
          fx.service.register(
            registerBody({ email: 'moi.dang.ky.1@example.com' }),
          ),
        () =>
          fx.service.register(
            registerBody({ email: 'moi.dang.ky.2@example.com' }),
          ),
        () => fx.verification.verifyOtp(verifyBody(verifying[0] ?? unverified)),
        tolerate(() =>
          fx.verification.verifyOtp(
            verifyBody(verifying[1] ?? unverified, {
              otp: wrongCodeFor((verifying[1] ?? unverified).code),
            }),
          ),
        ),
        () => fx.verification.resendOtp(resendBody(resending)),
      ];
      await runConcurrently(actions, tally);

      // Nhất quán: mỗi tài khoản chỉ chịu ảnh hưởng của CHÍNH thao tác của nó
      const where = `vòng ${String(round)}`;
      for (const a of right) {
        const sessions = await sessionRowsOf(db, a.taiKhoanId);
        if (sessions.length !== 1)
          inconsistent.push(
            `${where}: đăng nhập đúng nhưng ${String(sessions.length)} phiên`,
          );
      }
      for (const a of wrong) {
        const state = await failureState(db, a.taiKhoanId);
        if (
          state.soLanDangNhapSai !== 1 ||
          (await sessionRowsOf(db, a.taiKhoanId)).length !== 0
        )
          inconsistent.push(
            `${where}: đăng nhập sai không ra đúng 1 lần đếm và 0 phiên`,
          );
      }
      const lockedState = await failureState(db, locking.taiKhoanId);
      if (
        lockedState.soLanDangNhapSai !== 5 ||
        lockedState.khoaDangNhapDen?.getTime() !== at(61 + LOCK).getTime()
      )
        inconsistent.push(`${where}: lần sai chạm 5 không khoá đúng 15 phút`);
      const pendingState = await failureState(db, unverified.taiKhoanId);
      if (
        pendingState.soLanDangNhapSai !== 0 ||
        (await sessionRowsOf(db, unverified.taiKhoanId)).length !== 0
      )
        inconsistent.push(
          `${where}: chưa xác minh mà có phiên hoặc bộ đếm sai`,
        );
      const patients = await patientRows(db);
      const wallets = await walletRows(db);
      const verifiedId = (await accountByEmail(db, 'xac.minh.1@example.com'))
        ?.taiKhoanId;
      if (
        patients.length !== 1 ||
        wallets.length !== 1 ||
        patients[0]?.taiKhoanId !== verifiedId
      )
        inconsistent.push(
          `${where}: verify-otp của tài khoản khác ra sai hồ sơ hoặc ví`,
        );
      if (
        (await accountByEmail(db, 'moi.dang.ky.1@example.com')) === null ||
        (await accountByEmail(db, 'moi.dang.ky.2@example.com')) === null
      )
        inconsistent.push(`${where}: đăng ký mới của tài khoản khác bị mất`);
      const sessionTotal = await db.getRepository(PhienDangNhap).count();
      if (sessionTotal !== right.length)
        inconsistent.push(
          `${where}: tổng phiên ${String(sessionTotal)}, mong đợi ${String(right.length)}`,
        );
    }
    const deadlocks = (await serverDeadlocks(db)) - deadlocksBefore;
    const summary = `${describeTally('hỗn hợp', tally)}; deadlock phía máy chủ = ${String(deadlocks)}`;
    console.info(`[LM] ${summary}`); // số đo cho báo cáo

    expect(inconsistent, summary).toEqual([]);
    expect(tally, summary).toMatchObject({
      deadlock1213: 0,
      lockTimeout1205: 0,
      other: {},
    });
    expect(tally.ok, summary).toBe(tally.requests);
    expect(deadlocks, summary).toBe(0);
  }, 600_000);

  it(`LM-02 chỉ đăng nhập: ${String(ROUNDS)} vòng × 12 tài khoản khác nhau (6 đúng, 6 sai) cùng lúc; mỗi tài khoản đúng kết quả của riêng nó; 0 lỗi 1213 và 1205, 0 deadlock phía máy chủ`, async () => {
    const tally = newTally();
    const inconsistent: string[] = [];
    const deadlocksBefore = await serverDeadlocks(db);

    for (let round = 0; round < ROUNDS; round++) {
      await resetTables(db);
      vi.setSystemTime(at(0));
      fx = createLoginFixture(db, new SelectiveMail());
      const accounts = [];
      for (let i = 0; i < 12; i++) accounts.push(await newLoginAccount(db));

      await runConcurrently(
        accounts.map((account, i) =>
          i % 2 === 0
            ? () => fx.login.login(loginBody(account, LOGIN_PASSWORD))
            : tolerate(() =>
                fx.login.login(loginBody(account, WRONG_PASSWORD)),
              ),
        ),
        tally,
      );

      for (const [i, account] of accounts.entries()) {
        const sessions = await sessionRowsOf(db, account.taiKhoanId);
        const state = await failureState(db, account.taiKhoanId);
        const correct = i % 2 === 0;
        if (correct && (sessions.length !== 1 || state.soLanDangNhapSai !== 0))
          inconsistent.push(
            `vòng ${String(round)}: tài khoản đúng ${String(i)} sai kết quả`,
          );
        if (!correct && (sessions.length !== 0 || state.soLanDangNhapSai !== 1))
          inconsistent.push(
            `vòng ${String(round)}: tài khoản sai ${String(i)} sai kết quả`,
          );
      }
    }
    const deadlocks = (await serverDeadlocks(db)) - deadlocksBefore;
    const summary = `${describeTally('chỉ đăng nhập', tally)}; deadlock phía máy chủ = ${String(deadlocks)}`;
    console.info(`[LM] ${summary}`);

    expect(inconsistent, summary).toEqual([]);
    expect(tally, summary).toMatchObject({
      deadlock1213: 0,
      lockTimeout1205: 0,
      other: {},
    });
    expect(tally.ok, summary).toBe(tally.requests);
    expect(deadlocks, summary).toBe(0);
  }, 600_000);
});
