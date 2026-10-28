import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { BenhNhan } from './../src/auth/entities/benh-nhan.entity.js';
import { MaXacThuc } from './../src/auth/entities/ma-xac-thuc.entity.js';
import { PhienDangNhap } from './../src/auth/entities/phien-dang-nhap.entity.js';
import { TaiKhoan } from './../src/auth/entities/tai-khoan.entity.js';
import { ViNoiBo } from './../src/auth/entities/vi-noi-bo.entity.js';
import { T0, at, wrongCodeFor } from './../src/auth/testing/otp-int-helpers.js';
import { readOtpFromMail } from './../src/auth/testing/otp-test-helpers.js';
import { REGISTER_PASSWORD } from './../src/auth/testing/register-int-helpers.js';
import { standalone } from './../src/auth/testing/secret-scan.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { MailService } from './../src/mail/mail.service.js';
import { FakeMailService } from './../src/mail/testing/fake-mail.service.js';

// Task A6 — POST /auth/register/verify-otp và /resend-otp qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (bộ lọc lỗi P5,
// ValidationPipe, logger che bí mật), MailService giả. Mã test case: DK-02, 18, 20, 22, 24, 28, 29, 30, 31, 38, 39, 40, 43, 44, 45, 48, 49, 50;
// SE-04, SE-05. Mã E2E-Vnn là [đề xuất].
const mail = new FakeMailService();
let app: NestExpressApplication;
let db: DataSource;
let output: string[];
const DAY = 24 * 60 * 60;

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

const registerBody = (overrides: Record<string, unknown> = {}) => ({
  hoTen: 'Nguyễn Văn A',
  email: 'dang.ky@example.com',
  soDienThoai: '0901234567',
  matKhau: REGISTER_PASSWORD,
  xacNhan: REGISTER_PASSWORD,
  ...overrides,
});
const post = (path: string, payload: object) =>
  request(app.getHttpServer()).post(path).send(payload);
const accounts = () => db.getRepository(TaiKhoan).find();
const rows = () =>
  db.getRepository(MaXacThuc).find({ order: { maXacThucId: 'ASC' } });
const count = (entity: new () => object) => db.getRepository(entity).count();

interface Registered {
  email: string;
  id: string;
  code: string;
}

/** Mã OTP trong thư giả thứ `index` (mặc định: thư gửi thành công gần nhất); đây là cách duy nhất biết mã, như người dùng thật. */
function codeFromMail(index?: number): string {
  const message = index === undefined ? mail.sent.at(-1) : mail.attempts[index];
  if (!message) throw new Error('chưa có thư');
  return readOtpFromMail(message);
}

/** Đăng ký qua HTTP rồi đọc mã từ thư giả vừa nhận. */
async function signUp(
  overrides: Record<string, unknown> = {},
): Promise<Registered> {
  const body = registerBody(overrides);
  const res = await post('/auth/register', body);
  expect(res.status).toBe(201);
  return {
    email: String(body.email),
    id: (res.body as { maXacThucId: string }).maXacThucId,
    code: codeFromMail(),
  };
}
const verify = (r: Registered, overrides: Record<string, unknown> = {}) =>
  post('/auth/register/verify-otp', {
    email: r.email,
    maXacThucId: r.id,
    otp: r.code,
    ...overrides,
  });
const resend = (r: Registered, overrides: Record<string, unknown> = {}) =>
  post('/auth/register/resend-otp', {
    email: r.email,
    maXacThucId: r.id,
    ...overrides,
  });
const wrongAttempts = async (id: string) =>
  (await db.getRepository(MaXacThuc).findOneByOrFail({ maXacThucId: id }))
    .soLanNhapSai;

describe('verify-otp thành công (DK-02, DK-40, DK-45)', () => {
  it('E2E-V01 200 { daXacMinh: true } và KHÔNG gì khác: không token, cookie, OTP, email, mật khẩu, băm, mã tài khoản; tài khoản đã xác minh có hồ sơ + ví 0/0; không phiên đăng nhập', async () => {
    const r = await signUp();
    const [before] = await accounts();

    const res = await verify(r);

    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toContain('application/json');
    expect(res.body).toEqual({ daXacMinh: true });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['authorization']).toBeUndefined();
    const [account] = await accounts();
    for (const secret of [
      r.code,
      r.email,
      REGISTER_PASSWORD,
      before?.matKhauBam ?? 'thiếu',
      '$argon2id$',
    ]) {
      expect(res.text).not.toContain(secret);
    }
    expect(account).toMatchObject({
      daXacMinhEmail: true,
      soLanDangNhapSai: 0,
    });
    expect(await count(BenhNhan)).toBe(1);
    const [wallet] = await db.getRepository(ViNoiBo).find();
    expect(wallet).toMatchObject({
      benhNhanId: account?.taiKhoanId,
      soDu: '0.00',
      soTienDangGiu: '0.00',
    });
    expect(await count(PhienDangNhap)).toBe(0); // đăng nhập là việc của A8
    for (const row of await rows()) expect(row.matKhauBamDangKy).toBeNull(); // DK-45
  });

  it('E2E-V02 hai endpoint đều CÔNG KHAI: Authorization rác bị bỏ qua (A4-B), không 401', async () => {
    const r = await signUp();
    vi.setSystemTime(at(61));
    const sent = await request(app.getHttpServer())
      .post('/auth/register/resend-otp')
      .set('Authorization', 'Bearer khong.phai.token')
      .send({ email: r.email, maXacThucId: r.id });
    expect(sent.status).toBe(201);

    const newest = (sent.body as { maXacThucId: string }).maXacThucId;
    const code = codeFromMail();
    const verified = await request(app.getHttpServer())
      .post('/auth/register/verify-otp')
      .set('Authorization', 'Bearer khong.phai.token')
      .send({ email: r.email, maXacThucId: newest, otp: code });
    expect(verified.status).toBe(200);
  });
});

describe('dữ liệu sai → 400 DU_LIEU_KHONG_HOP_LE, không chạm DB, không đếm lần sai (XM-01..04)', () => {
  it('E2E-V03 sai định dạng email, mã lần gửi, OTP: báo đủ trường, không echo giá trị; hàng OTP không bị đếm', async () => {
    const r = await signUp();

    const res = await post('/auth/register/verify-otp', {
      email: 'khong-phai-email',
      maXacThucId: '0',
      otp: '12ab',
    });

    const error = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
    expect(
      [...(error.loi ?? [])].sort((a, b) => a.truong.localeCompare(b.truong)),
    ).toEqual([
      { truong: 'email', ma: 'EMAIL_KHONG_HOP_LE' },
      { truong: 'maXacThucId', ma: 'MA_XAC_THUC_KHONG_HOP_LE' },
      { truong: 'otp', ma: 'OTP_KHONG_HOP_LE' },
    ]);
    for (const echoed of ['khong-phai-email', '12ab']) {
      expect(res.text).not.toContain(echoed);
    }
    expect(await wrongAttempts(r.id)).toBe(0);
  });

  it.each([
    ['otp là số JSON (mất số 0 đứng đầu)', { otp: 123456 }],
    ['otp 5 chữ số', { otp: '12345' }],
    ['otp có khoảng trắng', { otp: ' 123456' }],
    ['mã lần gửi là số JSON', { maXacThucId: 1 }],
    ['mã lần gửi vượt BIGINT', { maXacThucId: '9223372036854775808' }],
  ])(
    'E2E-V04 %s → 400 và KHÔNG đếm lần nhập sai (lọt xuống OtpService sẽ bị tính là một lần sai)',
    async (_label, overrides) => {
      const r = await signUp();

      const res = await verify(r, overrides);

      expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
      expect(await wrongAttempts(r.id)).toBe(0);
    },
  );

  it.each([
    ['taiKhoanId', '1'],
    ['loai', 'QuenMatKhau'],
    ['matKhau', REGISTER_PASSWORD],
  ])(
    'E2E-V05 trường lạ %s → 400 TRUONG_KHONG_DUOC_PHEP ở cả hai endpoint; resend không nhận otp',
    async (field, value) => {
      const r = await signUp();
      // Gọi TUẦN TỰ: tạo sẵn hai request supertest rồi mới await thì request đầu đóng mất máy chủ của request sau
      for (const send of [
        () => verify(r, { [field]: value }),
        () => resend(r, { [field]: value }),
      ]) {
        const error = expectErrorResponse(
          await send(),
          400,
          'DU_LIEU_KHONG_HOP_LE',
        );
        expect(error.loi).toEqual([
          { truong: field, ma: 'TRUONG_KHONG_DUOC_PHEP' },
        ]);
      }
      const withOtp = await resend(r, { otp: r.code });
      expect(
        expectErrorResponse(withOtp, 400, 'DU_LIEU_KHONG_HOP_LE').loi,
      ).toEqual([{ truong: 'otp', ma: 'TRUONG_KHONG_DUOC_PHEP' }]);
      expect(await wrongAttempts(r.id)).toBe(0);
    },
  );

  it('E2E-V06 thân rỗng và JSON hỏng → 400, không 500', async () => {
    expectErrorResponse(
      await post('/auth/register/verify-otp', {}),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    expectErrorResponse(
      await post('/auth/register/resend-otp', {}),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    const broken = await request(app.getHttpServer())
      .post('/auth/register/verify-otp')
      .set('Content-Type', 'application/json')
      .send('{"otp": ');
    expectErrorResponse(broken, 400, 'YEU_CAU_KHONG_HOP_LE');
  });
});

describe('mã lỗi và trạng thái HTTP từng nhánh của verify-otp (DK-18, 20, 22, 29, 30, 31, 43, 49, 50)', () => {
  it('E2E-V10 (DK-18, DK-20) sai → 400 OTP_SAI (đếm); đủ 5 lần → 400 OTP_HET_LUOT; mã đúng sau đó vẫn OTP_HET_LUOT', async () => {
    const r = await signUp();
    const wrong = { otp: wrongCodeFor(r.code) };
    for (let i = 1; i <= 4; i++) {
      expectErrorResponse(await verify(r, wrong), 400, 'OTP_SAI');
    }
    expect(await wrongAttempts(r.id)).toBe(4);
    expectErrorResponse(await verify(r, wrong), 400, 'OTP_HET_LUOT');
    expectErrorResponse(await verify(r), 400, 'OTP_HET_LUOT');
    expect(await count(BenhNhan)).toBe(0);
  });

  it('E2E-V11 (DK-22) hết hạn → 400 OTP_HET_HAN kể cả mã sai (không đếm); bị thay thế → 409 OTP_BI_THAY_THE (DK-43)', async () => {
    const first = await signUp();
    vi.setSystemTime(at(601));
    expectErrorResponse(
      await verify(first, { otp: wrongCodeFor(first.code) }),
      400,
      'OTP_HET_HAN',
    );
    expect(await wrongAttempts(first.id)).toBe(0);

    vi.setSystemTime(at(700));
    await signUp(); // hàng mới gửi thành công ⇒ hàng cũ bị thay thế
    expectErrorResponse(await verify(first), 409, 'OTP_BI_THAY_THE');
  });

  it('E2E-V12 (DK-49, DK-31) hàng chưa gửi, email lạ, sai cặp email–id: cùng 400 OTP_SAI, thân giống hệt nhau, không đếm', async () => {
    mail.failNextWith('CONNECTION');
    const failed = await post('/auth/register', registerBody());
    expectErrorResponse(failed, 503, 'GUI_MAIL_LOI');
    const unsent: Registered = {
      email: 'dang.ky@example.com',
      id: String(
        (failed.body as { chiTiet: { maXacThucId: string } }).chiTiet
          .maXacThucId,
      ),
      code: codeFromMail(0), // thư gửi lỗi vẫn mang mã
    };
    vi.setSystemTime(at(61));
    const other = await signUp({ email: 'khac@example.com' });

    const responses = [
      await verify(unsent), // hàng chưa gửi: ngay cả mã đúng cũng không dùng được
      await verify(other, { email: 'la.hoan.toan@example.com' }),
      await verify(other, { email: unsent.email }), // id của tài khoản khác
    ];

    for (const res of responses) expectErrorResponse(res, 400, 'OTP_SAI');
    expect(new Set(responses.map((res) => res.text)).size).toBe(1);
    expect(await wrongAttempts(unsent.id)).toBe(0);
    expect(await wrongAttempts(other.id)).toBe(0);
  });

  it('E2E-V13 (DK-24, DK-30, DK-50) 24 giờ: 23:59:59 còn xác minh được; đúng 24:00:00 → 409 CAN_DANG_KY_LAI (không ghi, không xoá); dữ liệu đăng ký đã xoá → 409 CAN_DANG_KY_LAI', async () => {
    const first = await signUp();
    vi.setSystemTime(at(DAY - 300));
    const second = (await resend(first)).body as { maXacThucId: string };
    const near: Registered = {
      ...first,
      id: second.maXacThucId,
      code: codeFromMail(),
    };
    const accountBefore = await accounts();
    const rowsBefore = await rows();

    vi.setSystemTime(at(DAY));
    expectErrorResponse(await verify(near), 409, 'CAN_DANG_KY_LAI');
    expect(await accounts()).toEqual(accountBefore);
    expect(await rows()).toEqual(rowsBefore); // mã chưa dùng: hoàn tác trọn

    vi.setSystemTime(at(DAY - 1));
    expect((await verify(near)).status).toBe(200);

    // sau xác minh: hàng cũ đã dùng/ thu hồi, dữ liệu đăng ký bị xoá ⇒ dùng lại chỉ nhận OTP_SAI hoặc CAN_DANG_KY_LAI, không bao giờ xác minh lần hai
    expect([400, 409]).toContain((await verify(first)).status);
    expect(await count(BenhNhan)).toBe(1);
  });

  it('E2E-V14 bị ngưng hoạt động: mã đúng → 403 TAI_KHOAN_NGUNG (có thongBao theo PLAN 5.5, không requestId vì là 4xx); mã sai vẫn 400 OTP_SAI', async () => {
    const r = await signUp();
    await db
      .getRepository(TaiKhoan)
      .update({ email: r.email }, { trangThai: 'NgungHoatDong' });

    const res = await verify(r);

    const error = expectErrorResponse(res, 403, 'TAI_KHOAN_NGUNG');
    expect(error.thongBao).toBe(
      'Tài khoản đã bị ngưng hoạt động. Vui lòng liên hệ quản trị viên.',
    );
    expect(error.requestId).toBeUndefined();
    expect(await count(BenhNhan)).toBe(0);
    expectErrorResponse(
      await verify(r, { otp: wrongCodeFor(r.code) }),
      400,
      'OTP_SAI',
    );
  });
});

describe('resend-otp qua HTTP (DK-24, DK-28, DK-38, DK-44, DK-48)', () => {
  it('E2E-V20 201 { maXacThucId MỚI, hetHanLuc, coTheGuiLaiLuc }, không OTP; thư tới đúng email; mã mới xác minh được', async () => {
    const r = await signUp();
    vi.setSystemTime(at(61));

    const res = await resend(r);

    expect(res.status).toBe(201);
    expect(Object.keys(res.body as object).sort()).toEqual([
      'coTheGuiLaiLuc',
      'hetHanLuc',
      'maXacThucId',
    ]);
    const body = res.body as {
      maXacThucId: string;
      hetHanLuc: string;
      coTheGuiLaiLuc: string;
    };
    expect(body.maXacThucId).not.toBe(r.id);
    expect(body.hetHanLuc).toBe(at(661).toISOString());
    expect(body.coTheGuiLaiLuc).toBe(at(121).toISOString());
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(mail.sent.at(-1)?.to).toBe(r.email);
    const code = codeFromMail();
    expect(res.text).not.toMatch(standalone(code));
    expect((await verify({ ...r, id: body.maXacThucId, code })).status).toBe(
      200,
    );
  });

  it('E2E-V21 (DK-28) quá sớm → 429 GUI_LAI_QUA_SOM kèm chiTiet.soGiayCho; mã cũ bị thay thế → 409 OTP_BI_THAY_THE (DK-44); không thư thừa', async () => {
    const r = await signUp();
    vi.setSystemTime(at(30));
    const tooSoon = expectErrorResponse(
      await resend(r),
      429,
      'GUI_LAI_QUA_SOM',
    );
    expect(tooSoon.chiTiet).toEqual({ soGiayCho: 30 });
    expect(mail.attempts).toHaveLength(1);

    vi.setSystemTime(at(61));
    expect((await resend(r)).status).toBe(201);
    vi.setSystemTime(at(200));
    expectErrorResponse(await resend(r), 409, 'OTP_BI_THAY_THE');
    expect(mail.attempts).toHaveLength(2);
  });

  it('E2E-V22 (DK-48) gửi thư lỗi → 503 GUI_MAIL_LOI có requestId, chiTiet { maXacThucId của hàng lỗi, coTheGuiLaiLuc }, không lộ loại lỗi SMTP; gửi lại bằng chính id đó thành công; log ERROR cùng requestId', async () => {
    const r = await signUp();
    vi.setSystemTime(at(61));
    mail.failNextWith('AUTH');

    const res = await resend(r);

    const error = expectErrorResponse(res, 503, 'GUI_MAIL_LOI'); // kiểm luôn requestId dạng UUID ở mọi 5xx
    const detail = error.chiTiet as {
      maXacThucId: string;
      coTheGuiLaiLuc: string;
    };
    expect(detail.coTheGuiLaiLuc).toBe(at(121).toISOString());
    expect(res.text).not.toMatch(/smtp|auth|timeout|tls/i);
    expect(output.join('')).toContain(String(error.requestId));

    vi.setSystemTime(at(121));
    const again = await resend(r, { maXacThucId: detail.maXacThucId });
    expect(again.status).toBe(201);
  });

  it('E2E-V23 (DK-38) bị ngưng hoạt động → 403 TAI_KHOAN_NGUNG, không hàng mới, không thư; quá 24 giờ → 409 CAN_DANG_KY_LAI, không hàng mới', async () => {
    const r = await signUp();
    await db
      .getRepository(TaiKhoan)
      .update({ email: r.email }, { trangThai: 'NgungHoatDong' });
    vi.setSystemTime(at(61));
    expectErrorResponse(await resend(r), 403, 'TAI_KHOAN_NGUNG');
    await db
      .getRepository(TaiKhoan)
      .update(
        { email: r.email },
        { trangThai: 'DangHoatDong', thoiDiemTao: at(-DAY) },
      );
    expectErrorResponse(await resend(r), 409, 'CAN_DANG_KY_LAI');

    expect(await rows()).toHaveLength(1);
    expect(mail.attempts).toHaveLength(1);
  });

  it('E2E-V24 email lạ hoặc sai cặp → 400 OTP_SAI cùng một thân, không hàng mới, không thư', async () => {
    const r = await signUp();
    vi.setSystemTime(at(61));

    const unknown = await resend(r, { email: 'la@example.com' });
    const unknownId = await resend(r, { maXacThucId: '999999' });

    expectErrorResponse(unknown, 400, 'OTP_SAI');
    expectErrorResponse(unknownId, 400, 'OTP_SAI');
    expect(unknown.text).toBe(unknownId.text);
    expect(await rows()).toHaveLength(1);
    expect(mail.attempts).toHaveLength(1);
  });
});

describe('log không chứa mật khẩu, băm, OTP, email (DK-39, SE-04)', () => {
  it('E2E-V30 toàn bộ stdout/stderr của luồng xác minh thành công và các luồng lỗi sạch', async () => {
    const r = await signUp();
    const [account] = await accounts();
    const hash = account?.matKhauBam ?? 'thiếu';
    await verify(r, { otp: wrongCodeFor(r.code) }); // 400
    await verify(r, { maXacThucId: '999999' }); // 400
    vi.setSystemTime(at(30));
    await resend(r); // 429
    vi.setSystemTime(at(61));
    mail.failNextWith('AUTH');
    await resend(r); // 503
    await db
      .getRepository(TaiKhoan)
      .update({ email: r.email }, { trangThai: 'NgungHoatDong' });
    await verify(r); // 403
    await db
      .getRepository(TaiKhoan)
      .update({ email: r.email }, { trangThai: 'DangHoatDong' });
    expect((await verify(r)).status).toBe(200);

    const codes = mail.attempts.map((m) => readOtpFromMail(m));
    const logText = output.join('');
    expect(logText).not.toContain(REGISTER_PASSWORD);
    expect(logText).not.toContain(r.email);
    expect(logText).not.toContain(hash);
    expect(logText).not.toContain('$argon2id$');
    for (const code of codes) expect(logText).not.toMatch(standalone(code));
  });
});

describe('đồng thời qua HTTP (DK-29) và nhiều tài khoản cùng lúc', () => {
  it('E2E-V40 (DK-29) 5 yêu cầu xác minh cùng mã đúng: đúng 1 lần 200, 4 lần 400 OTP_SAI; không 500; 1 hồ sơ, 1 ví', async () => {
    const r = await signUp();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => verify(r)),
    );

    expect(results.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      200, 400, 400, 400, 400,
    ]);
    for (const res of results.filter((x) => x.status === 400)) {
      expectErrorResponse(res, 400, 'OTP_SAI');
    }
    expect(await count(BenhNhan)).toBe(1);
    expect(await count(ViNoiBo)).toBe(1);
  });

  it('E2E-V41 6 người xác minh CÙNG LÚC (4 vòng, mỗi người một email): tất cả 200, không 500 (deadlock chéo tài khoản đã sửa ở A5-C); mỗi người đúng 1 hồ sơ và 1 ví', async () => {
    for (let round = 0; round < 4; round++) {
      await resetTables(db);
      mail.reset();
      vi.setSystemTime(T0);
      const people: Registered[] = [];
      for (let i = 0; i < 6; i++) {
        people.push(
          await signUp({
            email: `nguoi${String(i)}.vong${String(round)}@example.com`,
          }),
        );
      }

      const results = await Promise.all(people.map((p) => verify(p)));

      expect(
        results.map((res) => res.status),
        `vòng ${String(round)}`,
      ).toEqual([200, 200, 200, 200, 200, 200]);
      expect(await count(BenhNhan)).toBe(6);
      expect(await count(ViNoiBo)).toBe(6);
    }
  }, 120_000);
});
