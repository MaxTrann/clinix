import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import {
  changeInput,
  changeServiceFor,
  hashOf,
} from '../testing/change-password-helpers.js';
import { newResetAccount } from '../testing/forgot-password-int-helpers.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import {
  WRONG_PASSWORD,
  newLoginAccount,
  sessionRowsOf,
} from '../testing/login-int-helpers.js';
import {
  liveSessions,
  logoutAction,
  measureRounds,
  trafficOfOthers,
  type Action,
  type Round,
} from '../testing/multi-account-helpers.js';
import { at } from '../testing/otp-int-helpers.js';
import {
  NEW_PASSWORD,
  resetInput,
  resetServicesFor,
} from '../testing/reset-password-int-helpers.js';

// Task A13 — NHIỀU tài khoản KHÁC NHAU cùng lúc trên MySQL 8.4 thật (bài học A5-C, TECH_DEBT dòng 30). N tài khoản đổi mật khẩu ĐỒNG THỜI (mỗi tài khoản 3 phiên), xen các lần
// sai mật khẩu cũ, cùng lúc với lưu lượng của tài khoản KHÁC: đăng nhập, đăng ký, verify-otp, resend-otp, quên và đặt lại mật khẩu, làm mới, đăng xuất, dọn tài khoản quá hạn (A5, A7: `deleteByAccount` quét cùng chỉ mục nên tài khoản bị dọn đứng ngay trước một tài khoản đang đổi trong chỉ mục). Đo bằng lỗi MySQL THẬT (1213, 1205) VÀ bộ đếm
// `lock_deadlocks` của máy chủ (`measureRounds`). Từ chối nghiệp vụ DỰ KIẾN (MAT_KHAU_CU_SAI) được ghi riêng, lỗi lạ làm vòng đo đỏ. Mã MDM-nn là [đề xuất].
// Số vòng CHANGE_MULTI_ROUNDS (mặc định 8; đo kỹ dùng 50 và --reporter=verbose để thấy các dòng "[LM]").
const ROUNDS = Number(process.env['CHANGE_MULTI_ROUNDS'] ?? 8);
const TEST_TIMEOUT = Math.max(30_000, ROUNDS * 15_000); // hạn mỗi test tăng theo số vòng

let db: DataSource;

useIntegrationHooks((testDb) => {
  db = testDb;
});

async function changer(fx: Round['fx']) {
  const account = await newLoginAccount(db);
  const current = await fx.sessionService.create(account.taiKhoanId);
  const others = [
    await fx.sessionService.create(account.taiKhoanId),
    await fx.sessionService.create(account.taiKhoanId),
  ];
  return { account, current, others };
}

async function runRound(
  { fx, where, flag, race }: Round,
  writers: number,
): Promise<void> {
  const service = changeServiceFor(db, fx);
  const targets = [];
  const purging = [];
  for (let i = 0; i < writers; i++) {
    if (i < 2) {
      const expired = await newResetAccount(db, 'expired-unverified');
      if (i === 0) await fx.sessionService.create(expired.taiKhoanId); // có phiên để DELETE thật sự xoá; ca kia không có hàng nào
      purging.push(expired);
    }
    targets.push(await changer(fx));
  }
  const guessers = [await changer(fx), await changer(fx)];
  const refreshing = await liveSessions(db, fx, 3);
  const leaving = await liveSessions(db, fx, 3);
  const others = await trafficOfOthers(db, fx);
  const recovery = resetServicesFor(db, fx);
  const asking = await newResetAccount(db, 'verified');
  const resetting = await newResetAccount(db, 'verified');
  await fx.sessionService.create(resetting.taiKhoanId);
  await recovery.forgot.requestCode(resetting.email);
  const { resetToken } = await recovery.forgot.verifyCode(
    resetting.email,
    fx.mail.codeSentTo(resetting.email),
  );
  vi.setSystemTime(at(61));

  const outcome = new Map<string, string>();
  const note = (
    key: string,
    kind: string,
    work: () => Promise<unknown>,
  ): Action => ({
    kind,
    run: async () => {
      try {
        await work();
        outcome.set(key, 'ok');
      } catch (error) {
        if (!(error instanceof AppException)) throw error; // lỗi lạ (1213, 1205…) vào bảng đếm của measureRounds, làm vòng đo đỏ
        outcome.set(key, error.maLoi);
      }
    },
  });
  const refreshed: boolean[] = [];
  const left: boolean[] = [];
  const purged: boolean[] = [];
  await race([
    ...targets.map((t) =>
      note(t.account.taiKhoanId, 'đổi mật khẩu', () =>
        service.change(changeInput(t.account.taiKhoanId, t.current)),
      ),
    ),
    ...guessers.map((t) =>
      note(t.account.taiKhoanId, 'sai mật khẩu cũ', () =>
        service.change(
          changeInput(t.account.taiKhoanId, t.current, WRONG_PASSWORD),
        ),
      ),
    ),
    ...refreshing.map((live, i) => ({
      kind: 'làm mới (khác)',
      run: async () => {
        refreshed[i] = (
          await fx.sessionService.refresh(live.session.refreshToken)
        ).ok;
      },
    })),
    ...leaving.map((live, i) =>
      logoutAction(fx, live, left, i, 'đăng xuất (khác)'),
    ),
    ...purging.map((account, i) => ({
      kind: 'dọn quá hạn (khác)',
      run: async () => {
        purged[i] = await fx.otp.transaction((em) =>
          fx.cleaner.purgeIfExpired(em, account.taiKhoanId),
        );
      },
    })),
    {
      kind: 'cấp mã QMK (khác)',
      run: () => recovery.forgot.requestCode(asking.email),
    },
    {
      kind: 'đặt lại mật khẩu (khác)',
      run: () => recovery.reset.reset(resetInput(resetToken)),
    },
    ...others.actions,
  ]);

  for (const { account, current } of targets) {
    const id = account.taiKhoanId;
    if (outcome.get(id) !== 'ok') {
      flag(`${where}: đổi mật khẩu ra ${String(outcome.get(id))}`);
      continue; // không đọc DB của yêu cầu đã lỗi: số đo cuối là bảng đếm thật
    }
    if (!(await fx.hasher.verify(await hashOf(db, id), NEW_PASSWORD)))
      flag(`${where}: mật khẩu mới không vào DB`);
    const live = (await sessionRowsOf(db, id)).filter(
      (row) => row.thuHoiLuc === null,
    );
    if (live.length !== 1 || live[0]?.phienDangNhapId !== current.sessionId)
      flag(`${where}: phiên sống sai sau khi đổi`);
  }
  for (const { account } of guessers) {
    const id = account.taiKhoanId;
    if (outcome.get(id) !== 'MAT_KHAU_CU_SAI')
      flag(`${where}: sai mật khẩu cũ ra ${String(outcome.get(id))}`);
    const live = (await sessionRowsOf(db, id)).filter(
      (row) => row.thuHoiLuc === null,
    );
    if (live.length !== 3) flag(`${where}: sai mật khẩu mà phiên bị đụng`);
  }
  if (refreshed.length !== 3 || refreshed.some((ok) => !ok))
    flag(`${where}: làm mới của tài khoản khác bị từ chối`);
  if (left.length !== 3 || left.some((done) => !done))
    flag(`${where}: đăng xuất của tài khoản khác không thu hồi`);
  if (purged.length !== purging.length || purged.some((done) => !done))
    flag(`${where}: dọn tài khoản quá hạn không xong`);
  for (const problem of await others.problems()) flag(`${where}: ${problem}`);
}

describe('đổi mật khẩu của nhiều tài khoản khác nhau cùng lúc', () => {
  it.each([1, 8, 20])(
    `MDM-01 %i tài khoản đổi đồng thời cùng 2 lần sai và lưu lượng của tài khoản KHÁC: mỗi tài khoản đúng kết quả; 0 lỗi 1213 và 1205, 0 deadlock phía máy chủ`,
    async (writers) => {
      await measureRounds(db, ROUNDS, `${String(writers)} đổi`, (round) =>
        runRound(round, writers),
      );
    },
    TEST_TIMEOUT,
  );
});
