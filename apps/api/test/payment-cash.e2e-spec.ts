import request from 'supertest';
import { vi } from 'vitest';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import { IN_WINDOW } from './../src/appointments/testing/status-world.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { cashRows, cashWorld } from './../src/payment/testing/cash-stack.js';

// payment B6 — `POST /reception/appointments/:maLichHen/collect-cash` qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN payment 5.7, 5.11 #8; TTQ-10, TTQ-12, QTT-04;
// TTQ-01 và TTQ-03 phần HTTP). Phần dịch vụ và SQL: src/payment/cash/cash-payment.int-spec.ts. Dữ liệu giả.
const FORBIDDEN = 'KHONG_DU_QUYEN';
const NOT_FOUND = 'KHONG_TIM_THAY';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const RESULT_KEYS = ['maLichHen', 'phieuThu', 'trangThai'];
const RECEIPT_KEYS = [
  'daThanhToanTruoc',
  'giaKham',
  'nguoiThu',
  'soPhieu',
  'thoiDiem',
  'thuTaiQuay',
];

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
  vi.setSystemTime(IN_WINDOW);
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
const post = (code: string, body: object, accessToken?: string) => {
  const req = request(h.app.getHttpServer())
    .post(`/reception/appointments/${code}/collect-cash`)
    .send(body);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};

/** Lịch DaXacNhan giá 300.000, đã cọc 100.000 bằng ví (còn phải thu 200.000) ở chi nhánh của Lễ tân; token của mọi vai trò. */
async function world() {
  const w = await cashWorld(h.db, fx);
  const lich = await w.appointment(0, { coc: '100000.00' });
  return {
    w,
    lich,
    code: lich.maLichHen,
    reception: await tokenOf(w.receptionId),
    otherReception: await tokenOf(w.otherReceptionId),
    patient: await tokenOf(w.patientId),
    doctor: await tokenOf(w.doctor.account.taiKhoanId),
    system: await tokenOf(w.systemAdmin.account.taiKhoanId),
    branch: await tokenOf(w.branchAdmin.account.taiKhoanId),
  };
}

describe('TTQ-01 thu tiền mặt qua HTTP', () => {
  it('200 đúng ba khoá và sáu khoá phiếu thu, no-store; người thu là Lễ tân của token', async () => {
    const t = await world();
    const res = await post(t.code, { soTien: '200000' }, t.reception);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.body as object).toSorted()).toEqual(RESULT_KEYS);
    const body = res.body as { phieuThu: object };
    expect(Object.keys(body.phieuThu).toSorted()).toEqual(RECEIPT_KEYS);
    expect(res.body).toMatchObject({
      maLichHen: t.code,
      trangThai: 'DaTiepDon',
      phieuThu: {
        giaKham: '300000.00',
        daThanhToanTruoc: '100000.00',
        thuTaiQuay: '200000.00',
        nguoiThu: t.w.receptionist.account.hoTen,
      },
    });
    expect((await cashRows(h.db))[0]!.nguoiThuId).toBe(t.w.receptionId);
  });

  it('lỗi nghiệp vụ 409 cũng có no-store (thu lần hai ⇒ LICH_HEN_KHONG_CHO_THU_TIEN; sai số ⇒ SO_TIEN_KHONG_KHOP kèm conPhaiThu)', async () => {
    const t = await world();
    const mismatch = await post(t.code, { soTien: '300000' }, t.reception);
    expect(
      expectErrorResponse(mismatch, 409, 'SO_TIEN_KHONG_KHOP').chiTiet,
    ).toEqual({
      conPhaiThu: '200000.00',
    });
    expect(mismatch.headers['cache-control']).toBe('no-store');
    expect((await post(t.code, { soTien: '200000' }, t.reception)).status).toBe(
      200,
    );
    const again = await post(t.code, { soTien: '200000' }, t.reception);
    expectErrorResponse(again, 409, 'LICH_HEN_KHONG_CHO_THU_TIEN');
    expect(again.headers['cache-control']).toBe('no-store');
  });
});

describe('TTQ-10 thân chỉ nhận soTien', () => {
  it.each(['chiNhanhId', 'nguoiThuId', 'lichHenId', 'khoaLa'])(
    'thân có `%s` ⇒ 400 TRUONG_KHONG_DUOC_PHEP đúng trường đó; không ghi gì',
    async (key) => {
      const t = await world();
      const res = await post(
        t.code,
        { soTien: '200000', [key]: 'GIA-TRI-NHAY-CAM-9' },
        t.reception,
      );
      expect(expectErrorResponse(res, 400, INVALID_DATA).loi).toEqual([
        { truong: key, ma: NOT_ALLOWED },
      ]);
      expect(res.text).not.toContain('GIA-TRI-NHAY-CAM-9');
      expect(await cashRows(h.db)).toEqual([]);
    },
  );

  it.each([
    ['thiếu', {}],
    ['kiểu số', { soTien: 200000 }],
    ['phần lẻ', { soTien: '200000.5' }],
    ['âm', { soTien: '-200000' }],
    ['số 0 đứng đầu', { soTien: '0200000' }],
    ['quá 10 chữ số', { soTien: '12345678901' }],
  ])(
    'soTien %s ⇒ 400 DU_LIEU_KHONG_HOP_LE ở trường soTien; không ghi gì',
    async (_name, body) => {
      const t = await world();
      const res = await post(t.code, body, t.reception);
      const loi = expectErrorResponse(res, 400, INVALID_DATA).loi as {
        truong: string;
      }[];
      expect(loi.map((l) => l.truong)).toEqual(['soTien']);
      expect(await cashRows(h.db)).toEqual([]);
    },
  );
});

describe('TTQ-12, QTT-04 quyền và phạm vi', () => {
  it('Bệnh nhân, Bác sĩ, QTV Chi nhánh, QTV Toàn hệ thống ⇒ ĐÚNG 403, kể cả khi mã hay thân SAI (guard trước pipe); chưa đăng nhập ⇒ 401; không ghi gì', async () => {
    const t = await world();
    for (const token of [t.patient, t.doctor, t.branch, t.system])
      for (const code of [t.code, 'sai-dang']) {
        expectErrorResponse(
          await post(code, { soTien: '200000' }, token),
          403,
          FORBIDDEN,
        );
        expectErrorResponse(
          await post(code, { chiNhanhId: '1' }, token),
          403,
          FORBIDDEN,
        );
      }
    expectErrorResponse(
      await post(t.code, { soTien: '200000' }),
      401,
      'CHUA_DANG_NHAP',
    );
    expect(await cashRows(h.db)).toEqual([]);
  });

  it('TTQ-03 lịch ở chi nhánh khác, không tồn tại, mã sai dạng ⇒ CÙNG một 404 KHONG_TIM_THAY; lịch vẫn thu được bởi Lễ tân đúng chi nhánh', async () => {
    const t = await world();
    const bodies: unknown[] = [];
    for (const [code, token] of [
      [t.code, t.otherReception],
      ['CLX-20261110-ZZZZZ', t.reception],
      ['sai-dang', t.reception],
    ] as const) {
      const res = await post(code, { soTien: '200000' }, token);
      expectErrorResponse(res, 404, NOT_FOUND);
      bodies.push(res.body);
    }
    for (const body of bodies) expect(body).toEqual(bodies[0]);
    expect(await cashRows(h.db)).toEqual([]);
    expect((await post(t.code, { soTien: '200000' }, t.reception)).status).toBe(
      200,
    );
  });

  it('QTT-04 tài khoản Lễ tân bị khoá SAU khi lấy token ⇒ 401 hoặc 403, không ghi gì', async () => {
    const t = await world();
    await h.db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [t.w.receptionId],
    );
    const res = await post(t.code, { soTien: '200000' }, t.reception);
    expect([401, 403]).toContain(res.status);
    expect(await cashRows(h.db)).toEqual([]);
  });
});

describe('TTQ-19 GET cash-preview qua HTTP (payment F4)', () => {
  const get = (code: string, accessToken?: string) => {
    const req = request(h.app.getHttpServer()).get(
      `/reception/appointments/${code}/cash-preview`,
    );
    return accessToken
      ? req.set('Authorization', `Bearer ${accessToken}`)
      : req;
  };

  it('200 đúng bốn khoá do máy chủ tính, no-store; không ghi gì', async () => {
    const t = await world();
    const res = await get(t.code, t.reception);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toStrictEqual({
      maLichHen: t.code,
      giaKham: '300000.00',
      daThanhToanTruoc: '100000.00',
      thuTaiQuay: '200000.00',
    });
    expect(await cashRows(h.db)).toEqual([]);
  });

  it('Bệnh nhân, Bác sĩ, hai loại Quản trị viên ⇒ 403; không token ⇒ 401; Lễ tân chi nhánh khác và mã sai dạng ⇒ CÙNG 404; lỗi cũng no-store', async () => {
    const t = await world();
    for (const token of [t.patient, t.doctor, t.system, t.branch])
      expectErrorResponse(await get(t.code, token), 403, FORBIDDEN);
    expectErrorResponse(await get(t.code), 401, 'CHUA_DANG_NHAP');
    const outside = await get(t.code, t.otherReception);
    const malformed = await get('sai-dang', t.reception);
    expectErrorResponse(outside, 404, NOT_FOUND);
    expectErrorResponse(malformed, 404, NOT_FOUND);
    expect(outside.body).toEqual(malformed.body);
    expect(outside.headers['cache-control']).toBe('no-store');
  });
});
