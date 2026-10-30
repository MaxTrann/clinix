import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import type { RefreshResult } from '../session/session.service.js';
import {
  forgotRows,
  forgotServicesFor,
  newResetAccount,
  type ResetAccountKind,
} from '../testing/forgot-password-int-helpers.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import {
  liveSessions,
  logoutAction,
  measureRounds,
  trafficOfOthers,
  type Action,
  type MultiFixture,
  type Round,
} from '../testing/multi-account-helpers.js';
import { at, wrongCodeFor } from '../testing/otp-int-helpers.js';

// Task A11 — NHIỀU tài khoản KHÁC NHAU cùng lúc, mỗi tài khoản một thao tác riêng, trên MySQL 8.4 thật (bài học A5-C, TECH_DEBT dòng 30: nơi gọi OtpService
// mới PHẢI có test này). Cấp mã, gửi lại, verify-otp của N tài khoản chạy ĐỒNG THỜI với đăng ký, xác minh đăng ký, gửi lại mã đăng ký, đăng nhập,
// làm mới, đăng xuất và dọn tài khoản quá hạn của tài khoản KHÁC. Đo bằng số lỗi MySQL THẬT: lỗi trả ra (1213, 1205) VÀ bộ đếm `lock_deadlocks` của máy
// chủ; khẳng định đều bằng 0 (`measureRounds`). Từ chối nghiệp vụ DỰ KIẾN (email lạ, chưa kích hoạt, gửi thư lỗi, mã sai) là kết quả đúng.
// Mã FM-nn là [đề xuất]. Số vòng chỉnh bằng FORGOT_MULTI_ROUNDS (mặc định 8; đo kỹ dùng 50 và chạy với --reporter=verbose để thấy các dòng "[LM]").
const ROUNDS = Number(process.env['FORGOT_MULTI_ROUNDS'] ?? 8);
// Hạn mỗi test tăng theo số vòng (mặc định 30 giây của cấu hình tích hợp không đủ cho 50 vòng); quá hạn mà việc chạy dở vẫn tiếp tục sẽ làm hỏng ca kế tiếp
const TEST_TIMEOUT = Math.max(30_000, ROUNDS * 15_000);
const UNKNOWN_EMAIL = 'khong.ton.tai@example.com';
// Mỗi vòng dựng tài khoản theo vòng quay các loại này: đủ loại tài khoản mà quên mật khẩu phải xử lý
const KINDS: ResetAccountKind[] = [
  'verified',
  'unverified',
  'staff',
  'suspended',
  'locked',
  'verified',
];

let db: DataSource;

useIntegrationHooks((testDb) => {
  db = testDb;
});

const accountsOf = async (count: number): Promise<TaiKhoan[]> => {
  const made: TaiKhoan[] = [];
  for (let index = 0; index < count; index++) {
    made.push(
      await newResetAccount(db, KINDS[index % KINDS.length] ?? 'verified'),
    );
  }
  return made;
};

interface Background {
  actions: Action[];
  problems: () => Promise<string[]>;
}

/** Lưu lượng nền của tài khoản KHÁC: đăng nhập, đăng ký, verify/resend đăng ký (trafficOfOthers), 4 làm mới, 4 đăng xuất, 2 lần dọn tài khoản quá hạn. */
async function backgroundOf(fx: MultiFixture): Promise<Background> {
  const others = await trafficOfOthers(db, fx);
  const refreshing = await liveSessions(db, fx, 4);
  const leaving = await liveSessions(db, fx, 4);
  const expired = [
    await newResetAccount(db, 'expired-unverified'),
    await newResetAccount(db, 'expired-unverified'),
  ];
  const refreshed: (RefreshResult | undefined)[] = [];
  const left: boolean[] = [];
  const purged: boolean[] = [];
  return {
    actions: [
      ...others.actions,
      ...refreshing.map((item, index) => ({
        kind: 'làm mới của tài khoản khác',
        run: async () => {
          refreshed[index] = await fx.sessionService.refresh(
            item.session.refreshToken,
          );
        },
      })),
      ...leaving.map((item, index) =>
        logoutAction(fx, item, left, index, 'đăng xuất của tài khoản khác'),
      ),
      ...expired.map((account, index) => ({
        kind: 'dọn tài khoản quá hạn của tài khoản khác',
        run: async () => {
          purged[index] = await fx.otp.transaction((manager) =>
            fx.cleaner.purgeIfExpired(manager, account.taiKhoanId),
          );
        },
      })),
    ],
    problems: async () => {
      const found = await others.problems();
      if (refreshed.some((result) => result?.ok !== true))
        found.push('làm mới của tài khoản khác bị từ chối');
      if (left.some((done) => !done))
        found.push('đăng xuất của tài khoản khác không thu hồi');
      if (purged.length !== 2 || purged.some((done) => !done))
        found.push('tài khoản quá hạn của tài khoản khác không bị dọn');
      return found;
    },
  };
}

interface Mix {
  /** Tài khoản yêu cầu cấp mã lần đầu (kèm 1 tài khoản chưa kích hoạt và 1 email lạ: từ chối nghiệp vụ). */
  requests: number;
  /** Tài khoản đã có mã, nhập mã (chẵn: đúng, lẻ: sai). */
  verifies: number;
  /** Tài khoản đã có mã, bấm "Gửi lại mã" sau 61 giây. */
  resends: number;
  /** Thư gửi lại tới tài khoản lẻ bị giả lập lỗi (503 GUI_MAIL_LOI). */
  failingResends: boolean;
}

/** Một vòng: dựng tài khoản và mã, chạy mọi thao tác ĐỒNG THỜI lúc 61 giây, rồi kiểm KẾT QUẢ CUỐI của từng tài khoản (điều bất nhất ghi bằng `flag`). */
async function runMix(round: Round, mix: Mix): Promise<void> {
  const { fx, where, flag, race } = round;
  const { forgot, resetTokens } = forgotServicesFor(db, fx);
  const requesting = await accountsOf(mix.requests);
  const verifying = await accountsOf(mix.verifies);
  const resending = await accountsOf(mix.resends);
  const pending =
    mix.requests > 0 ? await newResetAccount(db, 'pending-staff') : null;

  // Lần cấp mã đầu của nhóm "đã có mã" (đồng hồ giả đang ở 0 giây), tuần tự
  for (const account of [...verifying, ...resending]) {
    await forgot.requestCode(account.email);
  }
  const firstCode = new Map(
    [...verifying, ...resending].map((account) => [
      account.email,
      fx.mail.codeSentTo(account.email),
    ]),
  );
  const failing = new Set(
    mix.failingResends
      ? resending.filter((_a, index) => index % 2 === 1).map((a) => a.email)
      : [],
  );
  for (const email of failing) fx.mail.failFor.add(email);
  const background = await backgroundOf(fx);
  vi.setSystemTime(at(61));

  const outcome = new Map<string, string>();
  const tokens = new Map<string, string>();
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
        if (!(error instanceof AppException)) throw error; // lỗi lạ (1213, 1205…) làm vòng đo đỏ
        outcome.set(key, error.maLoi);
      }
    },
  });
  await race([
    ...requesting.map((a) =>
      note(a.email, 'cấp mã', () => forgot.requestCode(a.email)),
    ),
    ...(pending
      ? [
          note(pending.email, 'cấp mã bị từ chối', () =>
            forgot.requestCode(pending.email),
          ),
        ]
      : []),
    ...(mix.requests > 0
      ? [
          note(UNKNOWN_EMAIL, 'cấp mã email lạ', () =>
            forgot.requestCode(UNKNOWN_EMAIL),
          ),
        ]
      : []),
    ...verifying.map((a, index) =>
      note(a.email, 'verify-otp', async () => {
        const code = firstCode.get(a.email) ?? '';
        const result = await forgot.verifyCode(
          a.email,
          index % 2 === 0 ? code : wrongCodeFor(code),
        );
        tokens.set(a.email, result.resetToken);
      }),
    ),
    ...resending.map((a) =>
      note(a.email, 'gửi lại mã', () => forgot.requestCode(a.email)),
    ),
    ...background.actions,
  ]);

  const expectOutcome = (email: string, expected: string) => {
    if (outcome.get(email) !== expected)
      flag(
        `${where}: kết quả ${String(outcome.get(email))}, mong đợi ${expected}`,
      );
  };
  const mailsTo = (email: string) =>
    fx.mail.attempts.filter((m) => m.to === email).length;
  for (const a of requesting) {
    expectOutcome(a.email, 'ok');
    // Yêu cầu bị lỗi (1213, 1205…) đã ghi vào bảng đếm của measureRounds: không đọc thư/token của nó để thông báo lỗi cuối là số đo thật
    if (outcome.get(a.email) !== 'ok') continue;
    const rows = await forgotRows(db, a.taiKhoanId);
    if (
      rows.length !== 1 ||
      rows[0]?.daGuiLuc?.getTime() !== at(61).getTime() ||
      mailsTo(a.email) !== 1
    )
      flag(
        `${where}: cấp mã ${a.taiKhoanId} ra ${String(rows.length)} hàng, ${String(mailsTo(a.email))} thư`,
      );
    // mã vừa nhận dùng được và token mang đúng tài khoản/hàng OTP
    const token = await forgot.verifyCode(a.email, fx.mail.codeSentTo(a.email));
    const claims = await resetTokens.verify(token.resetToken);
    if (
      claims?.taiKhoanId !== a.taiKhoanId ||
      claims.maXacThucId !== rows[0]?.maXacThucId
    )
      flag(`${where}: token của ${a.taiKhoanId} mang sai nội dung`);
  }
  if (pending) {
    expectOutcome(pending.email, 'TAI_KHOAN_CHUA_KICH_HOAT');
    if (
      (await forgotRows(db, pending.taiKhoanId)).length +
        mailsTo(pending.email) !==
      0
    )
      flag(`${where}: tài khoản chưa kích hoạt vẫn có OTP hoặc thư`);
  }
  if (mix.requests > 0) expectOutcome(UNKNOWN_EMAIL, 'EMAIL_CHUA_DANG_KY');
  for (const [index, a] of verifying.entries()) {
    const [row] = await forgotRows(db, a.taiKhoanId);
    const right = index % 2 === 0;
    expectOutcome(a.email, right ? 'ok' : 'OTP_SAI');
    const claims = right
      ? await resetTokens.verify(tokens.get(a.email) ?? '')
      : null;
    if (
      right &&
      (claims?.taiKhoanId !== a.taiKhoanId ||
        claims.maXacThucId !== row?.maXacThucId)
    )
      flag(`${where}: token verify của ${a.taiKhoanId} sai`);
    if (
      row?.soLanNhapSai !== (right ? 0 : 1) ||
      row.daDungLuc !== null ||
      row.thuHoiLuc !== null
    )
      flag(
        `${where}: mã của ${a.taiKhoanId} sau verify: sai=${String(row?.soLanNhapSai)}`,
      );
  }
  for (const a of resending) {
    const rows = await forgotRows(db, a.taiKhoanId);
    const fails = failing.has(a.email);
    expectOutcome(a.email, fails ? 'GUI_MAIL_LOI' : 'ok');
    const [older, newer] = rows;
    const good = fails
      ? older?.thuHoiLuc === null &&
        newer?.daGuiLuc === null &&
        newer?.thuHoiLuc?.getTime() === at(61).getTime()
      : older?.thuHoiLuc?.getTime() === at(61).getTime() &&
        newer?.daGuiLuc?.getTime() === at(61).getTime() &&
        newer.thuHoiLuc === null;
    if (rows.length !== 2 || !good || mailsTo(a.email) !== 2)
      flag(
        `${where}: gửi lại ${a.taiKhoanId} (lỗi=${String(fails)}) ra ${String(rows.length)} hàng, ${String(mailsTo(a.email))} thư`,
      );
  }
  for (const problem of await background.problems())
    flag(`${where}: ${problem}`);
}

describe(
  'quên mật khẩu của nhiều tài khoản khác nhau cùng lúc',
  { timeout: TEST_TIMEOUT },
  () => {
    it(`FM-01 ${String(ROUNDS)} vòng × (6 tài khoản yêu cầu cấp mã + 1 chưa kích hoạt + 1 email lạ) cùng lưu lượng nền của tài khoản KHÁC: mỗi tài khoản đúng một mã, đúng một thư, token đúng chủ; 0 lỗi 1213 và 1205, 0 deadlock phía máy chủ`, async () => {
      await measureRounds(db, ROUNDS, 'cấp mã', (round) =>
        runMix(round, {
          requests: 6,
          verifies: 0,
          resends: 0,
          failingResends: false,
        }),
      );
    });

    it('FM-02 6 verify-otp (chẵn đúng, lẻ sai) trong lúc 2 tài khoản khác cấp mã và lưu lượng nền: mã đúng cấp token đúng chủ, mã sai chỉ đếm cho đúng hàng của nó; 0 lỗi 1213 và 1205, 0 deadlock', async () => {
      await measureRounds(db, ROUNDS, 'verify-otp', (round) =>
        runMix(round, {
          requests: 2,
          verifies: 6,
          resends: 0,
          failingResends: false,
        }),
      );
    });

    it('FM-03 6 "Gửi lại mã" sau 61 giây, một nửa thư lỗi (503 GUI_MAIL_LOI): mã cũ bị thu hồi chỉ khi gửi thành công, gửi lỗi thì mã cũ còn nguyên; 0 lỗi 1213 và 1205, 0 deadlock', async () => {
      await measureRounds(db, ROUNDS, 'gửi lại', (round) =>
        runMix(round, {
          requests: 0,
          verifies: 0,
          resends: 6,
          failingResends: true,
        }),
      );
    });

    it('FM-04 hỗn hợp: 4 cấp mã + 4 verify-otp + 4 gửi lại (một nửa thư lỗi) cùng lúc với lưu lượng nền; 0 lỗi 1213 và 1205, 0 deadlock', async () => {
      await measureRounds(db, ROUNDS, 'hỗn hợp', (round) =>
        runMix(round, {
          requests: 4,
          verifies: 4,
          resends: 4,
          failingResends: true,
        }),
      );
    });
  },
);
