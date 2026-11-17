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

// payment B1 — GET /patient/wallet và GET /patient/wallet/transactions qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN payment 5.11 #1, #2;
// QTT-02, QTT-03, QTT-05, QTT-07, QTT-12; SDV-06 phần pipe, SDV-08). Phần dịch vụ và SQL: src/wallet/balance/patient-wallet.int-spec.ts. Dữ liệu giả.
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const NOT_FOUND = 'KHONG_TIM_THAY';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const OVERVIEW_KEYS = [
  'congThanhToan',
  'hanMucNap',
  'napChoXacNhan',
  'soDu',
  'soDuKhaDung',
  'soTienDangGiu',
  'yeuCauRutGanNhat',
];
const PAGE_KEYS = ['items', 'kichThuoc', 'total', 'trang'];
const ITEM_KEYS = [
  'id',
  'loai',
  'noiDung',
  'quaCuaSo',
  'soTien',
  'thoiDiem',
  'trangThai',
];
/** Khoá không bao giờ được lộ ra ngoài (SDV-08) */
const FORBIDDEN_KEYS = [
  'viNoiBoId',
  'vi_noi_bo_id',
  'benhNhanId',
  'maGiaoDichCong',
  'ma_giao_dich_cong',
  'giaoDichViId',
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
// `path` viết thẳng (kể cả `?`) để thử query sai dạng, lặp khoá, khoá lạ
const get = (path: string, accessToken?: string) => {
  const req = request(h.app.getHttpServer()).get(`/patient/wallet${path}`);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};

/** Hai Bệnh nhân có ví (A đã nạp 100.000, B đã nạp 900.000) và mọi vai trò khác, kèm token. */
async function world() {
  const w = await statusWorld(h.db, fx);
  const a = await wf.patientWithWallet();
  const b = await wf.patientWithWallet();
  await wf.fundWallet(a.walletId, '100000.00');
  await wf.fundWallet(b.walletId, '900000.00');
  // Bệnh nhân của statusWorld có ví mặc định: xoá để dựng ca "không có hàng ví" (trên DB thật ví luôn tạo cùng lúc xác minh, nên đây là ca phòng thủ)
  await h.db.query('DELETE FROM vi_noi_bo WHERE benh_nhan_id = ?', [
    w.patientId,
  ]);
  return {
    a: await tokenOf(a.patientId),
    b: await tokenOf(b.patientId),
    doctor: await tokenOf(w.doctor.account.taiKhoanId),
    reception: await tokenOf(w.receptionId),
    system: await tokenOf(w.systemAdmin.account.taiKhoanId),
    branch: await tokenOf(w.branchAdmin.account.taiKhoanId),
    /** Bệnh nhân đã đăng nhập được nhưng KHÔNG có hàng ví */
    noWallet: await tokenOf(w.patientId),
  };
}

describe('QTT-02, SDV-07, SDV-08, QTT-12 Bệnh nhân xem ví của mình', () => {
  it('GET /patient/wallet: 200, đúng bảy khoá, no-store, đúng số của CHÍNH mình; Bệnh nhân khác thấy số của họ', async () => {
    const t = await world();
    const a = await get('', t.a);
    expect(a.status).toBe(200);
    expect(a.headers['cache-control']).toBe('no-store');
    expect(Object.keys(a.body as object).toSorted()).toEqual(OVERVIEW_KEYS);
    expect(a.body).toMatchObject({
      soDu: '100000.00',
      soDuKhaDung: '100000.00',
      yeuCauRutGanNhat: null,
    });
    const b = await get('', t.b);
    expect(b.body).toMatchObject({ soDu: '900000.00' });
  });

  it('GET /patient/wallet/transactions: 200, đúng bốn khoá ở gốc và bảy khoá mỗi dòng, no-store; mỗi người chỉ thấy dòng của mình; không khoá cấm', async () => {
    const t = await world();
    const a = await get('/transactions', t.a);
    expect(a.status).toBe(200);
    expect(a.headers['cache-control']).toBe('no-store');
    expect(Object.keys(a.body as object).toSorted()).toEqual(PAGE_KEYS);
    const body = a.body as { items: Record<string, unknown>[]; total: number };
    expect(body.total).toBe(1);
    expect(Object.keys(body.items[0] ?? {}).toSorted()).toEqual(ITEM_KEYS);
    expect(body.items[0]).toMatchObject({
      loai: 'Nap',
      soTien: '100000.00',
      trangThai: 'ThanhCong',
    });
    const text = a.text;
    for (const key of FORBIDDEN_KEYS) expect(text).not.toContain(`"${key}"`);
    const b = await get('/transactions?loai=Nap', t.b);
    expect(b.body).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ soTien: '900000.00' })],
    });
  });

  it('QTT-02, QTT-12 không có hàng ví ⇒ 404 KHONG_TIM_THAY (cùng thân với mọi 404), có no-store', async () => {
    const t = await world();
    for (const path of ['', '/transactions']) {
      const res = await get(path, t.noWallet);
      expectErrorResponse(res, 404, NOT_FOUND);
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });
});

describe('SDV-06, QTT-03, QTT-12 query sai ⇒ 400 có no-store, không lặp lại giá trị', () => {
  it('QTT-03 khoá lạ (`benhNhanId`, `viNoiBoId`, tuỳ ý) ở query của cả hai route ⇒ 400 TRUONG_KHONG_DUOC_PHEP đúng trường đó; giá trị không xuất hiện trong phản hồi', async () => {
    const t = await world();
    for (const path of ['', '/transactions'])
      for (const key of ['benhNhanId', 'viNoiBoId', 'tuyY']) {
        const res = await get(`${path}?${key}=GIA-TRI-NHAY-CAM-9`, t.a);
        if (path === '') {
          // `GET /patient/wallet` không có DTO query: khoá lạ bị bỏ qua, chủ ví vẫn chỉ từ token (khác route danh sách)
          expect(res.status).toBe(200);
          expect(res.body).toMatchObject({ soDu: '100000.00' });
          continue;
        }
        expect(expectErrorResponse(res, 400, INVALID_DATA).loi).toEqual([
          { truong: key, ma: NOT_ALLOWED },
        ]);
        expect(res.headers['cache-control']).toBe('no-store');
        expect(res.text).not.toContain('GIA-TRI-NHAY-CAM-9');
      }
  });

  it.each([
    'trang=0',
    'trang=abc',
    'trang=1.5',
    'trang=1&trang=2',
    'kichThuoc=0',
    'kichThuoc=51',
    'loai=KhongCo',
    'loai=nap',
    'loai=',
  ])('`?%s` ⇒ 400 DU_LIEU_KHONG_HOP_LE, có no-store', async (query) => {
    const t = await world();
    const res = await get(`/transactions?${query}`, t.a);
    expectErrorResponse(res, 400, INVALID_DATA);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('query hợp lệ đi qua pipe thật: kichThuoc 50, loai Nap; trang rất lớn ⇒ 200 rỗng, total giữ nguyên', async () => {
    const t = await world();
    const ok = await get('/transactions?trang=1&kichThuoc=50&loai=Nap', t.a);
    expect(ok.status).toBe(200);
    for (const query of ['?trang=999', '?trang=1000000000000000000']) {
      const past = await get(`/transactions${query}`, t.a);
      expect(past.status).toBe(200);
      expect(past.body).toMatchObject({ items: [], total: 1 });
    }
  });
});

describe('QTT-05, QTT-07 quyền', () => {
  it('QTT-07 khách ⇒ 401 CHUA_DANG_NHAP ở cả hai route, kể cả khi query sai', async () => {
    for (const path of ['', '/transactions', '/transactions?trang=0'])
      expectErrorResponse(await get(path), 401, NOT_LOGGED_IN);
  });

  it('QTT-05 Bác sĩ, Lễ tân, QTV Chi nhánh, QTV Toàn hệ thống ⇒ ĐÚNG 403 KHONG_DU_QUYEN, kể cả khi query SAI (guard trước pipe)', async () => {
    const t = await world();
    for (const token of [t.doctor, t.reception, t.branch, t.system])
      for (const path of [
        '',
        '/transactions',
        '/transactions?trang=0',
        '/transactions?benhNhanId=1',
      ])
        expectErrorResponse(await get(path, token), 403, FORBIDDEN);
  });
});
