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
import { withdrawalStack } from './../src/wallet/testing/withdrawal-stack.js';

// payment B12 — route Quản trị viên về rút tiền qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN payment 5.8, 5.11 #10, #11; XRT-08, QTT-06, XRT-09, XRT-12, XRT-03/04 phần HTTP).
// Phần dịch vụ và SQL: src/wallet/withdrawal/admin-withdrawal.int-spec.ts. Dữ liệu giả.
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const NOT_FOUND = 'KHONG_TIM_THAY';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const ITEM_KEYS = [
  'benhNhan',
  'maYeuCau',
  'soTien',
  'thoiDiemXuLy',
  'thoiDiemYeuCau',
  'trangThai',
];
const DETAIL_KEYS = [
  ...ITEM_KEYS,
  'giaoDichGanDay',
  'soDuHienTai',
  'soTienDangGiu',
].toSorted();

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

type Method = 'get' | 'post';
const call = (method: Method, path: string, token?: string, body?: object) => {
  const req = request(h.app.getHttpServer())[method](path);
  if (token) req.set('Authorization', `Bearer ${token}`);
  return method === 'post' ? req.send(body ?? {}) : req;
};

/** Bệnh nhân A có ví 350.000 và một yêu cầu rút 100.000 đang chờ; token của Quản trị viên toàn hệ thống và mọi vai trò khác. */
async function world() {
  const w = await statusWorld(h.db, fx);
  const walletRow = await h.db.query<{ id: string }[]>(
    'SELECT CAST(vi_noi_bo_id AS CHAR) AS id FROM vi_noi_bo WHERE benh_nhan_id = ?',
    [w.patientId],
  );
  const walletA = walletRow[0]!.id;
  await wf.fundWallet(walletA, '350000.00');
  const { maYeuCau } = await withdrawalStack(h.db).request(
    w.patientId,
    '100000',
  );
  return {
    walletA,
    maYeuCau,
    system: await tokenOf(w.systemAdmin.account.taiKhoanId),
    systemId: w.systemAdmin.account.taiKhoanId,
    patientId: w.patientId,
    others: [
      await tokenOf(w.patientId),
      await tokenOf(w.doctor.account.taiKhoanId),
      await tokenOf(w.receptionId),
      await tokenOf(w.branchAdmin.account.taiKhoanId),
    ],
  };
}

const routes = (maYeuCau: string): [Method, string][] => [
  ['get', '/admin/wallet/withdrawals'],
  ['get', `/admin/wallet/withdrawals/${maYeuCau}`],
  ['post', `/admin/wallet/withdrawals/${maYeuCau}/approve`],
  ['post', `/admin/wallet/withdrawals/${maYeuCau}/reject`],
];

const status = async (maYeuCau: string) =>
  (
    await h.db.query<{ t: string }[]>(
      'SELECT trang_thai AS t FROM yeu_cau_rut_tien WHERE yeu_cau_rut_tien_id = ?',
      [maYeuCau],
    )
  )[0]!.t;

describe('XRT-08, QTT-06 phân quyền bốn route', () => {
  it('chưa đăng nhập ⇒ 401; Admin ChiNhanh, Bệnh nhân, Bác sĩ, Lễ tân ⇒ 403; yêu cầu không bị đổi', async () => {
    const t = await world();
    for (const [method, path] of routes(t.maYeuCau)) {
      expectErrorResponse(await call(method, path), 401, NOT_LOGGED_IN);
      for (const token of t.others)
        expectErrorResponse(await call(method, path, token), 403, FORBIDDEN);
    }
    expect(await status(t.maYeuCau)).toBe('ChoDuyet');
    expect(await wf.readWallet(t.walletA)).toMatchObject({
      soTienDangGiu: '100000.00',
    });
  });

  it('guard chạy TRƯỚC pipe: vai trò sai gửi id sai dạng vẫn nhận 403, không 404', async () => {
    const t = await world();
    expectErrorResponse(
      await call('get', '/admin/wallet/withdrawals/abc', t.others[3]),
      403,
      FORBIDDEN,
    );
  });
});

describe('XRT-01, XRT-02, XRT-09, XRT-12 đọc', () => {
  it('XRT-12 danh sách: đúng khoá cấp một, no-store, chỉ họ tên Bệnh nhân (không email, SĐT)', async () => {
    const t = await world();
    const res = await call('get', '/admin/wallet/withdrawals', t.system);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.body as object).toSorted()).toEqual([
      'demTheoTrangThai',
      'items',
      'kichThuoc',
      'total',
      'trang',
    ]);
    const item = (res.body as { items: Record<string, unknown>[] }).items[0]!;
    expect(Object.keys(item).toSorted()).toEqual(ITEM_KEYS);
    expect(Object.keys(item.benhNhan as object)).toEqual(['hoTen']);
    expect(JSON.stringify(res.body)).not.toMatch(/@|so_dien_thoai|email/u);
    expect(
      (res.body as { demTheoTrangThai: unknown }).demTheoTrangThai,
    ).toEqual({ tatCa: 1, choDuyet: 1, daDuyet: 0, tuChoi: 0 });
  });

  it('XRT-12 chi tiết: đúng khoá; XRT-09 id lạ hoặc sai dạng ⇒ 404 cùng thân', async () => {
    const t = await world();
    const res = await call(
      'get',
      `/admin/wallet/withdrawals/${t.maYeuCau}`,
      t.system,
    );
    expect(res.status).toBe(200);
    expect(Object.keys(res.body as object).toSorted()).toEqual(DETAIL_KEYS);
    expect(JSON.stringify(res.body)).not.toMatch(/@|so_dien_thoai|email/u);
    const missing = await call(
      'get',
      '/admin/wallet/withdrawals/999999',
      t.system,
    );
    const malformed = await call(
      'get',
      '/admin/wallet/withdrawals/abc',
      t.system,
    );
    expectErrorResponse(missing, 404, NOT_FOUND);
    expectErrorResponse(malformed, 404, NOT_FOUND);
    expect(malformed.body).toEqual(missing.body);
    expect(missing.headers['cache-control']).toBe('no-store');
  });

  it('XRT-01 query sai ⇒ 400: trangThai lạ, kichThuoc > 50, khoá lạ', async () => {
    const t = await world();
    for (const query of [
      '?trangThai=Khac',
      '?kichThuoc=51',
      '?trang=0',
      '?benhNhanId=1',
    ])
      expectErrorResponse(
        await call('get', `/admin/wallet/withdrawals${query}`, t.system),
        400,
        INVALID_DATA,
      );
  });
});

describe('XRT-03, XRT-04, XRT-06 duyệt và từ chối qua HTTP', () => {
  it('duyệt ⇒ 200 { maYeuCau, trangThai }, no-store; ví bị trừ; duyệt lần hai ⇒ 409 YEU_CAU_DA_XU_LY', async () => {
    const t = await world();
    const path = `/admin/wallet/withdrawals/${t.maYeuCau}/approve`;
    const res = await call('post', path, t.system, { ghiChu: '  Đã chuyển  ' });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ maYeuCau: t.maYeuCau, trangThai: 'DaDuyet' });
    expect(await wf.readWallet(t.walletA)).toEqual({
      soDu: '250000.00',
      soTienDangGiu: '0.00',
    });
    const again = await call('post', path, t.system);
    expect(expectErrorResponse(again, 409, 'YEU_CAU_DA_XU_LY').chiTiet).toEqual(
      {
        trangThai: 'DaDuyet',
      },
    );
  });

  it('từ chối ⇒ 200; thân rỗng và ghiChu toàn khoảng trắng đều hợp lệ', async () => {
    const t = await world();
    const res = await call(
      'post',
      `/admin/wallet/withdrawals/${t.maYeuCau}/reject`,
      t.system,
      { ghiChu: '   ' },
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ maYeuCau: t.maYeuCau, trangThai: 'TuChoi' });
    expect(await wf.readWallet(t.walletA)).toEqual({
      soDu: '350000.00',
      soTienDangGiu: '0.00',
    });
  });

  it.each([
    ['nguoiXuLyId', '1'],
    ['trangThai', 'DaDuyet'],
    ['soTien', '1'],
    ['viNoiBoId', '1'],
  ])(
    'thân có khoá lạ `%s` ⇒ 400 TRUONG_KHONG_DUOC_PHEP, yêu cầu không đổi',
    async (key, value) => {
      const t = await world();
      const res = await call(
        'post',
        `/admin/wallet/withdrawals/${t.maYeuCau}/approve`,
        t.system,
        { [key]: value },
      );
      expect(expectErrorResponse(res, 400, INVALID_DATA).loi).toEqual([
        { truong: key, ma: NOT_ALLOWED },
      ]);
      expect(await status(t.maYeuCau)).toBe('ChoDuyet');
    },
  );

  it('ghiChu quá 200 ký tự hoặc không phải chuỗi ⇒ 400; đúng 200 ký tự (biên) ⇒ 200', async () => {
    const t = await world();
    const path = `/admin/wallet/withdrawals/${t.maYeuCau}/approve`;
    for (const ghiChu of ['x'.repeat(201), 123, ['a']])
      expectErrorResponse(
        await call('post', path, t.system, { ghiChu }),
        400,
        INVALID_DATA,
      );
    expect(await status(t.maYeuCau)).toBe('ChoDuyet');
    const ok = await call('post', path, t.system, { ghiChu: 'x'.repeat(200) });
    expect(ok.status).toBe(200);
  });

  // Trước bản sửa: DTO nhận chữ này, `AuditService` ném AUDIT_SENSITIVE_DATA, giao dịch hoàn tác và route trả 500 (TRACKING payment, B13 quyết định 6).
  it.each([
    ['approve', 'token=abc123xyz'],
    ['approve', 'password: hunter2'],
    ['reject', 'Bearer abcdefghijklmnop'],
    ['reject', `mã băm ${'a'.repeat(64)}`],
  ])(
    'XRT-06 %s với ghiChu giống bí mật "%s" ⇒ 400 ghiChu NOI_DUNG_KHONG_HOP_LE (không 500); yêu cầu, ví, nhật ký, thông báo không đổi',
    async (action, ghiChu) => {
      const t = await world();
      const countRows = async (table: 'thong_bao' | 'nhat_ky_hanh_dong') =>
        (
          await h.db.query<{ n: string }[]>(
            `SELECT COUNT(*) AS n FROM ${table}`,
          )
        )[0]!.n;
      const before = {
        thongBao: await countRows('thong_bao'),
        nhatKy: await countRows('nhat_ky_hanh_dong'),
      };
      const res = await call(
        'post',
        `/admin/wallet/withdrawals/${t.maYeuCau}/${action}`,
        t.system,
        { ghiChu },
      );
      const body = expectErrorResponse(res, 400, INVALID_DATA);
      expect(body.loi).toEqual([
        { truong: 'ghiChu', ma: 'NOI_DUNG_KHONG_HOP_LE' },
      ]);
      // Thân lỗi không lặp lại giá trị người dùng nhập
      expect(JSON.stringify(body)).not.toContain(ghiChu);
      expect(await status(t.maYeuCau)).toBe('ChoDuyet');
      expect(await wf.readWallet(t.walletA)).toEqual({
        soDu: '350000.00',
        soTienDangGiu: '100000.00',
      });
      expect({
        thongBao: await countRows('thong_bao'),
        nhatKy: await countRows('nhat_ky_hanh_dong'),
      }).toEqual(before);
    },
  );

  it('XRT-06 ghiChu bình thường (có số tiền, SĐT, ngày) vẫn được nhận', async () => {
    const t = await world();
    const res = await call(
      'post',
      `/admin/wallet/withdrawals/${t.maYeuCau}/reject`,
      t.system,
      {
        ghiChu: 'Số tài khoản sai, gọi 0901234567 ngày 10/11/2026 để xác nhận',
      },
    );
    expect(res.status).toBe(200);
  });

  it('XRT-09 duyệt hay từ chối id không tồn tại ⇒ 404', async () => {
    const t = await world();
    for (const action of ['approve', 'reject'])
      expectErrorResponse(
        await call(
          'post',
          `/admin/wallet/withdrawals/999999/${action}`,
          t.system,
        ),
        404,
        NOT_FOUND,
      );
  });
});
