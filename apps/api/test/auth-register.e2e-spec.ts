import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { MaXacThuc } from './../src/auth/entities/ma-xac-thuc.entity.js';
import { TaiKhoan } from './../src/auth/entities/tai-khoan.entity.js';
import {
  insertMaXacThuc,
  insertTaiKhoan,
} from './../src/auth/entities/testing/auth-fixtures.js';
import { T0, at } from './../src/auth/testing/otp-int-helpers.js';
import { readOtpFromMail } from './../src/auth/testing/otp-test-helpers.js';
import { REGISTER_PASSWORD } from './../src/auth/testing/register-int-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { MailService } from './../src/mail/mail.service.js';
import { FakeMailService } from './../src/mail/testing/fake-mail.service.js';

// Task A5 — POST /auth/register qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (bộ lọc lỗi P5, ValidationPipe, logger che bí mật),
// MailService giả. Mã test case: DK-01, 04–09, 11, 12–13, 25, 27, 37, 39, 40, 41; SE-04, SE-05. Mã E2E-Rnn là [đề xuất].
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

const body = (overrides: Record<string, unknown> = {}) => ({
  hoTen: 'Nguyễn Văn A',
  email: 'dang.ky@example.com',
  soDienThoai: '0901234567',
  matKhau: REGISTER_PASSWORD,
  xacNhan: REGISTER_PASSWORD,
  ...overrides,
});
const register = (payload: object) =>
  request(app.getHttpServer()).post('/auth/register').send(payload);
const standalone = (code: string) => new RegExp(`(?<![0-9])${code}(?![0-9])`);
const accounts = () => db.getRepository(TaiKhoan).find();
const otpRows = () => db.getRepository(MaXacThuc).find();

describe('đăng ký thành công (DK-01, DK-40)', () => {
  it('E2E-R01 201 + { maXacThucId, hetHanLuc, coTheGuiLaiLuc }; KHÔNG có OTP, email, mật khẩu, băm hay mã tài khoản; thư tới đúng email; endpoint công khai', async () => {
    const res = await register(body());

    expect(res.status).toBe(201);
    expect(String(res.headers['content-type'])).toContain('application/json');
    expect(Object.keys(res.body as object).sort()).toEqual([
      'coTheGuiLaiLuc',
      'hetHanLuc',
      'maXacThucId',
    ]);
    const payload = res.body as {
      maXacThucId: string;
      hetHanLuc: string;
      coTheGuiLaiLuc: string;
    };
    expect(payload.hetHanLuc).toBe(at(600).toISOString());
    expect(payload.coTheGuiLaiLuc).toBe(at(60).toISOString());
    expect(res.headers['set-cookie']).toBeUndefined();

    expect(mail.attempts).toHaveLength(1);
    const sent = mail.sent[0];
    if (!sent) throw new Error('chưa có thư');
    expect(sent.to).toBe('dang.ky@example.com');
    const code = readOtpFromMail(sent);
    const [account] = await accounts();
    // Đúng ba khoá ở trên đã loại trừ mã tài khoản (id nhỏ nên so chuỗi con với maXacThucId sẽ trùng chữ số); ở đây kiểm các bí mật còn lại
    for (const secret of [
      REGISTER_PASSWORD,
      'dang.ky@example.com',
      account?.matKhauBam ?? 'thiếu',
    ]) {
      expect(res.text).not.toContain(secret);
    }
    expect(res.text).not.toMatch(standalone(code));
    expect(account).toMatchObject({
      daXacMinhEmail: false,
      loaiTaiKhoan: 'BenhNhan',
    });
  });

  it('E2E-R02 route công khai: token rác trong Authorization bị bỏ qua (A4-B), không 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .set('Authorization', 'Bearer khong.phai.token')
      .send(body());
    expect(res.status).toBe(201);
  });
});

describe('dữ liệu sai → 400 DU_LIEU_KHONG_HOP_LE kèm loi[] đúng trường (DK-04..DK-09)', () => {
  it('E2E-R03 nhiều trường sai cùng lúc: báo đủ, không tạo gì, không thư, không echo giá trị người dùng gửi', async () => {
    const res = await register(
      body({
        hoTen: '   ',
        email: 'khong-phai-email',
        soDienThoai: '123',
        matKhau: 'yeu',
        xacNhan: 'khac',
      }),
    );

    const error = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
    expect(
      [...(error.loi ?? [])].sort((a, b) => a.truong.localeCompare(b.truong)),
    ).toEqual([
      { truong: 'email', ma: 'EMAIL_KHONG_HOP_LE' },
      { truong: 'hoTen', ma: 'HO_TEN_KHONG_HOP_LE' },
      { truong: 'matKhau', ma: 'MAT_KHAU_KHONG_HOP_LE' },
      { truong: 'soDienThoai', ma: 'SDT_KHONG_HOP_LE' },
      { truong: 'xacNhan', ma: 'XAC_NHAN_KHONG_KHOP' },
    ]);
    expect(res.text).not.toContain('khong-phai-email');
    expect(res.text).not.toContain('yeu');
    expect(await accounts()).toHaveLength(0);
    expect(mail.attempts).toHaveLength(0);
  });

  it.each([
    ['loaiTaiKhoan', 'QuanTriVien'],
    ['trangThai', 'DangHoatDong'],
    ['daXacMinhEmail', true],
    ['taiKhoanId', '1'],
  ])(
    'E2E-R04 trường lạ %s → 400 TRUONG_KHONG_DUOC_PHEP: không leo thang đặc quyền, không tạo tài khoản',
    async (field, value) => {
      const res = await register(body({ [field]: value }));
      const error = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
      expect(error.loi).toEqual([
        { truong: field, ma: 'TRUONG_KHONG_DUOC_PHEP' },
      ]);
      expect(await accounts()).toHaveLength(0);
    },
  );

  it('E2E-R05 thân rỗng và JSON hỏng → 400, không 500', async () => {
    expectErrorResponse(await register({}), 400, 'DU_LIEU_KHONG_HOP_LE');
    const broken = await request(app.getHttpServer())
      .post('/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"hoTen": ');
    expectErrorResponse(broken, 400, 'YEU_CAU_KHONG_HOP_LE');
  });
});

describe('các nhánh nghiệp vụ qua HTTP (DK-11, DK-12, DK-13, DK-37, DK-41)', () => {
  it('E2E-R06 email đã xác minh hoặc nhân sự → 409 EMAIL_DA_DUNG, không thư', async () => {
    await insertTaiKhoan(db, {
      email: 'da.xac.minh@example.com',
      daXacMinhEmail: true,
    });
    await insertTaiKhoan(db, {
      email: 'nhan.su@example.com',
      loaiTaiKhoan: 'BacSi',
      trangThai: 'ChoKichHoat',
      matKhauBam: null,
      daXacMinhEmail: false,
      thoiDiemTao: at(-30 * DAY),
    });
    for (const email of ['da.xac.minh@example.com', 'nhan.su@example.com']) {
      const res = await register(body({ email }));
      const error = expectErrorResponse(res, 409, 'EMAIL_DA_DUNG');
      expect(error.thongBao).toBe(
        'Email này đã được sử dụng. Vui lòng đăng nhập.',
      );
    }
    expect(mail.attempts).toHaveLength(0);
    expect(await accounts()).toHaveLength(2); // nhân sự quá hạn KHÔNG bị dọn (H1)
  });

  it('E2E-R07 đăng ký lại cùng email: 59 giây → 429 GUI_LAI_QUA_SOM kèm chiTiet.soGiayCho; 60 giây → 201 với hàng OTP mới, tài khoản không đổi', async () => {
    expect((await register(body())).status).toBe(201);
    const before = await accounts();

    vi.setSystemTime(at(59));
    const tooSoon = await register(body({ hoTen: 'Người Khác' }));
    const error = expectErrorResponse(tooSoon, 429, 'GUI_LAI_QUA_SOM');
    expect(error.chiTiet).toEqual({ soGiayCho: 1 });
    expect(mail.attempts).toHaveLength(1);

    vi.setSystemTime(at(60));
    expect((await register(body({ hoTen: 'Người Khác' }))).status).toBe(201);
    expect(mail.attempts).toHaveLength(2);
    expect(await otpRows()).toHaveLength(2);
    expect(await accounts()).toEqual(before); // tai_khoan không đổi một cột nào
  });

  it('E2E-R08 tài khoản chưa xác minh quá 24 giờ → xoá lười rồi tạo mới, 201', async () => {
    const old = await insertTaiKhoan(db, {
      email: 'dang.ky@example.com',
      daXacMinhEmail: false,
      thoiDiemTao: at(-DAY - 5),
    });
    await insertMaXacThuc(db, old.taiKhoanId, { taoLuc: at(-DAY - 5) });

    const res = await register(body());

    expect(res.status).toBe(201);
    const [account] = await accounts();
    expect(account?.taiKhoanId).not.toBe(old.taiKhoanId);
    expect(await otpRows()).toHaveLength(1);
  });
});

describe('gửi mail lỗi → 503 GUI_MAIL_LOI (DK-25, quyết định A5-B)', () => {
  it('E2E-R09 503 với mã ổn định, có requestId (5xx), chiTiet { maXacThucId, coTheGuiLaiLuc }; không lộ loại lỗi SMTP; tài khoản vẫn còn; log ERROR cùng requestId, sạch email/mật khẩu/OTP', async () => {
    mail.failNextWith('AUTH');

    const res = await register(body());

    const error = expectErrorResponse(res, 503, 'GUI_MAIL_LOI'); // kiểm luôn requestId dạng UUID ở mọi 5xx
    expect(error.thongBao).toBe(
      'Không gửi được email. Vui lòng thử lại sau ít phút.',
    );
    const [row] = await otpRows();
    expect(error.chiTiet).toEqual({
      maXacThucId: row?.maXacThucId,
      coTheGuiLaiLuc: at(60).toISOString(),
    });
    expect(res.text).not.toMatch(/smtp|auth|timeout|tls/i);
    expect(await accounts()).toHaveLength(1);
    expect(row?.daGuiLuc).toBeNull();
    expect(row?.thuHoiLuc).not.toBeNull();

    const attempt = mail.attempts[0];
    if (!attempt) throw new Error('thiếu thư');
    const code = readOtpFromMail(attempt);
    const logText = output.join('');
    expect(logText).toContain(String(error.requestId)); // bộ lọc P5 ghi ERROR kèm requestId
    expect(logText).toContain('GUI_MAIL_LOI');
    expect(logText).not.toContain('dang.ky@example.com');
    expect(logText).not.toContain(REGISTER_PASSWORD);
    expect(logText).not.toContain('$argon2id$');
    expect(logText).not.toMatch(standalone(code));
  });
});

describe('log không chứa mật khẩu, băm, OTP, email (DK-39, SE-04)', () => {
  it('E2E-R10 toàn bộ stdout/stderr của một luồng thành công và các luồng lỗi sạch', async () => {
    await register(body());
    vi.setSystemTime(at(10));
    await register(body()); // 429
    await register(body({ matKhau: 'yeu', xacNhan: 'yeu' })); // 400
    await insertTaiKhoan(db, {
      email: 'da.dung@example.com',
      daXacMinhEmail: true,
    });
    await register(body({ email: 'da.dung@example.com' })); // 409

    const sent = mail.sent[0];
    if (!sent) throw new Error('chưa có thư');
    const code = readOtpFromMail(sent);
    const [account] = await accounts();
    const logText = output.join('');
    expect(logText).not.toContain(REGISTER_PASSWORD);
    expect(logText).not.toContain('dang.ky@example.com');
    expect(logText).not.toContain('da.dung@example.com');
    expect(logText).not.toContain(account?.matKhauBam ?? 'thiếu');
    expect(logText).not.toContain('$argon2id$');
    expect(logText).not.toMatch(standalone(code));
  });
});

describe('đồng thời qua HTTP (DK-27) và sửa lỗi deadlock chéo tài khoản của A2', () => {
  it('E2E-R11 5 yêu cầu cùng email mới: đúng 1 thành công (201), các yêu cầu còn lại 429 GUI_LAI_QUA_SOM; không 500; đúng 1 tài khoản và 1 thư', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => register(body())),
    );
    const statuses = results.map((r) => r.status).sort((a, b) => a - b);
    expect(statuses).toEqual([201, 429, 429, 429, 429]);
    for (const res of results.filter((r) => r.status === 429)) {
      expectErrorResponse(res, 429, 'GUI_LAI_QUA_SOM');
    }
    expect(await accounts()).toHaveLength(1);
    expect(mail.attempts).toHaveLength(1);
  });

  it('E2E-R12 6 người đăng ký CÙNG LÚC với 6 email khác nhau (10 vòng): tất cả 201, không 500 (trước khi sửa A2, khoảng một nửa bị deadlock 1213)', async () => {
    for (let round = 0; round < 10; round++) {
      await resetTables(db);
      mail.reset();
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          register(
            body({
              email: `nguoi${String(i)}.vong${String(round)}@example.com`,
            }),
          ),
        ),
      );
      expect(
        results.map((r) => r.status),
        `vòng ${String(round)}`,
      ).toEqual([201, 201, 201, 201, 201, 201]);
      expect(mail.sent).toHaveLength(6);
    }
  });
});
