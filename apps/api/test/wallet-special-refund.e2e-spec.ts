import request from 'supertest';
import { vi } from 'vitest';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { specialRefundWorld } from './../src/wallet/testing/special-refund-stack.js';

// payment B13 — hoàn tiền đặc biệt qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN payment 5.6.2, 5.11 #12; HDB-03, HDB-04, HDB-10, QTT-06, BDT-08, HDB-02 phần HTTP).
// Phần dịch vụ và SQL: src/wallet/special-refund/special-refund.int-spec.ts. Dữ liệu giả.
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const NOT_FOUND = 'KHONG_TIM_THAY';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const REASON = 'Bệnh nhân khiếu nại hợp lệ';

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

const LIST = '/admin/wallet/refundable-payments';
const CREATE = '/admin/wallet/special-refunds';
const get = (query: string, token?: string) => {
  const req = request(h.app.getHttpServer()).get(`${LIST}${query}`);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};
const post = (body: unknown, token?: string) => {
  const req = request(h.app.getHttpServer())
    .post(CREATE)
    .send(body as object);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};
const refundRows = async () =>
  Number(
    (
      await h.db.query<{ n: string }[]>(
        'SELECT COUNT(*) AS n FROM lich_su_hoan_tien',
      )
    )[0]!.n,
  );

/** Khoản cọc 100.000đ trả bằng ví; token Quản trị viên toàn hệ thống và mọi vai trò khác. */
async function world() {
  const t = await specialRefundWorld(h.db);
  return {
    ...t,
    system: await tokenOf(t.adminId),
    others: [
      await tokenOf(t.w.branchAdmin.account.taiKhoanId),
      await tokenOf(t.w.patientId),
      await tokenOf(t.w.receptionist.account.taiKhoanId),
      await tokenOf(t.w.doctor.account.taiKhoanId),
    ],
  };
}

describe('HDB-10, QTT-06 phân quyền hai route', () => {
  it('chưa đăng nhập ⇒ 401; Admin ChiNhanh, Bệnh nhân, Lễ tân, Bác sĩ ⇒ 403; không dòng hoàn nào được ghi', async () => {
    const t = await world();
    const body = { maGiaoDich: t.paymentId, soTien: '10000', lyDo: REASON };
    expectErrorResponse(
      await get(`?benhNhanId=${t.w.patientId}`),
      401,
      NOT_LOGGED_IN,
    );
    expectErrorResponse(await post(body), 401, NOT_LOGGED_IN);
    for (const token of t.others) {
      expectErrorResponse(
        await get(`?benhNhanId=${t.w.patientId}`, token),
        403,
        FORBIDDEN,
      );
      expectErrorResponse(await post(body, token), 403, FORBIDDEN);
    }
    expect(await refundRows()).toBe(0);
  });

  it('guard chạy TRƯỚC DTO: vai trò sai gửi thân sai vẫn nhận 403', async () => {
    const t = await world();
    expectErrorResponse(
      await post({ soTien: -1 }, t.others[0]),
      403,
      FORBIDDEN,
    );
  });
});

describe('HDB-02, BDT-08 qua HTTP', () => {
  it('danh sách ⇒ 200 { items } đúng khoá, no-store; hoàn ⇒ 200 ĐÚNG hai khoá { maGiaoDich, soTien }, không số dư', async () => {
    const t = await world();
    const list = await get(`?maLichHen=${t.lich.maLichHen}`, t.system);
    expect(list.status).toBe(200);
    expect(list.headers['cache-control']).toBe('no-store');
    const items = (list.body as { items: Record<string, unknown>[] }).items;
    expect(items).toHaveLength(1);
    expect(Object.keys(items[0]!).toSorted()).toEqual([
      'conCoTheHoan',
      'daHoan',
      'maGiaoDich',
      'maLichHen',
      'soTien',
      'thoiDiem',
    ]);

    const res = await post(
      { maGiaoDich: t.paymentId, soTien: '40000', lyDo: `  ${REASON}  ` },
      t.system,
    );
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ maGiaoDich: t.paymentId, soTien: '40000.00' });
    expect(JSON.stringify(res.body)).not.toMatch(/soDu|so_du/u);
    // Lý do đã cắt khoảng trắng trước khi lưu
    const [row] = await h.db.query<{ lyDo: string }[]>(
      'SELECT ly_do AS lyDo FROM lich_su_hoan_tien',
    );
    expect(row!.lyDo).toBe(REASON);
    expectErrorResponse(
      await post(
        { maGiaoDich: t.paymentId, soTien: '10000', lyDo: REASON },
        t.system,
      ),
      409,
      'DA_HOAN_DAC_BIET',
    );
  });

  it('HDB-11, QTT-13 maGiaoDich không có hay sai dạng ⇒ 404 cùng thân; query gửi cả hai hay không gửi ⇒ 400', async () => {
    const t = await world();
    const missing = await post(
      { maGiaoDich: '999999', soTien: '10000', lyDo: REASON },
      t.system,
    );
    const malformed = await post(
      { maGiaoDich: 'abc', soTien: '10000', lyDo: REASON },
      t.system,
    );
    expectErrorResponse(missing, 404, NOT_FOUND);
    expectErrorResponse(malformed, 404, NOT_FOUND);
    expect(malformed.body).toEqual(missing.body);
    expectErrorResponse(await get('', t.system), 400, INVALID_DATA);
    expectErrorResponse(
      await get(
        `?maLichHen=${t.lich.maLichHen}&benhNhanId=${t.w.patientId}`,
        t.system,
      ),
      400,
      INVALID_DATA,
    );
    expectErrorResponse(
      await get('?benhNhanId=abc', t.system),
      400,
      INVALID_DATA,
    );
  });
});

describe('HDB-03, HDB-04 kiểm dữ liệu vào', () => {
  it.each([
    [undefined],
    [''],
    ['   '],
    ['ngắn quá'],
    ['x'.repeat(256)],
    ['password=abc123 khách báo'],
    [12345678901],
  ])(
    'HDB-03 lyDo = %j ⇒ 400 với loi[].ma LY_DO_BAT_BUOC, không ghi gì',
    async (lyDo) => {
      const t = await world();
      const res = await post(
        { maGiaoDich: t.paymentId, soTien: '10000', lyDo },
        t.system,
      );
      expect(expectErrorResponse(res, 400, INVALID_DATA).loi).toEqual([
        { truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' },
      ]);
      expect(await refundRows()).toBe(0);
    },
  );

  it('HDB-03 biên: lý do đúng 10 và đúng 255 ký tự được nhận', async () => {
    const t = await world();
    const ten = await post(
      { maGiaoDich: t.paymentId, soTien: '10000', lyDo: 'a'.repeat(10) },
      t.system,
    );
    expect(ten.status).toBe(200);
    const u = await specialRefundWorld(h.db);
    const max = await post(
      { maGiaoDich: u.paymentId, soTien: '10000', lyDo: 'b'.repeat(255) },
      t.system,
    );
    expect(max.status).toBe(200);
  });

  it.each([
    ['-10000'],
    ['0'],
    ['10000.5'],
    ['01000'],
    [10000],
    [null],
    ['12345678901'],
  ])(
    'HDB-04 soTien = %j ⇒ 400 với loi[].ma SO_TIEN_KHONG_HOP_LE',
    async (soTien) => {
      const t = await world();
      const res = await post(
        { maGiaoDich: t.paymentId, soTien, lyDo: REASON },
        t.system,
      );
      expect(expectErrorResponse(res, 400, INVALID_DATA).loi).toEqual([
        { truong: 'soTien', ma: 'SO_TIEN_KHONG_HOP_LE' },
      ]);
      expect(await refundRows()).toBe(0);
    },
  );

  it.each(['viNoiBoId', 'benhNhanId', 'nguoiThucHienId', 'loai'])(
    'thân có khoá lạ `%s` ⇒ 400 TRUONG_KHONG_DUOC_PHEP',
    async (key) => {
      const t = await world();
      const res = await post(
        { maGiaoDich: t.paymentId, soTien: '10000', lyDo: REASON, [key]: '1' },
        t.system,
      );
      expect(expectErrorResponse(res, 400, INVALID_DATA).loi).toEqual([
        { truong: key, ma: NOT_ALLOWED },
      ]);
    },
  );
});
