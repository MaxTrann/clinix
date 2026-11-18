import request from 'supertest';
import { vi } from 'vitest';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import { statusWorld } from './../src/appointments/testing/status-world.js';
import {
  T0,
  captureNestLogger,
} from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import {
  FAKE_VNPAY_ENV,
  signedVnpayIpn,
} from './../src/payment/testing/topup-stack.js';

// payment B4 — nạp ví và IPN của VNPAY qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN payment 5.4, 5.11 #3, #4, #5; NTV-01 phần HTTP, NTV-03, NTV-05, NTV-18, QTT-13,
// CGS-13, CGS-15, BDT-01 phần HTTP). Phần dịch vụ và SQL: src/payment/topup/topup.int-spec.ts. VNPAY cấu hình bằng KHOÁ GIẢ đặt vào `process.env` TRƯỚC khi dựng AppModule (không dùng `.env`
// của máy) và trả lại giá trị cũ sau cùng để file e2e khác không thấy VNPAY "đã cấu hình". Dữ liệu giả.
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const NOT_FOUND = 'KHONG_TIM_THAY';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const CREATE_KEYS = ['maGiaoDich', 'redirectUrl'];
const STATUS_KEYS = [
  'daCongVi',
  'maGiaoDich',
  'phuongThuc',
  'soTien',
  'thoiDiemTao',
  'trangThai',
];

let h: RefreshHarness;
let fx: BookingFixtures;
const savedEnv: Record<string, string | undefined> = {};

beforeAll(async () => {
  for (const [key, value] of Object.entries(FAKE_VNPAY_ENV)) {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }
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
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const server = () => h.app.getHttpServer();
const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
const create = (body: unknown, accessToken?: string) => {
  const req = request(server())
    .post('/patient/wallet/topups')
    .send(body as object);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const status = (id: string, accessToken?: string) => {
  const req = request(server()).get(`/patient/wallet/topups/${id}`);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const ipn = (params: Record<string, string>) =>
  request(server()).get('/payment/ipn/vnpay').query(params);

const count = async (sql: string, params: unknown[] = []) =>
  Number((await h.db.query<{ n: string }[]>(sql, params))[0]!.n);
const topupRows = () =>
  count("SELECT COUNT(*) AS n FROM giao_dich_thanh_toan WHERE loai = 'NapVi'");
const balanceOf = async (patientId: string) =>
  (
    await h.db.query<{ soDu: string }[]>(
      'SELECT so_du AS soDu FROM vi_noi_bo WHERE benh_nhan_id = ?',
      [patientId],
    )
  )[0]!.soDu;

async function world() {
  const w = await statusWorld(h.db, fx);
  return {
    patientId: w.patientId,
    a: await tokenOf(w.patientId),
    b: await tokenOf(w.secondPatientId),
    doctor: await tokenOf(w.doctor.account.taiKhoanId),
    reception: await tokenOf(w.receptionId),
    system: await tokenOf(w.systemAdmin.account.taiKhoanId),
    branch: await tokenOf(w.branchAdmin.account.taiKhoanId),
  };
}

describe('NTV-01 tạo nạp qua HTTP', () => {
  it('POST /patient/wallet/topups ⇒ 201 đúng hai khoá, no-store, redirectUrl https của VNPAY', async () => {
    const t = await world();
    const res = await create({ soTien: '100000', phuongThuc: 'VNPay' }, t.a);
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.body as object).toSorted()).toEqual(CREATE_KEYS);
    const body = res.body as { maGiaoDich: string; redirectUrl: string };
    expect(new URL(body.redirectUrl).host).toBe('sandbox.vnpayment.vn');
    expect(res.text).not.toContain(FAKE_VNPAY_ENV.VNPAY_HASH_SECRET);
    expect(await balanceOf(t.patientId)).toBe('0.00');
  });
});

describe('NTV-03, NTV-05, QTT-03 thân sai', () => {
  it.each([
    ['100000.5'],
    ['-100000'],
    ['0'],
    ['abc'],
    ['12345678901'],
    [' 100000'],
    ['１０００００'],
    [''],
    [null],
    [['100000']],
    [100000],
  ])(
    'NTV-03 soTien = %j ⇒ 400 SO_TIEN_KHONG_HOP_LE ở trường soTien, không dòng mới, thân không lặp giá trị',
    async (soTien) => {
      const t = await world();
      const res = await create({ soTien, phuongThuc: 'VNPay' }, t.a);
      expect(expectErrorResponse(res, 400, INVALID_DATA).loi).toEqual([
        { truong: 'soTien', ma: 'SO_TIEN_KHONG_HOP_LE' },
      ]);
      expect(res.headers['cache-control']).toBe('no-store');
      if (typeof soTien === 'string' && soTien.trim() !== '')
        expect(res.text).not.toContain(soTien.trim());
      expect(await topupRows()).toBe(0);
    },
  );

  it.each(['Vi', 'TienMatTaiQuay', 'vnpay', ''])(
    'NTV-05 phuongThuc = %j ⇒ 400 ở trường phuongThuc, không dòng mới',
    async (phuongThuc) => {
      const t = await world();
      const res = await create({ soTien: '100000', phuongThuc }, t.a);
      const body = expectErrorResponse(res, 400, INVALID_DATA);
      expect(body.loi?.map((e) => e.truong)).toEqual(['phuongThuc']);
      expect(await topupRows()).toBe(0);
    },
  );

  it.each(['viNoiBoId', 'benhNhanId', 'trangThai'])(
    'QTT-03 thân có `%s` ⇒ 400 TRUONG_KHONG_DUOC_PHEP, không dòng mới',
    async (key) => {
      const t = await world();
      const res = await create(
        { soTien: '100000', phuongThuc: 'VNPay', [key]: 'GIA-TRI-LA-9' },
        t.a,
      );
      expect(expectErrorResponse(res, 400, INVALID_DATA).loi).toEqual([
        { truong: key, ma: NOT_ALLOWED },
      ]);
      expect(res.text).not.toContain('GIA-TRI-LA-9');
      expect(await topupRows()).toBe(0);
    },
  );
});

describe('QTT-01 vai trò', () => {
  it('chưa đăng nhập ⇒ 401; vai trò khác Bệnh nhân ⇒ 403 ở cả hai route, không dòng mới', async () => {
    const t = await world();
    expectErrorResponse(
      await create({ soTien: '100000', phuongThuc: 'VNPay' }),
      401,
      NOT_LOGGED_IN,
    );
    expectErrorResponse(await status('1'), 401, NOT_LOGGED_IN);
    for (const token of [t.doctor, t.reception, t.system, t.branch]) {
      expectErrorResponse(
        await create({ soTien: '100000', phuongThuc: 'VNPay' }, token),
        403,
        FORBIDDEN,
      );
      expectErrorResponse(await status('1', token), 403, FORBIDDEN);
    }
    expect(await topupRows()).toBe(0);
  });
});

describe('NTV-18, QTT-13 xem trạng thái nạp', () => {
  it('chủ thấy đúng trạng thái (DangXuLy rồi ThanhCong sau IPN); xem nhiều lần không cộng ví', async () => {
    const t = await world();
    const { maGiaoDich } = (
      await create({ soTien: '100000', phuongThuc: 'VNPay' }, t.a)
    ).body as { maGiaoDich: string };
    const before = await status(maGiaoDich, t.a);
    expect(before.status).toBe(200);
    expect(before.headers['cache-control']).toBe('no-store');
    expect(Object.keys(before.body as object).toSorted()).toEqual(STATUS_KEYS);
    expect(before.body).toMatchObject({
      maGiaoDich,
      soTien: '100000.00',
      phuongThuc: 'VNPay',
      trangThai: 'DangXuLy',
      daCongVi: false,
    });
    await status(maGiaoDich, t.a);
    expect(await balanceOf(t.patientId)).toBe('0.00');
    await ipn(signedVnpayIpn({ giaoDichId: maGiaoDich, soTien: '100000.00' }));
    expect((await status(maGiaoDich, t.a)).body).toMatchObject({
      trangThai: 'ThanhCong',
      daCongVi: true,
    });
  });

  it('QTT-13 mã của người khác, không tồn tại, sai dạng ⇒ CÙNG một 404, có no-store', async () => {
    const t = await world();
    const { maGiaoDich } = (
      await create({ soTien: '100000', phuongThuc: 'VNPay' }, t.a)
    ).body as { maGiaoDich: string };
    const bodies: unknown[] = [];
    for (const id of [
      maGiaoDich,
      String(Number(maGiaoDich) + 1000),
      'abc',
      '0',
    ]) {
      const res = await status(id, t.b);
      expectErrorResponse(res, 404, NOT_FOUND);
      expect(res.headers['cache-control']).toBe('no-store');
      bodies.push(res.body);
    }
    const [first, ...rest] = bodies;
    for (const body of rest) expect(body).toEqual(first);
  });
});

describe('CGS-13, CGS-15, BDT-01 IPN qua HTTP', () => {
  it('CGS-13 IPN lặp hai lần qua GET /payment/ipn/vnpay ⇒ 00 rồi 02, cộng đúng một lần', async () => {
    const t = await world();
    const { maGiaoDich } = (
      await create({ soTien: '100000', phuongThuc: 'VNPay' }, t.a)
    ).body as { maGiaoDich: string };
    const params = signedVnpayIpn({
      giaoDichId: maGiaoDich,
      soTien: '100000.00',
    });
    const first = await ipn(params);
    const second = await ipn(params);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ RspCode: '00', Message: 'Confirm Success' });
    expect(second.body).toMatchObject({ RspCode: '02' });
    expect(await balanceOf(t.patientId)).toBe('100000.00');
  });

  it('CGS-15, BDT-01 route IPN không cần token (không 401), có no-store; log không chứa chuỗi truy vấn, chữ ký, mã cổng; chữ ký sai ⇒ 97', async () => {
    const t = await world();
    const logs = captureNestLogger();
    const { maGiaoDich } = (
      await create({ soTien: '123000', phuongThuc: 'VNPay' }, t.a)
    ).body as { maGiaoDich: string };
    const params = signedVnpayIpn({
      giaoDichId: maGiaoDich,
      soTien: '123000.00',
      transactionNo: '88887777',
    });
    const bad = await ipn({ ...params, vnp_Amount: '1' });
    expect(bad.status).toBe(200);
    expect(bad.headers['cache-control']).toBe('no-store');
    expect(bad.body).toMatchObject({ RspCode: '97' });
    const good = await ipn(params);
    expect(good.status).toBe(200);
    expect(good.headers['cache-control']).toBe('no-store');
    expect(good.body).toMatchObject({ RspCode: '00' });
    const text = logs.join('\n');
    for (const leak of [
      params.vnp_SecureHash!,
      '88887777',
      'vnp_',
      FAKE_VNPAY_ENV.VNPAY_TMN_CODE,
      FAKE_VNPAY_ENV.VNPAY_HASH_SECRET,
      '12300000',
    ])
      expect(text).not.toContain(leak);
  });
});
