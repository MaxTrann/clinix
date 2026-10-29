import { vi } from 'vitest';
import {
  SESSION_IDLE_MS,
  SESSION_MAX_MS,
} from './../src/auth/auth.constants.js';
import { TaiKhoan } from './../src/auth/entities/tai-khoan.entity.js';
import { PhienDangNhap } from './../src/auth/entities/phien-dang-nhap.entity.js';
import { sha256Hex } from './../src/auth/session/token.service.js';
import {
  T0,
  at,
  captureNestLogger,
} from './../src/auth/testing/otp-int-helpers.js';
import {
  expOf,
  expectCookieCleared,
  openRefreshHarness,
  refreshTokenOf,
  setCookiesOf,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import {
  deferred,
  serverDeadlocks,
} from './../src/auth/testing/verification-int-helpers.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';

// Task A9 — vòng đời phiên qua POST /auth/refresh: biên thời gian từng giây, trần 8 giờ, thu hồi, dùng lại, tài khoản không hoạt động, song song,
// access token. AppModule + MySQL thật + configureApp; đồng hồ giả chỉ giả `Date`. Mã test case: DN-27, DN-28, DN-30, DN-35, H12/N4, H14, Q8, Q29.
// Hợp đồng HTTP (Origin, cookie, token giả, SE-04) ở auth-refresh.e2e-spec.ts. Mã E2E-Rnn là [đề xuất].
const IDLE = SESSION_IDLE_MS / 1000; // 1800 giây
const MAX = SESSION_MAX_MS / 1000; // 28800 giây
const atMs = (ms: number): Date => new Date(T0.getTime() + ms);
/** Giá trị `exp` (giây từ 1970) của một mốc cách T0 `seconds` giây. */
const epochOf = (seconds: number): number => at(seconds).getTime() / 1000;
let h: RefreshHarness;

beforeAll(async () => {
  h = await openRefreshHarness();
});

beforeEach(async () => {
  await resetTables(h.db);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await h.close();
});

const accessTokenOf = (res: { body: unknown }): string =>
  (res.body as { accessToken: string }).accessToken;

describe('hạn trượt 30 phút và trần 8 giờ (DN-27, DN-28, H14)', () => {
  it('E2E-R20 (DN-27, DN-28) làm mới mỗi 25 phút tới trần: het_han_luc = min(bây giờ + 30 phút, tao_luc + 8 giờ) và cookie Expires khớp; 7:59:59 còn, kẹp ở 8:00:00; 8:00:00 hết', async () => {
    const { session } = await h.newSession();
    let token = session.refreshToken;

    for (let step = 1; step <= 19; step++) {
      const elapsed = step * 25 * 60;
      vi.setSystemTime(at(elapsed));
      const res = await h.refresh({ cookie: token });
      expect(res.status, `bước ${String(step)}`).toBe(200);
      const expected = at(Math.min(elapsed + IDLE, MAX));
      expect((await h.rowOf(session.sessionId)).hetHanLuc).toEqual(expected);
      expect(setCookiesOf(res)[0]).toContain(
        `Expires=${expected.toUTCString()}`,
      );
      token = refreshTokenOf(res);
    }

    vi.setSystemTime(at(MAX - 1));
    const last = await h.refresh({ cookie: token });
    expect(last.status).toBe(200);
    expect((await h.rowOf(session.sessionId)).hetHanLuc).toEqual(at(MAX));
    expect(setCookiesOf(last)[0]).toContain(`Expires=${at(MAX).toUTCString()}`);
    expect(expOf(accessTokenOf(last))).toBe(epochOf(MAX)); // access token cũng bị kẹp ở trần
    token = refreshTokenOf(last);

    vi.setSystemTime(at(MAX));
    const over = await h.refresh({ cookie: token });
    expectErrorResponse(over, 401, 'PHIEN_HET_HIEU_LUC');
    expectCookieCleared(over);
    const row = await h.rowOf(session.sessionId);
    expect(row.refreshTokenBam).toBe(sha256Hex(token));
    expect(row.thuHoiLuc).toBeNull();
  });

  it.each([
    ['29:59', IDLE * 1000 - 1000, 200],
    ['29:59,999', IDLE * 1000 - 1, 200],
    ['30:00', IDLE * 1000, 401],
    ['30:01', IDLE * 1000 + 1000, 401],
  ])(
    'E2E-R21 (DN-28) không hoạt động, sau %s: %i → HTTP %i (nửa mở: đúng 30:00:00 là hết); hết hạn thì không xoay',
    async (_label, elapsedMs, status) => {
      const { session } = await h.newSession();
      vi.setSystemTime(atMs(elapsedMs));
      const before = await h.rowOf(session.sessionId);

      const res = await h.refresh({ cookie: session.refreshToken });

      expect(res.status).toBe(status);
      if (status === 200) {
        expect((await h.rowOf(session.sessionId)).refreshTokenBam).not.toBe(
          before.refreshTokenBam,
        );
      } else {
        expectErrorResponse(res, 401, 'PHIEN_HET_HIEU_LUC');
        expectCookieCleared(res);
        expect(await h.rowOf(session.sessionId)).toEqual(before);
      }
    },
  );

  it.each([
    ['7:59:59', MAX * 1000 - 1000, 200],
    ['7:59:59,999', MAX * 1000 - 1, 200],
    ['8:00:00', MAX * 1000, 401],
    ['8:00:01', MAX * 1000 + 1000, 401],
  ])(
    'E2E-R22 (DN-28) trần 8 giờ, sau %s: %i → HTTP %i (nửa mở: đúng 8:00:00 là hết); hạn không hoạt động còn dài vẫn không cứu được',
    async (_label, elapsedMs, status) => {
      const { session } = await h.newSession();
      await h.db
        .getRepository(PhienDangNhap)
        .update(
          { phienDangNhapId: session.sessionId },
          { hetHanLuc: at(MAX + 3600) },
        );
      vi.setSystemTime(atMs(elapsedMs));
      const before = await h.rowOf(session.sessionId);

      const res = await h.refresh({ cookie: session.refreshToken });

      expect(res.status).toBe(status);
      if (status === 200) {
        expect(expOf(accessTokenOf(res))).toBe(epochOf(MAX)); // kẹp theo trần
        expect((await h.rowOf(session.sessionId)).hetHanLuc).toEqual(at(MAX));
      } else {
        expectErrorResponse(res, 401, 'PHIEN_HET_HIEU_LUC');
        expect(await h.rowOf(session.sessionId)).toEqual(before);
      }
    },
  );
});

describe('phiên đã thu hồi và tài khoản không hoạt động (DN-28, Q8, Q29)', () => {
  it('E2E-R23 (DN-28, DN-35) phiên đã thu hồi → 401, xoá cookie, không đổi mốc thu hồi; access token của phiên đó bị guard từ chối ngay', async () => {
    const { session } = await h.newSession();
    expect(await h.sessions.revoke(session.sessionId)).toBe(true);
    vi.setSystemTime(at(30));

    const res = await h.refresh({ cookie: session.refreshToken });

    expectErrorResponse(res, 401, 'PHIEN_HET_HIEU_LUC');
    expectCookieCleared(res);
    expect((await h.rowOf(session.sessionId)).thuHoiLuc).toEqual(T0);
    expectErrorResponse(
      await h.whoami(session.accessToken),
      401,
      'PHIEN_HET_HIEU_LUC',
    );
  });

  it('E2E-R24 token CŨ của phiên đã thu hồi: vẫn 401, mốc thu hồi giữ nguyên và KHÔNG có cảnh báo "dùng lại" giả (thu hồi được kiểm trước dùng lại)', async () => {
    const logs = captureNestLogger();
    const { session } = await h.newSession();
    vi.setSystemTime(at(10));
    const rotated = refreshTokenOf(
      await h.refresh({ cookie: session.refreshToken }),
    );
    vi.setSystemTime(at(20));
    await h.sessions.revoke(session.sessionId);
    vi.setSystemTime(at(60));

    const oldToken = await h.refresh({ cookie: session.refreshToken });
    const current = await h.refresh({ cookie: rotated });

    for (const res of [oldToken, current]) {
      expectErrorResponse(res, 401, 'PHIEN_HET_HIEU_LUC');
      expectCookieCleared(res);
    }
    expect((await h.rowOf(session.sessionId)).thuHoiLuc).toEqual(at(20));
    expect(logs.filter((line) => line.includes('dùng lại'))).toEqual([]);
  });

  it('E2E-R25 (DN-28) tài khoản NgungHoatDong mà phiên chưa thu hồi: 401, xoá cookie, hàng phiên NGUYÊN VẸN (không xoay, không thu hồi); mở lại thì cùng token làm mới được', async () => {
    const logs = captureNestLogger();
    const { accountId, session } = await h.newSession();
    const accounts = h.db.getRepository(TaiKhoan);
    await accounts.update(
      { taiKhoanId: accountId },
      { trangThai: 'NgungHoatDong' },
    );
    vi.setSystemTime(at(60));
    const before = await h.rowOf(session.sessionId);

    const res = await h.refresh({ cookie: session.refreshToken });

    expectErrorResponse(res, 401, 'PHIEN_HET_HIEU_LUC');
    expectCookieCleared(res);
    expect(await h.rowOf(session.sessionId)).toEqual(before);
    expect(before.thuHoiLuc).toBeNull();
    expect(logs.filter((line) => line.includes('dùng lại'))).toEqual([]);

    await accounts.update(
      { taiKhoanId: accountId },
      { trangThai: 'DangHoatDong' },
    );
    expect((await h.refresh({ cookie: session.refreshToken })).status).toBe(
      200,
    );
  });

  it('E2E-R26 (Q29) khoá tài khoản kiểu B18 (đổi trạng thái và thu hồi mọi phiên cùng giao dịch): làm mới 401, access token cũ cũng 401', async () => {
    const { accountId, session } = await h.newSession();
    const other = await h.sessions.create(accountId);
    await h.db.transaction(async (manager) => {
      await manager.update(
        TaiKhoan,
        { taiKhoanId: accountId },
        { trangThai: 'NgungHoatDong' },
      );
      await h.sessions.revokeAll(accountId, { manager });
    });

    for (const token of [session.refreshToken, other.refreshToken]) {
      const res = await h.refresh({ cookie: token });
      expectErrorResponse(res, 401, 'PHIEN_HET_HIEU_LUC');
      expectCookieCleared(res);
    }
    expectErrorResponse(
      await h.whoami(session.accessToken),
      401,
      'PHIEN_HET_HIEU_LUC',
    );
  });

  it('E2E-R27 (QM-16, Q8) quên mật khẩu thu hồi mọi phiên: mọi refresh cũ đều 401 PHIEN_HET_HIEU_LUC; phiên của tài khoản khác không bị ảnh hưởng', async () => {
    const mine = await h.newSession();
    const second = await h.sessions.create(mine.accountId);
    const stranger = await h.newSession();
    await h.sessions.revokeAll(mine.accountId);

    for (const token of [mine.session.refreshToken, second.refreshToken]) {
      expectErrorResponse(
        await h.refresh({ cookie: token }),
        401,
        'PHIEN_HET_HIEU_LUC',
      );
    }
    expect(
      (await h.refresh({ cookie: stranger.session.refreshToken })).status,
    ).toBe(200);
  });

  it('E2E-R28 (DM-07, Q8) đổi mật khẩu xoay token của phiên hiện tại: token mới làm mới được; token cũ bị coi là dùng lại và thu hồi phiên', async () => {
    const { session } = await h.newSession();
    const rotated = await h.sessions.rotateRefreshToken(session.sessionId);
    expect(rotated).not.toBeNull();

    const fresh = await h.refresh({ cookie: rotated?.refreshToken ?? '' });
    expect(fresh.status).toBe(200);

    const stale = await h.refresh({ cookie: session.refreshToken });
    expectErrorResponse(stale, 401, 'PHIEN_HET_HIEU_LUC');
    expect((await h.rowOf(session.sessionId)).thuHoiLuc).not.toBeNull();
  });
});

describe('dùng lại refresh token cũ (DN-30)', () => {
  it('E2E-R29 (DN-30) token cũ dùng lại → 401, xoá cookie, thu hồi phiên ĐÃ COMMIT (đọc bằng kết nối khác); token mới và access token của phiên đó cũng vô hiệu; phiên khác không sao; có cảnh báo kèm mã phiên và mã tài khoản', async () => {
    const logs = captureNestLogger();
    const mine = await h.newSession();
    const sibling = await h.sessions.create(mine.accountId);
    const stranger = await h.newSession();
    vi.setSystemTime(at(60));
    const ok = await h.refresh({ cookie: mine.session.refreshToken });
    const rotated = refreshTokenOf(ok);
    const accessAfterRotate = accessTokenOf(ok);
    vi.setSystemTime(at(120));

    const reuse = await h.refresh({ cookie: mine.session.refreshToken });

    expectErrorResponse(reuse, 401, 'PHIEN_HET_HIEU_LUC');
    expectCookieCleared(reuse);
    expect((await h.rowOf(mine.session.sessionId)).thuHoiLuc).toEqual(at(120));
    expectErrorResponse(
      await h.refresh({ cookie: rotated }),
      401,
      'PHIEN_HET_HIEU_LUC',
    );
    expectErrorResponse(
      await h.whoami(accessAfterRotate),
      401,
      'PHIEN_HET_HIEU_LUC',
    );
    expectErrorResponse(
      await h.whoami(mine.session.accessToken),
      401,
      'PHIEN_HET_HIEU_LUC',
    );
    expect((await h.refresh({ cookie: sibling.refreshToken })).status).toBe(
      200,
    );
    expect(
      (await h.refresh({ cookie: stranger.session.refreshToken })).status,
    ).toBe(200);
    expect(
      logs.filter((line) =>
        line.includes(
          `Phát hiện dùng lại refresh token của phiên ${mine.session.sessionId} (tài khoản ${mine.accountId})`,
        ),
      ),
    ).toHaveLength(1);
  });

  it('E2E-R30 (A8-F) đăng nhập lại cùng tài khoản để lại phiên cũ mồ côi: hai phiên độc lập, làm mới phiên này không đụng phiên kia', async () => {
    const first = await h.newSession();
    const second = await h.sessions.create(first.accountId);
    const secondBefore = await h.rowOf(second.sessionId);
    vi.setSystemTime(at(60));

    const res = await h.refresh({ cookie: first.session.refreshToken });

    expect(res.status).toBe(200);
    expect(await h.rowOf(second.sessionId)).toEqual(secondBefore);
    expect((await h.refresh({ cookie: second.refreshToken })).status).toBe(200);
    expect((await h.rowOf(first.session.sessionId)).refreshTokenBam).not.toBe(
      (await h.rowOf(second.sessionId)).refreshTokenBam,
    );
  });
});

describe('song song (H12, N4)', () => {
  it.each([2, 5])(
    'E2E-R31 (H12, N4) %i yêu cầu làm mới CÙNG một token cùng lúc (20 vòng): đúng MỘT 200, các yêu cầu còn lại 401 và xoá cookie, phiên bị thu hồi, access token của bên thắng bị guard từ chối; 0 deadlock',
    async (parties) => {
      const deadlocksBefore = await serverDeadlocks(h.db);
      for (let round = 0; round < 20; round++) {
        const { session } = await h.newSession();
        vi.setSystemTime(at(60 + round));

        const results = await Promise.all(
          Array.from({ length: parties }, () =>
            h.refresh({ cookie: session.refreshToken }),
          ),
        );

        const winners = results.filter((res) => res.status === 200);
        expect(winners, `vòng ${String(round)}`).toHaveLength(1);
        for (const loser of results.filter((res) => res.status !== 200)) {
          expectErrorResponse(loser, 401, 'PHIEN_HET_HIEU_LUC');
          expectCookieCleared(loser);
        }
        expect((await h.rowOf(session.sessionId)).thuHoiLuc).not.toBeNull();
        expectErrorResponse(
          await h.whoami(accessTokenOf(winners[0] ?? { body: {} })),
          401,
          'PHIEN_HET_HIEU_LUC',
        );
      }
      expect((await serverDeadlocks(h.db)) - deadlocksBefore).toBe(0);
    },
    120_000,
  );
});

describe('access token và làm mới (DN-35, H14)', () => {
  it('E2E-R32 (g) trong lúc làm mới đang giữ khoá hàng phiên, request dùng access token cũ KHÔNG bị chặn; sau khi xoay access cũ vẫn dùng được tới hạn 15 phút của nó (cùng sid), rồi hết', async () => {
    const { session } = await h.newSession();
    const original = h.repo.rotate.bind(h.repo);
    const entered = deferred();
    const release = deferred();
    vi.spyOn(h.repo, 'rotate').mockImplementation(async (...args) => {
      entered.resolve();
      await release.promise;
      return original(...args);
    });
    vi.setSystemTime(at(60));

    const pending = h
      .refresh({ cookie: session.refreshToken })
      .then((res) => res);
    await entered.promise; // refresh đã khoá hàng phiên và dừng trước khi ghi
    const during = await Promise.race([
      h.whoami(session.accessToken).then((res) => res.status),
      new Promise<string>((resolve) => {
        setTimeout(() => {
          resolve('BỊ CHẶN quá 5 giây');
        }, 5000);
      }),
    ]);
    expect(during).toBe(200);
    release.resolve();
    const res = await pending;

    expect(res.status).toBe(200);
    expect((await h.whoami(session.accessToken)).status).toBe(200);
    expect((await h.whoami(accessTokenOf(res))).status).toBe(200);
    vi.setSystemTime(at(15 * 60 + 1));
    expectErrorResponse(
      await h.whoami(session.accessToken),
      401,
      'TOKEN_KHONG_HOP_LE',
    );
    expect((await h.whoami(accessTokenOf(res))).status).toBe(200);
  });

  it('E2E-R33 (DN-35, H14) access token cấp lúc 7:59 có exp kẹp ở 8:00:00: dùng được tới 7:59:59, lúc 8:00:00 và 8:05 bị 401 TOKEN_KHONG_HOP_LE', async () => {
    const { session } = await h.newSession();
    await h.db
      .getRepository(PhienDangNhap)
      .update(
        { phienDangNhapId: session.sessionId },
        { hetHanLuc: at(MAX + 3600) },
      );
    vi.setSystemTime(at(MAX - 60));

    const res = await h.refresh({ cookie: session.refreshToken });
    const access = accessTokenOf(res);

    expect(res.status).toBe(200);
    expect(expOf(access)).toBe(epochOf(MAX));
    vi.setSystemTime(at(MAX - 1));
    expect((await h.whoami(access)).status).toBe(200);
    for (const elapsed of [MAX, MAX + 300]) {
      vi.setSystemTime(at(elapsed));
      expectErrorResponse(await h.whoami(access), 401, 'TOKEN_KHONG_HOP_LE');
    }
  });
});
