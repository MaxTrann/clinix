import request from 'supertest';
import { vi } from 'vitest';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import { statusWorld } from './../src/appointments/testing/status-world.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { WalletFixtures } from './../src/wallet/testing/wallet-fixtures.js';

// payment B5 — hai route thanh toán cọc bằng ví qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN payment 5.5, 5.11 #6, #7; TLK-14, TLK-15, QTT-03, QTT-12; TLK-09 phần pipe).
// Phần dịch vụ và SQL: src/payment/deposit/deposit-payment.int-spec.ts. Dữ liệu giả.
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const NOT_FOUND = 'KHONG_TIM_THAY';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const COC = '100000.00';
const PAY_KEYS = [
  'daXuLyTruocDo',
  'maLichHen',
  'soDuKhaDung',
  'soTien',
  'trangThai',
];
const PREVIEW_KEYS = [
  'duSoDu',
  'hanThanhToan',
  'soDuKhaDung',
  'soDuSauThanhToan',
  'soTienCan',
  'thoiGianMayChu',
];

let h: RefreshHarness;
let fx: BookingFixtures;
let wf: WalletFixtures;

beforeAll(async () => {
  h = await openRefreshHarness();
  fx = new BookingFixtures(h.db);
  wf = new WalletFixtures(h.db);
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
const path = (code: string, suffix: string) =>
  `/patient/appointments/${code}/${suffix}`;
const post = (code: string, body: object, accessToken?: string) => {
  const req = request(h.app.getHttpServer())
    .post(path(code, 'payment'))
    .send(body);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const preview = (code: string, accessToken?: string) => {
  const req = request(h.app.getHttpServer()).get(path(code, 'payment-preview'));
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};

/** Thế giới (Bệnh nhân A có ví 350.000 và một lịch chờ thanh toán cọc 100.000; Bệnh nhân B; mọi vai trò khác) kèm token. */
async function world() {
  const w = await statusWorld(h.db, fx);
  const lich = await w.booked('ChoThanhToan', 0, { coc: COC });
  const wallet = await h.db.query<{ id: string }[]>(
    'SELECT CAST(vi_noi_bo_id AS CHAR) AS id FROM vi_noi_bo WHERE benh_nhan_id = ?',
    [w.patientId],
  );
  await wf.fundWallet(wallet[0]!.id, '350000.00');
  return {
    code: lich.maLichHen,
    a: await tokenOf(w.patientId),
    b: await tokenOf(w.secondPatientId),
    doctor: await tokenOf(w.doctor.account.taiKhoanId),
    reception: await tokenOf(w.receptionId),
    system: await tokenOf(w.systemAdmin.account.taiKhoanId),
    branch: await tokenOf(w.branchAdmin.account.taiKhoanId),
  };
}

describe('TLK-01, TLK-04, TLK-15, QTT-12 thanh toán qua HTTP', () => {
  it('POST …/payment: 200 đúng năm khoá, no-store; lần hai 200 daXuLyTruocDo true', async () => {
    const t = await world();
    const first = await post(t.code, {}, t.a);
    expect(first.status).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(Object.keys(first.body as object).toSorted()).toEqual(PAY_KEYS);
    expect(first.body).toEqual({
      maLichHen: t.code,
      trangThai: 'DaXacNhan',
      soTien: COC,
      soDuKhaDung: '250000.00',
      daXuLyTruocDo: false,
    });
    const second = await post(t.code, {}, t.a);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      daXuLyTruocDo: true,
      soDuKhaDung: '250000.00',
    });
  });

  it('GET …/payment-preview: 200 đúng sáu khoá, no-store, số do máy chủ tính', async () => {
    const t = await world();
    const res = await preview(t.code, t.a);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.body as object).toSorted()).toEqual(PREVIEW_KEYS);
    expect(res.body).toMatchObject({
      soTienCan: COC,
      soDuKhaDung: '350000.00',
      soDuSauThanhToan: '250000.00',
      duSoDu: true,
    });
  });

  it('QTT-12 lỗi nghiệp vụ 409 cũng có no-store và đúng mã (thanh toán rồi xem preview ⇒ không còn chờ)', async () => {
    const t = await world();
    await post(t.code, {}, t.a);
    const res = await preview(t.code, t.a);
    expectErrorResponse(res, 409, 'LICH_HEN_KHONG_CHO_THANH_TOAN');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('TLK-15, QTT-03 thân phải rỗng', () => {
  it.each(['benhNhanId', 'viNoiBoId', 'soTien', 'tienCoc', 'khoaLa'])(
    'thân có `%s` ⇒ 400 TRUONG_KHONG_DUOC_PHEP đúng trường đó, có no-store, giá trị không lặp lại, ví không đổi',
    async (key) => {
      const t = await world();
      const res = await post(t.code, { [key]: 'GIA-TRI-NHAY-CAM-9' }, t.a);
      expect(expectErrorResponse(res, 400, INVALID_DATA).loi).toEqual([
        { truong: key, ma: NOT_ALLOWED },
      ]);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.text).not.toContain('GIA-TRI-NHAY-CAM-9');
      // Chưa thanh toán gì: preview vẫn thấy ví nguyên
      expect((await preview(t.code, t.a)).body).toMatchObject({
        soDuKhaDung: '350000.00',
      });
    },
  );
});

describe('TLK-09, QTT-02 sở hữu và mã sai dạng', () => {
  it('lịch của người khác, không tồn tại, mã sai dạng ⇒ CÙNG một 404 KHONG_TIM_THAY, có no-store, ở cả hai route', async () => {
    const t = await world();
    const bodies: unknown[] = [];
    for (const code of [t.code, 'CLX-20261110-ZZZZZ', 'sai-dang'])
      for (const call of [
        () => post(code, {}, t.b),
        () => preview(code, t.b),
      ]) {
        const res = await call();
        expectErrorResponse(res, 404, NOT_FOUND);
        expect(res.headers['cache-control']).toBe('no-store');
        bodies.push(res.body);
      }
    for (const body of bodies) expect(body).toEqual(bodies[0]);
    // Bệnh nhân B không làm đổi lịch của A
    expect((await preview(t.code, t.a)).status).toBe(200);
  });
});

describe('TLK-14 quyền', () => {
  it('chưa đăng nhập ⇒ 401 CHUA_DANG_NHAP ở cả hai route, kể cả khi thân hay mã sai', async () => {
    const t = await world();
    for (const code of [t.code, 'sai-dang']) {
      expectErrorResponse(await post(code, {}), 401, NOT_LOGGED_IN);
      expectErrorResponse(
        await post(code, { benhNhanId: '1' }),
        401,
        NOT_LOGGED_IN,
      );
      expectErrorResponse(await preview(code), 401, NOT_LOGGED_IN);
    }
  });

  it('Bác sĩ, Lễ tân, QTV Chi nhánh, QTV Toàn hệ thống ⇒ ĐÚNG 403 KHONG_DU_QUYEN, kể cả khi mã hay thân SAI (guard trước pipe); không thanh toán được', async () => {
    const t = await world();
    for (const token of [t.doctor, t.reception, t.branch, t.system])
      for (const code of [t.code, 'sai-dang']) {
        expectErrorResponse(await post(code, {}, token), 403, FORBIDDEN);
        expectErrorResponse(
          await post(code, { benhNhanId: '1' }, token),
          403,
          FORBIDDEN,
        );
        expectErrorResponse(await preview(code, token), 403, FORBIDDEN);
      }
    expect((await preview(t.code, t.a)).body).toMatchObject({
      soDuKhaDung: '350000.00',
    });
  });
});

describe('TLK-02 thiếu số dư qua HTTP', () => {
  it('409 SO_DU_KHONG_DU kèm chiTiet, có no-store; ví không đổi', async () => {
    const t = await world();
    await h.db.query('UPDATE vi_noi_bo SET so_du = 50000.00');
    const res = await post(t.code, {}, t.a);
    expect(expectErrorResponse(res, 409, 'SO_DU_KHONG_DU').chiTiet).toEqual({
      soDuKhaDung: '50000.00',
      soTienCan: COC,
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
