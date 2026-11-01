import { vi } from 'vitest';
import { TaiKhoan } from './../src/auth/entities/tai-khoan.entity.js';
import {
  CHANGE_PATH,
  changeBody,
  hashOf,
  openChangePasswordHarness,
  type ChangePasswordHarness,
} from './../src/auth/testing/change-password-helpers.js';
import {
  LOGIN_PASSWORD,
  WRONG_PASSWORD,
  loginPasswordHash,
} from './../src/auth/testing/login-int-helpers.js';
import { T0, at } from './../src/auth/testing/otp-int-helpers.js';
import {
  expectNoSetCookie,
  flagsOf,
  refreshTokenOf,
  setCookiesOf,
} from './../src/auth/testing/refresh-http-helpers.js';
import { NEW_PASSWORD } from './../src/auth/testing/reset-password-int-helpers.js';
import { TEST_AUTH_ENV } from './../src/auth/testing/auth-test-env.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import request from 'supertest';

// Task A13 — POST /auth/change-password qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts. Mã test case: DM-01, DM-03, DM-04, DM-05, DM-06, DM-07, DM-09
// (thân, Set-Cookie, stdout/stderr), SE-04. Mã E2E-DMnn là [đề xuất].
let h: ChangePasswordHarness;
let output: string[];

beforeAll(async () => {
  h = await openChangePasswordHarness();
});

beforeEach(async () => {
  await resetTables(h.db);
  h.mail.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  output = [];
  const capture = (chunk: unknown): boolean => {
    output.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stderr, 'write').mockImplementation(capture);
  vi.spyOn(process.stdout, 'write').mockImplementation(capture);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await h.close();
});

const accountWithSession = async () =>
  h.newSession({ matKhauBam: await loginPasswordHash() });

describe('POST /auth/change-password', () => {
  it('E2E-DM01 DM-01 DM-07 thành công: 200 { daDoiMatKhau: true }, no-store, MỘT Set-Cookie refresh mới cùng cờ với làm mới; access token cũ dùng tiếp; cookie mới làm mới được; phiên kia chết NGAY; không cần Origin hay cookie', async () => {
    const { accountId, session } = await accountWithSession();
    const other = await h.sessions.create(accountId);

    const res = await h.change({ accessToken: session.accessToken });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ daDoiMatKhau: true });
    expect(res.headers['cache-control']).toBe('no-store');
    const token = refreshTokenOf(res);
    expect(token).not.toBe(session.refreshToken);
    expect((await h.whoami(session.accessToken)).status).toBe(200);
    expectErrorResponse(
      await h.whoami(other.accessToken),
      401,
      'PHIEN_HET_HIEU_LUC',
    );
    const refreshed = await h.refresh({ cookie: token });
    expect(refreshed.status).toBe(200);
    expect(flagsOf(setCookiesOf(res)[0] ?? '')).toEqual(
      flagsOf(setCookiesOf(refreshed)[0] ?? ''),
    );
  });

  it('E2E-DM02 DM-07 refresh token CŨ của phiên hiện tại: 401 và phiên bị thu hồi', async () => {
    const { session } = await accountWithSession();
    const res = await h.change({ accessToken: session.accessToken });
    expect(res.status).toBe(200);

    expectErrorResponse(
      await h.refresh({ cookie: session.refreshToken }),
      401,
      'PHIEN_HET_HIEU_LUC',
    );
    expectErrorResponse(
      await h.whoami(session.accessToken),
      401,
      'PHIEN_HET_HIEU_LUC',
    );
  });

  it('E2E-DM03 DM-03 mật khẩu cũ sai: 400 MAT_KHAU_CU_SAI (KHÔNG phải 401 để FE không đi làm mới), no-store, không Set-Cookie, mật khẩu và phiên giữ nguyên', async () => {
    const { accountId, session } = await accountWithSession();
    const before = await hashOf(h.db, accountId);

    const res = await h.change({
      accessToken: session.accessToken,
      body: changeBody({ matKhauCu: WRONG_PASSWORD }),
    });

    expectErrorResponse(res, 400, 'MAT_KHAU_CU_SAI');
    expect(res.headers['cache-control']).toBe('no-store');
    expectNoSetCookie(res);
    expect(await hashOf(h.db, accountId)).toBe(before);
    expect((await h.refresh({ cookie: session.refreshToken })).status).toBe(
      200,
    );
  });

  it.each([
    [
      'mật khẩu mới yếu',
      { matKhauMoi: 'yeu', xacNhan: 'yeu' },
      'matKhauMoi',
      'MAT_KHAU_KHONG_HOP_LE',
    ],
    [
      'xác nhận không khớp',
      { xacNhan: 'Khac-Han-1!' },
      'xacNhan',
      'XAC_NHAN_KHONG_KHOP',
    ],
    [
      'thiếu mật khẩu cũ',
      { matKhauCu: undefined },
      'matKhauCu',
      'MAT_KHAU_KHONG_HOP_LE',
    ],
  ])(
    'E2E-DM04 DM-04 %s: 400 kèm lỗi đúng ô, mật khẩu không đổi',
    async (_label, overrides, truong, ma) => {
      const { accountId, session } = await accountWithSession();
      const before = await hashOf(h.db, accountId);

      const res = await h.change({
        accessToken: session.accessToken,
        body: changeBody(overrides),
      });

      expect(expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE').loi).toEqual(
        [{ truong, ma }],
      );
      expectNoSetCookie(res);
      expect(await hashOf(h.db, accountId)).toBe(before);
    },
  );

  it('E2E-DM05 DM-05 không có token 401 CHUA_DANG_NHAP; token rác 401 TOKEN_KHONG_HOP_LE; token hết hạn 401; phiên đã thu hồi 401 PHIEN_HET_HIEU_LUC; mật khẩu không đổi', async () => {
    const { accountId, session } = await accountWithSession();
    const before = await hashOf(h.db, accountId);

    expectErrorResponse(await h.change({}), 401, 'CHUA_DANG_NHAP');
    expectErrorResponse(
      await h.change({ accessToken: 'khong.phai.jwt' }),
      401,
      'TOKEN_KHONG_HOP_LE',
    );
    const revoked = await accountWithSession();
    await h.sessions.revoke(revoked.session.sessionId);
    expectErrorResponse(
      await h.change({ accessToken: revoked.session.accessToken }),
      401,
      'PHIEN_HET_HIEU_LUC',
    );
    vi.setSystemTime(at(15 * 60));
    expect((await h.change({ accessToken: session.accessToken })).status).toBe(
      401,
    );
    expect(await hashOf(h.db, accountId)).toBe(before);
  });

  it.each([['taiKhoanId'], ['tai_khoan_id']])(
    'E2E-DM06 DM-06 thân cố truyền %s của người khác: 400 TRUONG_KHONG_DUOC_PHEP, KHÔNG đổi tài khoản nào',
    async (field) => {
      const { accountId, session } = await accountWithSession();
      const victim = await accountWithSession();
      const [mine, theirs] = [
        await hashOf(h.db, accountId),
        await hashOf(h.db, victim.accountId),
      ];

      const res = await h.change({
        accessToken: session.accessToken,
        body: changeBody({ [field]: victim.accountId }),
      });

      expect(expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE').loi).toEqual(
        [{ truong: field, ma: 'TRUONG_KHONG_DUOC_PHEP' }],
      );
      expect(await hashOf(h.db, accountId)).toBe(mine);
      expect(await hashOf(h.db, victim.accountId)).toBe(theirs);
    },
  );

  it('E2E-DM07 đổi xong đăng nhập bằng mật khẩu mới được qua HTTP, mật khẩu cũ 401', async () => {
    const { accountId, session } = await accountWithSession();
    const { email } = await h.db
      .getRepository(TaiKhoan)
      .findOneByOrFail({ taiKhoanId: accountId });
    await h.change({ accessToken: session.accessToken });
    const login = (matKhau: string) =>
      request(h.app.getHttpServer())
        .post('/auth/login')
        .set('Origin', TEST_AUTH_ENV.WEB_ORIGIN)
        .send({ email, matKhau });

    expect((await login(NEW_PASSWORD)).status).toBe(200);
    expectErrorResponse(await login(LOGIN_PASSWORD), 401, 'DANG_NHAP_SAI');
  });

  it('E2E-DM08 lỗi DB khi thu hồi phiên khác: 500 LOI_HE_THONG, không Set-Cookie, mật khẩu và băm refresh như trước, thử lại được', async () => {
    const { accountId, session } = await accountWithSession();
    await h.sessions.create(accountId);
    const before = await hashOf(h.db, accountId);
    const row = await h.rowOf(session.sessionId);
    vi.spyOn(h.repo, 'revokeAllActive').mockRejectedValueOnce(
      new Error('giả lập mất kết nối DB'),
    );

    const res = await h.change({ accessToken: session.accessToken });

    expectErrorResponse(res, 500, 'LOI_HE_THONG');
    expectNoSetCookie(res);
    expect(await hashOf(h.db, accountId)).toBe(before);
    expect(await h.rowOf(session.sessionId)).toEqual(row);
    expect((await h.change({ accessToken: session.accessToken })).status).toBe(
      200,
    );
  });

  it('E2E-DM09 DM-09 SE-04 log, stdout/stderr và thân ở mọi nhánh không có mật khẩu, băm, token; refresh token mới CHỈ nằm ở Set-Cookie', async () => {
    const { accountId, session } = await accountWithSession();
    const oldHash = await hashOf(h.db, accountId);
    const wrong = await h.change({
      accessToken: session.accessToken,
      body: changeBody({ matKhauCu: WRONG_PASSWORD }),
    });
    const weak = await h.change({
      accessToken: session.accessToken,
      body: changeBody({ matKhauMoi: 'yeu-qua', xacNhan: 'yeu-qua' }),
    });
    const ok = await h.change({ accessToken: session.accessToken });
    const token = refreshTokenOf(ok);

    const secrets = [
      LOGIN_PASSWORD,
      WRONG_PASSWORD,
      NEW_PASSWORD,
      'yeu-qua',
      oldHash,
      await hashOf(h.db, accountId),
      session.accessToken,
      session.refreshToken,
    ];
    const text = output.join('');
    for (const secret of [...secrets, token]) {
      expect(text, `log lộ ${secret.slice(0, 6)}…`).not.toContain(secret);
    }
    expect(ok.text).not.toContain(token);
    expect(h.mail.sent).toEqual([]);
    for (const res of [wrong, weak, ok]) {
      const wire = JSON.stringify({ text: res.text, headers: res.headers });
      for (const secret of secrets) expect(wire).not.toContain(secret);
    }
  });

  it.each(['get', 'put', 'delete', 'patch'] as const)(
    'E2E-DM10 phương thức %s → 404 KHONG_TIM_THAY',
    async (method) => {
      const { session } = await accountWithSession();
      const res = await request(h.app.getHttpServer())
        [method](CHANGE_PATH)
        .set('Authorization', `Bearer ${session.accessToken}`);
      expectErrorResponse(res, 404, 'KHONG_TIM_THAY');
    },
  );
});
