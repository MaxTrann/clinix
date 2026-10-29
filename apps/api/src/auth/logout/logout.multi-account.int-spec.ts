import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { PhienDangNhap } from '../entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import type { RefreshResult } from '../session/session.service.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import { loginBody, newLoginAccount } from '../testing/login-int-helpers.js';
import {
  deleteLive,
  freshFixture,
  liveSession,
  liveSessions,
  logoutAction,
  measureRounds,
  rowOfLive,
  tallyOf,
  trafficOfOthers,
} from '../testing/multi-account-helpers.js';
import { at } from '../testing/otp-int-helpers.js';
import { sleep } from '../testing/verification-int-helpers.js';

// Task A10 — NHIỀU tài khoản KHÁC NHAU cùng lúc, mỗi tài khoản một thao tác riêng, trên MySQL 8.4 thật (bài học A5-C). Đăng xuất của N phiên (N tài khoản)
// chạy ĐỒNG THỜI với làm mới, đăng nhập, đăng ký, verify-otp, resend-otp của tài khoản KHÁC và với việc admin khoá tài khoản (B18). `revokeByRefreshToken`
// là MỘT câu UPDATE autocommit theo khoá chính; ca sid không tồn tại (khoá khoảng) và ca đua đăng xuất × làm mới CÙNG phiên được đo riêng (LM-03, LM-04,
// LM-05). Đo bằng số lỗi MySQL THẬT: lỗi trả ra (1213, 1205) VÀ bộ đếm `lock_deadlocks` của máy chủ; khẳng định đều bằng 0 (`measureRounds`). Mã LM-nn
// là [đề xuất]. Số vòng chỉnh bằng LOGOUT_MULTI_ROUNDS (mặc định 8; đo kỹ dùng 50 và chạy với --reporter=verbose để thấy các dòng "[LM]").
const ROUNDS = Number(process.env['LOGOUT_MULTI_ROUNDS'] ?? 8);

let db: DataSource;

useIntegrationHooks((testDb) => {
  db = testDb;
});

const failureOf = (result: RefreshResult | undefined): string =>
  result === undefined ? 'chưa chạy' : result.ok ? 'ok' : result.reason;

describe('đăng xuất của nhiều tài khoản khác nhau cùng lúc', () => {
  it(`LM-01 hỗn hợp: ${String(ROUNDS)} vòng × (8 đăng xuất đúng, 2 phiên đã thu hồi, 1 phiên không còn, 1 token giả) cùng 8 làm mới, 2 admin khoá, 2 đăng nhập, 2 đăng ký, 2 verify-otp, 1 resend-otp của tài khoản KHÁC: mỗi phiên chỉ chịu ảnh hưởng của thao tác của nó; 0 lỗi 1213 và 1205, 0 deadlock phía máy chủ`, async () => {
    await measureRounds(
      db,
      ROUNDS,
      'hỗn hợp',
      async ({ fx, where, flag, race }) => {
        const leaving = await liveSessions(db, fx, 8);
        const dead = await liveSessions(db, fx, 2);
        const ghost = await liveSession(db, fx);
        const refreshing = await liveSessions(db, fx, 8);
        const locked = await liveSessions(db, fx, 2);
        const others = await trafficOfOthers(db, fx);
        vi.setSystemTime(at(5));
        for (const item of dead) {
          await fx.sessionService.revoke(item.session.sessionId);
        }
        await deleteLive(db, ghost);
        vi.setSystemTime(at(61));

        const out = {
          leaving: [] as boolean[],
          dead: [] as boolean[],
          ghost: [] as boolean[],
          forged: [] as boolean[],
        };
        const refreshed: (RefreshResult | undefined)[] = [];
        await race([
          ...leaving.map((item, i) => logoutAction(fx, item, out.leaving, i)),
          ...dead.map((item, i) =>
            logoutAction(fx, item, out.dead, i, 'đăng xuất phiên đã thu hồi'),
          ),
          logoutAction(fx, ghost, out.ghost, 0, 'đăng xuất phiên không còn'),
          logoutAction(
            fx,
            ghost,
            out.forged,
            0,
            'đăng xuất token giả',
            'rac.rac.rac',
          ),
          ...refreshing.map((item, i) => ({
            kind: 'làm mới của tài khoản khác',
            run: async () => {
              refreshed[i] = await fx.sessionService.refresh(
                item.session.refreshToken,
              );
            },
          })),
          ...locked.map((item) => ({
            kind: 'admin khoá',
            run: () =>
              db.transaction(async (manager) => {
                await manager.update(
                  TaiKhoan,
                  { taiKhoanId: item.accountId },
                  { trangThai: 'NgungHoatDong' },
                );
                await fx.sessionService.revokeAll(item.accountId, { manager });
              }),
          })),
          ...others.actions,
        ]);

        for (const [i, item] of leaving.entries()) {
          const row = await rowOfLive(db, item);
          if (
            out.leaving[i] !== true ||
            row?.thuHoiLuc?.getTime() !== at(61).getTime()
          ) {
            flag(
              `${where}: đăng xuất đúng #${String(i)} = ${String(out.leaving[i])}, mốc = ${String(row?.thuHoiLuc)}`,
            );
          }
        }
        for (const [i, item] of dead.entries()) {
          const row = await rowOfLive(db, item);
          if (
            out.dead[i] !== false ||
            row?.thuHoiLuc?.getTime() !== at(5).getTime()
          ) {
            flag(
              `${where}: phiên đã thu hồi #${String(i)} bị ghi đè hoặc báo thu hồi (${String(out.dead[i])}, ${String(row?.thuHoiLuc)})`,
            );
          }
        }
        if (out.ghost[0] !== false || (await rowOfLive(db, ghost)) !== null) {
          flag(`${where}: phiên không còn sinh ra hàng hoặc báo thu hồi`);
        }
        if (out.forged[0] !== false) flag(`${where}: token giả báo thu hồi`);
        for (const [i, item] of refreshing.entries()) {
          const row = await rowOfLive(db, item);
          if (!refreshed[i]?.ok || row?.thuHoiLuc !== null) {
            flag(
              `${where}: làm mới của tài khoản khác #${String(i)} = ${failureOf(refreshed[i])}, thu hồi = ${String(row?.thuHoiLuc)}`,
            );
          }
        }
        for (const [i, item] of locked.entries()) {
          if ((await rowOfLive(db, item))?.thuHoiLuc == null) {
            flag(`${where}: tài khoản bị khoá #${String(i)} còn phiên sống`);
          }
        }
        // 8 + 2 + 8 + 2 phiên còn hàng, cộng 1 phiên của đăng nhập đúng; phiên "không còn" đã bị xoá
        const total = await db.getRepository(PhienDangNhap).count();
        if (total !== 21)
          flag(`${where}: tổng phiên ${String(total)}, mong đợi 21`);
        for (const problem of await others.problems())
          flag(`${where}: ${problem}`);
      },
    );
  }, 600_000);

  it(`LM-02 chỉ đăng xuất: ${String(ROUNDS)} vòng × (12 phiên của 12 tài khoản khác nhau + 4 phiên của CÙNG một tài khoản) cùng lúc, với một tài khoản đứng ngoài đang làm mới: mọi phiên bị thu hồi đúng một lần, phiên đứng ngoài nguyên vẹn; 0 lỗi 1213 và 1205, 0 deadlock phía máy chủ`, async () => {
    await measureRounds(
      db,
      ROUNDS,
      'chỉ đăng xuất',
      async ({ fx, where, flag, race }) => {
        const separate = await liveSessions(db, fx, 12);
        const owner = await liveSession(db, fx);
        const siblings = [owner];
        while (siblings.length < 4) {
          siblings.push({
            accountId: owner.accountId,
            session: await fx.sessionService.create(owner.accountId),
          });
        }
        const bystander = await liveSession(db, fx);
        vi.setSystemTime(at(60));

        const outcomes: boolean[] = [];
        let bystanderResult: RefreshResult | undefined;
        const leaving = [...separate, ...siblings];
        await race([
          ...leaving.map((item, i) => logoutAction(fx, item, outcomes, i)),
          {
            kind: 'làm mới của tài khoản khác',
            run: async () => {
              bystanderResult = await fx.sessionService.refresh(
                bystander.session.refreshToken,
              );
            },
          },
        ]);

        if (outcomes.length !== 16 || outcomes.some((one) => one !== true)) {
          flag(
            `${where}: có đăng xuất không thu hồi được (${outcomes.join(',')})`,
          );
        }
        for (const item of leaving) {
          if (
            (await rowOfLive(db, item))?.thuHoiLuc?.getTime() !==
            at(60).getTime()
          ) {
            flag(
              `${where}: phiên ${item.session.sessionId} chưa thu hồi đúng mốc`,
            );
          }
        }
        if (
          !bystanderResult?.ok ||
          (await rowOfLive(db, bystander))?.thuHoiLuc !== null
        ) {
          flag(
            `${where}: phiên đứng ngoài bị ảnh hưởng (${failureOf(bystanderResult)})`,
          );
        }
      },
    );
  }, 600_000);

  it(`LM-03 đua đăng xuất × làm mới CÙNG một phiên: ${String(ROUNDS)} vòng × 12 phiên của 12 tài khoản, mỗi phiên bị đăng xuất và làm mới cùng lúc (cùng 2 đăng nhập của tài khoản khác): phiên LUÔN kết thúc đã thu hồi, token mới do làm mới vừa xoay (nếu thắng) KHÔNG dùng được; 0 lỗi 1213 và 1205, 0 deadlock phía máy chủ`, async () => {
    let refreshWins = 0;
    await measureRounds(
      db,
      ROUNDS,
      'đua đăng xuất × làm mới',
      async ({ fx, where, flag, race }) => {
        const sessions = await liveSessions(db, fx, 12);
        const loggingIn = [
          await newLoginAccount(db),
          await newLoginAccount(db),
        ];
        vi.setSystemTime(at(60));

        const outcomes: boolean[] = [];
        const refreshed: (RefreshResult | undefined)[] = [];
        await race([
          // phiên chẵn: đăng xuất vào cổng trước; phiên lẻ: làm mới vào cổng trước (để cả hai thứ tự đều có cơ hội thắng khoá)
          ...sessions.flatMap((item, i) => {
            const logout = logoutAction(fx, item, outcomes, i);
            const refresh = {
              kind: 'làm mới cùng phiên',
              run: async () => {
                refreshed[i] = await fx.sessionService.refresh(
                  item.session.refreshToken,
                );
              },
            };
            return i % 2 === 0 ? [logout, refresh] : [refresh, logout];
          }),
          ...loggingIn.map((account) => ({
            kind: 'đăng nhập (chèn phiên)',
            run: () => fx.login.login(loginBody(account)),
          })),
        ]);

        for (const [i, item] of sessions.entries()) {
          const label = `${where} phiên #${String(i)}`;
          const result = refreshed[i];
          if ((await rowOfLive(db, item))?.thuHoiLuc == null) {
            flag(
              `${label}: kết thúc mà CHƯA thu hồi (làm mới = ${failureOf(result)})`,
            );
          }
          if (result && !result.ok && result.reason !== 'SESSION_REVOKED') {
            flag(`${label}: làm mới thua với lý do lạ ${result.reason}`);
          }
          if (!result?.ok) continue;
          refreshWins += 1;
          const reuse = await fx.sessionService.refresh(
            result.tokens.refreshToken,
          );
          if (reuse.ok || reuse.reason !== 'SESSION_REVOKED') {
            flag(`${label}: token mới do làm mới vừa xoay vẫn dùng được`);
          }
          const active = await fx.sessionService.resolveActive({
            accountId: item.accountId,
            sessionId: item.session.sessionId,
          });
          if (active !== null)
            flag(`${label}: guard vẫn chấp nhận phiên đã thu hồi`);
        }
      },
    );
    console.info(
      `[LM] đua đăng xuất × làm mới: ${String(refreshWins)}/${String(ROUNDS * 12)} lần làm mới thắng khoá hàng (phiên vẫn kết thúc đã thu hồi)`,
    );
  }, 600_000);

  it(`LM-04 sid KHÔNG TỒN TẠI: ${String(ROUNDS)} vòng × 6 yêu cầu đăng xuất mang chữ ký đúng nhưng phiên không có hàng (3 nằm sau hàng lớn nhất, 3 nằm trong khe do hàng bị xoá) cùng 6 đăng nhập (chèn phiên mới) và 6 làm mới đúng của tài khoản khác: UPDATE theo khoá chính không có hàng, autocommit một câu, không gây 1213, 1205 hay deadlock`, async () => {
    const waits: number[] = [];
    const tallies = await measureRounds(
      db,
      ROUNDS,
      'sid không tồn tại',
      async ({ fx, where, flag, race }) => {
        const sessions = await liveSessions(db, fx, 9);
        const loggingIn = [];
        while (loggingIn.length < 6) loggingIn.push(await newLoginAccount(db));
        const holes = sessions.slice(0, 3); // khe giữa: xoá hàng rồi dùng chính token của chúng
        for (const hole of holes) await deleteLive(db, hole);
        const maxId = Math.max(
          ...sessions.map((item) => Number(item.session.sessionId)),
        );
        const ghostTokens = [
          ...holes.map((hole) => hole.session.refreshToken),
          ...[1, 2, 3].map(
            (n) => fx.tokens.issueRefreshToken(String(maxId + 100 * n)).token,
          ),
        ];
        vi.setSystemTime(at(60));

        const outcomes: boolean[] = [];
        const refreshed: (RefreshResult | undefined)[] = [];
        await race([
          ...ghostTokens.map((token, i) => ({
            kind: 'sid không tồn tại',
            run: async () => {
              const started = performance.now();
              outcomes[i] = await fx.sessionService.revokeByRefreshToken(token);
              waits.push(Math.round(performance.now() - started));
            },
          })),
          ...loggingIn.map((account) => ({
            kind: 'đăng nhập (chèn phiên)',
            run: () => fx.login.login(loginBody(account)),
          })),
          ...sessions.slice(3).map((item, i) => ({
            kind: 'làm mới của tài khoản khác',
            run: async () => {
              refreshed[i] = await fx.sessionService.refresh(
                item.session.refreshToken,
              );
            },
          })),
        ]);

        if (outcomes.length !== 6 || outcomes.some((one) => one !== false)) {
          flag(
            `${where}: sid không tồn tại báo thu hồi (${outcomes.join(',')})`,
          );
        }
        if (refreshed.some((result) => !result?.ok))
          flag(`${where}: có làm mới đúng bị từ chối`);
        // 6 phiên còn + 6 phiên mới của đăng nhập; không phiên "ma" nào được tạo ra hay bị thu hồi nhầm
        const rows = await db.getRepository(PhienDangNhap).find();
        if (rows.length !== 12 || rows.some((row) => row.thuHoiLuc !== null)) {
          flag(
            `${where}: ${String(rows.length)} phiên, có phiên bị thu hồi nhầm hoặc phiên ma`,
          );
        }
      },
    );
    const ghost = tallyOf(tallies, 'sid không tồn tại');
    console.info(
      `[LM] sid không tồn tại: ${String(ghost.requests)} yêu cầu, ${String(ghost.ok)} đúng, 1213 = ${String(ghost.deadlock1213)}, 1205 = ${String(ghost.lockTimeout1205)}; chờ lâu nhất = ${String(Math.max(0, ...waits))} ms`,
    );
    expect(ghost.requests).toBe(ROUNDS * 6);
  }, 600_000);

  it('LM-05 (đo cơ chế) làm mới đang giữ khoá hàng phiên: đăng xuất CHỜ khoá (không đi vòng qua), commit xong thì thu hồi phiên; token vừa xoay không dùng được và băm của lần xoay được giữ nguyên', async () => {
    const fx = await freshFixture(db);
    const item = await liveSession(db, fx);
    const rotated = fx.tokens.issueRefreshToken(item.session.sessionId);
    const holder = db.createQueryRunner();
    let finished = false;
    let blockedWhileHeld = false;
    let logout: Promise<boolean> = Promise.resolve(false);
    try {
      await holder.connect();
      await holder.startTransaction(); // mức cô lập mặc định, như SessionService.refresh
      await fx.sessions.findByIdForUpdate(
        holder.manager,
        item.session.sessionId,
      );
      await fx.sessions.rotate(
        holder.manager,
        item.session.sessionId,
        rotated.hash,
        at(1800),
      );
      logout = fx.sessionService
        .revokeByRefreshToken(item.session.refreshToken)
        .finally(() => {
          finished = true;
        });
      await sleep(300);
      blockedWhileHeld = !finished;
    } finally {
      await holder.commitTransaction();
      await holder.release();
    }
    const revoked = await logout;
    console.info(
      `[LM] đăng xuất khi làm mới giữ khoá hàng: bị chặn trong lúc giữ khoá = ${String(blockedWhileHeld)}, sau commit thu hồi = ${String(revoked)}`,
    );

    expect(blockedWhileHeld).toBe(true);
    expect(revoked).toBe(true);
    const row = await rowOfLive(db, item);
    expect(row?.thuHoiLuc).toEqual(at(0));
    expect(row?.refreshTokenBam).toBe(rotated.hash);
    expect(await fx.sessionService.refresh(rotated.token)).toEqual({
      ok: false,
      reason: 'SESSION_REVOKED',
    });
  }, 60_000);

  it('LM-06 (hợp đồng của rotate trong ca đua) rotate chỉ đổi băm và hạn, KHÔNG đụng thu_hoi_luc: xoay muộn trên phiên đã thu hồi không hồi sinh phiên', async () => {
    const fx = await freshFixture(db);
    const item = await liveSession(db, fx);
    vi.setSystemTime(at(10));
    expect(await fx.sessionService.revoke(item.session.sessionId)).toBe(true);
    const rotated = fx.tokens.issueRefreshToken(item.session.sessionId);

    await fx.sessions.rotate(
      db.manager,
      item.session.sessionId,
      rotated.hash,
      at(1800),
    );

    const row = await rowOfLive(db, item);
    expect(row?.thuHoiLuc).toEqual(at(10));
    expect(row?.refreshTokenBam).toBe(rotated.hash);
    expect(await fx.sessionService.refresh(rotated.token)).toEqual({
      ok: false,
      reason: 'SESSION_REVOKED',
    });
  });
});
