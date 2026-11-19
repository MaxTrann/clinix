import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { vi } from 'vitest';
import { parseActivationMail } from '../src/admin/staff-activation/testing/activation-link-fixtures.js';
import { AdminFixtures } from '../src/admin/testing/admin-fixtures.js';
import { TaiKhoan } from '../src/auth/entities/tai-khoan.entity.js';
import { T0 } from '../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from '../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';

// Task B15 — ca LIÊN THÔNG tạo tài khoản (B15) → liên kết trong thư → kích hoạt công khai (B16) → đăng nhập, qua HTTP THẬT. Tách riêng khỏi
// admin-staff-accounts.e2e-spec.ts vì cần hai route `/staff-activation/*` của B16: chỉ chạy được trên cây đã gộp `main` (có B16). Không nhập mã B16 nào,
// chỉ gọi HTTP, nên file biên dịch được ở mọi cây. Mã E2E-NSnn là [đề xuất]; mã PLAN: NS-01, NS-19, NS-25, NS-30, NS-31, NS-33, NS-37.
const CREATE = '/admin/staff-accounts';
const VALIDATE = '/staff-activation/validate';
const COMPLETE = '/staff-activation/complete';

let h: RefreshHarness;
let adminToken: string;
let branchId: string;

beforeAll(async () => {
  h = await openRefreshHarness();
});

beforeEach(async () => {
  await resetTables(h.db);
  h.mail.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  const fx = new AdminFixtures(h.db);
  branchId = (await fx.branch()).chiNhanhId;
  adminToken = (await h.sessions.create((await fx.admin()).account.taiKhoanId))
    .accessToken;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await h.close();
});

/** Mật khẩu hợp lệ sinh lúc chạy (không ghi cứng chuỗi trông như bí mật): hex, chữ hoa, số và ký tự đặc biệt. */
const newCredential = (): string => `${randomBytes(6).toString('hex')}Aa1!`;

const createReceptionist = (email: string) =>
  request(h.app.getHttpServer())
    .post(CREATE)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      vaiTro: 'LeTan',
      hoTen: 'Đặng Thị Hạnh',
      email,
      soDienThoai: '0944556677',
      chiNhanhId: branchId,
    });
const post = (path: string, body: unknown) =>
  request(h.app.getHttpServer())
    .post(path)
    .send(body as object);
const login = (email: string, matKhau: string) =>
  post('/auth/login', { email, matKhau });

describe('liên thông B15 → B16 → đăng nhập (NS-01, NS-25, NS-30, NS-31, NS-33)', () => {
  it('E2E-NS10 (NS-25, NS-30, NS-31, NS-33) tạo ⇒ chưa đăng nhập được; token trong thư dùng được ĐÚNG MỘT lần: validate 200, complete 200, rồi đăng nhập được; tài khoản DangHoatDong, da_xac_minh_email = true; dùng lại ⇒ LIEN_KET_KHONG_HOP_LE', async () => {
    const email = 'lien.thong@example.com';
    const created = await createReceptionist(email);
    expect(created.status).toBe(201);
    const taiKhoanId = (created.body as { taiKhoanId: string }).taiKhoanId;
    const link = parseActivationMail(h.mail.sent[0]);
    const credential = newCredential();

    expectErrorResponse(
      await login(email, credential),
      403,
      'TAI_KHOAN_CHUA_KICH_HOAT',
    );

    const validated = await post(VALIDATE, { id: link.id, token: link.token });
    expect(validated.status).toBe(200);
    expect(validated.body).toEqual({ hopLe: true });

    const done = await post(COMPLETE, {
      id: link.id,
      token: link.token,
      matKhauMoi: credential,
      xacNhan: credential,
    });
    expect(done.status).toBe(200);
    expect(done.body).toEqual({ daKichHoat: true });

    expect(
      await h.db.getRepository(TaiKhoan).findOneByOrFail({ taiKhoanId }),
    ).toMatchObject({
      trangThai: 'DangHoatDong',
      daXacMinhEmail: true,
    });
    const session = await login(email, credential);
    expect(session.status).toBe(200);
    expect(typeof (session.body as { accessToken: unknown }).accessToken).toBe(
      'string',
    );

    // Dùng lại liên kết đã dùng (mật khẩu mới hợp lệ, xác nhận khớp) ⇒ bị từ chối, mật khẩu của người dùng không bị đổi
    const second = newCredential();
    expectErrorResponse(
      await post(COMPLETE, {
        id: link.id,
        token: link.token,
        matKhauMoi: second,
        xacNhan: second,
      }),
      400,
      'LIEN_KET_KHONG_HOP_LE',
    );
    expect((await login(email, credential)).status).toBe(200);
    expectErrorResponse(
      await post(VALIDATE, { id: link.id, token: link.token }),
      400,
      'LIEN_KET_KHONG_HOP_LE',
    );
  });

  it('E2E-NS11 (NS-19, NS-37) thư gửi lỗi ⇒ liên kết của lần tạo đó KHÔNG dùng được: validate và complete đều LIEN_KET_KHONG_HOP_LE; tài khoản vẫn ChoKichHoat, không đặt được mật khẩu', async () => {
    h.mail.failNextWith('TIMEOUT');
    const email = 'thu.loi@example.com';
    const created = await createReceptionist(email);
    expect(created.status).toBe(201);
    expect(
      (created.body as { guiEmail: { ketQua: string } }).guiEmail.ketQua,
    ).toBe('ThatBai');
    const attempted = parseActivationMail(h.mail.attempts[0]);

    expectErrorResponse(
      await post(VALIDATE, { id: attempted.id, token: attempted.token }),
      400,
      'LIEN_KET_KHONG_HOP_LE',
    );
    const credential = newCredential();
    expectErrorResponse(
      await post(COMPLETE, {
        id: attempted.id,
        token: attempted.token,
        matKhauMoi: credential,
        xacNhan: credential,
      }),
      400,
      'LIEN_KET_KHONG_HOP_LE',
    );
    expect(
      await h.db.getRepository(TaiKhoan).findOneByOrFail({ email }),
    ).toMatchObject({ trangThai: 'ChoKichHoat', matKhauBam: null });
    expectErrorResponse(
      await login(email, credential),
      403,
      'TAI_KHOAN_CHUA_KICH_HOAT',
    );
  });
});
