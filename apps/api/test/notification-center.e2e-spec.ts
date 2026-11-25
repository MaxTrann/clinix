import request from 'supertest';
import { vi } from 'vitest';
import { AdminFixtures } from './../src/admin/testing/admin-fixtures.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';

// notification B2 — API Trung tâm thông báo qua HTTP THẬT (AppModule + MySQL + configureApp như main.ts): TTB-01, TTB-02, TTB-03, TTB-04, TTB-06, TTB-15, TTB-16,
// QTB-01, QTB-02, QTB-04, QTB-05, HTB-01, HTB-02, BTB-02, BTB-03. Hành vi DB chi tiết (lọc, chia lô, sở hữu trong UPDATE) ở notification-center.int-spec.ts.
const BASE = '/notifications';
const ITEM_KEYS = [
  'daDoc',
  'id',
  'lienKet',
  'loai',
  'nhom',
  'noiDung',
  'thoiDiemTao',
  'tieuDe',
];

let h: RefreshHarness;
let fx: AdminFixtures;

beforeAll(async () => {
  h = await openRefreshHarness();
  fx = new AdminFixtures(h.db);
});

beforeEach(async () => {
  await resetTables(h.db);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await h.close();
});

const server = () => request(h.app.getHttpServer());
const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
const get = (path: string, token?: string) => {
  const req = server().get(path);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};
const post = (path: string, token?: string) => {
  const req = server().post(path);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};

async function insertNotice(
  taiKhoanId: string,
  daDoc = false,
  loai = 'NapViThanhCong',
): Promise<string> {
  const result = (await h.db.query(
    "INSERT INTO thong_bao (tai_khoan_id, noi_dung, loai_su_kien, trang_thai_doc, thoi_diem_tao) VALUES (?, 'Nội dung', ?, ?, '2026-11-20 08:00:00')",
    [taiKhoanId, loai, daDoc ? 1 : 0],
  )) as { insertId: number };
  return String(result.insertId);
}

describe('Trung tâm thông báo qua HTTP', () => {
  it('TTB-01, HTB-01, BTB-02: danh sách đúng khuôn tám khoá; không email, SĐT, tai_khoan_id; JSON; no-store', async () => {
    const patient = await fx.patient();
    const a = patient.account.taiKhoanId;
    await insertNotice(a);
    await insertNotice(a, true);
    const res = await get(BASE, await tokenOf(a));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.body as object).sort()).toEqual([
      'items',
      'page',
      'pageSize',
      'soChuaDoc',
      'total',
    ]);
    const body = res.body as {
      items: Record<string, unknown>[];
      total: number;
      soChuaDoc: number;
    };
    expect([body.total, body.soChuaDoc]).toEqual([2, 1]);
    for (const item of body.items)
      expect(Object.keys(item).sort()).toEqual(ITEM_KEYS);
    const raw = JSON.stringify(res.body);
    expect(raw).not.toContain(patient.account.email);
    expect(raw).not.toContain(patient.account.soDienThoai);
    expect(raw).not.toMatch(/taiKhoanId|tai_khoan_id|lichHenId/);
  });

  it('TTB-02, HTB-02: trangThaiDoc lạ ⇒ 400 DU_LIEU_KHONG_HOP_LE, loi chỉ ra trường; có no-store', async () => {
    const token = await tokenOf((await fx.patient()).account.taiKhoanId);
    for (const value of ['abc', '', 'CHUA-DOC']) {
      const res = await get(`${BASE}?trangThaiDoc=${value}`, token);
      const body = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
      expect(body.loi, value).toEqual([
        { truong: 'trangThaiDoc', ma: 'IS_IN' },
      ]);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    for (const value of ['tat-ca', 'chua-doc', 'da-doc'])
      expect(
        (await get(`${BASE}?trangThaiDoc=${value}`, token)).status,
        value,
      ).toBe(200);
  });

  it('TTB-03: pageSize 1 và 100 hợp lệ; 0, 101, âm, chữ ⇒ 400; page 0, âm ⇒ 400; trang vượt cuối ⇒ 200 rỗng', async () => {
    const a = (await fx.patient()).account.taiKhoanId;
    await insertNotice(a);
    const token = await tokenOf(a);
    for (const qs of ['pageSize=1', 'pageSize=100', 'page=3'])
      expect((await get(`${BASE}?${qs}`, token)).status, qs).toBe(200);
    for (const [qs, field] of [
      ['pageSize=0', 'pageSize'],
      ['pageSize=101', 'pageSize'],
      ['pageSize=-1', 'pageSize'],
      ['pageSize=abc', 'pageSize'],
      ['page=0', 'page'],
      ['page=-2', 'page'],
    ] as const) {
      const body = expectErrorResponse(
        await get(`${BASE}?${qs}`, token),
        400,
        'DU_LIEU_KHONG_HOP_LE',
      );
      expect(
        body.loi?.every((x) => x.truong === field),
        qs,
      ).toBe(true);
    }
    expect((await get(`${BASE}?page=3`, token)).body).toMatchObject({
      items: [],
      total: 1,
      page: 3,
    });
  });

  it('TTB-04: chưa có thông báo ⇒ 200 rỗng; unread-count 0', async () => {
    const token = await tokenOf((await fx.patient()).account.taiKhoanId);
    expect((await get(BASE, token)).body).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      soChuaDoc: 0,
    });
    const count = await get(`${BASE}/unread-count`, token);
    expect(count.body).toEqual({ soChuaDoc: 0 });
    expect(count.headers['cache-control']).toBe('no-store');
  });

  it('TTB-06, HTB-02: chi tiết và đánh dấu với id của người khác, không có, sai dạng ⇒ 404 KHONG_TIM_THAY cùng một thân; có no-store', async () => {
    const a = (await fx.patient()).account.taiKhoanId;
    const b = (await fx.patient()).account.taiKhoanId;
    const ofA = await insertNotice(a);
    const ofB = await insertNotice(b);
    const token = await tokenOf(a);
    const bodies = new Set<string>();
    for (const id of [
      ofB,
      '999999999',
      'abc',
      '0',
      '-1',
      '1e3',
      '01',
      '1'.repeat(21),
    ]) {
      for (const res of [
        await get(`${BASE}/${id}`, token),
        await post(`${BASE}/${id}/read`, token),
      ]) {
        expectErrorResponse(res, 404, 'KHONG_TIM_THAY');
        expect(res.headers['cache-control']).toBe('no-store');
        bodies.add(JSON.stringify(res.body));
      }
    }
    expect(bodies.size).toBe(1);
    const own = await get(`${BASE}/${ofA}`, token);
    expect(own.status).toBe(200);
    expect(Object.keys(own.body as object).sort()).toEqual(ITEM_KEYS);
    const read = await post(`${BASE}/${ofA}/read`, token);
    expect(read.status).toBe(200);
    expect(read.body).toEqual({ id: ofA, daDoc: true, soChuaDoc: 0 });
  });

  it('QTB-01, TTB-15: không có Authorization ⇒ 401 CHUA_DANG_NHAP ở mọi route, không dữ liệu, vẫn có no-store (đặt trước guard)', async () => {
    for (const res of [
      await get(BASE),
      await get(`${BASE}/unread-count`),
      await get(`${BASE}/1`),
      await post(`${BASE}/1/read`),
      await post(`${BASE}/read-all`),
    ]) {
      expectErrorResponse(res, 401, 'CHUA_DANG_NHAP');
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it('QTB-02: token sửa bậy hay hết hạn ⇒ 401 TOKEN_KHONG_HOP_LE (mã của module auth), không 500', async () => {
    const a = (await fx.patient()).account.taiKhoanId;
    await insertNotice(a);
    expectErrorResponse(
      await get(BASE, 'khong.phai.token'),
      401,
      'TOKEN_KHONG_HOP_LE',
    );
    const token = await tokenOf(a);
    vi.setSystemTime(new Date(T0.getTime() + 16 * 60 * 1000));
    const expired = await get(BASE, token);
    expectErrorResponse(expired, 401, 'TOKEN_KHONG_HOP_LE');
    expect(expired.headers['cache-control']).toBe('no-store');
  });

  it('QTB-04: ?taiKhoanId= ở danh sách ⇒ 400 trường không được phép; taiKhoanId trong thân POST không có tác dụng', async () => {
    const a = (await fx.patient()).account.taiKhoanId;
    const b = (await fx.patient()).account.taiKhoanId;
    const ofB = await insertNotice(b);
    await insertNotice(a);
    const token = await tokenOf(a);
    const body = expectErrorResponse(
      await get(`${BASE}?taiKhoanId=${b}`, token),
      400,
      'DU_LIEU_KHONG_HOP_LE',
    );
    expect(body.loi).toEqual([
      { truong: 'taiKhoanId', ma: 'TRUONG_KHONG_DUOC_PHEP' },
    ]);
    const readAll = await post(`${BASE}/read-all`, token).send({
      taiKhoanId: b,
    });
    expect(readAll.body).toEqual({ daDanhDau: 1, soChuaDoc: 0 });
    expectErrorResponse(
      await post(`${BASE}/${ofB}/read`, token).send({ taiKhoanId: b }),
      404,
      'KHONG_TIM_THAY',
    );
    expect((await get(`${BASE}/unread-count`, await tokenOf(b))).body).toEqual({
      soChuaDoc: 1,
    });
  });

  it('TTB-16, QTB-05: năm vai trò gọi được mọi route, chỉ thấy thông báo của chính mình (kể cả hai Quản trị viên cùng chi nhánh)', async () => {
    const branch = await fx.branch();
    const accounts = [
      (await fx.patient()).account.taiKhoanId,
      (await fx.doctor(branch)).account.taiKhoanId,
      (await fx.receptionist(branch)).account.taiKhoanId,
      (await fx.admin()).account.taiKhoanId,
      (await fx.admin(branch)).account.taiKhoanId,
      (await fx.admin(branch)).account.taiKhoanId,
    ];
    const own = new Map<string, string>();
    for (const id of accounts) own.set(id, await insertNotice(id));
    for (const id of accounts) {
      const token = await tokenOf(id);
      const list = await get(BASE, token);
      expect(list.status, id).toBe(200);
      expect(
        (list.body as { items: { id: string }[] }).items.map((x) => x.id),
      ).toEqual([own.get(id)]);
      expect((await get(`${BASE}/unread-count`, token)).body).toEqual({
        soChuaDoc: 1,
      });
      expect((await get(`${BASE}/${own.get(id) ?? ''}`, token)).status).toBe(
        200,
      );
      expect(
        (await post(`${BASE}/${own.get(id) ?? ''}/read`, token)).status,
      ).toBe(200);
      expect((await post(`${BASE}/read-all`, token)).body).toEqual({
        daDanhDau: 0,
        soChuaDoc: 0,
      });
    }
  });
});
