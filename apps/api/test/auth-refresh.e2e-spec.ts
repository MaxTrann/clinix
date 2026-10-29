import request from 'supertest';
import { vi } from 'vitest';
import { PhienDangNhap } from './../src/auth/entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from './../src/auth/entities/tai-khoan.entity.js';
import { insertTaiKhoan } from './../src/auth/entities/testing/auth-fixtures.js';
import {
  sha256Hex,
  TokenService,
} from './../src/auth/session/token.service.js';
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
import { createTestConfigService } from './../src/auth/testing/auth-test-config.js';
import { TEST_AUTH_ENV } from './../src/auth/testing/auth-test-env.js';
import {
  WEB_ORIGIN,
  expectCookieCleared,
  expectNoSetCookie,
  flagsOf,
  openRefreshHarness,
  refreshTokenOf,
  setCookiesOf,
  type RefreshCall,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';

// Task A9 — hợp đồng HTTP của POST /auth/refresh: AppModule + MySQL thật + configureApp như main.ts (bộ lọc lỗi P5, cookie-parser, logger che bí mật).
// Mã test case: DN-27, DN-29, DN-31, DN-33, DN-34 (phần refresh), SE-04. Vòng đời phiên (biên thời gian, dùng lại, song song, access token) ở
// auth-refresh-session.e2e-spec.ts. Mã E2E-Rnn là [đề xuất].
const IDLE = 30 * 60;
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

/** Trạng thái DB của một phiên: để chứng minh một lần gọi bị từ chối KHÔNG ghi gì. */
const snapshot = (sessionId: string) => h.rowOf(sessionId);

describe('làm mới thành công', () => {
  it('E2E-R01 (DN-27, DN-33) đăng nhập rồi làm mới: 200 { accessToken }, cookie mới cùng cờ với cookie đăng nhập và Expires = +30 phút, no-store, refresh khác cũ, DB đổi băm và giữ tao_luc', async () => {
    const account = await insertTaiKhoan(h.db, {
      email: 'lam.moi@example.com',
      matKhauBam: await loginPasswordHash(),
      daXacMinhEmail: true,
      thoiDiemTao: new Date(Date.now() - 3600_000),
    });
    const loginRes = await request(h.app.getHttpServer())
      .post('/auth/login')
      .send({ email: account.email, matKhau: LOGIN_PASSWORD })
      .expect(200);
    const first = refreshTokenOf(loginRes);
    const sessionId = String(
      (await sessionRowsOf(h.db, account.taiKhoanId))[0]?.phienDangNhapId,
    );

    vi.setSystemTime(at(60));
    const res = await h.refresh({ cookie: first });

    expect(res.status).toBe(200);
    expect(Object.keys(res.body as object)).toEqual(['accessToken']);
    expect(res.headers['cache-control']).toBe('no-store');
    const second = refreshTokenOf(res);
    expect(second).not.toBe(first);
    const cookie = setCookiesOf(res)[0] ?? '';
    expect(cookie).toContain(`Expires=${at(60 + IDLE).toUTCString()}`);
    expect(cookie).not.toContain('Max-Age');
    expect(flagsOf(cookie)).toEqual(flagsOf(setCookiesOf(loginRes)[0] ?? ''));
    expect(flagsOf(cookie)).toEqual(
      ['HttpOnly', 'Path=/api/auth', 'SameSite=Lax', 'Secure'].sort(),
    );

    const row = await snapshot(sessionId);
    expect(row.refreshTokenBam).toBe(sha256Hex(second));
    expect(row.refreshTokenBam).not.toBe(sha256Hex(first));
    expect(row.hetHanLuc).toEqual(at(60 + IDLE));
    expect(row.taoLuc).toEqual(T0);
    expect(row.thuHoiLuc).toBeNull();
    expect(await sessionRowsOf(h.db, account.taiKhoanId)).toHaveLength(1);

    // access token mới mang đúng tài khoản và phiên cũ
    const accessToken = (res.body as { accessToken: string }).accessToken;
    expect(await h.tokens.verifyAccessToken(accessToken)).toEqual({
      accountId: account.taiKhoanId,
      sessionId,
    });
    const text = JSON.stringify(res.body);
    for (const secret of [first, second, sha256Hex(second), account.email]) {
      expect(text).not.toContain(secret);
    }
  });

  it('E2E-R02 (DN-29) DB chỉ lưu SHA-256 của refresh token, token có dạng sid.ngẫu nhiên.chữ ký, bản rõ không nằm ở bất kỳ cột nào', async () => {
    const { session } = await h.newSession();

    const res = await h.refresh({ cookie: session.refreshToken });
    const second = refreshTokenOf(res);

    expect(second).toMatch(
      new RegExp(
        `^${session.sessionId}\\.[A-Za-z0-9_-]{43}\\.[A-Za-z0-9_-]{43}$`,
      ),
    );
    const row = await snapshot(session.sessionId);
    expect(row.refreshTokenBam).toMatch(/^[0-9a-f]{64}$/);
    expect(row.refreshTokenBam).toBe(sha256Hex(second));
    const dump = JSON.stringify(
      await h.db.query('SELECT * FROM phien_dang_nhap'),
    );
    expect(dump).not.toContain(second);
    expect(dump).not.toContain(session.refreshToken);
  });
});

describe('Origin (DN-34)', () => {
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
    'E2E-R03 (DN-34) Origin %s → 403 ORIGIN_KHONG_HOP_LE: cookie hợp lệ cũng vô dụng, không Set-Cookie, SessionService.refresh không được gọi, DB nguyên vẹn',
    async (_label, origin) => {
      const { session } = await h.newSession();
      const refresh = vi.spyOn(h.sessions, 'refresh');
      const before = await snapshot(session.sessionId);

      const res = await h.refresh({ cookie: session.refreshToken, origin });

      expectErrorResponse(res, 403, 'ORIGIN_KHONG_HOP_LE');
      expectNoSetCookie(res);
      expect(refresh).not.toHaveBeenCalled();
      expect(await snapshot(session.sessionId)).toEqual(before);
    },
  );

  it('E2E-R04 (DN-34) Origin đúng WEB_ORIGIN thì qua; Origin sai kèm cookie rác vẫn 403 (Origin kiểm trước cookie)', async () => {
    const { session } = await h.newSession();
    expect(
      (await h.refresh({ cookie: session.refreshToken, origin: WEB_ORIGIN }))
        .status,
    ).toBe(200);

    const res = await h.refresh({ cookie: 'rac', origin: 'http://evil.test' });
    expectErrorResponse(res, 403, 'ORIGIN_KHONG_HOP_LE');
  });
});

describe('nguồn token: chỉ cookie refresh_token', () => {
  const UNUSABLE_COOKIES: [string, (token: string) => string | undefined][] = [
    ['vắng', () => undefined],
    ['rỗng', () => 'refresh_token='],
    ['dài 301 ký tự', () => `refresh_token=${'a'.repeat(301)}`],
    ['cookie JSON (j:)', () => 'refresh_token=j%3A%7B%22a%22%3A1%7D'],
    ['khác tên', (token) => `token=${token}`],
  ];
  const ELSEWHERE: [string, (token: string) => RefreshCall][] = [
    ['thân JSON', (t) => ({ body: { refreshToken: t, refresh_token: t } })],
    ['query', (t) => ({ query: { refresh_token: t } })],
    ['header Authorization: Bearer', (t) => ({ authorization: `Bearer ${t}` })],
  ];

  it.each(UNUSABLE_COOKIES)(
    'E2E-R05 cookie %s → 401 CHUA_DANG_NHAP: không Set-Cookie, SessionService.refresh không được gọi, DB nguyên vẹn, vẫn no-store',
    async (_label, rawCookie) => {
      const { session } = await h.newSession();
      const refresh = vi.spyOn(h.sessions, 'refresh');
      const before = await snapshot(session.sessionId);

      const res = await h.refresh({
        rawCookie: rawCookie(session.refreshToken),
      });

      expectErrorResponse(res, 401, 'CHUA_DANG_NHAP');
      expectNoSetCookie(res);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(refresh).not.toHaveBeenCalled();
      expect(await snapshot(session.sessionId)).toEqual(before);
    },
  );

  it.each(ELSEWHERE)(
    'E2E-R06 token chỉ ở %s (không cookie) bị bỏ qua → 401 CHUA_DANG_NHAP, DB nguyên vẹn',
    async (_label, place) => {
      const { session } = await h.newSession();
      const before = await snapshot(session.sessionId);

      const res = await h.refresh(place(session.refreshToken));

      expectErrorResponse(res, 401, 'CHUA_DANG_NHAP');
      expectNoSetCookie(res);
      expect(await snapshot(session.sessionId)).toEqual(before);
    },
  );

  it('E2E-R07 hai cookie cùng tên: cookie-parser lấy giá trị ĐẦU; token hợp lệ đứng sau token rác bị bỏ qua', async () => {
    const { session } = await h.newSession();

    const first = await h.refresh({
      rawCookie: `refresh_token=${session.refreshToken}; refresh_token=rac`,
    });
    expect(first.status).toBe(200);

    const second = await h.newSession();
    const before = await snapshot(second.session.sessionId);
    const res = await h.refresh({
      rawCookie: `refresh_token=rac; refresh_token=${second.session.refreshToken}`,
    });
    expectErrorResponse(res, 401, 'PHIEN_HET_HIEU_LUC');
    expectCookieCleared(res);
    expect(await snapshot(second.session.sessionId)).toEqual(before);
  });

  it('E2E-R08 header Authorization không ảnh hưởng: access token hết hạn hoặc rác kèm cookie hợp lệ vẫn làm mới được; cookie của phiên B kèm access token của phiên A chỉ xoay phiên B', async () => {
    const a = await h.newSession();
    const b = await h.newSession();
    const beforeA = await snapshot(a.session.sessionId);

    vi.setSystemTime(at(16 * 60)); // access token cấp lúc T0 đã hết hạn (15 phút), cookie còn trong hạn 30 phút
    expect((await h.whoami(a.session.accessToken)).status).toBe(401);
    const garbage = await h.refresh({
      cookie: b.session.refreshToken,
      authorization: 'Bearer rac.rac.rac',
    });
    expect(garbage.status).toBe(200);

    const c = await h.newSession();
    const mixed = await h.refresh({
      cookie: c.session.refreshToken,
      authorization: `Bearer ${a.session.accessToken}`,
    });
    expect(mixed.status).toBe(200);
    expect(
      await h.tokens.verifyAccessToken(
        (mixed.body as { accessToken: string }).accessToken,
      ),
    ).toEqual({ accountId: c.accountId, sessionId: c.session.sessionId });
    expect(await snapshot(a.session.sessionId)).toEqual(beforeA);
  });
});

describe('token giả không làm hại phiên nào (DN-31)', () => {
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
    'E2E-R09 (DN-31) %s → 401 PHIEN_HET_HIEU_LUC, xoá cookie, KHÔNG chạm DB và KHÔNG thu hồi phiên nào',
    async (_label, forge) => {
      const a = await h.newSession();
      const b = await h.newSession();
      const lock = vi.spyOn(h.repo, 'findByIdForUpdate');
      const [beforeA, beforeB] = [
        await snapshot(a.session.sessionId),
        await snapshot(b.session.sessionId),
      ];
      const other = new TokenService(
        createTestConfigService({
          JWT_REFRESH_SECRET: TEST_AUTH_ENV.OTP_HMAC_SECRET, // một khoá khác với khoá ký refresh token
        }),
      );

      const res = await h.refresh({
        cookie: forge({ a: a.session, b: b.session, other }),
      });

      expectErrorResponse(res, 401, 'PHIEN_HET_HIEU_LUC');
      expectCookieCleared(res);
      expect(lock).not.toHaveBeenCalled();
      expect(await snapshot(a.session.sessionId)).toEqual(beforeA);
      expect(await snapshot(b.session.sessionId)).toEqual(beforeB);
      expect(beforeA.thuHoiLuc).toBeNull();
      expect(beforeB.thuHoiLuc).toBeNull();
    },
  );

  it('E2E-R10 chữ ký đúng nhưng phiên không còn trong DB → 401 PHIEN_HET_HIEU_LUC, xoá cookie, không ghi gì', async () => {
    const { session } = await h.newSession();
    const ghost = h.tokens.issueRefreshToken('999999').token;
    const lock = vi.spyOn(h.repo, 'findByIdForUpdate');
    const rowsBefore = await h.db.getRepository(PhienDangNhap).count();

    const res = await h.refresh({ cookie: ghost });

    expectErrorResponse(res, 401, 'PHIEN_HET_HIEU_LUC');
    expectCookieCleared(res);
    expect(lock).toHaveBeenCalledTimes(1);
    expect(await h.db.getRepository(PhienDangNhap).count()).toBe(rowsBefore);
    expect((await snapshot(session.sessionId)).thuHoiLuc).toBeNull();
  });
});

describe('thân lỗi không để lộ lý do', () => {
  it('E2E-R11 mọi lý do làm mới thất bại (rác, không có phiên, đã thu hồi, dùng lại, quá 30 phút, tài khoản ngưng) cùng một thân 401 PHIEN_HET_HIEU_LUC và cùng cách xoá cookie', async () => {
    const ghost = h.tokens.issueRefreshToken('999999').token;
    const revoked = await h.newSession();
    await h.sessions.revoke(revoked.session.sessionId);
    const reused = await h.newSession();
    expect(
      (await h.refresh({ cookie: reused.session.refreshToken })).status,
    ).toBe(200);
    const suspended = await h.newSession();
    await h.db
      .getRepository(TaiKhoan)
      .update(
        { taiKhoanId: suspended.accountId },
        { trangThai: 'NgungHoatDong' },
      );
    const idle = await h.newSession();

    const responses = [
      await h.refresh({ cookie: 'rac' }),
      await h.refresh({ cookie: ghost }),
      await h.refresh({ cookie: revoked.session.refreshToken }),
      await h.refresh({ cookie: reused.session.refreshToken }),
      await h.refresh({ cookie: suspended.session.refreshToken }),
    ];
    vi.setSystemTime(at(IDLE));
    responses.push(await h.refresh({ cookie: idle.session.refreshToken }));

    expect(responses).toHaveLength(6);
    const bodies = responses.map((res) => res.body as object);
    for (const [index, res] of responses.entries()) {
      expectErrorResponse(res, 401, 'PHIEN_HET_HIEU_LUC');
      expectCookieCleared(res);
      expect(bodies[index], `lý do #${String(index)}`).toEqual(bodies[0]);
    }
  });

  it('E2E-R12 sai phương thức (GET) → 404 KHONG_TIM_THAY, không đụng cookie hay DB', async () => {
    const { session } = await h.newSession();
    const before = await snapshot(session.sessionId);

    const res = await request(h.app.getHttpServer())
      .get('/auth/refresh')
      .set('Origin', WEB_ORIGIN)
      .set('Cookie', `refresh_token=${session.refreshToken}`);

    expectErrorResponse(res, 404, 'KHONG_TIM_THAY');
    expectNoSetCookie(res);
    expect(await snapshot(session.sessionId)).toEqual(before);
  });
});

describe('lỗi hệ thống', () => {
  it('E2E-R13 lỗi DB giữa lúc xoay: 500 LOI_HE_THONG có requestId, KHÔNG đặt và KHÔNG xoá cookie, giao dịch hoàn tác nên cùng token thử lại được', async () => {
    const logs = captureNestLogger();
    const { session } = await h.newSession();
    const before = await snapshot(session.sessionId);
    vi.spyOn(h.repo, 'rotate').mockRejectedValueOnce(
      new Error('giả lập mất kết nối DB'),
    );
    vi.setSystemTime(at(60));

    const res = await h.refresh({ cookie: session.refreshToken });

    expectErrorResponse(res, 500, 'LOI_HE_THONG');
    expectNoSetCookie(res);
    expect(await snapshot(session.sessionId)).toEqual(before);
    expect(logs.some((line) => line.includes('giả lập mất kết nối DB'))).toBe(
      true,
    );

    const retry = await h.refresh({ cookie: session.refreshToken });
    expect(retry.status).toBe(200);
  });
});

describe('nhật ký và đáp ứng không lộ bí mật', () => {
  it('E2E-R14 (SE-04) log (kể cả lời gọi Logger thô trước bộ che), stdout/stderr, thân và Set-Cookie của đăng nhập, làm mới, dùng lại, token rác và không cookie không chứa refresh token, băm, access token hay mật khẩu', async () => {
    const output: string[] = [];
    const capture = (chunk: unknown): boolean => {
      output.push(String(chunk));
      return true;
    };
    vi.spyOn(process.stderr, 'write').mockImplementation(capture);
    vi.spyOn(process.stdout, 'write').mockImplementation(capture);
    const logs = captureNestLogger();
    const account = await insertTaiKhoan(h.db, {
      email: 'quet.bi.mat@example.com',
      matKhauBam: await loginPasswordHash(),
      daXacMinhEmail: true,
      thoiDiemTao: new Date(Date.now() - 3600_000),
    });

    const loginRes = await request(h.app.getHttpServer())
      .post('/auth/login')
      .send({ email: account.email, matKhau: LOGIN_PASSWORD })
      .expect(200);
    const first = refreshTokenOf(loginRes);
    vi.setSystemTime(at(60));
    const ok = await h.refresh({ cookie: first });
    const second = refreshTokenOf(ok);
    vi.setSystemTime(at(120));
    const reuse = await h.refresh({ cookie: first }); // dùng lại: ghi WARN và thu hồi phiên
    const junk = await h.refresh({ cookie: 'rac.rac.rac' });
    const none = await h.refresh({});
    const badOrigin = await h.refresh({
      cookie: second,
      origin: 'http://evil.test',
    });

    const sessionId = String(
      (await sessionRowsOf(h.db, account.taiKhoanId))[0]?.phienDangNhapId,
    );
    const accessTokens = [
      (loginRes.body as { accessToken: string }).accessToken,
      (ok.body as { accessToken: string }).accessToken,
    ];
    const secrets = [
      first,
      second,
      sha256Hex(first),
      sha256Hex(second),
      ...accessTokens,
      LOGIN_PASSWORD,
      account.matKhauBam ?? '',
      account.email,
    ];
    const text = [...logs, ...output].join('\n');
    for (const secret of secrets) {
      expect(text, `log lộ ${secret.slice(0, 8)}…`).not.toContain(secret);
    }
    expect(text).not.toContain('$argon2id$');

    // thân và header của mọi phản hồi LỖI sạch; Set-Cookie của nhánh lỗi chỉ là lệnh xoá
    for (const res of [reuse, junk, none, badOrigin]) {
      const wire = JSON.stringify({ body: res.body, headers: res.headers });
      for (const secret of secrets) expect(wire).not.toContain(secret);
    }
    expectCookieCleared(reuse);
    expectCookieCleared(junk);
    expectNoSetCookie(none);
    expectNoSetCookie(badOrigin);
    // làm mới thành công: refresh mới chỉ ở Set-Cookie, không ở thân
    expect(JSON.stringify(ok.body)).not.toContain(second);
    expect(setCookiesOf(ok)[0]).toContain(`refresh_token=${second}`);
    // dòng cảnh báo dùng lại có mã phiên và mã tài khoản (quyết định A9-F)
    expect(
      logs.some((line) =>
        line.includes(
          `Phát hiện dùng lại refresh token của phiên ${sessionId} (tài khoản ${account.taiKhoanId})`,
        ),
      ),
    ).toBe(true);
  });
});
