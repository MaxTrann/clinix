import request from 'supertest';
import { vi } from 'vitest';
import { MaXacThuc } from './../src/auth/entities/ma-xac-thuc.entity.js';
import { TaiKhoan } from './../src/auth/entities/tai-khoan.entity.js';
import { newResetAccount } from './../src/auth/testing/forgot-password-int-helpers.js';
import {
  LOGIN_PASSWORD,
  newLoginAccount,
} from './../src/auth/testing/login-int-helpers.js';
import { T0, at } from './../src/auth/testing/otp-int-helpers.js';
import { readOtpFromMail } from './../src/auth/testing/otp-test-helpers.js';
import {
  openRefreshHarness,
  refreshTokenOf,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { NEW_PASSWORD } from './../src/auth/testing/reset-password-int-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';

// Task A12 — POST /auth/reset-password qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (bộ lọc lỗi P5, ValidationPipe, logger che bí
// mật), MailService giả. Toàn luồng forgot-password → verify-otp → reset-password → login cũng qua HTTP. Mã test case: QM-01, QM-08, QM-11, QM-12, QM-13,
// QM-15, QM-16, QM-17, QM-19, SE-04 (thân phản hồi và stdout/stderr). Mã E2E-MKnn là [đề xuất].
const RESET = '/auth/reset-password';
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

const post = (path: string, payload: unknown) =>
  request(h.app.getHttpServer())
    .post(path)
    .send(payload as object);
const body = (
  resetToken: unknown,
  matKhauMoi = NEW_PASSWORD,
  xacNhan: unknown = matKhauMoi,
) => ({
  resetToken,
  matKhauMoi,
  xacNhan,
});
const login = (email: string, matKhau: string) =>
  post('/auth/login', { email, matKhau });

/** Bước 1 và 2 qua HTTP: cấp mã, đọc mã từ thư giả, xác minh ⇒ resetToken. */
async function tokenOverHttp(email: string): Promise<string> {
  expect((await post('/auth/forgot-password', { email })).status).toBe(201);
  const message = h.mail.sent.at(-1);
  if (!message) throw new Error('chưa có thư');
  const res = await post('/auth/forgot-password/verify-otp', {
    email,
    otp: readOtpFromMail(message),
  });
  expect(res.status).toBe(200);
  return (res.body as { resetToken: string }).resetToken;
}

const passwordHashOf = async (taiKhoanId: string) =>
  (await h.db.getRepository(TaiKhoan).findOneByOrFail({ taiKhoanId }))
    .matKhauBam;

describe('POST /auth/reset-password', () => {
  it('E2E-MK01 QM-01 toàn luồng qua HTTP: 200 { taiKhoanNgung, canDangKyLai } và không gì khác (không cookie, không no-store); mật khẩu mới đăng nhập được, cũ thì không; công khai (không cần Authorization, Origin)', async () => {
    const account = await newLoginAccount(h.db);
    const token = await tokenOverHttp(account.email);

    const res = await post(RESET, body(token));

    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toContain('application/json');
    expect(res.body).toEqual({ taiKhoanNgung: false, canDangKyLai: false });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['cache-control']).toBeUndefined();
    expect((await login(account.email, NEW_PASSWORD)).status).toBe(200);
    expectErrorResponse(
      await login(account.email, LOGIN_PASSWORD),
      401,
      'DANG_NHAP_SAI',
    );
    expect(h.mail.sent).toHaveLength(1); // không có thư nào của bước đặt mật khẩu
  });

  it('E2E-MK02 QM-08 mật khẩu mới không đạt Q11 hoặc không khớp: 400 kèm loi, mật khẩu cũ GIỮ NGUYÊN, token KHÔNG bị tiêu thụ (lần nhập lại đúng thì 200)', async () => {
    const account = await newResetAccount(h.db, 'verified');
    const token = await tokenOverHttp(account.email);
    const before = await passwordHashOf(account.taiKhoanId);

    const weak = await post(RESET, body(token, 'yeu'));
    const mismatch = await post(
      RESET,
      body(token, NEW_PASSWORD, `${NEW_PASSWORD}x`),
    );

    expect(expectErrorResponse(weak, 400, 'DU_LIEU_KHONG_HOP_LE').loi).toEqual([
      { truong: 'matKhauMoi', ma: 'MAT_KHAU_KHONG_HOP_LE' },
    ]);
    expect(
      expectErrorResponse(mismatch, 400, 'DU_LIEU_KHONG_HOP_LE').loi,
    ).toEqual([{ truong: 'xacNhan', ma: 'XAC_NHAN_KHONG_KHOP' }]);
    expect(await passwordHashOf(account.taiKhoanId)).toBe(before);
    expect(
      (
        await h.db
          .getRepository(MaXacThuc)
          .findOneByOrFail({ taiKhoanId: account.taiKhoanId })
      ).daDungLuc,
    ).toBeNull();
    for (const res of [weak, mismatch])
      expect(res.text).not.toContain(NEW_PASSWORD);

    expect((await post(RESET, body(token))).status).toBe(200);
  });

  it.each([
    ['thiếu', undefined],
    ['rỗng', ''],
    ['quá 512 ký tự', 'x'.repeat(513)],
    ['số', 42],
  ])(
    'E2E-MK03 QM-11 resetToken %s: 400 DU_LIEU_KHONG_HOP_LE, loi resetToken:RESET_TOKEN_KHONG_HOP_LE',
    async (_label, token) => {
      const res = await post(RESET, body(token));
      expect(expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE').loi).toEqual(
        [{ truong: 'resetToken', ma: 'RESET_TOKEN_KHONG_HOP_LE' }],
      );
    },
  );

  it('E2E-MK04 QM-11 token hết hạn (đúng 10:00 sau xác minh), token rác, access token: 403 RESET_TOKEN_HET_HIEU_LUC (KHÔNG phải 401), không chiTiet, mật khẩu không đổi; 9:59 thì qua', async () => {
    const account = await newLoginAccount(h.db);
    const token = await tokenOverHttp(account.email);
    const before = await passwordHashOf(account.taiKhoanId);
    const { session } = await h.newSession();
    vi.setSystemTime(at(600));

    for (const value of [token, 'khong.phai.jwt', session.accessToken]) {
      const error = expectErrorResponse(
        await post(RESET, body(value)),
        403,
        'RESET_TOKEN_HET_HIEU_LUC',
      );
      expect(error.chiTiet).toBeUndefined();
      expect(error.thongBao).toBe(
        'Yêu cầu đặt lại mật khẩu đã hết hiệu lực. Vui lòng nhập email để nhận mã mới.',
      );
    }
    expect(await passwordHashOf(account.taiKhoanId)).toBe(before);

    vi.setSystemTime(at(601));
    const fresh = await tokenOverHttp(account.email);
    vi.setSystemTime(at(601 + 599));
    expect((await post(RESET, body(fresh))).status).toBe(200);
  });

  it('E2E-MK05 QM-13 dùng lại token sau khi thành công: 403 RESET_TOKEN_HET_HIEU_LUC; mật khẩu giữ bản vừa đặt', async () => {
    const account = await newLoginAccount(h.db);
    const token = await tokenOverHttp(account.email);
    expect((await post(RESET, body(token))).status).toBe(200);

    expectErrorResponse(
      await post(RESET, body(token, 'Lan-Thu-Hai-2!')),
      403,
      'RESET_TOKEN_HET_HIEU_LUC',
    );

    expect((await login(account.email, NEW_PASSWORD)).status).toBe(200);
  });

  it('E2E-MK06 QM-12 thân kèm dữ liệu tài khoản khác (taiKhoanId, email): 400 TRUONG_KHONG_DUOC_PHEP, không đổi gì; token của A kèm Authorization của B: chỉ A đổi, phiên của B vẫn sống', async () => {
    const a = await newLoginAccount(h.db);
    const b = await newLoginAccount(h.db);
    const token = await tokenOverHttp(a.email);
    const bLogin = await login(b.email, LOGIN_PASSWORD);
    const bAccess = (bLogin.body as { accessToken: string }).accessToken;

    for (const extra of [{ taiKhoanId: b.taiKhoanId }, { email: b.email }]) {
      const error = expectErrorResponse(
        await post(RESET, { ...body(token), ...extra }),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
      expect(error.loi?.[0]?.ma).toBe('TRUONG_KHONG_DUOC_PHEP');
    }
    const res = await request(h.app.getHttpServer())
      .post(RESET)
      .set('Authorization', `Bearer ${bAccess}`)
      .send(body(token));

    expect(res.status).toBe(200);
    expect((await login(a.email, NEW_PASSWORD)).status).toBe(200);
    expect((await login(b.email, LOGIN_PASSWORD)).status).toBe(200);
    expect((await h.whoami(bAccess)).status).toBe(200);
  });

  it('E2E-MK07 QM-16 QM-15 tài khoản đang bị khoá đăng nhập và có phiên: sau đặt lại, access token cũ 401 PHIEN_HET_HIEU_LUC, cookie refresh cũ 401, đăng nhập bằng mật khẩu mới được ngay', async () => {
    const account = await newLoginAccount(h.db);
    const first = await login(account.email, LOGIN_PASSWORD);
    const access = (first.body as { accessToken: string }).accessToken;
    const cookie = refreshTokenOf(first);
    await h.db
      .getRepository(TaiKhoan)
      .update(
        { taiKhoanId: account.taiKhoanId },
        { soLanDangNhapSai: 5, khoaDangNhapDen: at(900) },
      );
    const token = await tokenOverHttp(account.email);

    expect((await post(RESET, body(token))).status).toBe(200);

    expectErrorResponse(await h.whoami(access), 401, 'PHIEN_HET_HIEU_LUC');
    expectErrorResponse(await h.refresh({ cookie }), 401, 'PHIEN_HET_HIEU_LUC');
    expect((await login(account.email, NEW_PASSWORD)).status).toBe(200);
  });

  it('E2E-MK08 QM-19 NgungHoatDong: 200 { taiKhoanNgung: true, canDangKyLai: false }; đăng nhập bằng mật khẩu mới 403 TAI_KHOAN_NGUNG', async () => {
    const account = await newResetAccount(h.db, 'suspended');

    const res = await post(RESET, body(await tokenOverHttp(account.email)));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ taiKhoanNgung: true, canDangKyLai: false });
    expectErrorResponse(
      await login(account.email, NEW_PASSWORD),
      403,
      'TAI_KHOAN_NGUNG',
    );
  });

  it('E2E-MK09 QM-17 Bệnh nhân chưa xác minh (đăng ký qua HTTP): 200 { canDangKyLai: true }; đăng nhập bằng mật khẩu mới 403 EMAIL_CHUA_XAC_MINH, trangThaiMa CanDangKyLai', async () => {
    const email = 'chua.xac.minh@example.com';
    const reg = await post('/auth/register', {
      hoTen: 'Nguyễn Văn A',
      email,
      soDienThoai: '0901234567',
      matKhau: 'Mat-Khau-Dang-Ky-9!',
      xacNhan: 'Mat-Khau-Dang-Ky-9!',
    });
    expect(reg.status).toBe(201);

    const res = await post(RESET, body(await tokenOverHttp(email)));

    expect(res.body).toEqual({ taiKhoanNgung: false, canDangKyLai: true });
    const error = expectErrorResponse(
      await login(email, NEW_PASSWORD),
      403,
      'EMAIL_CHUA_XAC_MINH',
    );
    expect(error.chiTiet).toMatchObject({
      trangThaiMa: 'CanDangKyLai',
      maXacThucId: null,
    });
  });

  it('E2E-MK10 Bệnh nhân chưa xác minh quá 24 giờ trong lúc giữ token: 404 EMAIL_CHUA_DANG_KY (cùng thân với bước 1); nhân sự về ChoKichHoat: 403 TAI_KHOAN_CHUA_KICH_HOAT', async () => {
    const expiring = await newResetAccount(h.db, 'unverified', {
      thoiDiemTao: at(-86_400 + 60),
    });
    const staff = await newResetAccount(h.db, 'staff');
    const expiringToken = await tokenOverHttp(expiring.email);
    const staffToken = await tokenOverHttp(staff.email);
    await h.db
      .getRepository(TaiKhoan)
      .update(
        { taiKhoanId: staff.taiKhoanId },
        { trangThai: 'ChoKichHoat', matKhauBam: null },
      );
    vi.setSystemTime(at(60));

    const gone = expectErrorResponse(
      await post(RESET, body(expiringToken)),
      404,
      'EMAIL_CHUA_DANG_KY',
    );
    const step1 = expectErrorResponse(
      await post('/auth/forgot-password', { email: expiring.email }),
      404,
      'EMAIL_CHUA_DANG_KY',
    );
    expect(gone).toEqual(step1);
    expectErrorResponse(
      await post(RESET, body(staffToken)),
      403,
      'TAI_KHOAN_CHUA_KICH_HOAT',
    );
  });

  it('E2E-MK11 JSON hỏng: 400 YEU_CAU_KHONG_HOP_LE, không echo nội dung', async () => {
    const res = await request(h.app.getHttpServer())
      .post(RESET)
      .set('Content-Type', 'application/json')
      .send('{"resetToken":"bi-mat-hong",');
    expectErrorResponse(res, 400, 'YEU_CAU_KHONG_HOP_LE');
    expect(res.text).not.toContain('bi-mat-hong');
  });

  it('E2E-MK12 SE-04 stdout/stderr (log đã qua bộ che P5) và mọi thân phản hồi: không mật khẩu mới/cũ, không token, không băm, không email', async () => {
    const account = await newLoginAccount(h.db);
    const token = await tokenOverHttp(account.email);
    const before = (await passwordHashOf(account.taiKhoanId)) ?? '';
    const texts: string[] = [];
    for (const payload of [
      body(token, 'yeu'),
      body(token),
      body(token),
      body('rac.rac.rac'),
    ]) {
      texts.push((await post(RESET, payload)).text);
    }
    const after = (await passwordHashOf(account.taiKhoanId)) ?? '';

    const everything = [...texts, ...output].join('\n');
    for (const secret of [
      NEW_PASSWORD,
      LOGIN_PASSWORD,
      token,
      ...token.split('.'),
      before,
      after,
      account.email,
    ]) {
      expect(everything, secret.slice(0, 6)).not.toContain(secret);
    }
    expect(everything).not.toContain('$argon2id$');
    expect(output.join('\n')).toContain(
      `Tài khoản ${account.taiKhoanId} đặt lại mật khẩu`,
    );
  });
});
