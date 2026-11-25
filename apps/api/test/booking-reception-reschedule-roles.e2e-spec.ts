import request from 'supertest';
import { vi } from 'vitest';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import {
  PROXY_REASON,
  receptionRescheduleWorld,
} from './../src/appointments/testing/reception-reschedule-world.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';

// reschedule B7 — QUYỀN và tiêu đề của hai route đổi lịch HỘ của Lễ tân qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN reschedule 7.3, 7.6, 7.10). Hành vi nghiệp vụ:
// `booking-reception-reschedule.e2e-spec.ts`. File này: QDL-01 phần B7 và DLO-03 (ma trận 2 route × 6 vai: Lễ tân 200 và 201; Bệnh nhân, Bác sĩ, Quản trị viên Chi nhánh, Quản trị viên Toàn hệ thống 403, KHÔNG có route
// đổi hộ cho Quản trị viên, Q7 (i); khách 401), QDL-03 (tài khoản Lễ tân bị khoá hoặc mất hồ sơ Lễ tân), QDL-09 `[đề xuất]` (xác thực TRƯỚC mọi kiểm tra khác), BDL-03 (`Cache-Control: no-store`). CA QDL-01 khẳng định
// ĐÚNG 403 ở trạng thái mà dịch vụ sẽ trả mã KHÁC nếu thiếu `@Roles` (lịch ngoài chi nhánh ⇒ 404, thân sai ⇒ 400): chỉ e2e phân biệt được `RolesGuard` với lỗi của dịch vụ (bài học ĐA-9b). Dữ liệu giả. Đồng hồ giả = T0;
// token tạo SAU khi đặt giờ.
const BASE = '/reception/appointments';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const INVALID_TOKEN = 'TOKEN_KHONG_HOP_LE';
const SESSION_INACTIVE = 'PHIEN_HET_HIEU_LUC';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const MISSING = 'CLX-20261110-ZZZZZ';

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
const preview = (code: string, accessToken?: string, query = '') => {
  const req = request(h.app.getHttpServer()).get(
    `${BASE}/${code}/reschedule-preview${query}`,
  );
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const reschedule = (code: string, accessToken?: string, body: unknown = {}) => {
  const req = request(h.app.getHttpServer())
    .post(`${BASE}/${code}/reschedule`)
    .send(body as object);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};

async function world() {
  const w = await receptionRescheduleWorld(h.db, fx);
  return { ...w, token: await tokenOf(w.receptionId) };
}

describe('QDL-01, DLO-03 ma trận route × vai trò', () => {
  it('Bệnh nhân, Bác sĩ, QTV Chi nhánh, QTV Toàn hệ thống ĐÚNG 403 KHONG_DU_QUYEN ở cả hai route với MỌI dạng đầu vào (mã đúng, không tồn tại, sai dạng, thân và query sai, kể cả khoá lạ chiNhanhId); DB nguyên; khách 401; Lễ tân 200 và 201', async () => {
    const w = await world();
    const mine = await w.book(0);
    const other = await w.otherBranch();
    const before = await w.untouched();
    const wrongRoles = [
      ['Bệnh nhân', w.patientId],
      ['Bác sĩ', w.doctor.taiKhoanId],
      ['QTV Chi nhánh', w.branchAdmin.account.taiKhoanId],
      ['QTV Toàn hệ thống', w.systemAdmin.account.taiKhoanId],
    ] as const;
    const validBody = { khungGioId: w.slot(2), lyDo: PROXY_REASON };

    for (const [role, accountId] of wrongRoles) {
      const token = await tokenOf(accountId);
      for (const code of [mine.maLichHen, MISSING, 'sai-dang']) {
        for (const [what, res] of [
          ['preview', await preview(code, token)],
          [
            'preview query sai',
            await preview(code, token, '?khungGioId=abc&chiNhanhId=1'),
          ],
          ['reschedule', await reschedule(code, token, validBody)],
          [
            'reschedule thân sai',
            await reschedule(code, token, {
              khungGioId: 'sai',
              chiNhanhId: other.branchId,
            }),
          ],
        ] as const) {
          expect(res.status, `${role} ${what} ${code}`).toBe(403);
          expectErrorResponse(res, 403, FORBIDDEN);
        }
      }
    }
    expect(await w.untouched()).toEqual(before);

    for (const code of [mine.maLichHen, 'sai-dang']) {
      expectErrorResponse(await preview(code), 401, NOT_LOGGED_IN);
      expectErrorResponse(
        await reschedule(code, undefined, validBody),
        401,
        NOT_LOGGED_IN,
      );
    }
    expect((await preview(mine.maLichHen, w.token)).status).toBe(200);
    expect((await reschedule(mine.maLichHen, w.token, validBody)).status).toBe(
      201,
    );
  });
});

describe('QDL-03 tài khoản Lễ tân bị khoá hoặc không còn hồ sơ Lễ tân', () => {
  it('khoá tài khoản giữa hai request ⇒ request sau 401 PHIEN_HET_HIEU_LUC ở cả hai route, lịch không đổi', async () => {
    const w = await world();
    const old = await w.book(0);
    expect((await preview(old.maLichHen, w.token)).status).toBe(200);
    await h.db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [w.receptionId],
    );
    const before = await w.untouched();

    expectErrorResponse(
      await preview(old.maLichHen, w.token),
      401,
      SESSION_INACTIVE,
    );
    expectErrorResponse(
      await reschedule(old.maLichHen, w.token, {
        khungGioId: w.slot(2),
        lyDo: PROXY_REASON,
      }),
      401,
      SESSION_INACTIVE,
    );
    expect(await w.untouched()).toEqual(before);
  });

  it('còn đăng nhập hợp lệ nhưng mất hồ sơ Lễ tân (hoặc chỉ là vai Lễ tân trong token) ⇒ 403 KHONG_DU_QUYEN từ ReceptionScopeService, không đọc, không ghi', async () => {
    const w = await world();
    const old = await w.book(0);
    await h.db.query('DELETE FROM le_tan WHERE tai_khoan_id = ?', [
      w.receptionId,
    ]);
    const before = await w.untouched();

    expectErrorResponse(await preview(old.maLichHen, w.token), 403, FORBIDDEN);
    expectErrorResponse(
      await reschedule(old.maLichHen, w.token, {
        khungGioId: w.slot(2),
        lyDo: PROXY_REASON,
      }),
      403,
      FORBIDDEN,
    );
    expect(await w.untouched()).toEqual(before);
  });
});

describe('QDL-09 xác thực TRƯỚC mọi kiểm tra khác', () => {
  it('token sai ⇒ 401 TOKEN_KHONG_HOP_LE ở cả hai route, kể cả khi mã và thân sai; DB nguyên', async () => {
    const w = await world();
    const old = await w.book(0);
    const before = await w.untouched();
    for (const code of [old.maLichHen, 'sai-dang']) {
      expectErrorResponse(
        await preview(code, 'khong.phai.jwt'),
        401,
        INVALID_TOKEN,
      );
      expectErrorResponse(
        await reschedule(code, 'khong.phai.jwt', { khungGioId: 'sai' }),
        401,
        INVALID_TOKEN,
      );
    }
    expect(await w.untouched()).toEqual(before);
  });

  it('đổi vai trò của tài khoản Lễ tân sang Bác sĩ rồi tạo phiên MỚI ⇒ 403 ở cả hai route; DB nguyên', async () => {
    const w = await world();
    const old = await w.book(0);
    await h.db.query(
      "UPDATE tai_khoan SET loai_tai_khoan = 'BacSi' WHERE tai_khoan_id = ?",
      [w.receptionId],
    );
    const afterRoleChange = await tokenOf(w.receptionId);
    const before = await w.untouched();

    expectErrorResponse(
      await preview(old.maLichHen, afterRoleChange),
      403,
      FORBIDDEN,
    );
    expectErrorResponse(
      await reschedule(old.maLichHen, afterRoleChange, {
        khungGioId: w.slot(2),
        lyDo: PROXY_REASON,
      }),
      403,
      FORBIDDEN,
    );
    expect(await w.untouched()).toEqual(before);
  });
});

describe('BDL-03 Cache-Control: no-store', () => {
  it('có ở 200, 201, 400 do DTO, 404 do dịch vụ, 404 do pipe và 409 của CẢ HAI route (401 và 403 do guard không hứa)', async () => {
    const w = await world();
    const open = await w.book(0);
    const body = { khungGioId: w.slot(2), lyDo: PROXY_REASON };
    const responses = [
      await preview(open.maLichHen, w.token),
      await preview(open.maLichHen, w.token, `?khungGioId=${w.slot(2)}`),
      await preview(open.maLichHen, w.token, '?khungGioId=abc'),
      await preview(MISSING, w.token),
      await preview('sai-dang', w.token),
      await reschedule(open.maLichHen, w.token, { khungGioId: w.slot(3) }),
      await reschedule(MISSING, w.token, body),
      await reschedule('sai-dang', w.token, body),
      await reschedule(open.maLichHen, w.token, body),
      await reschedule(open.maLichHen, w.token, body),
    ];
    expect(responses.map((res) => res.status)).toEqual([
      200, 200, 400, 404, 404, 400, 404, 404, 201, 409,
    ]);
    for (const res of responses)
      expect(res.headers['cache-control']).toBe('no-store');
  });
});
