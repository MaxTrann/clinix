import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import { insertMaXacThuc } from '../entities/testing/auth-fixtures.js';
import {
  forgotRows,
  newResetAccount,
  type ResetAccountKind,
} from '../testing/forgot-password-int-helpers.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import { sessionRowsOf } from '../testing/login-int-helpers.js';
import {
  freshFixture,
  liveSessions,
  logoutAction,
  measureRounds,
  trafficOfOthers,
  type Action,
  type MultiFixture,
  type Round,
} from '../testing/multi-account-helpers.js';
import { at } from '../testing/otp-int-helpers.js';
import {
  NEW_PASSWORD,
  resetInput,
  resetServicesFor,
  type ResetServices,
} from '../testing/reset-password-int-helpers.js';

// Task A12 — NHIỀU tài khoản KHÁC NHAU cùng lúc trên MySQL 8.4 thật (bài học A5-C, TECH_DEBT dòng 30: mỗi nơi gọi OtpService mới PHẢI có test này). N tài
// khoản đặt mật khẩu mới ĐỒNG THỜI (mỗi tài khoản có phiên sống; tài khoản chưa xác minh có mã DangKy để thu hồi) cùng lúc với lưu lượng của tài khoản
// KHÁC: quên mật khẩu (cấp mã, verify-otp, gửi lại), đăng ký, xác minh và gửi lại mã đăng ký, đăng nhập đúng/sai, làm mới, đăng xuất, dọn tài khoản quá hạn.
// Đo bằng lỗi MySQL THẬT (1213, 1205 trả ra) VÀ bộ đếm `lock_deadlocks` của máy chủ, khẳng định đều 0 (`measureRounds`). Từ chối nghiệp vụ DỰ KIẾN (token
// đã dùng, mã OTP sai, mật khẩu sai) được ghi riêng, không bị coi là lỗi; lỗi lạ làm vòng đo đỏ, và không đọc kết quả của yêu cầu đã lỗi (AI-BUG-019/020).
// Mã MKM-nn là [đề xuất]. Số vòng RESET_MULTI_ROUNDS (mặc định 8; đo kỹ dùng 50 và --reporter=verbose để thấy các dòng "[LM]").
const ROUNDS = Number(process.env['RESET_MULTI_ROUNDS'] ?? 8);
const TEST_TIMEOUT = Math.max(30_000, ROUNDS * 15_000); // hạn mỗi test tăng theo số vòng
const KINDS: ResetAccountKind[] = [
  'verified',
  'unverified',
  'suspended',
  'locked',
  'staff',
  'verified',
];

let db: DataSource;

useIntegrationHooks((testDb) => {
  db = testDb;
});

/** Một tài khoản sẽ đặt mật khẩu: 2 phiên sống (trừ chưa xác minh), mã DangKy đã gửi nếu chưa xác minh, và resetToken lấy qua dịch vụ A11 lúc 0 giây. */
async function resetter(
  fx: MultiFixture,
  services: ResetServices,
  kind: ResetAccountKind,
) {
  const account = await newResetAccount(db, kind);
  if (kind === 'unverified') {
    await insertMaXacThuc(db, account.taiKhoanId, { daGuiLuc: at(-30) });
  } else {
    await fx.sessionService.create(account.taiKhoanId);
    await fx.sessionService.create(account.taiKhoanId);
  }
  await services.forgot.requestCode(account.email);
  const { resetToken } = await services.forgot.verifyCode(
    account.email,
    fx.mail.codeSentTo(account.email),
  );
  return { account, kind, resetToken };
}

/**
 * Lưu lượng của tài khoản KHÁC, dựng lúc 0 giây (chạy lúc 61 giây): trafficOfOthers (đăng nhập, đăng ký, verify/resend đăng ký), 3 làm mới, 3 đăng xuất,
 * 2 lần dọn tài khoản quá hạn, và quên mật khẩu của 2 tài khoản khác (1 cấp mã mới, 1 verify-otp đúng, 1 "Gửi lại mã"). Trả thao tác và hàm kiểm kết quả.
 */
async function othersOf(fx: MultiFixture, services: ResetServices) {
  const base = await trafficOfOthers(db, fx);
  const refreshing = await liveSessions(db, fx, 3);
  const leaving = await liveSessions(db, fx, 3);
  const purging = [
    await newResetAccount(db, 'expired-unverified'),
    await newResetAccount(db, 'expired-unverified'),
  ];
  const asking = await newResetAccount(db, 'verified');
  const answering = await newResetAccount(db, 'verified');
  const resending = await newResetAccount(db, 'staff');
  for (const account of [answering, resending])
    await services.forgot.requestCode(account.email);
  const answer = fx.mail.codeSentTo(answering.email);

  const results: Record<string, unknown> = {};
  const left: boolean[] = [];
  const record = (key: string, work: () => Promise<unknown>) => async () => {
    results[key] = await work();
  };
  const actions: Action[] = [
    ...base.actions,
    ...refreshing.map((live, i) => ({
      kind: 'làm mới (khác)',
      run: record(`refresh${String(i)}`, () =>
        fx.sessionService.refresh(live.session.refreshToken),
      ),
    })),
    ...leaving.map((live, i) =>
      logoutAction(fx, live, left, i, 'đăng xuất (khác)'),
    ),
    ...purging.map((account, i) => ({
      kind: 'dọn quá hạn (khác)',
      run: record(`purge${String(i)}`, () =>
        fx.otp.transaction((em) =>
          fx.cleaner.purgeIfExpired(em, account.taiKhoanId),
        ),
      ),
    })),
    {
      kind: 'cấp mã QMK (khác)',
      run: () => services.forgot.requestCode(asking.email),
    },
    {
      kind: 'verify-otp QMK (khác)',
      run: () => services.forgot.verifyCode(answering.email, answer),
    },
    {
      kind: 'gửi lại mã QMK (khác)',
      run: () => services.forgot.requestCode(resending.email),
    },
  ];
  const problems = async (): Promise<string[]> => {
    const found = await base.problems();
    for (const [key, value] of Object.entries(results)) {
      const good = key.startsWith('refresh')
        ? (value as { ok?: boolean }).ok === true
        : value === true;
      if (!good) found.push(`${key} của tài khoản khác ra sai kết quả`);
    }
    if (left.length !== leaving.length || left.some((done) => !done))
      found.push('đăng xuất của tài khoản khác không thu hồi');
    if ((await forgotRows(db, resending.taiKhoanId)).length !== 2)
      found.push('gửi lại mã QMK của tài khoản khác thiếu hàng');
    if ((await forgotRows(db, asking.taiKhoanId)).length !== 1)
      found.push('cấp mã QMK của tài khoản khác thiếu hàng');
    return found;
  };
  return { actions, problems };
}

/** Một vòng: dựng N tài khoản có token + 1 token đã dùng + lưu lượng khác lúc 0 giây, chạy TẤT CẢ đồng thời lúc 61 giây, rồi kiểm kết quả cuối từng tài khoản. */
async function runRound(
  { fx, where, flag, race }: Round,
  resetters: number,
): Promise<void> {
  const services = resetServicesFor(db, fx);
  const targets = [];
  for (let i = 0; i < resetters; i++)
    targets.push(
      await resetter(fx, services, KINDS[i % KINDS.length] ?? 'verified'),
    );
  const spent = await resetter(fx, services, 'verified');
  await services.reset.reset(resetInput(spent.resetToken)); // token đã dùng: lần sau phải bị từ chối
  const others = await othersOf(fx, services);
  vi.setSystemTime(at(61));

  const outcome = new Map<string, string>();
  const flags = new Map<string, unknown>();
  const note = (
    key: string,
    kind: string,
    work: () => Promise<unknown>,
  ): Action => ({
    kind,
    run: async () => {
      try {
        flags.set(key, await work());
        outcome.set(key, 'ok');
      } catch (error) {
        if (!(error instanceof AppException)) throw error; // lỗi lạ (1213, 1205…) vào bảng đếm của measureRounds, làm vòng đo đỏ
        outcome.set(key, error.maLoi);
      }
    },
  });
  await race([
    ...targets.map((t) =>
      note(t.account.taiKhoanId, 'đặt mật khẩu', () =>
        services.reset.reset(resetInput(t.resetToken)),
      ),
    ),
    note('đã dùng', 'đặt mật khẩu bằng token đã dùng', () =>
      services.reset.reset(resetInput(spent.resetToken, 'Khong-Duoc-Dat-1!')),
    ),
    ...others.actions,
  ]);

  if (outcome.get('đã dùng') !== 'RESET_TOKEN_HET_HIEU_LUC')
    flag(`${where}: token đã dùng ra ${String(outcome.get('đã dùng'))}`);
  for (const { account, kind } of targets) {
    const id = account.taiKhoanId;
    if (outcome.get(id) !== 'ok') {
      flag(`${where}: đặt mật khẩu ${kind} ra ${String(outcome.get(id))}`);
      continue; // không đọc DB của yêu cầu đã lỗi: số đo cuối là bảng đếm thật
    }
    const expected = {
      taiKhoanNgung: kind === 'suspended',
      canDangKyLai: kind === 'unverified',
    };
    if (JSON.stringify(flags.get(id)) !== JSON.stringify(expected))
      flag(`${where}: cờ của ${kind} sai`);
    const row = await db
      .getRepository(TaiKhoan)
      .findOneByOrFail({ taiKhoanId: id });
    if (
      !(await fx.hasher.verify(row.matKhauBam ?? '', NEW_PASSWORD)) ||
      row.soLanDangNhapSai !== 0 ||
      row.khoaDangNhapDen !== null
    )
      flag(`${where}: mật khẩu hoặc bộ đếm của ${kind} sai`);
    if ((await sessionRowsOf(db, id)).some((s) => s.thuHoiLuc === null))
      flag(`${where}: ${kind} còn phiên sống`);
    const [code] = await forgotRows(db, id);
    if (code?.daDungLuc?.getTime() !== at(61).getTime())
      flag(`${where}: mã QMK của ${kind} chưa dùng`);
    const registrations = await forgotRows(db, id, 'DangKy');
    if (
      registrations.some(
        (r) => r.thuHoiLuc === null || r.matKhauBamDangKy !== null,
      )
    )
      flag(`${where}: mã đăng ký của ${kind} còn sống`);
  }
  for (const problem of await others.problems()) flag(`${where}: ${problem}`);
}

describe(
  'đặt mật khẩu của nhiều tài khoản khác nhau cùng lúc',
  { timeout: TEST_TIMEOUT },
  () => {
    it(`MKM-01 ${String(ROUNDS)} vòng × (6 tài khoản đặt mật khẩu đủ loại + 1 token đã dùng) cùng lưu lượng của tài khoản KHÁC: mỗi tài khoản đúng mật khẩu mới, mọi phiên bị thu hồi, mã đăng ký bị thu hồi; 0 lỗi 1213 và 1205, 0 deadlock phía máy chủ`, async () => {
      await measureRounds(db, ROUNDS, 'đặt mật khẩu', (round) =>
        runRound(round, 6),
      );
    });

    it(`MKM-02 ${String(ROUNDS)} vòng × 12 tài khoản đặt mật khẩu cùng lúc (không lưu lượng khác): 0 lỗi 1213 và 1205, 0 deadlock`, async () => {
      await measureRounds(
        db,
        ROUNDS,
        'đặt mật khẩu dày',
        async ({ fx, where, flag, race }) => {
          const services = resetServicesFor(db, fx);
          const targets = [];
          for (let i = 0; i < 12; i++)
            targets.push(
              await resetter(
                fx,
                services,
                KINDS[i % KINDS.length] ?? 'verified',
              ),
            );
          vi.setSystemTime(at(61));
          const done: string[] = [];
          await race(
            targets.map((t) => ({
              kind: 'đặt mật khẩu',
              run: async () => {
                await services.reset.reset(resetInput(t.resetToken));
                done.push(t.account.taiKhoanId);
              },
            })),
          );
          for (const t of targets) {
            if (
              done.includes(t.account.taiKhoanId) &&
              (await sessionRowsOf(db, t.account.taiKhoanId)).some(
                (s) => s.thuHoiLuc === null,
              )
            )
              flag(`${where}: ${t.kind} còn phiên sống`);
          }
        },
      );
    });

    it('MKM-03 Q8 đo thời gian 20 yêu cầu đặt mật khẩu song song (20 tài khoản khác nhau; mỗi yêu cầu một lần băm Argon2id NGOÀI giao dịch): in tổng, trung vị, lớn nhất; mọi yêu cầu thành công', async () => {
      const fx = await freshFixture(db);
      const services = resetServicesFor(db, fx);
      const targets = [];
      for (let i = 0; i < 20; i++)
        targets.push(await resetter(fx, services, 'verified'));
      vi.setSystemTime(at(61));
      const durations: number[] = [];
      const started = performance.now();
      await Promise.all(
        targets.map(async (t) => {
          const begin = performance.now();
          await services.reset.reset(resetInput(t.resetToken));
          durations.push(performance.now() - begin);
        }),
      );
      const total = performance.now() - started;
      durations.sort((a, b) => a - b);
      const solo = await resetter(fx, services, 'verified');
      const soloBegin = performance.now();
      await services.reset.reset(resetInput(solo.resetToken));
      const soloMs = performance.now() - soloBegin;
      console.info(
        `[LM] 20 reset song song: tổng ${total.toFixed(0)} ms, trung vị ${(durations[9] ?? 0).toFixed(0)} ms, lớn nhất ${(durations[19] ?? 0).toFixed(0)} ms; một reset đơn lẻ ${soloMs.toFixed(0)} ms`,
      );
      expect(durations).toHaveLength(20);
    });
  },
);
