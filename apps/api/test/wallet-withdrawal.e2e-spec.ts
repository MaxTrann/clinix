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

// payment B11 — `POST /patient/wallet/withdrawals` qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN payment 5.8, 5.11 #9; RTV-07, RTV-01 phần HTTP).
// Phần dịch vụ và SQL: src/wallet/withdrawal/withdrawal.int-spec.ts. Dữ liệu giả.
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const CREATED_KEYS = ['maYeuCau', 'soDuKhaDung', 'soTien', 'soTienDangGiu'];

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
const post = (body: unknown, accessToken?: string) => {
  const req = request(h.app.getHttpServer())
    .post('/patient/wallet/withdrawals')
    .send(body as object);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const pending = async () =>
  Number(
    (
      await h.db.query<{ n: string }[]>(
        "SELECT COUNT(*) AS n FROM yeu_cau_rut_tien WHERE trang_thai = 'ChoDuyet'",
      )
    )[0]!.n,
  );

/** Bệnh nhân A có ví 350.000; Bệnh nhân B có ví 0; mọi vai trò khác; kèm token. */
async function world() {
  const w = await statusWorld(h.db, fx);
  const walletOf = async (patientId: string) =>
    (
      await h.db.query<{ id: string }[]>(
        'SELECT CAST(vi_noi_bo_id AS CHAR) AS id FROM vi_noi_bo WHERE benh_nhan_id = ?',
        [patientId],
      )
    )[0]!.id;
  const walletA = await walletOf(w.patientId);
  await wf.fundWallet(walletA, '350000.00');
  return {
    walletA,
    walletB: await walletOf(w.secondPatientId),
    a: await tokenOf(w.patientId),
    b: await tokenOf(w.secondPatientId),
    others: [
      await tokenOf(w.doctor.account.taiKhoanId),
      await tokenOf(w.receptionId),
      await tokenOf(w.systemAdmin.account.taiKhoanId),
      await tokenOf(w.branchAdmin.account.taiKhoanId),
    ],
  };
}

describe('RTV-01, RTV-07 rút tiền qua HTTP', () => {
  it('RTV-01 201 đúng bốn khoá, no-store; ví của CHÍNH người gọi bị giữ tiền', async () => {
    const t = await world();
    const res = await post({ soTien: '100000' }, t.a);
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.body as object).toSorted()).toEqual(CREATED_KEYS);
    expect(res.body).toMatchObject({
      soTien: '100000.00',
      soDuKhaDung: '250000.00',
      soTienDangGiu: '100000.00',
    });
    expect(await wf.readWallet(t.walletA)).toMatchObject({
      soTienDangGiu: '100000.00',
    });
    expect(await wf.readWallet(t.walletB)).toMatchObject({
      soTienDangGiu: '0.00',
    });
  });

  it('RTV-07 chưa đăng nhập ⇒ 401; vai trò khác Bệnh nhân ⇒ 403; không yêu cầu nào được tạo', async () => {
    const t = await world();
    expectErrorResponse(await post({ soTien: '100000' }), 401, NOT_LOGGED_IN);
    for (const token of t.others)
      expectErrorResponse(
        await post({ soTien: '100000' }, token),
        403,
        FORBIDDEN,
      );
    expect(await pending()).toBe(0);
  });

  it.each(['viNoiBoId', 'benhNhanId', 'trangThai', 'nguoiXuLyId'])(
    'RTV-07 chủ ví chỉ từ token: thân có `%s` ⇒ 400 TRUONG_KHONG_DUOC_PHEP, giá trị không lặp lại, không yêu cầu nào',
    async (key) => {
      const t = await world();
      const res = await post({ soTien: '100000', [key]: t.walletB }, t.a);
      expect(expectErrorResponse(res, 400, INVALID_DATA).loi).toEqual([
        { truong: key, ma: NOT_ALLOWED },
      ]);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(await pending()).toBe(0);
    },
  );

  it.each([
    ['100000.5'],
    ['-100000'],
    ['0'],
    ['abc'],
    ['12345678901'],
    [' 100000'],
    [null],
    [['100000']],
    [100000],
  ])(
    'RTV-07 soTien = %j ⇒ 400 SO_TIEN_KHONG_HOP_LE ở trường soTien, không yêu cầu nào',
    async (soTien) => {
      const t = await world();
      const res = await post({ soTien }, t.a);
      expect(expectErrorResponse(res, 400, INVALID_DATA).loi).toEqual([
        { truong: 'soTien', ma: 'SO_TIEN_KHONG_HOP_LE' },
      ]);
      expect(await pending()).toBe(0);
    },
  );

  it('lỗi nghiệp vụ qua HTTP: thiếu tiền 409 SO_DU_KHONG_DU kèm chiTiet; dưới tối thiểu 400; đã có yêu cầu chờ 409; đều có no-store', async () => {
    const t = await world();
    const poor = await post({ soTien: '400000' }, t.a);
    expect(expectErrorResponse(poor, 409, 'SO_DU_KHONG_DU').chiTiet).toEqual({
      soDuKhaDung: '350000.00',
      soTienCan: '400000.00',
    });
    expect(poor.headers['cache-control']).toBe('no-store');
    expectErrorResponse(
      await post({ soTien: '5000' }, t.a),
      400,
      'SO_TIEN_NGOAI_HAN_MUC',
    );
    expect((await post({ soTien: '100000' }, t.a)).status).toBe(201);
    expectErrorResponse(
      await post({ soTien: '10000' }, t.a),
      409,
      'DA_CO_YEU_CAU_CHO_DUYET',
    );
    expect(await pending()).toBe(1);
  });
});
