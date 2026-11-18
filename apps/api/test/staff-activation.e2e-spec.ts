import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import request from 'supertest';
import { vi } from 'vitest';
import { createActivationFixture } from '../src/admin/staff-activation/testing/activation-link-fixtures.js';
import {
  newCredential,
  newLiveLink,
} from '../src/admin/staff-activation/testing/staff-activation-fixtures.js';
import { IS_PUBLIC_KEY } from '../src/auth/decorators/public.decorator.js';
import { TaiKhoan } from '../src/auth/entities/tai-khoan.entity.js';
import { PasswordHasher } from '../src/auth/password/password-hasher.service.js';
import { T0 } from '../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from '../src/auth/testing/refresh-http-helpers.js';
import { expectNoSecrets } from '../src/auth/testing/secret-scan.js';
import { expectErrorResponse } from '../src/common/testing/error-assertions.js';
import { resetTables } from '../src/database/testing/test-database.js';

// Task B16 — POST /staff-activation/validate và /complete qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (bộ lọc lỗi P5, ValidationPipe,
// logger che bí mật), MailService giả. Liên kết được cấp bằng ĐƯỜNG THẬT của B14 (issue + deliver, token đọc từ thư giả). Mã test case: NS-21, NS-25, NS-30,
// NS-31, NS-33, NS-35, NS-38, NS-39, SE-A2, SE-A12, SE-A13. Mã E2E-KHnn là [đề xuất]. (Gọi tay Gmail thật là NS-44, việc X1, không ở đây.)
const VALIDATE = '/staff-activation/validate';
const COMPLETE = '/staff-activation/complete';
const LINK_INVALID = 'LIEN_KET_KHONG_HOP_LE';

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
const fixture = () => ({
  db: h.db,
  links: createActivationFixture(h.db, h.mail),
});
const complete = (id: string, token: string, matKhauMoi: string, over = {}) =>
  post(COMPLETE, { id, token, matKhauMoi, xacNhan: matKhauMoi, ...over });
const accountOf = (id: string) =>
  h.db.getRepository(TaiKhoan).findOneByOrFail({ taiKhoanId: id });
const login = (email: string, matKhau: string) =>
  post('/auth/login', { email, matKhau });

describe('luồng trọn qua HTTP (NS-25, NS-30, NS-31, NS-33)', () => {
  it('E2E-KH01 (NS-25, NS-30, NS-31, NS-33) chưa kích hoạt thì không đăng nhập được; validate 200, complete 200, rồi ĐĂNG NHẬP ĐƯỢC bằng mật khẩu vừa đặt; dùng lại liên kết ⇒ 400', async () => {
    const live = await newLiveLink(fixture());
    const credential = newCredential();

    expectErrorResponse(
      await login(live.account.email, newCredential()),
      403,
      'TAI_KHOAN_CHUA_KICH_HOAT',
    );

    const validated = await post(VALIDATE, { id: live.id, token: live.token });
    expect(validated.status).toBe(200);
    expect(validated.body).toEqual({ hopLe: true });

    const done = await complete(live.id, live.token, credential);
    expect(done.status).toBe(200);
    expect(done.body).toEqual({ daKichHoat: true });

    // Bằng chứng Q24: đăng nhập tạo được phiên vì da_xac_minh_email = true; PLAN: kích hoạt KHÔNG tự đăng nhập (không cấp phiên ở bước complete)
    const session = await login(live.account.email, credential);
    expect(session.status).toBe(200);
    expect(typeof (session.body as { accessToken: unknown }).accessToken).toBe(
      'string',
    );

    expectErrorResponse(
      await complete(live.id, live.token, newCredential()),
      400,
      LINK_INVALID,
    );
    expectErrorResponse(
      await post(VALIDATE, { id: live.id, token: live.token }),
      400,
      LINK_INVALID,
    );
  });
});

describe('thân rác và mọi lý do thất bại cho CÙNG một phản hồi (NS-35)', () => {
  it('E2E-KH02 (NS-35) validate và complete: thiếu, sai kiểu, sai dạng, id không có, token sai ⇒ cùng status và cùng thân JSON; PasswordHasher.hash KHÔNG được gọi', async () => {
    const live = await newLiveLink(fixture());
    const hashSpy = vi.spyOn(h.app.get(PasswordHasher), 'hash');
    const other = await newLiveLink(fixture(), 'BacSi');
    const goodPair = { id: live.id, token: live.token };
    const wrongToken = other.token;
    const bodies: [string, Record<string, unknown>][] = [
      ['token của liên kết khác (id đúng)', { id: live.id, token: wrongToken }],
      [
        'id không tồn tại',
        { id: String(Number(live.id) + 1000), token: live.token },
      ],
      ['id sai dạng', { id: 'abc', token: live.token }],
      ['id là số JSON', { id: Number(live.id), token: live.token }],
      ['id là mảng', { id: [live.id], token: live.token }],
      ['id có số 0 đứng đầu', { id: `0${live.id}`, token: live.token }],
      ['id vượt BIGINT', { id: '9223372036854775808', token: live.token }],
      ['token ngắn', { id: live.id, token: live.token.slice(1) }],
      ['token dài', { id: live.id, token: `${live.token}A` }],
      ['token ký tự lạ', { id: live.id, token: `${live.token.slice(1)}+` }],
      ['token số JSON', { id: live.id, token: 123 }],
      ['thiếu cả hai', {}],
      ['thiếu id', { token: live.token }],
      ['thiếu token', { id: live.id }],
    ];
    const reference = expectErrorResponse(
      await post(VALIDATE, bodies[0]?.[1]),
      400,
      LINK_INVALID,
    );
    for (const [label, body] of bodies) {
      const validated = await post(VALIDATE, body);
      expectErrorResponse(validated, 400, LINK_INVALID);
      expect(validated.body, `validate: ${label}`).toEqual(reference);
      const completed = await complete(
        body.id as string,
        body.token as string,
        newCredential(),
      );
      expectErrorResponse(completed, 400, LINK_INVALID);
      expect(completed.body, `complete: ${label}`).toEqual(reference);
    }
    // validate với thân là MẢNG (body-parser cho qua, handler không dùng DTO) cũng là lỗi chung
    for (const raw of ['[]', '[{"id":"1"}]']) {
      const res = await request(h.app.getHttpServer())
        .post(VALIDATE)
        .set('Content-Type', 'application/json')
        .send(raw);
      expect(res.status, `validate thân ${raw}`).toBe(400);
      expect(res.body, `validate thân ${raw}`).toEqual(reference);
    }
    // Chống tốn CPU: mọi lần thất bại sơ bộ đều chưa băm
    expect(hashSpy).not.toHaveBeenCalled();
    // Liên kết thật vẫn nguyên sau mọi lần thử sai
    expect((await post(VALIDATE, goodPair)).status).toBe(200);
  });

  it('E2E-KH02 lỗi giao thức (JSON hỏng, thân JSON không phải object hay mảng) ở CẢ HAI route: cùng một phản hồi 400 của bộ lọc chung, không phụ thuộc liên kết, không 500', async () => {
    const send = (path: string, raw: string) =>
      request(h.app.getHttpServer())
        .post(path)
        .set('Content-Type', 'application/json')
        .send(raw);
    let reference: unknown;
    for (const raw of ['{"id":', '"x"', 'null', '12']) {
      const [first, second] = [
        await send(VALIDATE, raw),
        await send(COMPLETE, raw),
      ];
      expect(first.status, raw).toBe(400);
      expect(second.status, raw).toBe(400);
      expect(second.body, raw).toEqual(first.body);
      // Cùng một thân cho mọi dạng hỏng (lỗi của body-parser, trước khi tới controller), và KHÔNG phải LIEN_KET (không lộ gì về liên kết)
      reference ??= first.body;
      expect(first.body, raw).toEqual(reference);
      expect((first.body as { maLoi: string }).maLoi, raw).not.toBe(
        LINK_INVALID,
      );
    }
  });
});

describe('mật khẩu sai không làm hỏng liên kết (NS-38, NS-39)', () => {
  const longEnough = (n: number): string => `${'a'.repeat(n - 2)}1!`;
  const cases: [string, string, string][] = [
    ['7 ký tự', 'Abcde1!', 'MAT_KHAU_KHONG_HOP_LE'],
    ['65 ký tự', longEnough(65), 'MAT_KHAU_KHONG_HOP_LE'],
    ['thiếu chữ số', 'Abcdefgh!', 'MAT_KHAU_KHONG_HOP_LE'],
    ['thiếu ký tự đặc biệt', 'Abcdefg12', 'MAT_KHAU_KHONG_HOP_LE'],
    ['có chữ có dấu', 'Abcdéf1!', 'MAT_KHAU_KY_TU_KHONG_HOP_LE'],
    ['có emoji', 'Abcdef1!😀', 'MAT_KHAU_KY_TU_KHONG_HOP_LE'],
    ['có NBSP', 'Abcd f1!', 'MAT_KHAU_KY_TU_KHONG_HOP_LE'],
  ];

  it('E2E-KH03 (NS-38, NS-39) mọi mật khẩu không đạt ⇒ 400 DU_LIEU_KHONG_HOP_LE đúng mã; liên kết vẫn hợp lệ, tài khoản vẫn ChoKichHoat; nhập đúng sau đó ⇒ 200', async () => {
    const live = await newLiveLink(fixture());
    for (const [label, matKhauMoi, ma] of cases) {
      const res = await complete(live.id, live.token, matKhauMoi);
      const body = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
      expect(body.loi, label).toEqual([{ truong: 'matKhauMoi', ma }]);
    }
    const mismatch = await complete(live.id, live.token, newCredential(), {
      xacNhan: newCredential(),
    });
    expect(
      expectErrorResponse(mismatch, 400, 'DU_LIEU_KHONG_HOP_LE').loi,
    ).toEqual([{ truong: 'xacNhan', ma: 'XAC_NHAN_KHONG_KHOP' }]);
    const missingConfirm = await post(COMPLETE, {
      id: live.id,
      token: live.token,
      matKhauMoi: newCredential(),
    });
    expect(
      expectErrorResponse(missingConfirm, 400, 'DU_LIEU_KHONG_HOP_LE').loi,
    ).toEqual([{ truong: 'xacNhan', ma: 'XAC_NHAN_KHONG_KHOP' }]);

    // Liên kết KHÔNG bị đốt
    expect(
      (await post(VALIDATE, { id: live.id, token: live.token })).status,
    ).toBe(200);
    const before = await accountOf(live.account.taiKhoanId);
    expect(before.trangThai).toBe('ChoKichHoat');
    expect(before.matKhauBam).toBeNull();

    const good = newCredential();
    expect((await complete(live.id, live.token, good)).status).toBe(200);
    expect((await login(live.account.email, good)).status).toBe(200);
  });

  it.each([
    ['biên dưới 8 ký tự', 'Abcdef1!'],
    ['biên trên 64 ký tự', longEnough(64)],
  ])(
    'E2E-KH03 (NS-39) %s ⇒ kích hoạt được và đăng nhập được bằng chính mật khẩu đó',
    async (_label, matKhauMoi) => {
      const live = await newLiveLink(fixture());
      expect((await complete(live.id, live.token, matKhauMoi)).status).toBe(
        200,
      );
      expect((await login(live.account.email, matKhauMoi)).status).toBe(200);
    },
  );
});

describe('hai route công khai, không cookie, không lộ gì (SE-A2, SE-A12, SE-A13)', () => {
  it('E2E-KH04 (SE-A13, SE-A12) không Set-Cookie ở thành công lẫn thất bại; thân chỉ có khoá đã khai báo; không cần Origin; Origin lạ và Authorization rác không ảnh hưởng (route không đọc cookie hay token)', async () => {
    const live = await newLiveLink(fixture());
    const input = { id: live.id, token: live.token };
    const credential = newCredential();

    const strangeOrigin = await request(h.app.getHttpServer())
      .post(VALIDATE)
      .set('Origin', 'https://trang-la.example.test')
      .set('Authorization', 'Bearer khong-phai-token')
      .set('Cookie', 'refresh_token=khong-co-that')
      .send(input);
    expect(strangeOrigin.status).toBe(200);
    expect(strangeOrigin.body).toEqual({ hopLe: true });
    expect(strangeOrigin.headers['set-cookie']).toBeUndefined();

    const wrong = await post(VALIDATE, { id: live.id, token: 'x' });
    expect(wrong.headers['set-cookie']).toBeUndefined();

    const done = await complete(live.id, live.token, credential);
    expect(done.status).toBe(200);
    expect(Object.keys(done.body as object)).toEqual(['daKichHoat']);
    expect(done.headers['set-cookie']).toBeUndefined();

    const again = await complete(live.id, live.token, newCredential());
    expect(again.headers['set-cookie']).toBeUndefined();
    // Không lộ mật khẩu, băm hay token trong BẤT KỲ phản hồi nào
    for (const res of [strangeOrigin, wrong, done, again]) {
      const text = JSON.stringify(res.body);
      for (const value of [credential, live.token]) {
        expect(text).not.toContain(value);
      }
      expect(text).not.toContain('$argon2');
    }
  });

  it('E2E-KH04 (SE-A2) trường lạ ở complete (trangThai, daXacMinhEmail, matKhauBam, taiKhoanId, loaiTaiKhoan) ⇒ 400 TRUONG_KHONG_DUOC_PHEP; liên kết còn nguyên', async () => {
    const live = await newLiveLink(fixture());
    for (const field of [
      'trangThai',
      'daXacMinhEmail',
      'matKhauBam',
      'taiKhoanId',
      'loaiTaiKhoan',
    ]) {
      const res = await complete(live.id, live.token, newCredential(), {
        [field]: 'DangHoatDong',
      });
      expect(
        expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE').loi,
        field,
      ).toEqual([{ truong: field, ma: 'TRUONG_KHONG_DUOC_PHEP' }]);
    }
    expect((await accountOf(live.account.taiKhoanId)).trangThai).toBe(
      'ChoKichHoat',
    );
    expect(
      (await post(VALIDATE, { id: live.id, token: live.token })).status,
    ).toBe(200);
  });
});

describe('log sạch (NS-21)', () => {
  it('E2E-KH05 (NS-21) bắt stdout và stderr suốt luồng đúng và sai: không token, URL, mật khẩu, băm Argon2id, ma_bam', async () => {
    const live = await newLiveLink(fixture());
    const other = await newLiveLink(fixture(), 'BacSi');
    const credential = newCredential();
    const wrongCredential = newCredential();
    await post(VALIDATE, { id: live.id, token: live.token });
    await post(VALIDATE, { id: live.id, token: other.token });
    await complete(other.id, live.token, wrongCredential);
    await complete(live.id, live.token, 'ngan');
    expect((await complete(live.id, live.token, credential)).status).toBe(200);
    await complete(live.id, live.token, wrongCredential);
    const storedHash = (await accountOf(live.account.taiKhoanId)).matKhauBam;
    const text = output.join('');
    expect(text).toContain('đã kích hoạt qua liên kết');
    expectNoSecrets('stdout và stderr', text, {
      literals: [
        live.token,
        other.token,
        credential,
        wrongCredential,
        storedHash ?? '',
        `kich-hoat#id=${live.id}`,
      ],
      codes: [],
    });
  });
});

describe('đúng hai route là công khai (SE-A13; bổ sung của phiên kiểm)', () => {
  it('E2E-KH06 quét controller của ứng dụng đã compile: dưới `staff-activation` có ĐÚNG hai route POST validate và complete, đều công khai; không route nào khác ở đó, và không route nào khác bị công khai vô tình', () => {
    const reflector = new Reflector();
    const scanner = new MetadataScanner();
    const routes: { method: string; path: string; isPublic: boolean }[] = [];
    for (const module of h.app.get(ModulesContainer).values()) {
      for (const wrapper of module.controllers.values()) {
        const controller = wrapper.metatype;
        if (typeof controller !== 'function') continue;
        const prototype = controller.prototype as Record<string, unknown>;
        const root = String(Reflect.getMetadata(PATH_METADATA, controller));
        for (const name of scanner.getAllMethodNames(prototype)) {
          const handler = prototype[name];
          if (typeof handler !== 'function') continue;
          const method = Reflect.getMetadata(METHOD_METADATA, handler) as
            RequestMethod | undefined;
          if (method === undefined) continue;
          const leaf = String(Reflect.getMetadata(PATH_METADATA, handler));
          routes.push({
            method: RequestMethod[method] ?? String(method),
            path: [root, leaf]
              .filter((part) => part !== '' && part !== '/')
              .join('/')
              .replace(/^\/+|\/+$/g, ''),
            isPublic:
              reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
                handler,
                controller,
              ]) === true,
          });
        }
      }
    }
    const underStaffActivation = routes
      .filter(
        (route) =>
          route.path === 'staff-activation' ||
          route.path.startsWith('staff-activation/'),
      )
      .map(
        (route) =>
          `${route.method} ${route.path} public=${String(route.isPublic)}`,
      )
      .sort();
    expect(underStaffActivation).toEqual([
      'POST staff-activation/complete public=true',
      'POST staff-activation/validate public=true',
    ]);
    // Không route dưới `admin/` nào công khai (bộ quét admin-scope cũng kiểm; ở đây khẳng định chéo từ phía route công khai)
    const publicAdminRoutes = routes.filter(
      (route) => route.isPublic && /^admin(\/|$)/.test(route.path),
    );
    expect(publicAdminRoutes).toEqual([]);
  });
});
