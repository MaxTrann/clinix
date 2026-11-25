import request from 'supertest';
import { vi } from 'vitest';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import {
  handleHttpWorld,
  HANDLING_NOTE,
} from './../src/appointments/testing/reschedule-request-handle-world.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';

// reschedule B9 — QUYỀN và tiêu đề của BỐN route ghi `POST /reception|admin/reschedule-requests/:yeuCauId/approve|reject` qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN reschedule 5.8, 7.4,
// 7.6, 7.10; TRACKING reschedule 1.13). Hành vi nghiệp vụ: `booking-reschedule-request-handle.e2e-spec.ts`. File này: QDL-13 (ma trận 4 route × 6 vai: Lễ tân chỉ route Lễ tân, Quản trị viên (cả hai phạm vi) chỉ route
// admin, Bệnh nhân và Bác sĩ 403, khách 401), QDL-03 (tài khoản Lễ tân bị khoá hoặc mất hồ sơ Lễ tân), QDL-09 `[đề xuất]` (xác thực TRƯỚC mọi kiểm tra khác), BDL-03 (`Cache-Control: no-store`). Mỗi ca QDL-13 khẳng định
// ĐÚNG 403 ở trạng thái mà dịch vụ sẽ trả mã KHÁC nếu thiếu `@Roles` (id sai dạng ⇒ 404, thân sai ⇒ 400): chỉ e2e phân biệt được `RolesGuard` với lỗi của dịch vụ (bài học ĐA-9b). Dữ liệu giả. Đồng hồ giả = T0; token
// tạo SAU khi đặt giờ.
const RECEPTION = '/reception/reschedule-requests';
const ADMIN = '/admin/reschedule-requests';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const INVALID_TOKEN = 'TOKEN_KHONG_HOP_LE';
const SESSION_INACTIVE = 'PHIEN_HET_HIEU_LUC';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const NOT_FOUND_TEXT =
  '{"maLoi":"YEU_CAU_DOI_LICH_KHONG_TON_TAI","thongBao":"Không tìm thấy yêu cầu đổi lịch."}';

let h: RefreshHarness;
let fx: BookingFixtures;

beforeAll(async () => {
  h = await openRefreshHarness();
  fx = new BookingFixtures(h.db);
});

beforeEach(async () => {
  await resetTables(h.db);
  h.mail.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await resetTables(h.db);
  await h.close();
});

const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
const world = () => handleHttpWorld(h.db, fx, tokenOf);

const post = (
  base: string,
  id: string,
  action: 'approve' | 'reject',
  accessToken?: string,
  body: unknown = { ghiChu: HANDLING_NOTE },
) => {
  const req = request(h.app.getHttpServer())
    .post(`${base}/${id}/${action}`)
    .send(body as object);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};

const ROUTES = [
  ['Lễ tân duyệt', RECEPTION, 'approve', 'LeTan'],
  ['Lễ tân từ chối', RECEPTION, 'reject', 'LeTan'],
  ['Quản trị viên duyệt', ADMIN, 'approve', 'QuanTriVien'],
  ['Quản trị viên từ chối', ADMIN, 'reject', 'QuanTriVien'],
] as const;

describe('QDL-13, XDL-13 ma trận route × vai trò', () => {
  it.each(ROUTES)(
    '%s: đúng vai ⇒ 200; vai khác ⇒ 403 KHONG_DU_QUYEN KỂ CẢ khi thân sai hay id sai dạng (guard TRƯỚC pipe); khách ⇒ 401 kể cả khi thân và id sai; token hỏng ⇒ 401; vai sai không ghi gì',
    async (_name, base, action, role) => {
      const w = await world();
      const okTokens =
        role === 'LeTan'
          ? [w.tokens.reception]
          : [w.tokens.all, w.tokens.branchAdmin];
      const deniedTokens =
        role === 'LeTan'
          ? [
              w.tokens.patient,
              w.tokens.doctor,
              w.tokens.all,
              w.tokens.branchAdmin,
              w.tokens.otherAdmin,
            ]
          : [
              w.tokens.patient,
              w.tokens.doctor,
              w.tokens.reception,
              w.tokens.otherReception,
            ];
      const wanted = await w.openRequest(0, 2, { soLan: 2 });
      const base0 = await w.untouched();

      for (const token of deniedTokens) {
        // thân đúng, id đúng; thân sai; id sai dạng: cả ba đều 403 (người sai vai không biết dạng nào đúng)
        for (const [id, body] of [
          [wanted.yeuCauId, undefined],
          [wanted.yeuCauId, {}],
          ['abc', { ghiChu: '' }],
        ] as const)
          expectErrorResponse(
            await post(base, id, action, token, body),
            403,
            FORBIDDEN,
          );
      }
      expect(await w.untouched()).toEqual(base0);

      expectErrorResponse(
        await post(base, wanted.yeuCauId, action),
        401,
        NOT_LOGGED_IN,
      );
      // QDL-09: xác thực TRƯỚC mọi kiểm tra khác (thân sai, id sai dạng vẫn 401, không 400 hay 404)
      expectErrorResponse(
        await post(base, 'abc', action, undefined, {}),
        401,
        NOT_LOGGED_IN,
      );
      expectErrorResponse(
        await post(base, wanted.yeuCauId, action, 'khong-phai-token'),
        401,
        INVALID_TOKEN,
      );
      expect(await w.untouched()).toEqual(base0);

      // Đúng vai: mỗi token xử lý MỘT yêu cầu riêng (khung giờ mong muốn khác nhau)
      for (const [index, token] of okTokens.entries()) {
        const own =
          index === 0
            ? wanted
            : await w.openRequest(index, index + 2, { soLan: 2 });
        const res = await post(base, own.yeuCauId, action, token);
        expect(res.status).toBe(200);
      }
    },
  );

  it('Quản trị viên Chi nhánh KHÁC ⇒ 404 cùng thân (không phải 403: đúng vai nhưng ngoài phạm vi); Toàn hệ thống vào được; hai route ghi đối xứng', async () => {
    const w = await world();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const base = await w.untouched();

    for (const action of ['approve', 'reject'] as const) {
      const res = await post(ADMIN, yeuCauId, action, w.tokens.otherAdmin);
      expectErrorResponse(res, 404, 'YEU_CAU_DOI_LICH_KHONG_TON_TAI');
      expect(res.text).toBe(NOT_FOUND_TEXT);
    }
    expect(await w.untouched()).toEqual(base);
    expect((await post(ADMIN, yeuCauId, 'approve', w.tokens.all)).status).toBe(
      200,
    );
  });
});

describe('QDL-03 tài khoản Lễ tân bị khoá hoặc không còn hồ sơ Lễ tân', () => {
  it.each(['approve', 'reject'] as const)(
    '%s: khoá tài khoản giữa hai request ⇒ request sau 401 PHIEN_HET_HIEU_LUC (kể cả id sai dạng); yêu cầu không đổi',
    async (action) => {
      const w = await world();
      const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
      await h.db.query(
        "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
        [w.receptionId],
      );
      const base = await w.untouched();

      for (const id of [yeuCauId, 'abc'])
        expectErrorResponse(
          await post(RECEPTION, id, action, w.tokens.reception),
          401,
          SESSION_INACTIVE,
        );
      expect(await w.untouched()).toEqual(base);
    },
  );

  it.each(['approve', 'reject'] as const)(
    '%s: còn đăng nhập hợp lệ nhưng mất hồ sơ Lễ tân ⇒ 403 KHONG_DU_QUYEN từ ReceptionScopeService TRƯỚC khi phân tích id (kể cả id sai dạng), không đọc, không ghi',
    async (action) => {
      const w = await world();
      const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
      await h.db.query('DELETE FROM le_tan WHERE tai_khoan_id = ?', [
        w.receptionId,
      ]);
      const base = await w.untouched();

      for (const id of [yeuCauId, 'abc', '999999999'])
        expectErrorResponse(
          await post(RECEPTION, id, action, w.tokens.reception),
          403,
          FORBIDDEN,
        );
      expect(await w.untouched()).toEqual(base);
    },
  );
});

describe('BDL-03 Cache-Control: no-store ở 200, 400, 404, 409 của cả bốn route', () => {
  it.each(ROUTES)(
    '%s: no-store ở thành công, thân sai (400), không có (404) và đã xử lý (409)',
    async (_name, base, action, role) => {
      const w = await world();
      const token = role === 'LeTan' ? w.tokens.reception : w.tokens.all;
      const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });

      const responses = [
        await post(base, yeuCauId, action, token, {}),
        await post(base, '999999999', action, token),
        await post(base, yeuCauId, action, token),
        await post(base, yeuCauId, action, token),
      ];

      expect(responses.map((res) => res.status)).toEqual([400, 404, 200, 409]);
      for (const res of responses)
        expect(res.headers['cache-control']).toBe('no-store');
    },
  );
});
