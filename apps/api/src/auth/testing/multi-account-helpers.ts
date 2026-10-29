// Hạ tầng cho các test "nhiều tài khoản KHÁC NHAU cùng lúc" của task A10 (MySQL thật): thao tác chạy ĐỒNG THỜI qua một rào chắn, bảng đếm lỗi MySQL theo
// loại thao tác, vòng đo (dựng lại DB, đo bộ đếm deadlock của máy chủ, khẳng định 0 lỗi 1213/1205), phiên sống của nhiều tài khoản và lưu lượng nền của
// TÀI KHOẢN KHÁC (đăng nhập, đăng ký, verify-otp, resend-otp). Chỉ dùng trong test (thư mục testing/ không vào bản build).
import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { resetTables } from '../../database/testing/test-database.js';
import { PhienDangNhap } from '../entities/phien-dang-nhap.entity.js';
import type { IssuedSession } from '../session/session.service.js';
import {
  WRONG_PASSWORD,
  createLoginFixture,
  loginBody,
  newLoginAccount,
  type LoginFixture,
} from './login-int-helpers.js';
import { at, wrongCodeFor } from './otp-int-helpers.js';
import {
  SelectiveMail,
  barrier,
  classify,
  describeTally,
  type Tally,
} from './otp-multi-account.js';
import { accountByEmail, registerBody } from './register-int-helpers.js';
import {
  patientRows,
  registerPatient,
  resendBody,
  serverDeadlocks,
  verifyBody,
  walletRows,
} from './verification-int-helpers.js';

export type MultiFixture = LoginFixture<SelectiveMail>;

export interface Action {
  kind: string;
  run: () => Promise<unknown>;
}

/** Một phiên đang sống và tài khoản của nó. */
export interface Live {
  accountId: string;
  session: IssuedSession;
}

// ---------- Bảng đếm ----------

const emptyTally = (): Tally => ({
  requests: 0,
  ok: 0,
  deadlock1213: 0,
  lockTimeout1205: 0,
  other: {},
});

export const tallyOf = (tallies: Map<string, Tally>, kind: string): Tally => {
  const found = tallies.get(kind) ?? emptyTally();
  tallies.set(kind, found);
  return found;
};

export const totalOf = (tallies: Map<string, Tally>): Tally =>
  [...tallies.values()].reduce<Tally>(
    (acc, one) => ({
      requests: acc.requests + one.requests,
      ok: acc.ok + one.ok,
      deadlock1213: acc.deadlock1213 + one.deadlock1213,
      lockTimeout1205: acc.lockTimeout1205 + one.lockTimeout1205,
      other: Object.entries(one.other).reduce(
        (merged, [key, count]) => ({
          ...merged,
          [key]: (merged[key] ?? 0) + count,
        }),
        acc.other,
      ),
    }),
    emptyTally(),
  );

/** Chạy mọi thao tác ĐỒNG THỜI qua một rào chắn, gom kết quả và lỗi MySQL theo loại thao tác. */
async function race(
  actions: Action[],
  tallies: Map<string, Tally>,
): Promise<void> {
  const gate = barrier(actions.length);
  const settled = await Promise.allSettled(
    actions.map(async ({ run }) => {
      await gate();
      return run();
    }),
  );
  settled.forEach((result, index) => {
    classify(tallyOf(tallies, actions[index]?.kind ?? 'lạ'), result);
  });
}

// ---------- Vòng đo ----------

export interface Round {
  round: number;
  /** "vòng N", để ghép vào thông điệp bất nhất. */
  where: string;
  fx: MultiFixture;
  /** Ghi một điều bất nhất (kết quả sai của một phiên, hồ sơ sai…); cuối bài đo mảng này phải rỗng. */
  flag: (problem: string) => void;
  race: (actions: Action[]) => Promise<void>;
}

/** DB sạch, đồng hồ giả ở `at(0)`, bộ dịch vụ mới (MailService giả chọn lọc). Test dùng đồng hồ giả của `useIntegrationHooks`. */
export async function freshFixture(db: DataSource): Promise<MultiFixture> {
  await resetTables(db);
  vi.setSystemTime(at(0));
  return createLoginFixture(db, new SelectiveMail());
}

/**
 * Chạy `rounds` vòng, mỗi vòng một DB sạch rồi `body`; cuối cùng khẳng định không có điều bất nhất, MỌI thao tác đều đúng, 0 lỗi 1213, 0 lỗi 1205 và
 * bộ đếm `lock_deadlocks` của máy chủ không tăng. Trả bảng đếm theo loại để test đọc riêng một loại.
 */
export async function measureRounds(
  db: DataSource,
  rounds: number,
  label: string,
  body: (round: Round) => Promise<void>,
): Promise<Map<string, Tally>> {
  const tallies = new Map<string, Tally>();
  const problems: string[] = [];
  const deadlocksBefore = await serverDeadlocks(db);
  for (let index = 0; index < rounds; index++) {
    const fx = await freshFixture(db);
    await body({
      round: index,
      where: `vòng ${String(index)}`,
      fx,
      flag: (problem) => problems.push(problem),
      race: (actions) => race(actions, tallies),
    });
  }
  const deadlocks = (await serverDeadlocks(db)) - deadlocksBefore;
  const total = totalOf(tallies);
  const summary = `${describeTally(label, total)}; deadlock phía máy chủ = ${String(deadlocks)}`;
  console.info(`[LM] ${summary}`); // số đo cho báo cáo
  expect(problems, summary).toEqual([]);
  expect(total, summary).toMatchObject({
    deadlock1213: 0,
    lockTimeout1205: 0,
    other: {},
  });
  expect(total.ok, summary).toBe(total.requests);
  expect(deadlocks, summary).toBe(0);
  return tallies;
}

// ---------- Phiên ----------

export async function liveSession(
  db: DataSource,
  fx: MultiFixture,
): Promise<Live> {
  const account = await newLoginAccount(db);
  return {
    accountId: account.taiKhoanId,
    session: await fx.sessionService.create(account.taiKhoanId),
  };
}

export async function liveSessions(
  db: DataSource,
  fx: MultiFixture,
  count: number,
): Promise<Live[]> {
  const made: Live[] = [];
  while (made.length < count) made.push(await liveSession(db, fx));
  return made;
}

export const rowOfLive = (db: DataSource, item: Live) =>
  db
    .getRepository(PhienDangNhap)
    .findOneBy({ phienDangNhapId: item.session.sessionId });

export const deleteLive = (db: DataSource, item: Live): Promise<unknown> =>
  db
    .getRepository(PhienDangNhap)
    .delete({ phienDangNhapId: item.session.sessionId });

/** Đăng xuất bằng đúng refresh token của phiên (hoặc `token` cho trước); ghi kết quả true/false vào `outcomes[index]`. */
export function logoutAction(
  fx: MultiFixture,
  item: Live,
  outcomes: boolean[],
  index: number,
  kind = 'đăng xuất',
  token = item.session.refreshToken,
): Action {
  return {
    kind,
    run: async () => {
      outcomes[index] = await fx.sessionService.revokeByRefreshToken(token);
    },
  };
}

// ---------- Lưu lượng nền của tài khoản KHÁC ----------

export interface OthersTraffic {
  actions: Action[];
  /** Sau khi chạy: hồ sơ, ví và tài khoản mới của lưu lượng nền có đúng không (danh sách điều bất nhất). */
  problems: () => Promise<string[]>;
}

/**
 * Dựng (tại thời điểm giả hiện tại) rồi trả các thao tác của tài khoản KHÁC: 1 đăng nhập đúng (tạo thêm 1 phiên), 1 đăng nhập sai, 2 đăng ký mới,
 * 2 verify-otp (1 đúng, 1 sai mã), 1 resend-otp. Phải gọi trước khi đồng hồ giả qua mốc 60 giây của lần gửi mã đầu để resend-otp được chấp nhận.
 */
export async function trafficOfOthers(
  db: DataSource,
  fx: MultiFixture,
): Promise<OthersTraffic> {
  const right = await newLoginAccount(db);
  const wrong = await newLoginAccount(db);
  // Tuần tự: registerPatient đọc thư GỬI CUỐI CÙNG của thư giả để lấy mã, nên hai lần đăng ký chồng nhau sẽ đọc nhầm thư
  const good = await registerPatient(db, fx, {
    email: 'xac.minh.1@example.com',
  });
  const bad = await registerPatient(db, fx, {
    email: 'xac.minh.2@example.com',
  });
  const resending = await registerPatient(db, fx, {
    email: 'gui.lai@example.com',
  });
  const newcomers = ['moi.dang.ky.1', 'moi.dang.ky.2'].map(
    (name) => `${name}@example.com`,
  );
  // Từ chối nghiệp vụ DỰ KIẾN của kịch bản (sai mật khẩu, mã OTP sai) là kết quả đúng, không phải lỗi
  const expectedRefusal = (work: () => Promise<unknown>) => async () => {
    try {
      await work();
    } catch (error) {
      const code = error instanceof AppException ? error.maLoi : '';
      if (!['DANG_NHAP_SAI', 'OTP_SAI'].includes(code)) throw error;
    }
  };
  const work: [string, () => Promise<unknown>][] = [
    ['đăng nhập đúng', () => fx.login.login(loginBody(right))],
    [
      'đăng nhập sai',
      expectedRefusal(() => fx.login.login(loginBody(wrong, WRONG_PASSWORD))),
    ],
    ['verify-otp', () => fx.verification.verifyOtp(verifyBody(good))],
    [
      'verify-otp',
      expectedRefusal(() =>
        fx.verification.verifyOtp(
          verifyBody(bad, { otp: wrongCodeFor(bad.code) }),
        ),
      ),
    ],
    ['resend-otp', () => fx.verification.resendOtp(resendBody(resending))],
    ...newcomers.map((email): [string, () => Promise<unknown>] => [
      'đăng ký',
      () => fx.service.register(registerBody({ email })),
    ]),
  ];
  return {
    actions: work.map(([kind, run]) => ({ kind, run })),
    problems: async () => {
      const found: string[] = [];
      const [patients, wallets] = [await patientRows(db), await walletRows(db)];
      if (
        patients.length !== 1 ||
        wallets.length !== 1 ||
        patients[0]?.taiKhoanId !== good.taiKhoanId
      ) {
        found.push('verify-otp của tài khoản khác ra sai hồ sơ hoặc ví');
      }
      for (const email of newcomers) {
        if ((await accountByEmail(db, email)) === null) {
          found.push(`đăng ký mới ${email} của tài khoản khác bị mất`);
        }
      }
      return found;
    },
  };
}
