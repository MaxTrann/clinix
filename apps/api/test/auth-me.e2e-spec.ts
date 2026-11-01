import { SignJWT, UnsecuredJWT } from 'jose';
import request from 'supertest';
import { vi } from 'vitest';
import { AdminFixtures } from './../src/admin/testing/admin-fixtures.js';
import {
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
  ACCESS_TOKEN_TTL_MS,
} from './../src/auth/auth.constants.js';
import { PhienDangNhap } from './../src/auth/entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from './../src/auth/entities/tai-khoan.entity.js';
import { insertMaXacThuc } from './../src/auth/entities/testing/auth-fixtures.js';
import { TEST_AUTH_ENV } from './../src/auth/testing/auth-test-env.js';
import {
  LOGIN_PASSWORD,
  loginBody,
  newLoginAccount,
} from './../src/auth/testing/login-int-helpers.js';
import { T0, at } from './../src/auth/testing/otp-int-helpers.js';
import {
  expectNoSetCookie,
  openRefreshHarness,
  refreshTokenOf,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectNoSecrets } from './../src/auth/testing/secret-scan.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';

// Task A15 — GET /auth/me qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts. Test case: DN-23 (cả đáp ứng đăng nhập), DN-25 lặp lại trên route thật. Mã E2E-MEnn là [đề xuất].
const ME_PATH = '/auth/me';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const INVALID = 'TOKEN_KHONG_HOP_LE';
const SESSION_LOST = 'PHIEN_HET_HIEU_LUC';
const ACCESS_TTL = ACCESS_TOKEN_TTL_MS / 1000;

let h: RefreshHarness;
let output: string[];

beforeAll(async () => {
  h = await openRefreshHarness();
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

const server = () => request(h.app.getHttpServer());
const me = (accessToken: string) =>
  server().get(ME_PATH).set('Authorization', `Bearer ${accessToken}`);
const accountRow = (taiKhoanId: string) =>
  h.db.getRepository(TaiKhoan).findOneByOrFail({ taiKhoanId });
const updateAccount = (taiKhoanId: string, change: Partial<TaiKhoan>) =>
  h.db.getRepository(TaiKhoan).update(taiKhoanId, change);
const allSessions = () =>
  h.db.getRepository(PhienDangNhap).find({
    order: { phienDangNhapId: 'ASC' },
  });

const nowSeconds = () => Math.floor(Date.now() / 1000);

describe('GET /auth/me', () => {
  it('E2E-ME01 (DN-23) 200 đúng ba trường; no-store; JSON; không Set-Cookie', async () => {
    const { session } = await h.newSession({ hoTen: 'Phạm Thị D' });

    const res = await me(session.accessToken);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      vaiTro: 'BenhNhan',
      hoTen: 'Phạm Thị D',
      daXacMinhEmail: true,
    });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(String(res.headers['content-type'])).toContain('application/json');
    expectNoSetCookie(res);
  });

  it('E2E-ME02 (DN-23) cả đáp ứng đăng nhập và /auth/me: thân, header, log, thư giả không chứa băm, refresh, dữ liệu đăng ký hay mật khẩu', async () => {
    const account = await newLoginAccount(h.db, { hoTen: 'Võ Văn E' });
    const registration = await insertMaXacThuc(h.db, account.taiKhoanId, {
      hoTenDangKy: 'Họ Tên Đăng Ký Riêng',
      soDienThoaiDangKy: '0987654321',
      matKhauBamDangKy: 'bam-dang-ky-rieng',
    });

    const login = await server().post('/auth/login').send(loginBody(account));
    expect(login.status).toBe(200);
    expect(Object.keys(login.body as object).sort()).toEqual([
      'accessToken',
      'vaiTro',
    ]);
    const { accessToken } = login.body as { accessToken: string };
    const profile = await me(accessToken);
    expect(profile.status).toBe(200);
    expect(Object.keys(profile.body as object).sort()).toEqual([
      'daXacMinhEmail',
      'hoTen',
      'vaiTro',
    ]);

    const refreshToken = refreshTokenOf(login);
    const [sessionRow] = await allSessions();
    const never = [
      account.matKhauBam ?? '',
      sessionRow?.refreshTokenBam ?? '',
      registration.hoTenDangKy ?? '',
      registration.soDienThoaiDangKy ?? '',
      registration.matKhauBamDangKy ?? '',
      LOGIN_PASSWORD,
      account.soDienThoai,
      account.email,
    ];
    const withTokens = [...never, refreshToken, accessToken];

    expectNoSecrets(
      '/auth/me',
      JSON.stringify([profile.body, profile.headers]),
      { literals: withTokens, codes: [] },
    );
    // Thân đăng nhập có access token theo hợp đồng, refresh token chỉ được ở cookie
    expectNoSecrets('đăng nhập: thân', JSON.stringify(login.body), {
      literals: [...never, refreshToken],
      codes: [],
    });
    expectNoSecrets('đăng nhập: header', JSON.stringify(login.headers), {
      literals: never,
      codes: [],
    });
    expectNoSecrets('log', output.join(''), {
      literals: withTokens,
      codes: [],
    });
    expect(h.mail.sent).toEqual([]);
  });

  it('E2E-ME03 bốn vai trò: mỗi vai trò nhận đúng vai trò và họ tên của chính mình', async () => {
    const admin = new AdminFixtures(h.db);
    const branch = await admin.branch();
    const named = (hoTen: string) => ({ hoTen, daXacMinhEmail: true });
    const patient = await h.newSession(named('Bệnh Nhân F'));
    const doctor = await admin.doctor(branch, {}, named('Bác Sĩ G'));
    const receptionist = await admin.receptionist(branch, named('Lễ Tân H'));
    const manager = await admin.admin(undefined, named('Quản Trị I'));
    const cases = [
      ['BenhNhan', 'Bệnh Nhân F', patient.accountId],
      ['BacSi', 'Bác Sĩ G', doctor.account.taiKhoanId],
      ['LeTan', 'Lễ Tân H', receptionist.account.taiKhoanId],
      ['QuanTriVien', 'Quản Trị I', manager.account.taiKhoanId],
    ] as const;

    for (const [vaiTro, hoTen, accountId] of cases) {
      const { accessToken } = await h.sessions.create(accountId);
      const res = await me(accessToken);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ vaiTro, hoTen, daXacMinhEmail: true });
    }
  });

  it('E2E-ME04 hai tài khoản gọi đồng thời 40 lượt: không lượt nào lẫn hồ sơ của tài khoản kia', async () => {
    const first = await h.newSession({ hoTen: 'Người Một' });
    const second = await h.newSession({
      hoTen: 'Người Hai',
      loaiTaiKhoan: 'LeTan',
    });
    const calls = Array.from({ length: 40 }, (_, index) => {
      const owner = index % 2 === 0 ? first : second;
      const expected =
        owner === first
          ? { vaiTro: 'BenhNhan', hoTen: 'Người Một' }
          : { vaiTro: 'LeTan', hoTen: 'Người Hai' };
      return me(owner.session.accessToken).then((res) => ({ res, expected }));
    });

    for (const { res, expected } of await Promise.all(calls)) {
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject(expected);
    }
  });

  it('E2E-ME05 (DN-25) không token ⇒ 401 CHUA_DANG_NHAP', async () => {
    expectErrorResponse(await server().get(ME_PATH), 401, NOT_LOGGED_IN);
  });

  it('E2E-ME06 (DN-25) sai chữ ký ⇒ 401 TOKEN_KHONG_HOP_LE', async () => {
    const { accountId, session } = await h.newSession();
    const now = nowSeconds();
    const forged = await new SignJWT({ sid: session.sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(accountId)
      .setIssuer(ACCESS_TOKEN_ISSUER)
      .setAudience(ACCESS_TOKEN_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + ACCESS_TTL)
      .sign(new TextEncoder().encode(TEST_AUTH_ENV.JWT_REFRESH_SECRET));

    expectErrorResponse(await me(forged), 401, INVALID);
  });

  it('E2E-ME07 (DN-25) alg none ⇒ 401 TOKEN_KHONG_HOP_LE', async () => {
    const { accountId, session } = await h.newSession();
    const now = nowSeconds();
    const unsigned = new UnsecuredJWT({ sid: session.sessionId })
      .setSubject(accountId)
      .setIssuer(ACCESS_TOKEN_ISSUER)
      .setAudience(ACCESS_TOKEN_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + ACCESS_TTL)
      .encode();

    expectErrorResponse(await me(unsigned), 401, INVALID);
  });

  it('E2E-ME08 (DN-25) biên hết hạn: giây cuối còn dùng được, quá hạn ⇒ 401 TOKEN_KHONG_HOP_LE (FE làm mới một lần rồi thử lại)', async () => {
    const { session } = await h.newSession();

    vi.setSystemTime(at(ACCESS_TTL - 1));
    expect((await me(session.accessToken)).status).toBe(200);

    vi.setSystemTime(at(ACCESS_TTL + 1));
    expectErrorResponse(await me(session.accessToken), 401, INVALID);
  });

  it('E2E-ME09 phiên đã đăng xuất ⇒ 401 PHIEN_HET_HIEU_LUC với token còn hạn', async () => {
    const { session } = await h.newSession();
    expect((await me(session.accessToken)).status).toBe(200);

    await h.sessions.revoke(session.sessionId);

    expectErrorResponse(await me(session.accessToken), 401, SESSION_LOST);
  });

  it('E2E-ME10 tài khoản NgungHoatDong ⇒ 401 PHIEN_HET_HIEU_LUC ngay với cùng token', async () => {
    const { accountId, session } = await h.newSession();
    expect((await me(session.accessToken)).status).toBe(200);

    await updateAccount(accountId, { trangThai: 'NgungHoatDong' });

    expectErrorResponse(await me(session.accessToken), 401, SESSION_LOST);
  });

  it('E2E-ME11 tài khoản bị xoá (khoá ngoại không CASCADE nên xoá phiên trước) ⇒ 401 PHIEN_HET_HIEU_LUC; nhánh sau guard: MEU-S03, ME-03', async () => {
    const { accountId, session } = await h.newSession();

    await h.db.getRepository(PhienDangNhap).delete({ taiKhoanId: accountId });
    await h.db.getRepository(TaiKhoan).delete(accountId);

    expectErrorResponse(await me(session.accessToken), 401, SESSION_LOST);
  });

  it('E2E-ME12 đổi vai trò và họ tên trong DB: cùng access token thấy giá trị mới ngay', async () => {
    const { accountId, session } = await h.newSession({ hoTen: 'Tên Cũ' });
    expect((await me(session.accessToken)).body).toMatchObject({
      vaiTro: 'BenhNhan',
      hoTen: 'Tên Cũ',
    });

    await updateAccount(accountId, { loaiTaiKhoan: 'LeTan', hoTen: 'Tên Mới' });

    expect((await me(session.accessToken)).body).toMatchObject({
      vaiTro: 'LeTan',
      hoTen: 'Tên Mới',
    });
  });

  it('E2E-ME13 daXacMinhEmail đúng theo cột, true rồi false (false chỉ dựng được bằng sửa DB vì A8 chặn đăng nhập khi chưa xác minh)', async () => {
    const { accountId, session } = await h.newSession();
    expect((await me(session.accessToken)).body).toMatchObject({
      daXacMinhEmail: true,
    });

    await updateAccount(accountId, { daXacMinhEmail: false });

    expect((await me(session.accessToken)).body).toMatchObject({
      daXacMinhEmail: false,
    });
  });

  it('E2E-ME14 query hay thân cố truyền taiKhoanId khác bị bỏ qua: vẫn hồ sơ của chủ token, không 400', async () => {
    const mine = await h.newSession({ hoTen: 'Chủ Token' });
    const other = await h.newSession({ hoTen: 'Người Khác' });
    const forOther = { taiKhoanId: other.accountId };

    const viaQuery = await me(mine.session.accessToken).query(forOther);
    const viaBody = await me(mine.session.accessToken).send(forOther);

    for (const res of [viaQuery, viaBody]) {
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ hoTen: 'Chủ Token' });
    }
  });

  it('E2E-ME15 gọi 50 lần với đồng hồ chạy tới: phien_dang_nhap và tai_khoan giữ nguyên từng cột, không thêm hàng', async () => {
    const { accountId, session } = await h.newSession();
    await h.sessions.create(accountId); // phiên thứ hai để bắt việc ghi lan sang phiên khác
    const sessionsBefore = await allSessions();
    const accountBefore = await accountRow(accountId);

    for (let second = 1; second <= 50; second += 1) {
      vi.setSystemTime(at(second)); // đồng hồ đứng yên thì ghi gia hạn sẽ ra đúng giá trị cũ và lọt
      expect((await me(session.accessToken)).status).toBe(200);
    }

    expect(await allSessions()).toEqual(sessionsBefore);
    expect(await accountRow(accountId)).toEqual(accountBefore);
  });
});
