import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { MaXacThuc } from './../src/auth/entities/ma-xac-thuc.entity.js';
import { TaiKhoan } from './../src/auth/entities/tai-khoan.entity.js';
import { ResetTokenService } from './../src/auth/forgot-password/reset-token.service.js';
import { TEST_AUTH_ENV } from './../src/auth/testing/auth-test-env.js';
import { newResetAccount } from './../src/auth/testing/forgot-password-int-helpers.js';
import { setFailureState } from './../src/auth/testing/login-int-helpers.js';
import { T0, at, wrongCodeFor } from './../src/auth/testing/otp-int-helpers.js';
import { readOtpFromMail } from './../src/auth/testing/otp-test-helpers.js';
import { REGISTER_PASSWORD } from './../src/auth/testing/register-int-helpers.js';
import { standalone } from './../src/auth/testing/secret-scan.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { MailService } from './../src/mail/mail.service.js';
import { FakeMailService } from './../src/mail/testing/fake-mail.service.js';

// Task A11 — POST /auth/forgot-password, /resend-otp và /verify-otp qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (bộ lọc lỗi P5,
// ValidationPipe, logger che bí mật), MailService giả. Mã test case: QM-01 (đến khi có resetToken), QM-02, QM-03, QM-04, QM-05, QM-06, QM-07, QM-09, QM-10,
// QM-19 (nửa cấp mã), DN-21 (phần HTTP), SE-04. Mã E2E-Fnn là [đề xuất]. Mỗi ca từ chối chạy cho CẢ HAI route cấp mã (forgot-password và resend-otp):
// hai route cùng một hàm của dịch vụ nhưng khác route, nên route nào cũng phải được kiểm.
const mail = new FakeMailService();
let app: NestExpressApplication;
let db: DataSource;
let output: string[];
const DAY = 24 * 60 * 60;
const ROUTES = [
  ['forgot-password', '/auth/forgot-password'],
  ['resend-otp', '/auth/forgot-password/resend-otp'],
] as const;
const VERIFY = '/auth/forgot-password/verify-otp';

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

const post = (path: string, payload: object) =>
  request(app.getHttpServer()).post(path).send(payload);
const rows = () =>
  db.getRepository(MaXacThuc).find({ order: { maXacThucId: 'ASC' } });
const accountRow = (taiKhoanId: string) =>
  db.getRepository(TaiKhoan).findOneByOrFail({ taiKhoanId });
const codeFromMail = (): string => {
  const message = mail.sent.at(-1);
  if (!message) throw new Error('chưa có thư');
  return readOtpFromMail(message);
};
const ask = async (email: string, path: string = ROUTES[0][1]) => {
  const res = await post(path, { email });
  expect(res.status).toBe(201);
  return { res, code: codeFromMail() };
};
const verify = (email: string, otp: string) => post(VERIFY, { email, otp });

describe.each(ROUTES)('cấp mã qua %s', (_name, path) => {
  it('E2E-F01 201 { hetHanLuc, coTheGuiLaiLuc } và KHÔNG gì khác: không OTP, mã lần gửi, email, cookie; đúng một thư; hàng OTP đúng loại', async () => {
    const account = await newResetAccount(db, 'verified');

    const res = await post(path, { email: account.email });

    expect(res.status).toBe(201);
    expect(String(res.headers['content-type'])).toContain('application/json');
    expect(res.body).toEqual({
      hetHanLuc: at(600).toISOString(),
      coTheGuiLaiLuc: at(60).toISOString(),
    });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.to).toBe(account.email);
    for (const secret of [codeFromMail(), account.email, '$argon2id$']) {
      expect(res.text).not.toContain(secret);
    }
    expect(await rows()).toMatchObject([
      { loai: 'QuenMatKhau', soLanNhapSai: 0 },
    ]);
  });

  it('E2E-F02 QM-02 email lạ: 404 EMAIL_CHUA_DANG_KY (khác 404 của route lạ), không OTP, không thư, không ghi gì', async () => {
    await newResetAccount(db, 'verified');

    const res = await post(path, { email: 'la@example.com' });

    const error = expectErrorResponse(res, 404, 'EMAIL_CHUA_DANG_KY');
    expect(error.chiTiet).toBeUndefined();
    expect(mail.attempts).toHaveLength(0);
    expect(await rows()).toHaveLength(0);
  });

  it.each(['pending-staff', 'suspended-no-password'] as const)(
    'E2E-F03 QM-03/QM-04 tài khoản %s: 403 TAI_KHOAN_CHUA_KICH_HOAT, không OTP, không thư',
    async (kind) => {
      const account = await newResetAccount(db, kind);

      const res = await post(path, { email: account.email });

      expectErrorResponse(res, 403, 'TAI_KHOAN_CHUA_KICH_HOAT');
      expect(mail.attempts).toHaveLength(0);
      expect(await rows()).toHaveLength(0);
    },
  );

  it('E2E-F04 Bệnh nhân chưa xác minh: 23:59:59 được cấp (Q6); đúng 24:00:00 trở đi coi như chưa đăng ký (404), không OTP, không thư', async () => {
    const inside = await newResetAccount(db, 'unverified', {
      thoiDiemTao: at(-DAY + 1),
    });
    const outside = await newResetAccount(db, 'unverified', {
      thoiDiemTao: at(-DAY),
    });

    expect((await post(path, { email: inside.email })).status).toBe(201);
    const res = await post(path, { email: outside.email });

    expectErrorResponse(res, 404, 'EMAIL_CHUA_DANG_KY');
    expect(mail.attempts).toHaveLength(1);
    expect(await rows()).toHaveLength(1);
  });

  it('E2E-F05 QM-10 gửi liên tiếp: 59 giây ⇒ 429 GUI_LAI_QUA_SOM kèm soGiayCho (không thêm hàng, không thêm thư); đúng 60 giây ⇒ 201', async () => {
    const account = await newResetAccount(db, 'verified');
    await ask(account.email, path);

    vi.setSystemTime(at(59));
    const refused = await post(path, { email: account.email });
    const error = expectErrorResponse(refused, 429, 'GUI_LAI_QUA_SOM');
    expect(error.chiTiet).toEqual({ soGiayCho: 1 });
    expect(await rows()).toHaveLength(1);
    expect(mail.attempts).toHaveLength(1);

    vi.setSystemTime(at(60));
    expect((await post(path, { email: account.email })).status).toBe(201);
    expect(await rows()).toHaveLength(2);
  });

  it('E2E-F06 QM-09 gửi thư lỗi: 503 GUI_MAIL_LOI chỉ kèm coTheGuiLaiLuc (không id, không loại lỗi SMTP), có requestId; hàng mới bị thu hồi; thân và log không có email hay OTP', async () => {
    const account = await newResetAccount(db, 'verified');
    mail.failNextWith('AUTH');

    const res = await post(path, { email: account.email });

    const error = expectErrorResponse(res, 503, 'GUI_MAIL_LOI');
    expect(error.chiTiet).toEqual({ coTheGuiLaiLuc: at(60).toISOString() });
    const [row] = await rows();
    expect(row).toMatchObject({ daGuiLuc: null, thuHoiLuc: at(0) });
    const code = readOtpFromMail(mail.attempts[0] ?? ({} as never));
    expect(res.text).not.toContain('AUTH'); // loại lỗi SMTP không ra ngoài; log thì CÓ ghi để truy vết
    const text = res.text + output.join('');
    expect(text).not.toContain(account.email);
    expect(text).not.toMatch(standalone(code));
    expect(output.join('')).toContain('Gửi OTP quên mật khẩu lỗi (AUTH)');
  });

  it.each([
    ['thiếu email', {}],
    ['email rỗng', { email: '' }],
    ['email sai dạng', { email: 'khong-phai-email' }],
    ['email là số', { email: 123 }],
  ])(
    'E2E-F07 %s: 400 DU_LIEU_KHONG_HOP_LE với EMAIL_KHONG_HOP_LE, không chạm DB, không thư, không echo giá trị',
    async (_label, body) => {
      const res = await post(path, body);

      const error = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
      expect(error.loi).toEqual([
        { truong: 'email', ma: 'EMAIL_KHONG_HOP_LE' },
      ]);
      expect(res.text).not.toContain('khong-phai-email');
      expect(mail.attempts).toHaveLength(0);
      expect(await rows()).toHaveLength(0);
    },
  );

  it.each([
    ['maXacThucId', '1'],
    ['otp', '123456'],
    ['taiKhoanId', '1'],
  ])(
    'E2E-F08 trường lạ %s (không có trong PLAN 5.1): 400 TRUONG_KHONG_DUOC_PHEP, không gửi thư',
    async (field, value) => {
      const account = await newResetAccount(db, 'verified');

      const res = await post(path, { email: account.email, [field]: value });

      const error = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
      expect(error.loi).toEqual([
        { truong: field, ma: 'TRUONG_KHONG_DUOC_PHEP' },
      ]);
      expect(mail.attempts).toHaveLength(0);
    },
  );

  it('E2E-F09 email có khoảng trắng hai đầu và tên miền viết hoa vẫn ra đúng tài khoản; thư tới email đã lưu', async () => {
    const account = await newResetAccount(db, 'verified', {
      email: 'Nguoi.Dung.E2e@example.com',
    });

    const res = await post(path, { email: '  nguoi.dung.e2e@EXAMPLE.COM ' });

    expect(res.status).toBe(201);
    expect(mail.sent[0]?.to).toBe(account.email);
  });

  it('E2E-F10 DN-21 tài khoản đang bị khoá đăng nhập tạm vẫn dùng được Quên mật khẩu: 201; bộ đếm và khoá không đổi', async () => {
    const account = await newResetAccount(db, 'verified');
    const locked = { soLanDangNhapSai: 5, khoaDangNhapDen: at(900) };
    await setFailureState(db, account.taiKhoanId, locked);
    const before = await accountRow(account.taiKhoanId);

    const res = await post(path, { email: account.email });

    expect(res.status).toBe(201);
    expect(await accountRow(account.taiKhoanId)).toEqual(before);
    expect(mail.sent).toHaveLength(1);
  });

  it.each(['suspended', 'staff'] as const)(
    'E2E-F11 QM-19 (nửa cấp mã) tài khoản %s có mật khẩu: 201, trạng thái không đổi',
    async (kind) => {
      const account = await newResetAccount(db, kind);
      const before = await accountRow(account.taiKhoanId);

      const res = await post(path, { email: account.email });

      expect(res.status).toBe(201);
      expect(await accountRow(account.taiKhoanId)).toEqual(before);
    },
  );

  it('E2E-F12 route CÔNG KHAI và không dùng Origin: không Origin, Authorization rác bị bỏ qua (A4-B), vẫn 201', async () => {
    const account = await newResetAccount(db, 'verified');

    const res = await request(app.getHttpServer())
      .post(path)
      .set('Authorization', 'Bearer khong.phai.token')
      .send({ email: account.email });

    expect(res.status).toBe(201);
  });
});

describe('verify-otp thành công và resetToken (QM-01 phần A11)', () => {
  it('E2E-F20 200 { resetToken, hetHanLuc } kèm Cache-Control: no-store, KHÔNG cookie; token mang đúng tài khoản và mã xác thực, hạn 10 phút kể từ lúc xác minh; OTP vẫn chưa dùng', async () => {
    const account = await newResetAccount(db, 'verified');
    const { code } = await ask(account.email);
    vi.setSystemTime(at(30));

    const res = await verify(account.email, code);

    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toContain('application/json');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['set-cookie']).toBeUndefined();
    const body = res.body as { resetToken: string; hetHanLuc: string };
    expect(Object.keys(body).sort()).toEqual(['hetHanLuc', 'resetToken']);
    expect(body.hetHanLuc).toBe(at(30 + 600).toISOString());
    const [row] = await rows();
    expect(await app.get(ResetTokenService).verify(body.resetToken)).toEqual({
      taiKhoanId: account.taiKhoanId,
      maXacThucId: row?.maXacThucId,
    });
    expect(row).toMatchObject({ daDungLuc: null, thuHoiLuc: null });
    for (const secret of [code, account.email, '$argon2id$']) {
      expect(res.text).not.toContain(secret);
    }
  });

  it('E2E-F21 verify-otp lặp lại: lần nào cũng 200 kèm no-store, mã vẫn chưa dùng (A12 mới tiêu thụ)', async () => {
    const account = await newResetAccount(db, 'verified');
    const { code } = await ask(account.email);

    for (const seconds of [1, 2]) {
      vi.setSystemTime(at(seconds));
      const res = await verify(account.email, code);
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect((await rows())[0]).toMatchObject({
      daDungLuc: null,
      thuHoiLuc: null,
    });
  });

  it('E2E-F22 verify-otp là route CÔNG KHAI: Authorization rác bị bỏ qua', async () => {
    const account = await newResetAccount(db, 'verified');
    const { code } = await ask(account.email);

    const res = await request(app.getHttpServer())
      .post(VERIFY)
      .set('Authorization', 'Bearer khong.phai.token')
      .send({ email: account.email, otp: code });

    expect(res.status).toBe(200);
  });
});

describe('verify-otp bị từ chối (QM-05, QM-06, QM-07)', () => {
  it('E2E-F30 email lạ, tài khoản chưa kích hoạt, chưa từng cấp mã, mã sai: CÙNG 400 OTP_SAI và CÙNG thân phản hồi (không thêm cách dò email), không ghi gì ở ba ca đầu', async () => {
    const pending = await newResetAccount(db, 'pending-staff');
    const idle = await newResetAccount(db, 'verified');
    const active = await newResetAccount(db, 'staff');
    const { code } = await ask(active.email);
    const before = await rows();

    const unknown = await verify('la@example.com', code);
    const staff = await verify(pending.email, code);
    const noCode = await verify(idle.email, code);
    expect(await rows()).toEqual(before);
    const wrong = await verify(active.email, wrongCodeFor(code));

    const reference = expectErrorResponse(unknown, 400, 'OTP_SAI');
    for (const other of [staff, noCode, wrong]) {
      expect(expectErrorResponse(other, 400, 'OTP_SAI')).toEqual(reference);
    }
  });

  it('E2E-F31 QM-05/QM-06 sai 4 lần rồi đúng thì qua; sai đủ 5 lần thì 400 OTP_HET_LUOT và mã đúng sau đó cũng bị từ chối', async () => {
    const account = await newResetAccount(db, 'verified');
    const { code } = await ask(account.email);
    for (let attempt = 1; attempt <= 4; attempt++) {
      expectErrorResponse(
        await verify(account.email, wrongCodeFor(code)),
        400,
        'OTP_SAI',
      );
    }
    expect((await verify(account.email, code)).status).toBe(200);

    vi.setSystemTime(at(61));
    const second = await ask(account.email);
    for (let attempt = 1; attempt <= 4; attempt++) {
      await verify(account.email, wrongCodeFor(second.code));
    }
    expectErrorResponse(
      await verify(account.email, wrongCodeFor(second.code)),
      400,
      'OTP_HET_LUOT',
    );
    expectErrorResponse(
      await verify(account.email, second.code),
      400,
      'OTP_HET_LUOT',
    );
  });

  it('E2E-F32 QM-07 mã sống 599 giây thì qua, tới 600 giây thì 400 OTP_HET_HAN; mã sai + quá hạn không tăng bộ đếm', async () => {
    const account = await newResetAccount(db, 'verified');
    const { code } = await ask(account.email);

    vi.setSystemTime(at(599));
    expect((await verify(account.email, code)).status).toBe(200);
    vi.setSystemTime(at(600));
    expectErrorResponse(await verify(account.email, code), 400, 'OTP_HET_HAN');
    expectErrorResponse(
      await verify(account.email, wrongCodeFor(code)),
      400,
      'OTP_HET_HAN',
    );
    expect((await rows())[0]?.soLanNhapSai).toBe(0);
  });

  it.each([
    ['otp 5 chữ số', { otp: '12345' }],
    ['otp là số JSON', { otp: 123456 }],
    ['otp có khoảng trắng', { otp: ' 123456' }],
    ['thiếu otp', { otp: undefined }],
  ])(
    'E2E-F33 %s: 400 OTP_KHONG_HOP_LE ở trường otp và KHÔNG đếm lần nhập sai',
    async (_label, overrides) => {
      const account = await newResetAccount(db, 'verified');
      await ask(account.email);

      const res = await post(VERIFY, { email: account.email, ...overrides });

      const error = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
      expect(error.loi).toEqual([{ truong: 'otp', ma: 'OTP_KHONG_HOP_LE' }]);
      expect((await rows())[0]?.soLanNhapSai).toBe(0);
    },
  );

  it.each([
    [
      'email sai dạng',
      { email: 'khong-phai-email' },
      'email',
      'EMAIL_KHONG_HOP_LE',
    ],
    [
      'trường lạ maXacThucId',
      { maXacThucId: '1' },
      'maXacThucId',
      'TRUONG_KHONG_DUOC_PHEP',
    ],
  ])(
    'E2E-F34 %s: 400 DU_LIEU_KHONG_HOP_LE, không echo giá trị',
    async (_label, overrides, truong, ma) => {
      const account = await newResetAccount(db, 'verified');
      const { code } = await ask(account.email);

      const res = await post(VERIFY, {
        email: account.email,
        otp: code,
        ...overrides,
      });

      const error = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
      expect(error.loi).toEqual([{ truong, ma }]);
      expect(res.text).not.toContain('khong-phai-email');
    },
  );
});

describe('quan hệ với mã đăng ký, route lạ và log', () => {
  it('E2E-F40 QM-10 hàng DangKy không bị đụng: đăng ký qua HTTP, cấp mã quên mật khẩu, xác minh QMK, rồi xác minh đăng ký (A6) vẫn 200 và không thu hồi mã QuenMatKhau', async () => {
    const email = 'dang.ky.http@example.com';
    const registered = await post('/auth/register', {
      hoTen: 'Nguyễn Văn A',
      email,
      soDienThoai: '0901234567',
      matKhau: REGISTER_PASSWORD,
      xacNhan: REGISTER_PASSWORD,
    });
    expect(registered.status).toBe(201);
    const registerId = (registered.body as { maXacThucId: string }).maXacThucId;
    const registerCode = codeFromMail();
    const registrationBefore = (await rows()).find(
      (row) => row.maXacThucId === registerId,
    );

    vi.setSystemTime(at(10));
    const { code } = await ask(email);
    expect((await verify(email, code)).status).toBe(200);
    expect(
      (await rows()).find((row) => row.maXacThucId === registerId),
    ).toEqual(registrationBefore);

    const activated = await post('/auth/register/verify-otp', {
      email,
      maXacThucId: registerId,
      otp: registerCode,
    });
    expect(activated.status).toBe(200);
    const qmk = (await rows()).filter((row) => row.loai === 'QuenMatKhau');
    expect(qmk).toHaveLength(1);
    expect(qmk[0]).toMatchObject({ daDungLuc: null, thuHoiLuc: null });
  });

  it('E2E-F41 404 EMAIL_CHUA_DANG_KY khác 404 của route lạ: FE chọn thông báo theo maLoi, không theo mã HTTP', async () => {
    const unknownEmail = await post('/auth/forgot-password', {
      email: 'la@example.com',
    });
    const unknownRoute = await request(app.getHttpServer()).post(
      '/auth/forgot-password/khong-co',
    );
    const wrongMethod = await request(app.getHttpServer()).get(
      '/auth/forgot-password',
    );

    expectErrorResponse(unknownEmail, 404, 'EMAIL_CHUA_DANG_KY');
    expectErrorResponse(unknownRoute, 404, 'KHONG_TIM_THAY');
    expectErrorResponse(wrongMethod, 404, 'KHONG_TIM_THAY');
  });

  it('E2E-F42 SE-04 toàn luồng (cấp mã, gửi lỗi, từ chối, sai mã, đúng mã): stdout/stderr, mọi thân phản hồi KHÔNG chứa OTP, email, băm, khoá; OTP chỉ nằm trong thư, resetToken chỉ nằm trong thân 200 của verify-otp', async () => {
    const account = await newResetAccount(db, 'verified');
    const pending = await newResetAccount(db, 'pending-staff');
    const responses: string[] = [];
    const keep = <T extends { text: string }>(res: T): T => {
      responses.push(res.text);
      return res;
    };

    keep(await post('/auth/forgot-password', { email: 'la@example.com' }));
    keep(await post('/auth/forgot-password', { email: pending.email }));
    mail.failNextWith('AUTH');
    keep(await post('/auth/forgot-password', { email: account.email }));
    vi.setSystemTime(at(61));
    const { code } = await ask(
      account.email,
      '/auth/forgot-password/resend-otp',
    );
    keep(
      await post('/auth/forgot-password/resend-otp', { email: account.email }),
    );
    keep(await verify(account.email, wrongCodeFor(code)));
    const good = keep(await verify(account.email, code));
    const { resetToken } = good.body as { resetToken: string };

    const [header, payload, signature] = resetToken.split('.') as [
      string,
      string,
      string,
    ];
    const codes = mail.attempts.map((message) => readOtpFromMail(message));
    const logs = output.join('');
    const forbidden = [
      account.email,
      pending.email,
      '$argon2id$',
      TEST_AUTH_ENV.JWT_RESET_SECRET,
      TEST_AUTH_ENV.JWT_ACCESS_SECRET,
      TEST_AUTH_ENV.OTP_HMAC_SECRET,
      resetToken,
      header,
      payload,
      signature,
    ];
    for (const literal of forbidden) {
      expect(logs, 'stdout/stderr').not.toContain(literal);
      for (const text of responses.filter((t) => t !== good.text)) {
        expect(text, 'thân phản hồi').not.toContain(literal);
      }
    }
    for (const otp of codes) {
      expect(logs, 'stdout/stderr').not.toMatch(standalone(otp));
      for (const text of responses) {
        expect(text, 'thân phản hồi').not.toMatch(standalone(otp));
      }
    }
    for (const literal of [
      account.email,
      '$argon2id$',
      TEST_AUTH_ENV.JWT_RESET_SECRET,
      ...codes,
    ]) {
      expect(good.text).not.toContain(literal);
    }
    expect(logs).toContain('xác minh OTP quên mật khẩu đúng'); // thông tin chẩn đoán vẫn còn
  });
});
