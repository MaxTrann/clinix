import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { resetTables } from '../../database/testing/test-database.js';
import { PhienDangNhap } from '../entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import type {
  IssuedSession,
  RefreshResult,
} from '../session/session.service.js';
import { sha256Hex } from '../session/token.service.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import {
  WRONG_PASSWORD,
  createLoginFixture,
  loginBody,
  newLoginAccount,
  sessionRowsOf,
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
  accountByEmail,
  registerBody,
} from '../testing/register-int-helpers.js';
import {
  patientRows,
  registerPatient,
  resendBody,
  serverDeadlocks,
  verifyBody,
  walletRows,
} from '../testing/verification-int-helpers.js';

// Task A9 — NHIỀU tài khoản KHÁC NHAU cùng lúc, mỗi tài khoản một giao dịch riêng, trên MySQL 8.4 thật (bài học A5-C). Làm mới phiên của N tài khoản
// (đúng, dùng lại, phiên không còn trong DB, bị admin khoá cùng lúc) chạy ĐỒNG THỜI với đăng nhập, đăng ký, verify-otp và resend-otp của tài khoản KHÁC.
// `SessionService.refresh` mở giao dịch ở mức cô lập mặc định (REPEATABLE READ), nên ca "sid không tồn tại" (SELECT … FOR UPDATE trên khoá chính không có
// hàng) được đo RIÊNG (RM-03): nó có thể khoá khoảng và chặn lần chèn phiên của đăng nhập. Đo bằng số lỗi MySQL THẬT: lỗi trả ra (1213, 1205) VÀ bộ đếm
// `lock_deadlocks` của máy chủ; khẳng định đều bằng 0. Mã RM-nn là [đề xuất]. Số vòng chỉnh bằng REFRESH_MULTI_ROUNDS (mặc định 8; đo kỹ dùng 50 và chạy
// với --reporter=verbose để thấy các dòng "[RM]").
const ROUNDS = Number(process.env['REFRESH_MULTI_ROUNDS'] ?? 8);

let db: DataSource;
let fx: LoginFixture<SelectiveMail>;

useIntegrationHooks((testDb) => {
  db = testDb;
});

interface Action {
  kind: string;
  run: () => Promise<unknown>;
}

const newTally = (): Tally => ({
  requests: 0,
  ok: 0,
  deadlock1213: 0,
  lockTimeout1205: 0,
  other: {},
});

/** Từ chối nghiệp vụ DỰ KIẾN của kịch bản (sai mật khẩu, mã OTP sai) tính là kết quả đúng, không phải lỗi. */
const EXPECTED = new Set(['DANG_NHAP_SAI', 'OTP_SAI']);
const tolerate =
  (work: () => Promise<unknown>) => async (): Promise<unknown> => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof AppException && EXPECTED.has(error.maLoi)) return;
      throw error;
    }
  };

/** Chạy mọi thao tác ĐỒNG THỜI qua một rào chắn; gom kết quả vào bảng đếm của từng loại thao tác. */
async function runConcurrently(
  actions: Action[],
  tallies: Map<string, Tally>,
): Promise<void> {
  const wait = barrier(actions.length);
  const results = await Promise.allSettled(
    actions.map(async (action) => {
      await wait();
      return action.run();
    }),
  );
  for (const [index, result] of results.entries()) {
    const kind = actions[index]?.kind ?? 'lạ';
    let tally = tallies.get(kind);
    if (!tally) {
      tally = newTally();
      tallies.set(kind, tally);
    }
    classify(tally, result);
  }
}

const sum = (tallies: Map<string, Tally>): Tally => {
  const total = newTally();
  for (const tally of tallies.values()) {
    total.requests += tally.requests;
    total.ok += tally.ok;
    total.deadlock1213 += tally.deadlock1213;
    total.lockTimeout1205 += tally.lockTimeout1205;
    for (const [key, count] of Object.entries(tally.other)) {
      total.other[key] = (total.other[key] ?? 0) + count;
    }
  }
  return total;
};

interface Live {
  accountId: string;
  session: IssuedSession;
}

async function liveSession(): Promise<Live> {
  const account = await newLoginAccount(db);
  return {
    accountId: account.taiKhoanId,
    session: await fx.sessionService.create(account.taiKhoanId),
  };
}

const failureOf = (result: RefreshResult | undefined): string =>
  result === undefined ? 'chưa chạy' : result.ok ? 'ok' : result.reason;

const deletePhien = (sessionId: string): Promise<unknown> =>
  db.getRepository(PhienDangNhap).delete({ phienDangNhapId: sessionId });

describe('làm mới của nhiều tài khoản khác nhau cùng lúc', () => {
  it(`RM-01 hỗn hợp: ${String(ROUNDS)} vòng × (8 làm mới đúng, 2 dùng lại, 1 phiên không còn, 2 làm mới đúng lúc admin khoá) cùng 2 đăng nhập, 2 đăng ký, 2 verify-otp, 1 resend-otp của tài khoản khác: kết quả nhất quán; 0 lỗi 1213 và 1205, 0 deadlock phía máy chủ`, async () => {
    const tallies = new Map<string, Tally>();
    const inconsistent: string[] = [];
    const deadlocksBefore = await serverDeadlocks(db);

    for (let round = 0; round < ROUNDS; round++) {
      await resetTables(db);
      vi.setSystemTime(at(0));
      fx = createLoginFixture(db, new SelectiveMail());

      const good = [];
      for (let i = 0; i < 8; i++) good.push(await liveSession());
      const reused = [];
      for (let i = 0; i < 2; i++) reused.push(await liveSession());
      const ghost = await liveSession();
      const locked = [await liveSession(), await liveSession()];
      const loginRight = await newLoginAccount(db);
      const loginWrong = await newLoginAccount(db);
      const verifying = [
        await registerPatient(db, fx, { email: 'xac.minh.1@example.com' }),
        await registerPatient(db, fx, { email: 'xac.minh.2@example.com' }),
      ];
      const resending = await registerPatient(db, fx, {
        email: 'gui.lai@example.com',
      });

      // Dựng sẵn: token cũ của hai phiên "dùng lại" (làm mới một lần rồi giữ token CŨ), và một phiên mà hàng trong DB đã biến mất
      vi.setSystemTime(at(10));
      for (const live of reused) {
        const first = await fx.sessionService.refresh(
          live.session.refreshToken,
        );
        if (!first.ok) throw new Error(`dựng sẵn thất bại: ${first.reason}`);
      }
      await deletePhien(ghost.session.sessionId);
      vi.setSystemTime(at(61)); // qua mốc 60 giây để gửi lại được

      const results = {
        good: [] as (RefreshResult | undefined)[],
        reused: [] as (RefreshResult | undefined)[],
        ghost: undefined as RefreshResult | undefined,
        locked: [] as (RefreshResult | undefined)[],
      };
      const actions: Action[] = [
        ...good.map((live, i) => ({
          kind: 'làm mới đúng',
          run: async () => {
            results.good[i] = await fx.sessionService.refresh(
              live.session.refreshToken,
            );
          },
        })),
        ...reused.map((live, i) => ({
          kind: 'dùng lại',
          run: async () => {
            results.reused[i] = await fx.sessionService.refresh(
              live.session.refreshToken,
            );
          },
        })),
        {
          kind: 'phiên không còn',
          run: async () => {
            results.ghost = await fx.sessionService.refresh(
              ghost.session.refreshToken,
            );
          },
        },
        ...locked.flatMap((live, i) => [
          {
            kind: 'làm mới + khoá',
            run: async () => {
              results.locked[i] = await fx.sessionService.refresh(
                live.session.refreshToken,
              );
            },
          },
          {
            kind: 'admin khoá',
            run: () =>
              db.transaction(async (manager) => {
                await manager.update(
                  TaiKhoan,
                  { taiKhoanId: live.accountId },
                  { trangThai: 'NgungHoatDong' },
                );
                await fx.sessionService.revokeAll(live.accountId, { manager });
              }),
          },
        ]),
        // tài khoản KHÁC đang đăng nhập, đăng ký, xác minh (một đúng, một sai) và gửi lại cùng lúc
        {
          kind: 'đăng nhập đúng',
          run: () => fx.login.login(loginBody(loginRight)),
        },
        {
          kind: 'đăng nhập sai',
          run: tolerate(() =>
            fx.login.login(loginBody(loginWrong, WRONG_PASSWORD)),
          ),
        },
        {
          kind: 'đăng ký',
          run: () =>
            fx.service.register(
              registerBody({ email: 'moi.dang.ky.1@example.com' }),
            ),
        },
        {
          kind: 'đăng ký',
          run: () =>
            fx.service.register(
              registerBody({ email: 'moi.dang.ky.2@example.com' }),
            ),
        },
        {
          kind: 'verify-otp',
          run: () =>
            fx.verification.verifyOtp(verifyBody(verifying[0] ?? resending)),
        },
        {
          kind: 'verify-otp',
          run: tolerate(() =>
            fx.verification.verifyOtp(
              verifyBody(verifying[1] ?? resending, {
                otp: wrongCodeFor((verifying[1] ?? resending).code),
              }),
            ),
          ),
        },
        {
          kind: 'resend-otp',
          run: () => fx.verification.resendOtp(resendBody(resending)),
        },
      ];
      await runConcurrently(actions, tallies);

      // Nhất quán: mỗi phiên chỉ chịu ảnh hưởng của CHÍNH thao tác của nó
      const where = `vòng ${String(round)}`;
      for (const [i, live] of good.entries()) {
        const result = results.good[i];
        const row = await db
          .getRepository(PhienDangNhap)
          .findOneBy({ phienDangNhapId: live.session.sessionId });
        if (!result?.ok || row === null || row.thuHoiLuc !== null) {
          inconsistent.push(
            `${where}: làm mới đúng #${String(i)} = ${failureOf(result)}`,
          );
        } else if (
          row.refreshTokenBam !== sha256Hex(result.tokens.refreshToken)
        ) {
          inconsistent.push(
            `${where}: làm mới đúng #${String(i)} băm trong DB không khớp token vừa cấp`,
          );
        }
      }
      for (const [i, live] of reused.entries()) {
        const row = await db
          .getRepository(PhienDangNhap)
          .findOneBy({ phienDangNhapId: live.session.sessionId });
        if (
          failureOf(results.reused[i]) !== 'REUSE_DETECTED' ||
          row?.thuHoiLuc == null
        ) {
          inconsistent.push(
            `${where}: dùng lại #${String(i)} = ${failureOf(results.reused[i])}, thu hồi = ${String(row?.thuHoiLuc)}`,
          );
        }
      }
      if (failureOf(results.ghost) !== 'SESSION_NOT_FOUND') {
        inconsistent.push(
          `${where}: phiên không còn = ${failureOf(results.ghost)}`,
        );
      }
      for (const [i, live] of locked.entries()) {
        if (
          !['ok', 'ACCOUNT_INACTIVE', 'SESSION_REVOKED'].includes(
            failureOf(results.locked[i]),
          )
        ) {
          inconsistent.push(
            `${where}: làm mới + khoá #${String(i)} = ${failureOf(results.locked[i])}`,
          );
        }
        const rows = await sessionRowsOf(db, live.accountId);
        if (rows.length !== 1 || rows.some((row) => row.thuHoiLuc === null)) {
          inconsistent.push(
            `${where}: tài khoản bị khoá #${String(i)} còn phiên sống`,
          );
        }
      }
      const total = await db.getRepository(PhienDangNhap).count();
      // 8 đúng + 2 dùng lại + 2 bị khoá + 1 đăng nhập đúng; phiên "không còn" đã bị xoá
      if (total !== 13)
        inconsistent.push(`${where}: tổng phiên ${String(total)}, mong đợi 13`);
      const verifiedId = (await accountByEmail(db, 'xac.minh.1@example.com'))
        ?.taiKhoanId;
      const patients = await patientRows(db);
      const wallets = await walletRows(db);
      if (
        patients.length !== 1 ||
        wallets.length !== 1 ||
        patients[0]?.taiKhoanId !== verifiedId
      ) {
        inconsistent.push(
          `${where}: verify-otp của tài khoản khác ra sai hồ sơ hoặc ví`,
        );
      }
      if (
        (await accountByEmail(db, 'moi.dang.ky.1@example.com')) === null ||
        (await accountByEmail(db, 'moi.dang.ky.2@example.com')) === null
      ) {
        inconsistent.push(`${where}: đăng ký mới của tài khoản khác bị mất`);
      }
    }

    const deadlocks = (await serverDeadlocks(db)) - deadlocksBefore;
    const total = sum(tallies);
    const summary = `${describeTally('hỗn hợp', total)}; deadlock phía máy chủ = ${String(deadlocks)}`;
    console.info(`[RM] ${summary}`); // số đo cho báo cáo

    expect(inconsistent, summary).toEqual([]);
    expect(total, summary).toMatchObject({
      deadlock1213: 0,
      lockTimeout1205: 0,
      other: {},
    });
    expect(total.ok, summary).toBe(total.requests);
    expect(deadlocks, summary).toBe(0);
  }, 600_000);

  it(`RM-02 chỉ làm mới: ${String(ROUNDS)} vòng × 12 phiên của 12 tài khoản khác nhau cùng lúc; mỗi phiên xoay đúng một lần với token riêng; 0 lỗi 1213 và 1205, 0 deadlock phía máy chủ`, async () => {
    const tallies = new Map<string, Tally>();
    const inconsistent: string[] = [];
    const deadlocksBefore = await serverDeadlocks(db);

    for (let round = 0; round < ROUNDS; round++) {
      await resetTables(db);
      vi.setSystemTime(at(0));
      fx = createLoginFixture(db, new SelectiveMail());
      const lives: Live[] = [];
      for (let i = 0; i < 12; i++) lives.push(await liveSession());
      vi.setSystemTime(at(60));
      const results: (RefreshResult | undefined)[] = [];

      await runConcurrently(
        lives.map((live, i) => ({
          kind: 'làm mới',
          run: async () => {
            results[i] = await fx.sessionService.refresh(
              live.session.refreshToken,
            );
          },
        })),
        tallies,
      );

      const newTokens = new Set<string>();
      for (const [i, live] of lives.entries()) {
        const result = results[i];
        if (!result?.ok) {
          inconsistent.push(
            `vòng ${String(round)}: phiên #${String(i)} = ${failureOf(result)}`,
          );
          continue;
        }
        newTokens.add(result.tokens.refreshToken);
        const row = await db
          .getRepository(PhienDangNhap)
          .findOneByOrFail({ phienDangNhapId: live.session.sessionId });
        if (
          row.refreshTokenBam !== sha256Hex(result.tokens.refreshToken) ||
          row.thuHoiLuc !== null
        ) {
          inconsistent.push(
            `vòng ${String(round)}: phiên #${String(i)} băm hoặc thu hồi sai`,
          );
        }
      }
      if (newTokens.size !== 12)
        inconsistent.push(`vòng ${String(round)}: token mới trùng nhau`);
    }

    const deadlocks = (await serverDeadlocks(db)) - deadlocksBefore;
    const total = sum(tallies);
    const summary = `${describeTally('chỉ làm mới', total)}; deadlock phía máy chủ = ${String(deadlocks)}`;
    console.info(`[RM] ${summary}`);

    expect(inconsistent, summary).toEqual([]);
    expect(total, summary).toMatchObject({
      deadlock1213: 0,
      lockTimeout1205: 0,
      other: {},
    });
    expect(total.ok, summary).toBe(total.requests);
    expect(deadlocks, summary).toBe(0);
  }, 600_000);

  it(`RM-03 sid KHÔNG TỒN TẠI: ${String(ROUNDS)} vòng × 6 yêu cầu làm mới mang chữ ký đúng nhưng phiên không có hàng (3 nằm sau hàng lớn nhất, 3 nằm trong khe do hàng bị xoá) cùng 6 đăng nhập (chèn phiên mới) và 6 làm mới đúng của tài khoản khác: SELECT … FOR UPDATE trên khoá chính không có hàng ở REPEATABLE READ không gây 1213, 1205 hay deadlock`, async () => {
    const tallies = new Map<string, Tally>();
    const inconsistent: string[] = [];
    const deadlocksBefore = await serverDeadlocks(db);
    const waits: number[] = [];

    for (let round = 0; round < ROUNDS; round++) {
      await resetTables(db);
      vi.setSystemTime(at(0));
      fx = createLoginFixture(db, new SelectiveMail());

      const live: Live[] = [];
      for (let i = 0; i < 9; i++) live.push(await liveSession());
      const loggingIn = [];
      for (let i = 0; i < 6; i++) loggingIn.push(await newLoginAccount(db));
      // 3 khe giữa: xoá hàng của ba phiên đầu rồi dùng chính token của chúng
      const holes = live.slice(0, 3);
      for (const hole of holes) await deletePhien(hole.session.sessionId);
      const refreshing = live.slice(3, 9);
      const maxId = Math.max(...live.map((l) => Number(l.session.sessionId)));
      const beyond = [1, 2, 3].map(
        (n) => fx.tokens.issueRefreshToken(String(maxId + 100 * n)).token,
      );
      const ghostTokens = [
        ...holes.map((hole) => hole.session.refreshToken),
        ...beyond,
      ];
      vi.setSystemTime(at(60));

      const ghostResults: (RefreshResult | undefined)[] = [];
      const okResults: (RefreshResult | undefined)[] = [];
      const actions: Action[] = [
        ...ghostTokens.map((token, i) => ({
          kind: 'sid không tồn tại',
          run: async () => {
            const started = performance.now();
            ghostResults[i] = await fx.sessionService.refresh(token);
            waits.push(Math.round(performance.now() - started));
          },
        })),
        ...loggingIn.map((account) => ({
          kind: 'đăng nhập (chèn phiên)',
          run: () => fx.login.login(loginBody(account)),
        })),
        ...refreshing.map((l, i) => ({
          kind: 'làm mới đúng',
          run: async () => {
            okResults[i] = await fx.sessionService.refresh(
              l.session.refreshToken,
            );
          },
        })),
      ];
      await runConcurrently(actions, tallies);

      const where = `vòng ${String(round)}`;
      for (const [i, result] of ghostResults.entries()) {
        if (failureOf(result) !== 'SESSION_NOT_FOUND') {
          inconsistent.push(
            `${where}: sid không tồn tại #${String(i)} = ${failureOf(result)}`,
          );
        }
      }
      if (okResults.some((result) => !result?.ok)) {
        inconsistent.push(`${where}: có làm mới đúng bị từ chối`);
      }
      // 6 phiên còn + 6 phiên mới của đăng nhập; không phiên "ma" nào được tạo ra
      const total = await db.getRepository(PhienDangNhap).count();
      if (total !== 12)
        inconsistent.push(`${where}: tổng phiên ${String(total)}, mong đợi 12`);
    }

    const deadlocks = (await serverDeadlocks(db)) - deadlocksBefore;
    const ghost = tallies.get('sid không tồn tại') ?? newTally();
    const summary = `${describeTally('sid không tồn tại', ghost)}; chờ lâu nhất của yêu cầu sid không tồn tại = ${String(Math.max(0, ...waits))} ms; ${describeTally('toàn bộ', sum(tallies))}; deadlock phía máy chủ = ${String(deadlocks)}`;
    console.info(`[RM] ${summary}`);

    expect(inconsistent, summary).toEqual([]);
    expect(sum(tallies), summary).toMatchObject({
      deadlock1213: 0,
      lockTimeout1205: 0,
      other: {},
    });
    expect(ghost.requests, summary).toBe(ROUNDS * 6);
    expect(sum(tallies).ok, summary).toBe(sum(tallies).requests);
    expect(deadlocks, summary).toBe(0);
  }, 600_000);

  it('RM-04 (đo cơ chế) SELECT … FOR UPDATE trên khoá chính KHÔNG có hàng ở REPEATABLE READ khoá khoảng và chặn lần chèn phiên mới cho tới khi giao dịch kết thúc, nhưng không tạo vòng chờ (giao dịch làm mới không chờ gì khác sau đó) nên chỉ là chờ ngắn, không deadlock', async () => {
    await resetTables(db);
    vi.setSystemTime(at(0));
    fx = createLoginFixture(db, new SelectiveMail());
    const live = await liveSession();
    const account = await newLoginAccount(db);
    const ghostId = String(Number(live.session.sessionId) + 100);

    const holder = db.createQueryRunner();
    const inserter = db.createQueryRunner();
    let outcome = '';
    try {
      await holder.connect();
      await holder.startTransaction(); // mức cô lập mặc định, như SessionService.refresh
      await holder.query(
        'SELECT * FROM phien_dang_nhap WHERE phien_dang_nhap_id = ? FOR UPDATE',
        [ghostId],
      );
      await inserter.connect();
      await inserter.query('SET SESSION innodb_lock_wait_timeout = 1');
      const started = performance.now();
      try {
        await inserter.query(
          'INSERT INTO phien_dang_nhap (tai_khoan_id, refresh_token_bam, tao_luc, het_han_luc) VALUES (?, ?, ?, ?)',
          [account.taiKhoanId, 'f'.repeat(64), at(0), at(1800)],
        );
        outcome = 'KHÔNG bị chặn';
      } catch (error) {
        const errno = (error as { driverError?: { errno?: number } })
          .driverError?.errno;
        outcome =
          errno === 1205
            ? 'BỊ CHẶN (1205 sau khi chờ)'
            : `lỗi lạ errno=${String(errno)}`;
      }
      console.info(
        `[RM] sid không tồn tại, cơ chế: lần chèn phiên mới khi một giao dịch REPEATABLE READ đang giữ SELECT … FOR UPDATE trên sid ${ghostId} (không có hàng): ${outcome} sau ${String(Math.round(performance.now() - started))} ms`,
      );
    } finally {
      await holder.rollbackTransaction().catch(() => undefined);
      await holder.release();
      await inserter.release();
    }
    expect(outcome).toBe('BỊ CHẶN (1205 sau khi chờ)');
  }, 60_000);
});
