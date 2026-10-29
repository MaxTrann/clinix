import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { BenhNhan } from './../src/auth/entities/benh-nhan.entity.js';
import { PhienDangNhap } from './../src/auth/entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from './../src/auth/entities/tai-khoan.entity.js';
import { insertTaiKhoan } from './../src/auth/entities/testing/auth-fixtures.js';
import { SessionService } from './../src/auth/session/session.service.js';
import {
  TokenService,
  sha256Hex,
} from './../src/auth/session/token.service.js';
import {
  LOGIN_PASSWORD,
  WRONG_PASSWORD,
  loginPasswordHash,
} from './../src/auth/testing/login-int-helpers.js';
import { T0, at, wrongCodeFor } from './../src/auth/testing/otp-int-helpers.js';
import { readOtpFromMail } from './../src/auth/testing/otp-test-helpers.js';
import { REGISTER_PASSWORD } from './../src/auth/testing/register-int-helpers.js';
import { standalone } from './../src/auth/testing/secret-scan.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { MailService } from './../src/mail/mail.service.js';
import { FakeMailService } from './../src/mail/testing/fake-mail.service.js';

// Task A8 — POST /auth/login qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (bộ lọc lỗi P5, ValidationPipe, logger che bí mật),
// MailService giả. Mã test case: DN-01, 02, 04, 05, 07, 08, 09, 10, 12, 14, 15, 16, 17, 20, 22, 23, 37, 38; SE-04; DN-33 (cờ cookie, phần login);
// A6-D (thân NGUNG giống verify-otp). DN-21: phần HTTP làm ở A11. Mã E2E-Lnn là [đề xuất].
const mail = new FakeMailService();
let app: NestExpressApplication;
let db: DataSource;
let output: string[];
const DAY = 24 * 60 * 60;
const LOCK = 15 * 60;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app); // đúng cấu hình như main.ts
  await app.init();
  db = app.get(DataSource);
});

beforeEach(async () => {
  await resetTables(db);
  mail.reset();
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
  await app.close();
});

let sequence = 0;
const post = (path: string, payload: object) =>
  request(app.getHttpServer()).post(path).send(payload);
const login = (email: string, matKhau: string = LOGIN_PASSWORD) =>
  post('/auth/login', { email, matKhau });

async function newAccount(
  overrides: Partial<TaiKhoan> = {},
): Promise<TaiKhoan> {
  sequence += 1;
  return insertTaiKhoan(db, {
    email: `dang.nhap.${String(sequence)}@example.com`,
    matKhauBam: await loginPasswordHash(),
    daXacMinhEmail: true,
    thoiDiemTao: new Date(Date.now() - 3600_000),
    ...overrides,
  });
}
const stateOf = (account: TaiKhoan) =>
  db
    .getRepository(TaiKhoan)
    .findOneByOrFail({ taiKhoanId: account.taiKhoanId });
const sessionsOf = (account: TaiKhoan) =>
  db
    .getRepository(PhienDangNhap)
    .find({ where: { taiKhoanId: account.taiKhoanId } });
const setCookies = (res: { headers: Record<string, unknown> }): string[] => {
  const header = res.headers['set-cookie'];
  return Array.isArray(header) ? (header as string[]) : [];
};

async function registerOverHttp(email = 'moi.dang.ky@example.com') {
  const res = await post('/auth/register', {
    hoTen: 'Nguyễn Văn A',
    email,
    soDienThoai: '0901234567',
    matKhau: REGISTER_PASSWORD,
    xacNhan: REGISTER_PASSWORD,
  }).expect(201);
  const code = readOtpFromMail(
    mail.attempts[mail.attempts.length - 1] ?? { text: '' },
  );
  return { email, id: (res.body as { maXacThucId: string }).maXacThucId, code };
}

describe('đăng nhập thành công', () => {
  it('E2E-L01 (DN-01, DN-23, DN-33) 200 { accessToken, vaiTro }; cookie refresh HttpOnly + Secure + SameSite=Lax + Path=/api/auth + Expires = hạn không hoạt động; Cache-Control: no-store; refresh chỉ trong cookie; thân sạch', async () => {
    const account = await newAccount();

    const res = await login(account.email);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body as object).sort()).toEqual([
      'accessToken',
      'vaiTro',
    ]);
    expect((res.body as { vaiTro: string }).vaiTro).toBe('BenhNhan');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(String(res.headers['content-type'])).toContain('application/json');

    const cookies = setCookies(res);
    expect(cookies).toHaveLength(1);
    const cookie = cookies[0] ?? '';
    expect(cookie).toMatch(/^refresh_token=[^;]+;/);
    expect(cookie).toContain('Path=/api/auth');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain(`Expires=${at(30 * 60).toUTCString()}`);
    const refreshToken = decodeURIComponent(
      cookie.split(';')[0]?.split('=')[1] ?? '',
    );

    // refresh token chỉ lưu băm; thân phản hồi không có refresh, băm, hay dữ liệu đăng ký
    const rows = await sessionsOf(account);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.refreshTokenBam).toBe(sha256Hex(refreshToken));
    const text = JSON.stringify(res.body);
    for (const secret of [
      refreshToken,
      rows[0]?.refreshTokenBam ?? '',
      account.matKhauBam ?? '',
      '$argon2id$',
      'mat_khau',
      'refresh',
      LOGIN_PASSWORD,
      account.email,
    ]) {
      expect(text).not.toContain(secret);
    }

    // access token qua được hai hàm mà guard A4 thật dùng
    const claims = await app
      .get(TokenService)
      .verifyAccessToken((res.body as { accessToken: string }).accessToken);
    expect(claims).toEqual({
      accountId: account.taiKhoanId,
      sessionId: String(rows[0]?.phienDangNhapId),
    });
    expect(
      await app
        .get(SessionService)
        .resolveActive(claims ?? { accountId: '', sessionId: '' }),
    ).toMatchObject({ role: 'BenhNhan' });
    expect(mail.attempts).toHaveLength(0);
  });

  it.each(['BenhNhan', 'BacSi', 'LeTan', 'QuanTriVien'] as const)(
    'E2E-L02 (DN-02) vai trò %s qua HTTP',
    async (loaiTaiKhoan) => {
      const account = await newAccount({ loaiTaiKhoan });

      const res = await login(account.email);

      expect(res.status).toBe(200);
      expect((res.body as { vaiTro: string }).vaiTro).toBe(loaiTaiKhoan);
    },
  );

  it('E2E-L03 (DN-04) email khác hoa/thường và có khoảng trắng đầu/cuối: vào được, không tạo tài khoản mới', async () => {
    const account = await newAccount({ email: 'dang.nhap@example.com' });

    const res = await login('  Dang.Nhap@Example.COM ');

    expect(res.status).toBe(200);
    expect(await sessionsOf(account)).toHaveLength(1);
    expect(await db.getRepository(TaiKhoan).count()).toBe(1);
  });

  it('E2E-L04 route công khai: không cần token, và header Authorization rác không làm hỏng đăng nhập', async () => {
    const account = await newAccount();

    const res = await login(account.email).set(
      'Authorization',
      'Bearer rac.rac.rac',
    );

    expect(res.status).toBe(200);
  });
});

describe('sai thông tin và khoá tạm', () => {
  it('E2E-L10 (DN-05, G1) email lạ và mật khẩu sai: CÙNG thân 401 DANG_NHAP_SAI, không "còn N lần", không cookie', async () => {
    const account = await newAccount();

    const unknown = await login('khong.co@example.com', WRONG_PASSWORD);
    const wrong = await login(account.email, WRONG_PASSWORD);

    const unknownBody = expectErrorResponse(unknown, 401, 'DANG_NHAP_SAI');
    const wrongBody = expectErrorResponse(wrong, 401, 'DANG_NHAP_SAI');
    expect(wrongBody).toEqual(unknownBody);
    expect(wrongBody.chiTiet).toBeUndefined();
    expect(setCookies(unknown)).toEqual([]);
    expect(setCookies(wrong)).toEqual([]);
    expect((await stateOf(account)).soLanDangNhapSai).toBe(1);
  });

  it('E2E-L11 (DN-07, DN-08) sai 4 lần 401, lần thứ 5 là 429 TAI_KHOAN_BI_KHOA_TAM với 900 giây và mốc ISO; lần đếm đã COMMIT dù đã trả lỗi', async () => {
    const account = await newAccount();
    for (let attempt = 1; attempt <= 4; attempt++) {
      expectErrorResponse(
        await login(account.email, WRONG_PASSWORD),
        401,
        'DANG_NHAP_SAI',
      );
      expect((await stateOf(account)).soLanDangNhapSai).toBe(attempt);
    }

    const fifth = await login(account.email, WRONG_PASSWORD);

    const body = expectErrorResponse(fifth, 429, 'TAI_KHOAN_BI_KHOA_TAM');
    expect(body.chiTiet).toEqual({
      soGiayConLai: LOCK,
      khoaDen: at(LOCK).toISOString(),
    });
    expect(setCookies(fifth)).toEqual([]);
    expect(await stateOf(account)).toMatchObject({
      soLanDangNhapSai: 5,
      khoaDangNhapDen: at(LOCK),
    });
  });

  it('E2E-L12 (DN-09, DN-10) đang khoá: đúng mật khẩu vẫn 429; 14:59 còn 1 giây; ĐÚNG 15:00:00 và 15:01 vào được', async () => {
    const account = await newAccount();
    for (let i = 0; i < 5; i++) await login(account.email, WRONG_PASSWORD);

    const stillLocked = await login(account.email);
    expectErrorResponse(stillLocked, 429, 'TAI_KHOAN_BI_KHOA_TAM');
    expect(await sessionsOf(account)).toHaveLength(0);

    vi.setSystemTime(at(LOCK - 1));
    const lastSecond = expectErrorResponse(
      await login(account.email),
      429,
      'TAI_KHOAN_BI_KHOA_TAM',
    );
    expect((lastSecond.chiTiet as { soGiayConLai: number }).soGiayConLai).toBe(
      1,
    );

    vi.setSystemTime(at(LOCK));
    expect((await login(account.email)).status).toBe(200);
    expect(await stateOf(account)).toMatchObject({
      soLanDangNhapSai: 0,
      khoaDangNhapDen: null,
    });
    vi.setSystemTime(at(LOCK + 61));
    expect((await login(account.email)).status).toBe(200);
  });

  it('E2E-L13 (DN-12) 10 yêu cầu sai song song qua HTTP: đúng 4 yêu cầu 401 và 6 yêu cầu 429; bộ đếm cuối đúng 5', async () => {
    const account = await newAccount();

    const results = await Promise.all(
      Array.from({ length: 10 }, () => login(account.email, WRONG_PASSWORD)),
    );

    const statuses = results.map((res) => res.status).sort((a, b) => a - b);
    expect(statuses).toEqual([
      401, 401, 401, 401, 429, 429, 429, 429, 429, 429,
    ]);
    expect(await stateOf(account)).toMatchObject({
      soLanDangNhapSai: 5,
      khoaDangNhapDen: at(LOCK),
    });
  });
});

describe('trạng thái tài khoản', () => {
  it('E2E-L20 (DN-14, DN-16) ngưng hoạt động: 403 TAI_KHOAN_NGUNG kể cả đang khoá; thân giống HỆT verify-otp của A6 (cùng mã, trạng thái, câu chữ)', async () => {
    const registered = await registerOverHttp();
    await db.getRepository(TaiKhoan).update(
      { email: registered.email },
      {
        trangThai: 'NgungHoatDong',
        soLanDangNhapSai: 5,
        khoaDangNhapDen: at(LOCK),
      },
    );

    const fromLogin = await login(registered.email, REGISTER_PASSWORD);
    const fromVerify = await post('/auth/register/verify-otp', {
      email: registered.email,
      maXacThucId: registered.id,
      otp: registered.code,
    });

    const body = expectErrorResponse(fromLogin, 403, 'TAI_KHOAN_NGUNG');
    expect(expectErrorResponse(fromVerify, 403, 'TAI_KHOAN_NGUNG')).toEqual(
      body,
    );
    expect(setCookies(fromLogin)).toEqual([]);
  });

  it('E2E-L21 (DN-15) nhân sự ChoKichHoat: 403 TAI_KHOAN_CHUA_KICH_HOAT, không lỗi null, bộ đếm không đổi', async () => {
    const account = await newAccount({
      loaiTaiKhoan: 'BacSi',
      trangThai: 'ChoKichHoat',
      matKhauBam: null,
      daXacMinhEmail: false,
    });

    const res = await login(account.email);

    expectErrorResponse(res, 403, 'TAI_KHOAN_CHUA_KICH_HOAT');
    expect((await stateOf(account)).soLanDangNhapSai).toBe(0);
  });
});

describe('chưa xác minh email', () => {
  it('E2E-L30 (DN-17) đúng mật khẩu: 403 EMAIL_CHUA_XAC_MINH kèm mã lần gửi, trạng thái mã và hạn; KHÔNG cookie, KHÔNG phiên, KHÔNG gửi thư mới', async () => {
    const registered = await registerOverHttp();
    const mailBefore = mail.attempts.length;

    const res = await login(registered.email, REGISTER_PASSWORD);

    const body = expectErrorResponse(res, 403, 'EMAIL_CHUA_XAC_MINH');
    expect(body.chiTiet).toEqual({
      maXacThucId: registered.id,
      trangThaiMa: 'ConHan',
      hetHanLuc: at(600).toISOString(),
    });
    expect(setCookies(res)).toEqual([]);
    expect(res.body).not.toHaveProperty('accessToken');
    expect(await db.getRepository(PhienDangNhap).count()).toBe(0);
    expect(mail.attempts).toHaveLength(mailBefore);
  });

  it('E2E-L31 (DN-20) luồng liền: bị từ chối → "Gửi lại mã" bằng email và mã lần gửi trong phản hồi → OTP đúng → đăng nhập được, có hồ sơ bệnh nhân', async () => {
    const registered = await registerOverHttp();
    const refused = await login(registered.email, REGISTER_PASSWORD);
    const id = (
      expectErrorResponse(refused, 403, 'EMAIL_CHUA_XAC_MINH').chiTiet as {
        maXacThucId: string;
      }
    ).maXacThucId;
    vi.setSystemTime(at(61));

    const resent = await post('/auth/register/resend-otp', {
      email: registered.email,
      maXacThucId: id,
    });
    expect(resent.status).toBe(201);
    const code = readOtpFromMail(
      mail.attempts[mail.attempts.length - 1] ?? { text: '' },
    );
    const verified = await post('/auth/register/verify-otp', {
      email: registered.email,
      maXacThucId: (resent.body as { maXacThucId: string }).maXacThucId,
      otp: code,
    });
    expect(verified.status).toBe(200);
    const res = await login(registered.email, REGISTER_PASSWORD);

    expect(res.status).toBe(200);
    expect((res.body as { vaiTro: string }).vaiTro).toBe('BenhNhan');
    expect(await db.getRepository(BenhNhan).count()).toBe(1);
    expect(setCookies(res)).toHaveLength(1);
  });

  it('E2E-L32 (DN-37) mã cũ hết hạn: trangThaiMa HetHan; (DN-38) mã bị thu hồi vì quá 24 giờ: CanDangKyLai với id và hạn là null', async () => {
    const registered = await registerOverHttp();
    vi.setSystemTime(at(601));
    const expired = await login(registered.email, REGISTER_PASSWORD);
    expect(
      (
        expectErrorResponse(expired, 403, 'EMAIL_CHUA_XAC_MINH').chiTiet as {
          trangThaiMa: string;
        }
      ).trangThaiMa,
    ).toBe('HetHan');

    vi.setSystemTime(at(DAY));
    const late = await login(registered.email, REGISTER_PASSWORD);
    expect(
      expectErrorResponse(late, 403, 'EMAIL_CHUA_XAC_MINH').chiTiet,
    ).toEqual({
      maXacThucId: null,
      trangThaiMa: 'CanDangKyLai',
      hetHanLuc: null,
    });
  });

  it('E2E-L33 (DN-37) nhập sai 5 lần làm mã bị thu hồi: trangThaiMa DaThuHoi', async () => {
    const registered = await registerOverHttp();
    for (let i = 0; i < 5; i++) {
      await post('/auth/register/verify-otp', {
        email: registered.email,
        maXacThucId: registered.id,
        otp: wrongCodeFor(registered.code),
      });
    }

    const res = await login(registered.email, REGISTER_PASSWORD);

    expect(
      (
        expectErrorResponse(res, 403, 'EMAIL_CHUA_XAC_MINH').chiTiet as {
          trangThaiMa: string;
        }
      ).trangThaiMa,
    ).toBe('DaThuHoi');
  });
});

describe('dữ liệu vào', () => {
  it.each([
    [
      'thiếu mật khẩu',
      { email: 'a@example.com' },
      [{ truong: 'matKhau', ma: 'MAT_KHAU_KHONG_HOP_LE' }],
    ],
    [
      'thiếu email',
      { matKhau: LOGIN_PASSWORD },
      [{ truong: 'email', ma: 'EMAIL_KHONG_HOP_LE' }],
    ],
    [
      'mật khẩu rỗng',
      { email: 'a@example.com', matKhau: '' },
      [{ truong: 'matKhau', ma: 'MAT_KHAU_KHONG_HOP_LE' }],
    ],
    [
      'mật khẩu 65 ký tự',
      { email: 'a@example.com', matKhau: 'a'.repeat(65) },
      [{ truong: 'matKhau', ma: 'MAT_KHAU_KHONG_HOP_LE' }],
    ],
    [
      'email sai dạng',
      { email: 'khong-hop-le', matKhau: LOGIN_PASSWORD },
      [{ truong: 'email', ma: 'EMAIL_KHONG_HOP_LE' }],
    ],
    [
      'mật khẩu kiểu số',
      { email: 'a@example.com', matKhau: 123456789 },
      [{ truong: 'matKhau', ma: 'MAT_KHAU_KHONG_HOP_LE' }],
    ],
    [
      'trường lạ',
      {
        email: 'a@example.com',
        matKhau: LOGIN_PASSWORD,
        loaiTaiKhoan: 'QuanTriVien',
      },
      [{ truong: 'loaiTaiKhoan', ma: 'TRUONG_KHONG_DUOC_PHEP' }],
    ],
  ])(
    'E2E-L40 (DN-22) %s: 400 DU_LIEU_KHONG_HOP_LE đúng trường, không chạm DB, không echo giá trị',
    async (_ten, payload, expected) => {
      const account = await newAccount({ email: 'a@example.com' });

      const res = await post('/auth/login', payload);

      const body = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
      expect(body.loi).toEqual(expected);
      expect(JSON.stringify(res.body)).not.toContain(LOGIN_PASSWORD);
      expect((await stateOf(account)).soLanDangNhapSai).toBe(0);
      expect(setCookies(res)).toEqual([]);
    },
  );
});

describe('nhật ký và đáp ứng không lộ bí mật', () => {
  it('E2E-L50 (SE-04) log/stdout/stderr của cả một chuỗi đăng nhập (đúng, sai, khoá, ngưng, chưa xác minh) không chứa mật khẩu, băm, token, email hay OTP', async () => {
    const good = await newAccount();
    const suspended = await newAccount({ trangThai: 'NgungHoatDong' });
    const registered = await registerOverHttp();

    const ok = await login(good.email);
    for (let i = 0; i < 5; i++) await login(good.email, WRONG_PASSWORD);
    await login(suspended.email);
    await login(registered.email, REGISTER_PASSWORD);
    await login('khong.co@example.com', WRONG_PASSWORD);

    const text = output.join('');
    const cookie = setCookies(ok)[0] ?? '';
    const refreshToken = decodeURIComponent(
      cookie.split(';')[0]?.split('=')[1] ?? '',
    );
    const accessToken = (ok.body as { accessToken: string }).accessToken;
    const accounts = await db.getRepository(TaiKhoan).find();
    const sessions = await db.getRepository(PhienDangNhap).find();
    const literals = [
      LOGIN_PASSWORD,
      WRONG_PASSWORD,
      REGISTER_PASSWORD,
      'khong.co@example.com',
      refreshToken,
      accessToken,
      ...accounts.flatMap((a) => [a.email, a.matKhauBam ?? '']),
      ...sessions.map((s) => s.refreshTokenBam),
    ].filter((value) => value.length > 5);
    for (const literal of literals) {
      expect(text, `log lộ ${literal.slice(0, 6)}…`).not.toContain(literal);
    }
    expect(text).not.toContain('$argon2id$');
    expect(text).not.toMatch(standalone(registered.code));
    expect(text).toContain(
      `Tài khoản ${good.taiKhoanId} đăng nhập sai lần 1/5`,
    );
  });
});
