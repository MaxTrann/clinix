import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { PhienDangNhap } from '../entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from '../entities/tai-khoan.entity.js';
import {
  changeInput,
  changeServiceFor,
} from '../testing/change-password-helpers.js';
import { useIntegrationHooks } from '../testing/int-hooks.js';
import { newLoginAccount } from '../testing/login-int-helpers.js';
import {
  freshFixture,
  type MultiFixture,
} from '../testing/multi-account-helpers.js';
import {
  resetInput,
  resetServicesFor,
  tokenFor,
} from '../testing/reset-password-int-helpers.js';
import {
  deferred,
  serverDeadlocks,
  sleep,
} from '../testing/verification-int-helpers.js';

// Task A13 — thứ tự khoá khi thu hồi phiên (MySQL 1213). Ghi `phien_dang_nhap.thu_hoi_luc` làm MySQL ghi lại mục trong chỉ mục (tai_khoan_id, thu_hoi_luc); chỉ mục này cũng phục
// vụ khoá ngoại nên MySQL xin khoá S lên hàng cha `tai_khoan`. Đăng xuất và nhánh dùng lại của refresh từng giữ hàng phiên rồi mới xin khoá S, ngược với `revokeAll` (giữ khoá X
// `tai_khoan` rồi chờ hàng phiên). Nay cả hai khoá `tai_khoan` trước. Đo cho đổi mật khẩu (A13) và đặt lại mật khẩu (A12). Mỗi vòng: tài khoản mới có 4 phiên. Hai chế độ: thả tự
// do, và canh đúng lúc `revokeAll` bắt đầu. Ca thả tự do một mình KHÔNG chứng minh an toàn: băm Argon2id làm hai bên ít gặp nhau. Mã RV-nn là [đề xuất].
// Số vòng REVOKE_RACE_ROUNDS (mặc định 12; đo thật dùng 200 và --reporter=verbose để thấy các dòng "[RV]").
const ROUNDS = Number(process.env['REVOKE_RACE_ROUNDS'] ?? 12);
const TEST_TIMEOUT = Math.max(30_000, ROUNDS * 1_500); // hạn mỗi test tăng theo số vòng

let db: DataSource;

useIntegrationHooks((testDb) => {
  db = testDb;
});

type Mode = 'thả tự do' | 'canh revokeAll';
type Rival = 'đăng xuất' | 'refresh dùng lại';

interface Count {
  ok: number;
  deadlock1213: number;
  lockTimeout1205: number;
  other: Record<string, number>;
}

const emptyCount = (): Count => ({
  ok: 0,
  deadlock1213: 0,
  lockTimeout1205: 0,
  other: {},
});

function note(count: Count, result: PromiseSettledResult<unknown>): void {
  if (result.status === 'fulfilled') {
    count.ok += 1;
    return;
  }
  const error = result.reason as {
    driverError?: { errno?: number };
    errno?: number;
  };
  const errno = error.driverError?.errno ?? error.errno;
  if (errno === 1213) count.deadlock1213 += 1;
  else if (errno === 1205) count.lockTimeout1205 += 1;
  else {
    const key =
      result.reason instanceof AppException
        ? result.reason.maLoi
        : String(result.reason);
    count.other[key] = (count.other[key] ?? 0) + 1;
  }
}

/** Tài khoản có 4 phiên: [0] phiên hiện tại; [1] sẽ bị đăng xuất; [2] đã xoay một lần, giữ token CŨ để phát lại; [3] chỉ để bị thu hồi. */
async function fourSessions(fx: MultiFixture) {
  const account = await newLoginAccount(db);
  const sessions = [];
  for (let i = 0; i < 4; i++)
    sessions.push(await fx.sessionService.create(account.taiKhoanId));
  const replay = sessions[2]?.refreshToken ?? '';
  await fx.sessionService.refresh(replay);
  return { account, sessions, replay };
}

const revokedAt = async (sessionId: string): Promise<Date | null> =>
  (
    await db
      .getRepository(PhienDangNhap)
      .findOneByOrFail({ phienDangNhapId: sessionId })
  ).thuHoiLuc;

async function measure(
  service: 'đổi mật khẩu' | 'đặt lại mật khẩu',
  mode: Mode,
  rival: Rival,
): Promise<void> {
  const fx = await freshFixture(db);
  const change = changeServiceFor(db, fx);
  const reset = resetServicesFor(db, fx);
  const writer = emptyCount();
  const other = emptyCount();
  const realRevokeAll = fx.sessionService.revokeAll.bind(fx.sessionService);
  const before = await serverDeadlocks(db);
  const started = performance.now();

  for (let round = 0; round < ROUNDS; round++) {
    const { account, sessions, replay } = await fourSessions(fx);
    const current = sessions[0];
    const leaving = sessions[1];
    if (!current || !leaving) throw new Error('thiếu phiên');
    const token =
      service === 'đặt lại mật khẩu'
        ? await tokenFor({ ...reset, mail: fx.mail }, account.email)
        : '';

    // Canh giờ: bên kia bắt đầu đúng lúc revokeAll bắt đầu, lệch 0..3 ms theo vòng để quét nhiều thứ tự xen kẽ
    const atRevoke = deferred();
    const lead = round % 4;
    const spy = vi
      .spyOn(fx.sessionService, 'revokeAll')
      .mockImplementation(async (id, options) => {
        atRevoke.resolve();
        if (lead > 0) await sleep(lead);
        return realRevokeAll(id, options);
      });

    const writerRun =
      service === 'đổi mật khẩu'
        ? change.change(changeInput(account.taiKhoanId, current))
        : reset.reset.reset(resetInput(token));
    const rivalRun = (async () => {
      if (mode === 'canh revokeAll') await atRevoke.promise;
      return rival === 'đăng xuất'
        ? fx.sessionService.revokeByRefreshToken(leaving.refreshToken)
        : fx.sessionService.refresh(replay);
    })();
    const [first, second] = await Promise.allSettled([writerRun, rivalRun]);
    note(writer, first);
    note(other, second);
    spy.mockRestore();

    // Hậu điều kiện: bên ghi thành công thì không còn phiên nào ngoài phiên được giữ
    if (first.status === 'fulfilled') {
      const live = (
        await db
          .getRepository(PhienDangNhap)
          .findBy({ taiKhoanId: account.taiKhoanId })
      ).filter((row) => row.thuHoiLuc === null);
      const expected = service === 'đổi mật khẩu' ? [current.sessionId] : [];
      expect(live.map((row) => row.phienDangNhapId)).toEqual(expected);
    }
  }

  const deadlocks = (await serverDeadlocks(db)) - before;
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  const summary = `${service} × ${rival} (${mode}), ${String(ROUNDS)} vòng, ${seconds} giây: bên ghi ${JSON.stringify(writer)}; bên kia ${JSON.stringify(other)}; deadlock phía máy chủ ${String(deadlocks)}`;
  console.info(`[RV] ${summary}`);
  expect(writer, summary).toEqual({ ...emptyCount(), ok: ROUNDS });
  expect(other, summary).toEqual({ ...emptyCount(), ok: ROUNDS });
  expect(deadlocks, summary).toBe(0);
}

describe(
  'thu hồi phiên đua với bên đã khoá tài khoản',
  { timeout: TEST_TIMEOUT },
  () => {
    describe.each(['đổi mật khẩu', 'đặt lại mật khẩu'] as const)(
      '%s',
      (service) => {
        it.each([
          ['RV-01', 'thả tự do', 'đăng xuất'],
          ['RV-02', 'thả tự do', 'refresh dùng lại'],
          ['RV-03', 'canh revokeAll', 'đăng xuất'],
          ['RV-04', 'canh revokeAll', 'refresh dùng lại'],
        ] as const)(
          '%s %s, đua với %s của phiên KHÁC cùng tài khoản: 0 lỗi 1213 và 1205',
          async (_code, mode, rival) => {
            await measure(service, mode, rival);
          },
        );
      },
    );
  },
);

describe('cơ chế khoá của thu hồi một phiên', () => {
  /** Giữ khoá hàng `tai_khoan` (`mode`) trong một giao dịch tới khi `release` được gọi. */
  async function holdAccount(accountId: string, mode: 'SHARE' | 'UPDATE') {
    const locked = deferred();
    const free = deferred();
    const done = db.transaction('READ COMMITTED', async (em) => {
      await em.query(
        `SELECT tai_khoan_id FROM tai_khoan WHERE tai_khoan_id = ? FOR ${mode}`,
        [accountId],
      );
      locked.resolve();
      await free.promise;
    });
    await locked.promise;
    return async () => {
      free.resolve();
      await done;
    };
  }

  it('RV-05 phiên không tồn tại: trả false và không khoá gì', async () => {
    const fx = await freshFixture(db);
    const lock = vi.spyOn(fx.sessions, 'lockAccountForShare');

    expect(await fx.sessionService.revoke('987654321')).toBe(false);

    expect(lock).not.toHaveBeenCalled();
  });

  it('RV-06 tự mở giao dịch ở READ COMMITTED', async () => {
    const fx = await freshFixture(db);
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);
    const transaction = vi.spyOn(db, 'transaction');

    expect(await fx.sessionService.revoke(session.sessionId)).toBe(true);

    expect(transaction).toHaveBeenCalledExactlyOnceWith(
      'READ COMMITTED',
      expect.any(Function),
    );
  });

  it('RV-07 khoá là khoá S: có bên khác đang giữ khoá S trên tài khoản thì đăng xuất vẫn xong ngay', async () => {
    const fx = await freshFixture(db);
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);
    const release = await holdAccount(account.taiKhoanId, 'SHARE');
    try {
      expect(await fx.sessionService.revoke(session.sessionId)).toBe(true);
    } finally {
      await release();
    }
  });

  it.each([
    ['đăng xuất', 'logout'],
    ['refresh dùng lại', 'replay'],
  ] as const)(
    'RV-08 %s khi tài khoản đang bị giữ khoá X: chờ khoá tài khoản mà KHÔNG giữ hàng phiên; thả khoá thì phiên bị thu hồi',
    async (_label, kind) => {
      const fx = await freshFixture(db);
      const account = await newLoginAccount(db);
      const session = await fx.sessionService.create(account.taiKhoanId);
      const oldToken = session.refreshToken;
      await fx.sessionService.refresh(oldToken);
      const release = await holdAccount(account.taiKhoanId, 'UPDATE');
      let finished = false;
      const work = (
        kind === 'logout'
          ? fx.sessionService.revokeByRefreshToken(oldToken)
          : fx.sessionService.refresh(oldToken)
      ).finally(() => {
        finished = true;
      });
      try {
        await sleep(200);
        expect(finished).toBe(false);
        // Giữ hàng phiên trong lúc chờ `tai_khoan` chính là vòng khoá cũ: NOWAIT sẽ báo lỗi ngay
        await db.transaction('READ COMMITTED', (em) =>
          em.query(
            'SELECT 1 FROM phien_dang_nhap WHERE phien_dang_nhap_id = ? FOR UPDATE NOWAIT',
            [session.sessionId],
          ),
        );
      } finally {
        await release();
      }
      await work;
      expect(await revokedAt(session.sessionId)).not.toBeNull();
    },
  );

  it('RV-09 có `manager`: chạy trong giao dịch của người gọi, hoàn tác thì phiên còn sống', async () => {
    const fx = await freshFixture(db);
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);

    await expect(
      db.transaction('READ COMMITTED', async (manager) => {
        await manager.findOneByOrFail(TaiKhoan, {
          taiKhoanId: account.taiKhoanId,
        });
        expect(
          await fx.sessionService.revoke(session.sessionId, { manager }),
        ).toBe(true);
        throw new Error('lỗi giả lập của người gọi');
      }),
    ).rejects.toThrow('lỗi giả lập');

    expect(await revokedAt(session.sessionId)).toBeNull();
  });

  it('RV-14 `revokeAll` trong giao dịch REPEATABLE READ đã khoá tài khoản trước: phiên tạo ngay trước khi khoá vẫn bị thu hồi, phiên được chừa thì không', async () => {
    const fx = await freshFixture(db);
    const account = await newLoginAccount(db);
    const kept = await fx.sessionService.create(account.taiKhoanId);
    const others = [
      await fx.sessionService.create(account.taiKhoanId),
      await fx.sessionService.create(account.taiKhoanId),
    ];

    const revoked = await db.transaction('REPEATABLE READ', async (manager) => {
      await manager.query(
        'SELECT tai_khoan_id FROM tai_khoan WHERE tai_khoan_id = ? FOR UPDATE',
        [account.taiKhoanId],
      );
      return fx.sessionService.revokeAll(account.taiKhoanId, {
        manager,
        exceptSessionId: kept.sessionId,
      });
    });

    expect(revoked).toBe(2);
    expect(await revokedAt(kept.sessionId)).toBeNull();
    for (const other of others)
      expect(await revokedAt(other.sessionId)).not.toBeNull();
  });

  it('RV-15 `revokeAll` chỉ đếm phiên vừa thu hồi, không ghi đè mốc cũ kể cả khi phiên bị thu hồi xen giữa lúc đọc mã và lúc UPDATE', async () => {
    const fx = await freshFixture(db);
    const account = await newLoginAccount(db);
    const racing = await fx.sessionService.create(account.taiKhoanId);
    const plain = await fx.sessionService.create(account.taiKhoanId);
    await db
      .getRepository(PhienDangNhap)
      .update(
        { phienDangNhapId: racing.sessionId },
        { thuHoiLuc: new Date('2026-11-02T00:00:00.000Z') },
      );
    const staleIds = vi
      .spyOn(db.manager, 'find')
      .mockResolvedValueOnce([
        { phienDangNhapId: racing.sessionId },
        { phienDangNhapId: plain.sessionId },
      ] as never);

    expect(
      await fx.sessions.revokeAllActive(
        db.manager,
        account.taiKhoanId,
        new Date(),
      ),
    ).toBe(1);

    expect(staleIds).toHaveBeenCalledTimes(1);
    expect(await revokedAt(racing.sessionId)).toEqual(
      new Date('2026-11-02T00:00:00.000Z'),
    );
  });

  it('RV-10 tài khoản biến mất giữa lúc đọc và lúc khoá (job dọn xoá phiên rồi xoá tài khoản): trả false, không lỗi', async () => {
    const fx = await freshFixture(db);
    const account = await newLoginAccount(db);
    const session = await fx.sessionService.create(account.taiKhoanId);
    const read = fx.sessions.findAccountIdOf.bind(fx.sessions);
    vi.spyOn(fx.sessions, 'findAccountIdOf').mockImplementation(
      async (em, sessionId) => {
        const accountId = await read(em, sessionId);
        await db.getRepository(PhienDangNhap).delete({
          phienDangNhapId: sessionId,
        });
        await db.getRepository(TaiKhoan).delete({
          taiKhoanId: account.taiKhoanId,
        });
        return accountId;
      },
    );

    expect(await fx.sessionService.revoke(session.sessionId)).toBe(false);
  });
});
