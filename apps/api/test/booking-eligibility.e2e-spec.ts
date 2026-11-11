import request from 'supertest';
import { vi } from 'vitest';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';

// Task B7 — GET /booking/eligibility qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN booking 5.9, A4, Q26; TRACKING booking 3.18.3). Tầng dịch vụ và SQL: src/appointments/create/
// booking-eligibility.service.int-spec.ts. Mã DL-nn, QB-nn là PLAN 7.1, 7.9; BCK-nn là [đề xuất]. Dữ liệu giả (email đuôi example.com).
const PATH = '/booking/eligibility';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const INVALID_TOKEN = 'TOKEN_KHONG_HOP_LE';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const NO_CONFIG = 'HE_THONG_CHUA_CAU_HINH';
const LOCKED = 'DAT_LICH_BI_KHOA_NO_SHOW';

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

const get = (accessToken?: string, query = '') => {
  const req = request(h.app.getHttpServer()).get(`${PATH}${query}`);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
const lockNoShow = (accountId: string) =>
  h.db.query(
    'UPDATE benh_nhan SET khoa_dat_lich_do_no_show = 1 WHERE tai_khoan_id = ?',
    [accountId],
  );

async function world() {
  const w = await fx.world();
  const patientId = w.patient.account.taiKhoanId;
  return { ...w, patientId, token: await tokenOf(patientId) };
}

describe('GET /booking/eligibility', () => {
  it('DL-13, BCK-11 không bị khoá ⇒ 200 với ĐÚNG hai khoá (choPhepDatLich, soLichHenToiDaMoiHoSo), không có lyDo', async () => {
    const w = await world();

    const res = await get(w.token);

    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      choPhepDatLich: true,
      soLichHenToiDaMoiHoSo: 3,
    });
  });

  it('DL-13, BCK-11 bị khoá no-show ⇒ vẫn HTTP 200 (kết quả của cổng, không phải lỗi) với đúng ba khoá; lyDo là mã mà checks trả 403', async () => {
    const w = await world();
    await lockNoShow(w.patientId);

    const res = await get(w.token);

    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      choPhepDatLich: false,
      lyDo: LOCKED,
      soLichHenToiDaMoiHoSo: 3,
    });
  });

  it('DL-13 cờ bật giữa hai lần gọi ⇒ lần sau thấy ngay (không bộ nhớ đệm); đổi cấu hình thì số lịch tối đa đổi theo', async () => {
    const w = await world();
    expect((await get(w.token)).body).toMatchObject({ choPhepDatLich: true });

    await lockNoShow(w.patientId);
    await fx.systemConfig({ soLichHenToiDaMoiHoSo: 6 });

    expect((await get(w.token)).body).toStrictEqual({
      choPhepDatLich: false,
      lyDo: LOCKED,
      soLichHenToiDaMoiHoSo: 6,
    });
  });

  it('DL-19 chưa có cấu hình hệ thống ⇒ 409 HE_THONG_CHUA_CAU_HINH', async () => {
    const w = await world();
    await h.db.query('DELETE FROM cau_hinh_he_thong');

    expectErrorResponse(await get(w.token), 409, NO_CONFIG);
  });

  it('QB-02 (route eligibility) Bệnh nhân 200; Bác sĩ, Lễ tân, QTV Chi nhánh, QTV Toàn hệ thống 403 KHONG_DU_QUYEN; chưa đăng nhập 401; token sai 401', async () => {
    const w = await world();
    expect((await get(w.token)).status).toBe(200);

    for (const accountId of [
      w.doctor.account.taiKhoanId,
      w.receptionist.account.taiKhoanId,
      w.branchAdmin.account.taiKhoanId,
      w.systemAdmin.account.taiKhoanId,
    ])
      expectErrorResponse(await get(await tokenOf(accountId)), 403, FORBIDDEN);
    expectErrorResponse(await get(), 401, NOT_LOGGED_IN);
    expectErrorResponse(await get('khong.phai.jwt'), 401, INVALID_TOKEN);
  });

  it('QB-02 sai vai trò khi CHƯA có cấu hình ⇒ vẫn 403 KHONG_DU_QUYEN do RolesGuard, không rơi xuống dịch vụ (vốn trả 409)', async () => {
    const w = await world();
    await h.db.query('DELETE FROM cau_hinh_he_thong');

    for (const accountId of [
      w.doctor.account.taiKhoanId,
      w.receptionist.account.taiKhoanId,
      w.branchAdmin.account.taiKhoanId,
      w.systemAdmin.account.taiKhoanId,
    ])
      expectErrorResponse(await get(await tokenOf(accountId)), 403, FORBIDDEN);
  });

  it('QB-03 query lạ như benhNhanId bị BỎ QUA: kết quả luôn của CHÍNH người gọi (người gọi không bị khoá, người kia bị khoá; rồi ngược lại)', async () => {
    const w = await world();
    const other = await fx.admin.patient();
    const otherId = other.account.taiKhoanId;
    await lockNoShow(otherId);

    const unlockedCaller = await get(w.token, `?benhNhanId=${otherId}`);
    await lockNoShow(w.patientId);
    await h.db.query(
      'UPDATE benh_nhan SET khoa_dat_lich_do_no_show = 0 WHERE tai_khoan_id = ?',
      [otherId],
    );
    const lockedCaller = await get(w.token, `?benhNhanId=${otherId}&x=1`);

    expect(unlockedCaller.status).toBe(200);
    expect(unlockedCaller.body).toMatchObject({ choPhepDatLich: true });
    expect(lockedCaller.status).toBe(200);
    expect(lockedCaller.body).toMatchObject({ choPhepDatLich: false });
  });

  it('QB-08 Cache-Control: no-store ở 200 (không khoá và bị khoá) và ở lỗi nghiệp vụ do dịch vụ ném (409 chưa cấu hình)', async () => {
    const w = await world();
    expect((await get(w.token)).headers['cache-control']).toBe('no-store');
    await lockNoShow(w.patientId);
    expect((await get(w.token)).headers['cache-control']).toBe('no-store');
    await h.db.query('DELETE FROM cau_hinh_he_thong');

    const res = await get(w.token);

    expect(res.status).toBe(409);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('QB-08 chưa đăng nhập ⇒ 401 và sai vai trò ⇒ 403 do guard: chỉ khẳng định mã trạng thái, KHÔNG khẳng định gì về cache-control ở hai nhánh này', async () => {
    const w = await world();

    const unauthenticated = await get();
    const wrongRole = await get(await tokenOf(w.doctor.account.taiKhoanId));

    // Số đo ngày 11/11/2026 (ghi ở TRACKING booking B7-N và mục 5, không ghim ở đây): hai nhánh này KHÔNG có `cache-control` vì guard chạy trước `@Header`. Không ghim thiếu sót đó để test không đỏ vô cớ khi guard được sửa sau.
    expect(unauthenticated.status).toBe(401);
    expect(wrongRole.status).toBe(403);
  });
});
