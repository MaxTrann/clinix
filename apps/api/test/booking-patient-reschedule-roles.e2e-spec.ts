import request from 'supertest';
import { vi } from 'vitest';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import { patientRescheduleWorld } from './../src/appointments/testing/patient-reschedule-world.js';
import {
  untouchedState,
  writeCounts,
} from './../src/appointments/testing/reschedule-request-world.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';

// reschedule B6 — QUYỀN và tiêu đề của hai route đổi lịch Bệnh nhân qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN reschedule 7.2, 7.6, 7.10). Hành vi nghiệp vụ: `booking-patient-reschedule.e2e-spec.ts`.
// QDL-01 (ma trận route × vai trò: Bệnh nhân 200 và 201; Bác sĩ, Lễ tân, QTV Chi nhánh, QTV Toàn hệ thống 403; khách 401), DLH-10 (vai khác TRƯỚC mọi kiểm tra khác, kể cả mã và thân sai), QDL-07 (token sai, phiên bị thu hồi, đổi vai
// trò), BDL-03 (`Cache-Control: no-store` ở 200, 201, 400, 404, 409 của CẢ HAI route; 401 và 403 do guard không hứa). CA QDL-01 khẳng định ĐÚNG 403 ở trạng thái mà dịch vụ sẽ trả mã KHÁC nếu thiếu `@Roles` (lịch của người khác
// ⇒ 404, thân sai ⇒ 400): chỉ e2e phân biệt được `RolesGuard` với lỗi của dịch vụ (bài học ĐA-9b). Mã QDL-07 là `[đề xuất]`. Dữ liệu giả. Đồng hồ giả = T0; token tạo SAU khi đặt giờ.
const BASE = '/patient/appointments';
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
  const w = await patientRescheduleWorld(h.db, fx);
  return { ...w, token: await tokenOf(w.patientId) };
}

describe('QDL-01, DLH-10 ma trận route × vai trò', () => {
  it('Bác sĩ, Lễ tân, QTV Chi nhánh, QTV Toàn hệ thống ĐÚNG 403 KHONG_DU_QUYEN ở cả hai route với MỌI dạng đầu vào (mã đúng, của người khác, không tồn tại, sai dạng, thân và query sai); DB nguyên; khách 401; Bệnh nhân 200 và 201', async () => {
    const w = await world();
    const mine = await w.book(0);
    const other = await w.otherPatient(4);
    const before = await untouchedState(h.db);
    const counts = await writeCounts(h.db);
    const wrongRoles = [
      ['Bác sĩ', w.doctor.taiKhoanId],
      ['Lễ tân', w.receptionist.account.taiKhoanId],
      ['QTV Chi nhánh', w.branchAdmin.account.taiKhoanId],
      ['QTV Toàn hệ thống', w.systemAdmin.account.taiKhoanId],
    ] as const;
    const validBody = { khungGioId: w.slot(2), lyDoYeuCau: 'Có việc đột xuất' };

    for (const [role, accountId] of wrongRoles) {
      const token = await tokenOf(accountId);
      for (const code of [
        mine.maLichHen,
        other.own.maLichHen,
        MISSING,
        'sai-dang',
      ]) {
        for (const [what, res] of [
          ['preview', await preview(code, token)],
          [
            'preview query sai',
            await preview(code, token, '?khungGioId=abc&x=1'),
          ],
          ['reschedule', await reschedule(code, token, validBody)],
          [
            'reschedule thân sai',
            await reschedule(code, token, {
              khungGioId: 'sai',
              benhNhanId: '1',
            }),
          ],
        ] as const) {
          expect(res.status, `${role} ${what} ${code}`).toBe(403);
          expectErrorResponse(res, 403, FORBIDDEN);
        }
      }
    }
    expect(await untouchedState(h.db)).toEqual(before);
    expect(await writeCounts(h.db)).toEqual(counts);

    for (const code of [mine.maLichHen, 'sai-dang']) {
      expectErrorResponse(await preview(code), 401, NOT_LOGGED_IN);
      expectErrorResponse(
        await reschedule(code, undefined, validBody),
        401,
        NOT_LOGGED_IN,
      );
    }
    expect((await preview(mine.maLichHen, w.token)).status).toBe(200);
    expect(
      (await reschedule(mine.maLichHen, w.token, { khungGioId: w.slot(2) }))
        .status,
    ).toBe(201);
  });
});

describe('QDL-07 xác thực TRƯỚC mọi kiểm tra khác', () => {
  it('token sai ⇒ 401 TOKEN_KHONG_HOP_LE ở cả hai route, kể cả khi mã và thân sai', async () => {
    const w = await world();
    const old = await w.book(0);
    const before = await untouchedState(h.db);
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
    expect(await untouchedState(h.db)).toEqual(before);
  });

  it('khoá tài khoản giữa hai request ⇒ request sau 401 PHIEN_HET_HIEU_LUC ở cả hai route, lịch không đổi; đổi vai trò ⇒ 403', async () => {
    const w = await world();
    const old = await w.book(0);
    expect((await preview(old.maLichHen, w.token)).status).toBe(200);
    await h.db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [w.patientId],
    );
    const before = await untouchedState(h.db);
    expectErrorResponse(
      await preview(old.maLichHen, w.token),
      401,
      SESSION_INACTIVE,
    );
    expectErrorResponse(
      await reschedule(old.maLichHen, w.token, { khungGioId: w.slot(2) }),
      401,
      SESSION_INACTIVE,
    );
    expect(await untouchedState(h.db)).toEqual(before);

    // guard đã thu hồi phiên cũ: mở lại tài khoản, đổi vai trò rồi tạo phiên MỚI
    await h.db.query(
      "UPDATE tai_khoan SET trang_thai = 'DangHoatDong', loai_tai_khoan = 'BacSi' WHERE tai_khoan_id = ?",
      [w.patientId],
    );
    const afterRoleChange = await tokenOf(w.patientId);
    expectErrorResponse(
      await preview(old.maLichHen, afterRoleChange),
      403,
      FORBIDDEN,
    );
    expectErrorResponse(
      await reschedule(old.maLichHen, afterRoleChange, {
        khungGioId: w.slot(2),
      }),
      403,
      FORBIDDEN,
    );
    expect(await untouchedState(h.db)).toEqual(before);
  });
});

describe('BDL-03 Cache-Control: no-store', () => {
  it('có ở 200, 201, 400 do DTO, 404 do dịch vụ, 404 do pipe và 409 của CẢ HAI route (401 và 403 do guard không hứa)', async () => {
    const w = await world();
    const open = await w.book(0);
    const exhausted = await w.book(1, { soLan: 2 });
    const responses = [
      await preview(open.maLichHen, w.token),
      await preview(open.maLichHen, w.token, `?khungGioId=${w.slot(2)}`),
      await preview(open.maLichHen, w.token, '?khungGioId=abc'),
      await preview(MISSING, w.token),
      await preview('sai-dang', w.token),
      await reschedule(exhausted.maLichHen, w.token, { khungGioId: w.slot(3) }),
      await reschedule(open.maLichHen, w.token, { khungGioId: 'sai' }),
      await reschedule(MISSING, w.token, { khungGioId: w.slot(3) }),
      await reschedule('sai-dang', w.token, { khungGioId: w.slot(3) }),
      await reschedule(open.maLichHen, w.token, { khungGioId: w.slot(2) }),
      await reschedule(exhausted.maLichHen, w.token, {
        khungGioId: w.slot(3),
        lyDoYeuCau: 'Có việc đột xuất',
      }),
      await reschedule(exhausted.maLichHen, w.token, {
        khungGioId: w.slot(3),
        lyDoYeuCau: 'Có việc đột xuất',
      }),
    ];
    expect(responses.map((res) => res.status)).toEqual([
      200, 200, 400, 404, 404, 409, 400, 404, 404, 201, 201, 409,
    ]);
    for (const res of responses)
      expect(res.headers['cache-control']).toBe('no-store');
  });
});
