import request from 'supertest';
import { vi } from 'vitest';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { paymentWorld } from './../src/payment/testing/payment-world.js';
import {
  EXHAUSTED_ATTEMPTS,
  pendingTopup,
} from './../src/payment/testing/reconcile-stack.js';
import { WalletFixtures } from './../src/wallet/testing/wallet-fixtures.js';

// payment B15 — "Nạp ví chưa cộng" qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN payment 5.4 bước 6, 5.11 #13; NVC-09; NVC-03, NVC-06 phần HTTP).
// Phần dịch vụ và SQL: src/payment/reconcile/admin-unposted-topup.int-spec.ts. Dữ liệu giả.
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const NOT_FOUND = 'KHONG_TIM_THAY';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const REASON = 'Cổng báo thành công nhưng ngân hàng đang tra soát';
const BASE = '/admin/payment/unposted-topups';

let h: RefreshHarness;

beforeAll(async () => {
  h = await openRefreshHarness();
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
const call = (
  method: 'get' | 'post',
  path: string,
  token?: string,
  body?: object,
) => {
  const req = request(h.app.getHttpServer())[method](`${BASE}${path}`);
  if (body !== undefined) req.send(body);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};
const napRows = async () =>
  Number(
    (
      await h.db.query<{ n: string }[]>(
        "SELECT COUNT(*) AS n FROM giao_dich_vi WHERE loai = 'Nap'",
      )
    )[0]!.n,
  );

/** Một giao dịch nạp đã hết lượt tự động; token Quản trị viên toàn hệ thống và mọi vai trò khác. */
async function world() {
  const w = await paymentWorld(h.db);
  const wf = new WalletFixtures(h.db);
  const id = await pendingTopup(h.db, wf, {
    walletId: w.patient.wallet.viNoiBoId,
    attempts: EXHAUSTED_ATTEMPTS,
  });
  const system = await wf.admin.admin();
  return {
    w,
    id,
    system: await tokenOf(system.account.taiKhoanId),
    others: [
      await tokenOf(w.branchAdmin.account.taiKhoanId),
      await tokenOf(w.patientId),
      await tokenOf(w.receptionist.account.taiKhoanId),
      await tokenOf(w.doctor.account.taiKhoanId),
    ],
  };
}

describe('NVC-09 phân quyền và phạm vi', () => {
  it('chưa đăng nhập ⇒ 401; Admin ChiNhanh, Bệnh nhân, Lễ tân, Bác sĩ ⇒ 403 ở cả bốn route; không cộng gì', async () => {
    const t = await world();
    const routes: ['get' | 'post', string, object?][] = [
      ['get', ''],
      ['get', `/${t.id}`],
      ['post', `/${t.id}/credit`, {}],
      ['post', `/${t.id}/mark-unprocessable`, { lyDo: REASON }],
    ];
    for (const [method, path, body] of routes) {
      expectErrorResponse(
        await call(method, path, undefined, body),
        401,
        NOT_LOGGED_IN,
      );
      for (const token of t.others)
        expectErrorResponse(
          await call(method, path, token, body),
          403,
          FORBIDDEN,
        );
    }
    expect(await napRows()).toBe(0);
  });

  it('giao dịch không phải nạp ví, không có, id sai dạng ⇒ CÙNG một 404 ở chi tiết và hai route ghi', async () => {
    const t = await world();
    const wf = new WalletFixtures(h.db);
    const notTopup = await wf.insertPayment({
      viNoiBoId: t.w.patient.wallet.viNoiBoId,
      loai: 'ThanhToanLichHen',
      lichHenId: (await t.w.appointment(0)).lichHenId,
      phuongThuc: 'Vi',
      soTien: '100000.00',
    });
    const bodies: unknown[] = [];
    for (const code of [notTopup, '999999999', 'sai-dang']) {
      for (const [method, path, body] of [
        ['get', `/${code}`],
        ['post', `/${code}/credit`, {}],
        ['post', `/${code}/mark-unprocessable`, { lyDo: REASON }],
      ] as ['get' | 'post', string, object?][]) {
        const res = await call(method, path, t.system, body);
        expectErrorResponse(res, 404, NOT_FOUND);
        bodies.push(res.body);
      }
    }
    for (const body of bodies) expect(body).toEqual(bodies[0]);
  });
});

describe('NVC-01, NVC-03, NVC-06 qua HTTP', () => {
  it('danh sách và chi tiết 200, no-store; Cộng ví 200 { maGiaoDich, trangThaiDoiSoat: DaDoiSoat }; lần hai 409 GIAO_DICH_NAP_DA_DOI_SOAT', async () => {
    const t = await world();
    const list = await call('get', '', t.system);
    expect(list.status).toBe(200);
    expect(list.headers['cache-control']).toBe('no-store');
    expect(
      (list.body as { items: { maGiaoDich: string }[] }).items.map(
        (item) => item.maGiaoDich,
      ),
    ).toEqual([t.id]);
    const detail = await call('get', `/${t.id}`, t.system);
    expect(detail.status).toBe(200);
    expect((detail.body as { lanThu: unknown[] }).lanThu).toHaveLength(4);

    const credited = await call('post', `/${t.id}/credit`, t.system, {});
    expect(credited.status).toBe(200);
    expect(credited.headers['cache-control']).toBe('no-store');
    expect(credited.body).toStrictEqual({
      maGiaoDich: t.id,
      trangThaiDoiSoat: 'DaDoiSoat',
    });
    const again = await call('post', `/${t.id}/credit`, t.system, {});
    expect(
      expectErrorResponse(again, 409, 'GIAO_DICH_NAP_DA_DOI_SOAT').chiTiet,
    ).toEqual({ trangThaiDoiSoat: 'DaDoiSoat' });
    expect(await napRows()).toBe(1);
  });

  it.each(['soTien', 'viNoiBoId', 'khoaLa'])(
    'NVC-03 thân Cộng ví có `%s` ⇒ 400 TRUONG_KHONG_DUOC_PHEP (số tiền chỉ lấy từ giao dịch); không cộng',
    async (key) => {
      const t = await world();
      const res = await call('post', `/${t.id}/credit`, t.system, {
        [key]: '999999',
      });
      expect(expectErrorResponse(res, 400, INVALID_DATA).loi).toEqual([
        { truong: key, ma: NOT_ALLOWED },
      ]);
      expect(await napRows()).toBe(0);
    },
  );

  it.each([
    ['thiếu', {}],
    ['rỗng', { lyDo: '' }],
    ['toàn khoảng trắng', { lyDo: '          ' }],
    ['ngắn hơn 10 ký tự', { lyDo: 'Ngắn quá' }],
    ['dài hơn 255 ký tự', { lyDo: 'a'.repeat(256) }],
    ['kiểu số', { lyDo: 1234567890 }],
  ])(
    'NVC-06 lý do %s ⇒ 400 LY_DO_BAT_BUOC ở trường lyDo; không ghi lần thử nào',
    async (_name, body) => {
      const t = await world();
      const res = await call(
        'post',
        `/${t.id}/mark-unprocessable`,
        t.system,
        body,
      );
      const loi = expectErrorResponse(res, 400, INVALID_DATA).loi as {
        truong: string;
        ma: string;
      }[];
      expect(loi).toEqual([{ truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' }]);
      const n = await h.db.query<{ n: string }[]>(
        'SELECT COUNT(*) AS n FROM lan_doi_soat_nap_vi WHERE giao_dich_thanh_toan_id = ?',
        [t.id],
      );
      expect(Number(n[0]!.n)).toBe(4);
    },
  );

  it('NVC-06 "Không thể xử lý" 200 { trangThaiDoiSoat: ChoDoiSoat }; giao dịch vẫn ở danh sách với trạng thái KhongTheXuLy', async () => {
    const t = await world();
    const res = await call('post', `/${t.id}/mark-unprocessable`, t.system, {
      lyDo: `  ${REASON}  `,
    });
    expect(res.status).toBe(200);
    expect(res.body).toStrictEqual({
      maGiaoDich: t.id,
      trangThaiDoiSoat: 'ChoDoiSoat',
    });
    const list = await call('get', '', t.system);
    expect((list.body as { items: unknown[] }).items).toEqual([
      expect.objectContaining({
        maGiaoDich: t.id,
        trangThaiXuLy: 'KhongTheXuLy',
        // Lý do đã cắt khoảng trắng hai đầu
        lyDoKhongTheXuLy: REASON,
      }),
    ]);
  });
});
