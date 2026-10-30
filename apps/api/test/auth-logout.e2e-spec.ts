import request from 'supertest';
import { vi } from 'vitest';
import {
  SESSION_IDLE_MS,
  SESSION_MAX_MS,
} from './../src/auth/auth.constants.js';
import { PhienDangNhap } from './../src/auth/entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from './../src/auth/entities/tai-khoan.entity.js';
import { insertTaiKhoan } from './../src/auth/entities/testing/auth-fixtures.js';
import type { IssuedSession } from './../src/auth/session/session.service.js';
import {
  sha256Hex,
  TokenService,
} from './../src/auth/session/token.service.js';
import { createTestConfigService } from './../src/auth/testing/auth-test-config.js';
import { TEST_AUTH_ENV } from './../src/auth/testing/auth-test-env.js';
import {
  expectLoggedOut,
  openLogoutHarness,
  type LogoutCall,
  type LogoutHarness,
} from './../src/auth/testing/logout-http-helpers.js';
import {
  LOGIN_PASSWORD,
  loginPasswordHash,
  sessionRowsOf,
} from './../src/auth/testing/login-int-helpers.js';
import {
  T0,
  at,
  captureNestLogger,
} from './../src/auth/testing/otp-int-helpers.js';
import {
  WEB_ORIGIN,
  expectCookieCleared,
  expectNoSetCookie,
  refreshTokenOf,
  setCookiesOf,
} from './../src/auth/testing/refresh-http-helpers.js';
import {
  deferred,
  serverDeadlocks,
  sleep,
} from './../src/auth/testing/verification-int-helpers.js';
import {
  createTestDataSource,
  readTestDbSettings,
  resetTables,
} from './../src/database/testing/test-database.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';

// Task A10 — hợp đồng HTTP của POST /auth/logout: AppModule + MySQL thật + configureApp như main.ts (bộ lọc lỗi P5, cookie-parser, logger che bí mật).
// Mã test case: DX-01…DX-07, DN-33, DN-34 (phần logout), DN-35, SE-04. Phiên "hiện tại" là phiên của cookie `refresh_token` (quyết định A10-A);
// 204 không thân ở mọi nhánh thành công; lỗi DB không bị nuốt. Mã E2E-Dnn là [đề xuất].
const IDLE = SESSION_IDLE_MS / 1000; // 1800 giây
const MAX = SESSION_MAX_MS / 1000; // 28800 giây
let h: LogoutHarness;

beforeAll(async () => {
  h = await openLogoutHarness();
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

/** Trạng thái DB của một phiên: để chứng minh một lần gọi KHÔNG ghi gì. */
const snapshot = (sessionId: string) => h.rowOf(sessionId);
const accessTokenOf = (res: { body: unknown }): string =>
  (res.body as { accessToken: string }).accessToken;
const expectDead = (res: Parameters<typeof expectErrorResponse>[0]): void => {
  expectErrorResponse(res, 401, 'PHIEN_HET_HIEU_LUC');
};

describe('đăng xuất thành công (DX-01, DX-02, DX-03, DX-05)', () => {
  it('E2E-D01 (DX-01, DX-02, DN-33, DN-35) đăng nhập thật rồi đăng xuất: 204 thân rỗng không Content-Type, no-store, cookie xoá đúng cờ; thu hồi ĐÃ COMMIT (đọc bằng kết nối khác), băm và hạn không đổi; refresh cũ 401; access cũ 401 NGAY', async () => {
    const account = await insertTaiKhoan(h.db, {
      email: 'dang.xuat@example.com',
      matKhauBam: await loginPasswordHash(),
      daXacMinhEmail: true,
      thoiDiemTao: new Date(Date.now() - 3600_000),
    });
    const loginRes = await request(h.app.getHttpServer())
      .post('/auth/login')
      .send({ email: account.email, matKhau: LOGIN_PASSWORD })
      .expect(200);
    const refreshToken = refreshTokenOf(loginRes);
    const accessToken = accessTokenOf(loginRes);
    const sessionId = String(
      (await sessionRowsOf(h.db, account.taiKhoanId))[0]?.phienDangNhapId,
    );
    expect((await h.whoami(accessToken)).status).toBe(200);
    const before = await snapshot(sessionId);
    expect(before.thuHoiLuc).toBeNull();

    vi.setSystemTime(at(60));
    const res = await h.logout({ cookie: refreshToken });

    expectLoggedOut(res);
    const other = await createTestDataSource(readTestDbSettings());
    try {
      const row = await other
        .getRepository(PhienDangNhap)
        .findOneByOrFail({ phienDangNhapId: sessionId });
      expect(row.thuHoiLuc).toEqual(at(60));
      expect(row.refreshTokenBam).toBe(before.refreshTokenBam);
      expect(row.hetHanLuc).toEqual(before.hetHanLuc);
      expect(row.taoLuc).toEqual(before.taoLuc);
    } finally {
      await other.destroy();
    }
    expectDead(await h.refresh({ cookie: refreshToken }));
    expectDead(await h.whoami(accessToken));
    expect(await sessionRowsOf(h.db, account.taiKhoanId)).toHaveLength(1);
  });

  it('E2E-D02 (DX-03) chỉ thu hồi phiên hiện tại: phiên thiết bị khác của CÙNG tài khoản và phiên của tài khoản khác nguyên vẹn, vẫn làm mới và gọi API được', async () => {
    const a = await h.newSession();
    const b = {
      accountId: a.accountId,
      session: await h.sessions.create(a.accountId),
    };
    const c = await h.newSession();
    const [beforeB, beforeC] = [
      await snapshot(b.session.sessionId),
      await snapshot(c.session.sessionId),
    ];
    vi.setSystemTime(at(60));

    expectLoggedOut(await h.logout({ cookie: a.session.refreshToken }));

    expect((await snapshot(a.session.sessionId)).thuHoiLuc).toEqual(at(60));
    expect(await snapshot(b.session.sessionId)).toEqual(beforeB);
    expect(await snapshot(c.session.sessionId)).toEqual(beforeC);
    expectDead(await h.whoami(a.session.accessToken));
    expect((await h.whoami(b.session.accessToken)).status).toBe(200);
    expect((await h.whoami(c.session.accessToken)).status).toBe(200);
    expect((await h.refresh({ cookie: b.session.refreshToken })).status).toBe(
      200,
    );
  });

  it('E2E-D03 (DX-05) đăng xuất hai lần: lần hai vẫn 204 và xoá cookie, mốc thu hồi của lần đầu (đọc từ DB) KHÔNG bị ghi đè', async () => {
    const { session } = await h.newSession();

    vi.setSystemTime(at(60));
    expectLoggedOut(await h.logout({ cookie: session.refreshToken }));
    const first = await snapshot(session.sessionId);
    vi.setSystemTime(at(600));
    expectLoggedOut(await h.logout({ cookie: session.refreshToken }));

    expect(first.thuHoiLuc).toEqual(at(60));
    expect(await snapshot(session.sessionId)).toEqual(first);
  });

  const PREPARE: [
    string,
    (s: LogoutSession) => Promise<void>,
    number,
    number | null,
  ][] = [
    [
      'phiên đã bị thu hồi từ nơi khác (kiểu quên mật khẩu, Q8)',
      async (s) => {
        vi.setSystemTime(at(10));
        await h.sessions.revokeAll(s.accountId);
      },
      100,
      10,
    ],
    [
      'quá 30 phút không hoạt động (nửa mở: đúng 30:00)',
      () => Promise.resolve(),
      IDLE,
      IDLE,
    ],
    ['quá trần 8 giờ (đúng 8:00:00)', () => Promise.resolve(), MAX, MAX],
    [
      'hàng phiên đã bị xoá khỏi DB (chữ ký token vẫn đúng)',
      async (s) => {
        await h.db
          .getRepository(PhienDangNhap)
          .delete({ phienDangNhapId: s.session.sessionId });
      },
      60,
      null,
    ],
  ];
  type LogoutSession = { accountId: string; session: IssuedSession };

  it.each(PREPARE)(
    'E2E-D04 (DX-04) %s: vẫn 204 và xoá cookie; không ghi đè mốc cũ; phiên hết hạn mà chưa thu hồi thì ghi mốc lúc đăng xuất (A10-G)',
    async (_label, prepare, nowSeconds, expectedSeconds) => {
      const mine = await h.newSession();
      const bystander = await h.newSession();
      const bystanderBefore = await snapshot(bystander.session.sessionId);
      await prepare(mine);
      vi.setSystemTime(at(nowSeconds));

      expectLoggedOut(await h.logout({ cookie: mine.session.refreshToken }));

      const rows = await h.db
        .getRepository(PhienDangNhap)
        .findBy({ phienDangNhapId: mine.session.sessionId });
      if (expectedSeconds === null) {
        expect(rows).toEqual([]); // không có hàng thì không được sinh ra hàng nào
      } else {
        expect(rows[0]?.thuHoiLuc).toEqual(at(expectedSeconds));
      }
      expect(await snapshot(bystander.session.sessionId)).toEqual(
        bystanderBefore,
      );
    },
  );

  it('E2E-D05 tài khoản đã NgungHoatDong mà phiên chưa thu hồi: vẫn 204 và phiên bị thu hồi (thu hồi luôn an toàn)', async () => {
    const { accountId, session } = await h.newSession();
    await h.db
      .getRepository(TaiKhoan)
      .update({ taiKhoanId: accountId }, { trangThai: 'NgungHoatDong' });
    vi.setSystemTime(at(60));

    expectLoggedOut(await h.logout({ cookie: session.refreshToken }));

    expect((await snapshot(session.sessionId)).thuHoiLuc).toEqual(at(60));
  });

  it('E2E-D06 đăng xuất ngay sau đăng nhập rồi đăng nhập lại: phiên mới độc lập với phiên đã đăng xuất', async () => {
    const account = await insertTaiKhoan(h.db, {
      email: 'dang.nhap.lai@example.com',
      matKhauBam: await loginPasswordHash(),
      daXacMinhEmail: true,
      thoiDiemTao: new Date(Date.now() - 3600_000),
    });
    const login = () =>
      request(h.app.getHttpServer())
        .post('/auth/login')
        .send({ email: account.email, matKhau: LOGIN_PASSWORD })
        .expect(200);
    const first = await login();

    expectLoggedOut(await h.logout({ cookie: refreshTokenOf(first) }));
    const second = await login();

    expect(refreshTokenOf(second)).not.toBe(refreshTokenOf(first));
    expect((await h.whoami(accessTokenOf(second))).status).toBe(200);
    expectDead(await h.whoami(accessTokenOf(first)));
    expect((await h.refresh({ cookie: refreshTokenOf(second) })).status).toBe(
      200,
    );
    const rows = await sessionRowsOf(h.db, account.taiKhoanId);
    expect(rows.map((row) => row.thuHoiLuc === null)).toEqual([false, true]);
  });

  it('E2E-D07 (A3-G) token CŨ đã xoay (chữ ký còn đúng) vẫn đăng xuất được phiên của nó; token mới của phiên đó cũng chết', async () => {
    const { session } = await h.newSession();
    vi.setSystemTime(at(10));
    const rotated = refreshTokenOf(
      await h.refresh({ cookie: session.refreshToken }),
    );
    vi.setSystemTime(at(20));

    expectLoggedOut(await h.logout({ cookie: session.refreshToken }));

    expect((await snapshot(session.sessionId)).thuHoiLuc).toEqual(at(20));
    expectDead(await h.refresh({ cookie: rotated }));
  });
});

describe('Origin (DX-07, DN-34)', () => {
  const BAD_ORIGINS: [string, string | null][] = [
    ['sai', 'http://evil.example.com'],
    ['khác cổng', 'http://localhost:3000'],
    ['khác giao thức', 'https://localhost:5173'],
    ['viết HOA cả chuỗi', 'HTTP://LOCALHOST:5173'],
    ['host viết HOA', 'http://LOCALHOST:5173'],
    ['"null"', 'null'],
    ['có dấu / ở cuối', `${WEB_ORIGIN}/`],
    ['vắng', null],
  ];

  it.each(BAD_ORIGINS)(
    'E2E-D10 (DX-07, DN-34) Origin %s → 403 ORIGIN_KHONG_HOP_LE: cookie hợp lệ cũng vô dụng, KHÔNG Set-Cookie (không xoá cookie), không thu hồi và không chạm DB, hàng phiên nguyên vẹn',
    async (_label, origin) => {
      const { session } = await h.newSession();
      const revokeByToken = vi.spyOn(h.sessions, 'revokeByRefreshToken');
      const revokeRow = vi.spyOn(h.repo, 'revokeIfActive');
      const before = await snapshot(session.sessionId);

      const res = await h.logout({ cookie: session.refreshToken, origin });

      expectErrorResponse(res, 403, 'ORIGIN_KHONG_HOP_LE');
      expectNoSetCookie(res);
      expect(revokeByToken).not.toHaveBeenCalled();
      expect(revokeRow).not.toHaveBeenCalled();
      expect(await snapshot(session.sessionId)).toEqual(before);
      expect(before.thuHoiLuc).toBeNull();
    },
  );

  it('E2E-D11 (DN-34) Origin đúng thì qua kể cả khi access token hết hạn hoặc rác (công khai về access token); Origin sai kèm cookie rác vẫn 403', async () => {
    const a = await h.newSession();
    vi.setSystemTime(at(16 * 60)); // access token cấp lúc T0 đã hết hạn (15 phút), cookie còn trong hạn 30 phút
    expect((await h.whoami(a.session.accessToken)).status).toBe(401);
    expectLoggedOut(
      await h.logout({
        cookie: a.session.refreshToken,
        authorization: `Bearer ${a.session.accessToken}`,
      }),
    );
    expect((await snapshot(a.session.sessionId)).thuHoiLuc).toEqual(
      at(16 * 60),
    );

    const b = await h.newSession();
    expectLoggedOut(
      await h.logout({
        cookie: b.session.refreshToken,
        authorization: 'Bearer rac.rac.rac',
      }),
    );
    expect((await snapshot(b.session.sessionId)).thuHoiLuc).not.toBeNull();

    const res = await h.logout({ cookie: 'rac', origin: 'http://evil.test' });
    expectErrorResponse(res, 403, 'ORIGIN_KHONG_HOP_LE');
  });
});

describe('nguồn token: chỉ cookie refresh_token (DX-06)', () => {
  const ELSEWHERE: [string, (s: IssuedSession) => LogoutCall][] = [
    [
      'thân JSON',
      (s) => ({
        body: { refreshToken: s.refreshToken, refresh_token: s.refreshToken },
      }),
    ],
    ['query', (s) => ({ query: { refresh_token: s.refreshToken } })],
    [
      'header Authorization là refresh token',
      (s) => ({ authorization: `Bearer ${s.refreshToken}` }),
    ],
    [
      'header Authorization là access token CÒN HẠN của chính phiên đó (A10-A: chỉ cookie)',
      (s) => ({ authorization: `Bearer ${s.accessToken}` }),
    ],
  ];
  const UNUSABLE_COOKIES: [string, (token: string) => string][] = [
    ['rỗng', () => 'refresh_token='],
    ['dài 301 ký tự', () => `refresh_token=${'a'.repeat(301)}`],
    ['cookie JSON (j:)', () => 'refresh_token=j%3A%7B%22a%22%3A1%7D'],
    ['khác tên', (token) => `token=${token}`],
  ];

  it.each(ELSEWHERE)(
    'E2E-D20 (DX-06) token chỉ ở %s (không cookie) bị bỏ qua: vẫn 204 và xoá cookie, nhưng KHÔNG thu hồi gì, access token vẫn dùng được',
    async (_label, place) => {
      const { session } = await h.newSession();
      const revokeByToken = vi.spyOn(h.sessions, 'revokeByRefreshToken');
      const before = await snapshot(session.sessionId);

      expectLoggedOut(await h.logout(place(session)));

      expect(revokeByToken).not.toHaveBeenCalled();
      expect(await snapshot(session.sessionId)).toEqual(before);
      expect((await h.whoami(session.accessToken)).status).toBe(200);
    },
  );

  it.each(UNUSABLE_COOKIES)(
    'E2E-D22 cookie %s: vẫn 204 và xoá cookie, SessionService không được gọi, phiên nguyên vẹn',
    async (_label, rawCookie) => {
      const { session } = await h.newSession();
      const revokeByToken = vi.spyOn(h.sessions, 'revokeByRefreshToken');
      const before = await snapshot(session.sessionId);

      expectLoggedOut(
        await h.logout({ rawCookie: rawCookie(session.refreshToken) }),
      );

      expect(revokeByToken).not.toHaveBeenCalled();
      expect(await snapshot(session.sessionId)).toEqual(before);
    },
  );

  it('E2E-D22b hai cookie cùng tên: cookie-parser lấy giá trị ĐẦU; token hợp lệ đứng sau token rác không bị thu hồi, đứng trước thì có', async () => {
    const first = await h.newSession();
    const before = await snapshot(first.session.sessionId);
    expectLoggedOut(
      await h.logout({
        rawCookie: `refresh_token=rac; refresh_token=${first.session.refreshToken}`,
      }),
    );
    expect(await snapshot(first.session.sessionId)).toEqual(before);

    const second = await h.newSession();
    expectLoggedOut(
      await h.logout({
        rawCookie: `refresh_token=${second.session.refreshToken}; refresh_token=rac`,
      }),
    );
    expect((await snapshot(second.session.sessionId)).thuHoiLuc).toEqual(T0);
  });

  it('E2E-D23 cookie của phiên B kèm access token của phiên A: chỉ phiên B bị thu hồi, Authorization bị bỏ qua', async () => {
    const a = await h.newSession();
    const b = await h.newSession();
    const beforeA = await snapshot(a.session.sessionId);

    expectLoggedOut(
      await h.logout({
        cookie: b.session.refreshToken,
        authorization: `Bearer ${a.session.accessToken}`,
      }),
    );

    expect((await snapshot(b.session.sessionId)).thuHoiLuc).toEqual(T0);
    expect(await snapshot(a.session.sessionId)).toEqual(beforeA);
    expect((await h.whoami(a.session.accessToken)).status).toBe(200);
    expectDead(await h.whoami(b.session.accessToken));
  });

  it('E2E-D24 (DX-06) không cookie, không token: không lỗi, vẫn 204 và xoá cookie, không chạm DB', async () => {
    const { session } = await h.newSession();
    const revokeByToken = vi.spyOn(h.sessions, 'revokeByRefreshToken');
    const revokeRow = vi.spyOn(h.repo, 'revokeIfActive');
    const before = await snapshot(session.sessionId);

    expectLoggedOut(await h.logout());

    expect(revokeByToken).not.toHaveBeenCalled();
    expect(revokeRow).not.toHaveBeenCalled();
    expect(await snapshot(session.sessionId)).toEqual(before);
  });
});

describe('token giả không làm hại phiên nào (giống DN-31)', () => {
  interface Forge {
    a: { sessionId: string; refreshToken: string; accessToken: string };
    b: { sessionId: string; refreshToken: string };
    other: TokenService;
  }
  const parts = (token: string) => token.split('.') as [string, string, string];
  const flipLast = (text: string) =>
    text.slice(0, -1) + (text.endsWith('A') ? 'B' : 'A');
  const FORGED: [string, (f: Forge) => string][] = [
    ['sửa 1 ký tự của chữ ký', ({ a }) => flipLast(a.refreshToken)],
    [
      'thay sid bằng sid của phiên khác (giữ phần ngẫu nhiên và chữ ký)',
      ({ a, b }) =>
        `${b.sessionId}.${parts(a.refreshToken)[1]}.${parts(a.refreshToken)[2]}`,
    ],
    [
      'ghép chữ ký của phiên khác vào token của mình',
      ({ a, b }) =>
        `${parts(a.refreshToken)[0]}.${parts(a.refreshToken)[1]}.${parts(b.refreshToken)[2]}`,
    ],
    ['cắt cụt 1 ký tự', ({ a }) => a.refreshToken.slice(0, -1)],
    ['dư 1 ký tự', ({ a }) => `${a.refreshToken}x`],
    ['chỉ 2 phần', ({ a }) => parts(a.refreshToken).slice(0, 2).join('.')],
    ['4 phần', ({ a }) => `${a.refreshToken}.abc`],
    [
      'ký bằng khoá khác (chữ ký đúng dạng, sai khoá)',
      ({ b, other }) => other.issueRefreshToken(b.sessionId).token,
    ],
    ['access token đưa nhầm vào chỗ refresh token', ({ a }) => a.accessToken],
    ['chuỗi rác', () => 'abc'],
    ['dài 250 ký tự', () => 'a'.repeat(250)],
  ];

  it.each(FORGED)(
    'E2E-D21 (giống DN-31) %s → vẫn 204 và xoá cookie, KHÔNG chạm DB và KHÔNG thu hồi phiên nào',
    async (_label, forge) => {
      const a = await h.newSession();
      const b = await h.newSession();
      const revokeRow = vi.spyOn(h.repo, 'revokeIfActive');
      const [beforeA, beforeB] = [
        await snapshot(a.session.sessionId),
        await snapshot(b.session.sessionId),
      ];
      const other = new TokenService(
        createTestConfigService({
          JWT_REFRESH_SECRET: TEST_AUTH_ENV.OTP_HMAC_SECRET, // một khoá khác với khoá ký refresh token
        }),
      );

      expectLoggedOut(
        await h.logout({
          cookie: forge({ a: a.session, b: b.session, other }),
        }),
      );

      expect(revokeRow).not.toHaveBeenCalled();
      expect(await snapshot(a.session.sessionId)).toEqual(beforeA);
      expect(await snapshot(b.session.sessionId)).toEqual(beforeB);
      expect(beforeA.thuHoiLuc).toBeNull();
      expect(beforeB.thuHoiLuc).toBeNull();
    },
  );
});

describe('lỗi hệ thống và yêu cầu hỏng', () => {
  it('E2E-D30 lỗi DB khi thu hồi: 500 LOI_HE_THONG có requestId, KHÔNG Set-Cookie, phiên còn sống (không báo đăng xuất giả); thử lại cùng cookie thì 204 và phiên bị thu hồi', async () => {
    const logs = captureNestLogger();
    const { session } = await h.newSession();
    const before = await snapshot(session.sessionId);
    vi.spyOn(h.repo, 'revokeIfActive').mockRejectedValueOnce(
      new Error('giả lập mất kết nối DB'),
    );
    vi.setSystemTime(at(60));

    const res = await h.logout({ cookie: session.refreshToken });

    expectErrorResponse(res, 500, 'LOI_HE_THONG');
    expectNoSetCookie(res);
    expect(await snapshot(session.sessionId)).toEqual(before);
    expect((await h.whoami(session.accessToken)).status).toBe(200);
    expect(logs.some((line) => line.includes('giả lập mất kết nối DB'))).toBe(
      true,
    );

    expectLoggedOut(await h.logout({ cookie: session.refreshToken }));
    expect((await snapshot(session.sessionId)).thuHoiLuc).toEqual(at(60));
  });

  it.each(['get', 'put', 'delete', 'patch', 'options'] as const)(
    'E2E-D32 phương thức %s → 404 KHONG_TIM_THAY, không đụng cookie hay DB',
    async (method) => {
      const { session } = await h.newSession();
      const before = await snapshot(session.sessionId);

      const res = await request(h.app.getHttpServer())
        [method]('/auth/logout')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', `refresh_token=${session.refreshToken}`);

      expectErrorResponse(res, 404, 'KHONG_TIM_THAY');
      expectNoSetCookie(res);
      expect(await snapshot(session.sessionId)).toEqual(before);
    },
  );

  it('E2E-D32b thân JSON hỏng: 400 YEU_CAU_KHONG_HOP_LE từ hạ tầng (body-parser chạy trước guard), không thu hồi, không xoá cookie; thân quá 100 KB: 413 DU_LIEU_QUA_LON', async () => {
    const { session } = await h.newSession();
    const before = await snapshot(session.sessionId);
    const send = () =>
      request(h.app.getHttpServer())
        .post('/auth/logout')
        .set('Origin', WEB_ORIGIN)
        .set('Cookie', `refresh_token=${session.refreshToken}`)
        .set('Content-Type', 'application/json');

    const broken = await send().send('{"a":');
    const huge = await send().send(JSON.stringify({ a: 'x'.repeat(150_000) }));

    expectErrorResponse(broken, 400, 'YEU_CAU_KHONG_HOP_LE');
    expectErrorResponse(huge, 413, 'DU_LIEU_QUA_LON');
    expectNoSetCookie(broken);
    expectNoSetCookie(huge);
    expect(await snapshot(session.sessionId)).toEqual(before);
  });
});

describe('nhật ký và đáp ứng không lộ bí mật', () => {
  it('E2E-D33 (SE-04) log (kể cả lời gọi Logger thô trước bộ che), stdout/stderr, thân và header của đăng nhập, đăng xuất, đăng xuất lần hai, token rác, không cookie, Origin sai và lỗi DB không chứa refresh token, băm, access token hay mật khẩu; các nhánh 204 không ghi dòng log nào', async () => {
    const output: string[] = [];
    const capture = (chunk: unknown): boolean => {
      output.push(String(chunk));
      return true;
    };
    vi.spyOn(process.stderr, 'write').mockImplementation(capture);
    vi.spyOn(process.stdout, 'write').mockImplementation(capture);
    const logs = captureNestLogger();
    const account = await insertTaiKhoan(h.db, {
      email: 'quet.bi.mat.dx@example.com',
      matKhauBam: await loginPasswordHash(),
      daXacMinhEmail: true,
      thoiDiemTao: new Date(Date.now() - 3600_000),
    });
    const loginRes = await request(h.app.getHttpServer())
      .post('/auth/login')
      .send({ email: account.email, matKhau: LOGIN_PASSWORD })
      .expect(200);
    const first = refreshTokenOf(loginRes);
    const access = accessTokenOf(loginRes);
    const second = await h.newSession();
    const logsBefore = logs.length;

    vi.setSystemTime(at(60));
    const ok = await h.logout({
      cookie: first,
      authorization: `Bearer ${access}`,
    });
    const again = await h.logout({ cookie: first });
    const junk = await h.logout({ cookie: 'rac.rac.rac' });
    const none = await h.logout();
    const logsAfter204 = logs.slice(logsBefore);
    const badOrigin = await h.logout({
      cookie: second.session.refreshToken,
      origin: 'http://evil.test',
    });
    vi.spyOn(h.repo, 'revokeIfActive').mockRejectedValueOnce(
      new Error('giả lập mất kết nối DB'),
    );
    const failed = await h.logout({ cookie: second.session.refreshToken });

    const secrets = [
      first,
      sha256Hex(first),
      access,
      second.session.refreshToken,
      sha256Hex(second.session.refreshToken),
      second.session.accessToken,
      LOGIN_PASSWORD,
      account.matKhauBam ?? '',
      account.email,
    ];
    expect(logsAfter204, 'nhánh 204 không được ghi log').toEqual([]);
    const text = [...logs, ...output].join('\n');
    for (const secret of secrets) {
      expect(text, `log lộ ${secret.slice(0, 8)}…`).not.toContain(secret);
    }
    expect(text).not.toContain('$argon2id$');
    for (const res of [ok, again, junk, none, badOrigin, failed]) {
      const wire = JSON.stringify({
        text: res.text,
        body: res.body,
        headers: res.headers,
      });
      for (const secret of secrets) expect(wire).not.toContain(secret);
    }
    for (const res of [ok, again, junk, none]) expectLoggedOut(res);
    expectNoSetCookie(badOrigin);
    expectNoSetCookie(failed);
    // Set-Cookie của nhánh thành công chỉ là lệnh xoá (giá trị rỗng)
    expect(setCookiesOf(ok)[0]).toMatch(/^refresh_token=;/);
    expectCookieCleared(ok);
  });
});

describe('song song (DX-05, đua với làm mới)', () => {
  const ROUNDS = Number(process.env['LOGOUT_RACE_ROUNDS'] ?? 20);

  it.each([
    [1, 1],
    [2, 2],
  ])(
    'E2E-D40 đua đăng xuất × làm mới CÙNG một phiên (%i đăng xuất + %i làm mới, 20 vòng; LOGOUT_RACE_ROUNDS chỉnh số vòng): mọi đăng xuất 204; phiên LUÔN kết thúc ở trạng thái đã thu hồi với mốc không đổi nữa; token mới (nếu có làm mới thắng) và access token mới đều vô hiệu; không 500; 0 deadlock',
    async (logouts, refreshes) => {
      const deadlocksBefore = await serverDeadlocks(h.db);
      let refreshWins = 0;
      for (let round = 0; round < ROUNDS; round++) {
        const { session } = await h.newSession();
        vi.setSystemTime(at(60 + round));
        const where = `vòng ${String(round)}`;

        const calls = [
          ...Array.from({ length: logouts }, () =>
            h.logout({ cookie: session.refreshToken }),
          ),
          ...Array.from({ length: refreshes }, () =>
            h.refresh({ cookie: session.refreshToken }),
          ),
        ];
        const results = await Promise.all(calls);

        for (const res of results.slice(0, logouts)) expectLoggedOut(res);
        const refreshed = results.slice(logouts);
        for (const res of refreshed) {
          if (res.status !== 200) expectDead(res); // 401 (phiên đã chết hoặc dùng lại), không bao giờ 500
        }
        const winners = refreshed.filter((res) => res.status === 200);
        expect(winners.length, where).toBeLessThanOrEqual(1);
        refreshWins += winners.length;
        const settled = await snapshot(session.sessionId);
        expect(settled.thuHoiLuc, where).not.toBeNull();
        expectDead(await h.whoami(session.accessToken));
        for (const winner of winners) {
          expectDead(await h.refresh({ cookie: refreshTokenOf(winner) }));
          expectDead(await h.whoami(accessTokenOf(winner)));
        }
        // mốc thu hồi và băm đã chốt, các lần thử sau không đổi gì
        expect(await snapshot(session.sessionId), where).toEqual(settled);
      }
      const deadlocks = (await serverDeadlocks(h.db)) - deadlocksBefore;
      console.info(
        `[E2E-D40] ${String(logouts)} đăng xuất + ${String(refreshes)} làm mới: ${String(refreshWins)}/${String(ROUNDS)} vòng làm mới thắng khoá hàng (nhận 200), mọi vòng phiên kết thúc đã thu hồi; deadlock phía máy chủ = ${String(deadlocks)}`,
      );
      expect(deadlocks).toBe(0);
    },
    120_000,
  );

  it.each([3, 5])(
    'E2E-D41 (DX-05) %i đăng xuất CÙNG một phiên cùng lúc (20 vòng): tất cả 204, đúng MỘT lần thu hồi thật (revokeIfActive trả true một lần), mốc thu hồi ghi một lần; 0 deadlock',
    async (parties) => {
      const deadlocksBefore = await serverDeadlocks(h.db);
      const revokeRow = vi.spyOn(h.repo, 'revokeIfActive');
      for (let round = 0; round < ROUNDS; round++) {
        const { session } = await h.newSession();
        vi.setSystemTime(at(60 + round));
        revokeRow.mockClear();

        const results = await Promise.all(
          Array.from({ length: parties }, () =>
            h.logout({ cookie: session.refreshToken }),
          ),
        );

        for (const res of results) expectLoggedOut(res);
        const outcomes = await Promise.all(
          revokeRow.mock.results.map(
            (result) => result.value as Promise<boolean>,
          ),
        );
        expect(outcomes, `vòng ${String(round)}`).toHaveLength(parties);
        expect(outcomes.filter(Boolean), `vòng ${String(round)}`).toHaveLength(
          1,
        );
        expect((await snapshot(session.sessionId)).thuHoiLuc).toEqual(
          at(60 + round),
        );
      }
      expect((await serverDeadlocks(h.db)) - deadlocksBefore).toBe(0);
    },
    120_000,
  );

  it('E2E-D42 (đua có điểm dừng) làm mới đang giữ khoá hàng phiên (rotate bị kéo dài 250 ms TRONG giao dịch): đăng xuất CHỜ khoá rồi vẫn 204; làm mới nhận 200 nhưng phiên kết thúc đã thu hồi, băm vừa xoay được giữ, token và access token mới đều vô hiệu', async () => {
    const { session } = await h.newSession();
    const original = h.repo.rotate.bind(h.repo);
    const entered = deferred();
    vi.spyOn(h.repo, 'rotate').mockImplementation(async (...args) => {
      entered.resolve();
      await sleep(250);
      return original(...args);
    });
    vi.setSystemTime(at(60));

    const refreshing = h.refresh({ cookie: session.refreshToken }).then();
    await entered.promise; // làm mới đã khoá hàng và đang giữ khoá
    const started = performance.now();
    const logout = await h.logout({ cookie: session.refreshToken });
    const waited = Math.round(performance.now() - started);
    const refreshed = await refreshing;
    console.info(
      `[E2E-D42] đăng xuất chờ ${String(waited)} ms trong lúc làm mới giữ khoá hàng; làm mới = ${String(refreshed.status)}, đăng xuất = ${String(logout.status)}`,
    );

    expect(waited).toBeGreaterThan(150);
    expect(refreshed.status).toBe(200);
    expectLoggedOut(logout);
    const row = await snapshot(session.sessionId);
    expect(row.thuHoiLuc).toEqual(at(60));
    expect(row.refreshTokenBam).toBe(sha256Hex(refreshTokenOf(refreshed)));
    expectDead(await h.refresh({ cookie: refreshTokenOf(refreshed) }));
    expectDead(await h.whoami(accessTokenOf(refreshed)));
    expectDead(await h.whoami(session.accessToken));
  });
});
