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
import {
  hideAuditRows,
  untouchedByHide,
} from './../src/doctor/examination/testing/hide-rating-stack.js';
import {
  day,
  moderationWorld,
} from './../src/doctor/examination/testing/moderation-stack.js';
import { keysDeep } from './../src/doctor/examination/testing/patient-exam-stack.js';
import {
  captureProcessLogs,
  ratingRows,
} from './../src/doctor/examination/testing/rating-stack.js';

// doctor-exam B8 — POST /admin/doctor-ratings/:id/hide qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN 5.8, 5.11; 7.5 KDD-04…KDD-08, KDD-11, KDD-12, KDD-13; 7.7 QHK-01, QHK-06, QHK-12; TDK-05, BDK-01, BDK-04; `[đề xuất]` KDD-25).
// Phần dịch vụ, SQL, hoàn tác, thử lại: src/doctor/examination/moderation/rating-hide.int-spec.ts; ca đồng thời: rating-hide.concurrency.int-spec.ts. QHK-12: 200, 400, 404, 409 có `no-store`; 401 và 403 do guard trả TRƯỚC khi `@Header` áp nên KHÔNG khẳng định.
// CA KDD-11 khẳng định ĐÚNG 403 KHONG_DU_QUYEN ở trạng thái mà dịch vụ sẽ trả mã KHÁC nếu thiếu `@Roles` hay `@RequireAdminScope` (id sai dạng ⇒ 404 ở pipe; thân sai ⇒ 400): bài học ĐA-9b. Dữ liệu giả (email đuôi example.com).
const PATH = '/admin/doctor-ratings';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const ALREADY_HIDDEN = 'DANH_GIA_DA_AN';
// Thân 404 chung (patient Q27): giống từng ký tự ở mọi nhánh "không thấy", kể cả id sai dạng bị pipe từ chối
const NOT_FOUND_TEXT =
  '{"maLoi":"KHONG_TIM_THAY","thongBao":"Không tìm thấy dữ liệu."}';
const MALFORMED = [
  '-1',
  '0',
  'abc',
  '1.5',
  '01',
  '9223372036854775808',
  '99999999999999999999',
];
const REASON = 'Nội dung quảng cáo, không liên quan đến buổi khám';
const NHAN_XET_RIENG = 'NHAN-XET-RIENG-9137 Bác sĩ nói chuyện thiếu tôn trọng';
const LY_DO_RIENG = 'LY-DO-RIENG-5521 quảng cáo liên kết bên ngoài';

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

const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
// `path` viết thẳng để thử id sai dạng, đường dẫn lạ; `body` không truyền ⇒ không gửi thân
const send = (
  method: Method,
  path: string,
  accessToken?: string,
  body?: unknown,
) => {
  const req = request(h.app.getHttpServer())[method](`${PATH}${path}`);
  const authed = accessToken
    ? req.set('Authorization', `Bearer ${accessToken}`)
    : req;
  return body === undefined ? authed : authed.send(body as object);
};
const hide = (id: string, body?: unknown, accessToken?: string) =>
  send('post', `/${id}/hide`, accessToken, body);
const get = (path: string, accessToken?: string) =>
  send('get', path, accessToken);

/** Thế giới kiểm duyệt: hai đánh giá của chi nhánh A (a1 kèm nhận xét riêng), một của chi nhánh B, kèm token của mọi vai trò. */
async function world() {
  const w = await statusWorld(h.db, fx);
  const m = await moderationWorld(h.db, fx, w);
  return {
    m,
    a1: await m.seed({ nhanXet: NHAN_XET_RIENG, at: day(1) }),
    a2: await m.seed({ at: day(2) }),
    b1: await m.seed({ doctor: m.doctors.b, at: day(3) }),
    system: await tokenOf(w.systemAdmin.account.taiKhoanId),
    adminA: await tokenOf(w.branchAdmin.account.taiKhoanId),
    adminB: await tokenOf(m.admins.b.account.taiKhoanId),
    patient: await tokenOf(w.patientId),
    doctor: await tokenOf(w.doctor.account.taiKhoanId),
    reception: await tokenOf(w.receptionId),
  };
}

/** Trạng thái DB mà một lời gọi bị từ chối KHÔNG được đổi: ba đánh giá, nhật ký và bốn bảng khác. */
const snapshot = async () => ({
  ratings: await ratingRows(h.db),
  audit: await hideAuditRows(h.db),
  others: await untouchedByHide(h.db),
});

describe('KDD-04, TDK-05, QHK-12 ẩn thành công', () => {
  it('Toàn hệ thống: 200 đúng hai khoá { danhGiaId, biAn: true }; no-store; bi_an = 1 và ly_do_an = lý do; MỘT nhật ký đủ trường; chi tiết của B7 thấy biAn và lyDoAn', async () => {
    const t = await world();
    const res = await hide(t.a1.danhGiaId, { lyDo: REASON }, t.system).expect(
      200,
    );
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ danhGiaId: t.a1.danhGiaId, biAn: true });
    expect(typeof (res.body as { danhGiaId: unknown }).danhGiaId).toBe(
      'string',
    );
    const rows = await ratingRows(h.db);
    expect(rows.find((r) => r.danhGiaId === t.a1.danhGiaId)).toMatchObject({
      biAn: 1,
      lyDoAn: REASON,
    });
    expect(rows.filter((r) => r.biAn === 1)).toHaveLength(1);
    const audit = await hideAuditRows(h.db);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      chiNhanhId: t.m.branches.a.chiNhanhId,
      loaiDoiTuong: 'danh_gia_bac_si',
      maDoiTuong: t.a1.danhGiaId,
      ketQua: 'ThanhCong',
      chiTiet: {
        truoc: { bi_an: false },
        sau: { bi_an: true },
        ly_do: REASON,
        bac_si_id: t.m.doctors.a.account.taiKhoanId,
      },
    });
    const detail = await get(`/${t.a1.danhGiaId}`, t.system).expect(200);
    expect(detail.body).toMatchObject({ biAn: true, lyDoAn: REASON });
  });

  it('Admin Chi nhánh đúng chi nhánh của lịch ẩn được; Toàn hệ thống ẩn được đánh giá chi nhánh B (nhật ký ghi chi nhánh B)', async () => {
    const t = await world();
    await hide(t.a2.danhGiaId, { lyDo: REASON }, t.adminA).expect(200);
    await hide(t.b1.danhGiaId, { lyDo: REASON }, t.system).expect(200);
    const audit = await hideAuditRows(h.db);
    expect(audit.map((row) => row.chiNhanhId)).toEqual([
      t.m.branches.a.chiNhanhId,
      t.m.branches.b.chiNhanhId,
    ]);
  });

  it('KDD-06 biên 10 và 255 đơn vị ⇒ 200; lý do được trim (khoảng trắng đầu cuối không tính)', async () => {
    const t = await world();
    await hide(t.a1.danhGiaId, { lyDo: 'x'.repeat(10) }, t.system).expect(200);
    await hide(
      t.a2.danhGiaId,
      { lyDo: `  ${'x'.repeat(255)}  ` },
      t.system,
    ).expect(200);
    const rows = await ratingRows(h.db);
    expect(rows.find((r) => r.danhGiaId === t.a1.danhGiaId)?.lyDoAn).toBe(
      'x'.repeat(10),
    );
    expect(rows.find((r) => r.danhGiaId === t.a2.danhGiaId)?.lyDoAn).toBe(
      'x'.repeat(255),
    );
  });

  it('Q19 Bệnh nhân vẫn thấy đánh giá của mình như chưa ẩn: không khoá biAn, lyDoAn ở bất kỳ đâu của chi tiết lịch', async () => {
    const t = await world();
    const before = await request(h.app.getHttpServer())
      .get(`/patient/exam-records/${t.a1.maLichHen}`)
      .set('Authorization', `Bearer ${t.patient}`)
      .expect(200);
    await hide(t.a1.danhGiaId, { lyDo: REASON }, t.system).expect(200);
    const after = await request(h.app.getHttpServer())
      .get(`/patient/exam-records/${t.a1.maLichHen}`)
      .set('Authorization', `Bearer ${t.patient}`)
      .expect(200);
    expect((after.body as { danhGia: unknown }).danhGia).toEqual(
      (before.body as { danhGia: unknown }).danhGia,
    );
    expect(keysDeep(after.body)).not.toContain('biAn');
    expect(keysDeep(after.body)).not.toContain('lyDoAn');
  });
});

describe('KDD-05, KDD-06, KDD-25, QHK-12, BDK-04 thân sai ⇒ 400, không ghi gì', () => {
  const bad: [string, unknown, string, string][] = [
    ['không gửi thân', undefined, 'lyDo', 'LY_DO_BAT_BUOC'],
    ['thân rỗng', {}, 'lyDo', 'LY_DO_BAT_BUOC'],
    ['null', { lyDo: null }, 'lyDo', 'LY_DO_BAT_BUOC'],
    ['rỗng', { lyDo: '' }, 'lyDo', 'LY_DO_BAT_BUOC'],
    ['chỉ khoảng trắng', { lyDo: '     ' }, 'lyDo', 'LY_DO_BAT_BUOC'],
    ['9 đơn vị', { lyDo: 'x'.repeat(9) }, 'lyDo', 'LY_DO_QUA_NGAN'],
    ['256 đơn vị', { lyDo: 'x'.repeat(256) }, 'lyDo', 'LY_DO_QUA_DAI'],
    ['số', { lyDo: 12345 }, 'lyDo', 'IS_STRING'],
    ['mảng', { lyDo: [REASON] }, 'lyDo', 'IS_STRING'],
    [
      'dạng bí mật',
      { lyDo: 'Bearer abc123xyz' },
      'lyDo',
      'NOI_DUNG_KHONG_HOP_LE',
    ],
    ['khoá lạ biAn', { lyDo: REASON, biAn: false }, 'biAn', NOT_ALLOWED],
    ['khoá lạ bacSiId', { lyDo: REASON, bacSiId: '1' }, 'bacSiId', NOT_ALLOWED],
    [
      'khoá lạ danhGiaId',
      { lyDo: REASON, danhGiaId: '1' },
      'danhGiaId',
      NOT_ALLOWED,
    ],
    ['khoá lạ nhanXet', { lyDo: REASON, nhanXet: 'x' }, 'nhanXet', NOT_ALLOWED],
  ];

  it.each(bad)(
    '%s ⇒ 400 DU_LIEU_KHONG_HOP_LE, đúng mã trường; no-store; DB không đổi một byte; lỗi không lặp lại giá trị',
    async (_name, body, truong, ma) => {
      const t = await world();
      const before = await snapshot();
      const res = await hide(t.a1.danhGiaId, body, t.system);
      const error = expectErrorResponse(res, 400, INVALID_DATA);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(error.loi).toContainEqual({ truong, ma });
      expect(JSON.stringify(res.body)).not.toContain('abc123xyz');
      expect(JSON.stringify(res.body)).not.toContain(REASON);
      expect(await snapshot()).toEqual(before);
    },
  );
});

describe('KDD-07, QHK-12 ẩn lần hai ⇒ 409 DANH_GIA_DA_AN', () => {
  it('gửi lại y hệt (hai lần liên tiếp): 200 rồi 409 kèm no-store; ly_do_an của lần đầu giữ nguyên; MỘT nhật ký; thân 409 không lộ lý do', async () => {
    const t = await world();
    await hide(
      t.a1.danhGiaId,
      { lyDo: 'Lý do của lần ẩn thứ nhất' },
      t.system,
    ).expect(200);
    const second = await hide(t.a1.danhGiaId, { lyDo: LY_DO_RIENG }, t.adminA);
    expectErrorResponse(second, 409, ALREADY_HIDDEN);
    expect(second.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(second.body)).not.toContain(
      'Lý do của lần ẩn thứ nhất',
    );
    expect(JSON.stringify(second.body)).not.toContain('LY-DO-RIENG');
    const rows = await ratingRows(h.db);
    expect(rows.find((r) => r.danhGiaId === t.a1.danhGiaId)?.lyDoAn).toBe(
      'Lý do của lần ẩn thứ nhất',
    );
    expect(await hideAuditRows(h.db)).toHaveLength(1);
  });

  it('đánh giá ĐÃ ẩn từ đầu (dựng với bi_an = 1) ⇒ 409; không nhật ký', async () => {
    const t = await world();
    const hidden = await t.m.seed({
      hiddenReason: 'Lý do dựng sẵn từ trước',
      at: day(4),
    });
    expectErrorResponse(
      await hide(hidden.danhGiaId, { lyDo: REASON }, t.system),
      409,
      ALREADY_HIDDEN,
    );
    expect(await hideAuditRows(h.db)).toEqual([]);
  });
});

describe('KDD-08, KDD-12, QHK-06, QHK-12 không thấy ⇒ 404 CÙNG MỘT thân; không ghi', () => {
  it('Admin Chi nhánh B ẩn đánh giá chi nhánh A ⇒ 404 y hệt "không có"; no-store; DB không đổi; Toàn hệ thống vẫn ẩn được', async () => {
    const t = await world();
    const before = await snapshot();
    const outOfScope = await hide(t.a1.danhGiaId, { lyDo: REASON }, t.adminB);
    const missing = await hide('999999999', { lyDo: REASON }, t.system);
    expect(outOfScope.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(outOfScope.text).toBe(NOT_FOUND_TEXT);
    expect(missing.text).toBe(NOT_FOUND_TEXT);
    expect(outOfScope.headers['cache-control']).toBe('no-store');
    expect(await snapshot()).toEqual(before);
    await hide(t.a1.danhGiaId, { lyDo: REASON }, t.system).expect(200);
  });

  it.each(MALFORMED)(
    'id %j sai dạng (thân hợp lệ) ⇒ 404 KHONG_TIM_THAY cùng thân; no-store; không ghi',
    async (id) => {
      const t = await world();
      const before = await snapshot();
      const res = await hide(id, { lyDo: REASON }, t.system);
      expect(res.status).toBe(404);
      expect(res.text).toBe(NOT_FOUND_TEXT);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(await snapshot()).toEqual(before);
    },
  );

  it('id sai dạng cộng thân sai: ghi nhận kết quả đo thật (400 hay 404, tuỳ pipe nào báo lỗi trước); cả hai KHÔNG lộ gì về đánh giá có thật hay không và KHÔNG ghi', async () => {
    const t = await world();
    const before = await snapshot();
    const res = await hide('abc', { lyDo: 5 }, t.system);
    console.info(
      `[B8-E2E] id sai dạng + thân sai ⇒ ${String(res.status)} ${res.text.slice(0, 80)}`,
    );
    expect([400, 404]).toContain(res.status);
    expect(await snapshot()).toEqual(before);
  });
});

describe('KDD-11, QHK-01 quyền: guard chạy TRƯỚC pipe và DTO', () => {
  it('khách ⇒ 401; Bệnh nhân, Bác sĩ, Lễ tân ⇒ ĐÚNG 403 KHONG_DU_QUYEN với id đúng, id sai dạng, thân sai và khoá lạ; DB không đổi', async () => {
    const t = await world();
    const before = await snapshot();
    const attempts: [string, unknown][] = [
      [t.a1.danhGiaId, { lyDo: REASON }],
      ['abc', { lyDo: REASON }],
      ['-1', { lyDo: REASON }],
      [t.a1.danhGiaId, {}],
      [t.a1.danhGiaId, { lyDo: 5 }],
      [t.a1.danhGiaId, { lyDo: REASON, biAn: false }],
    ];
    for (const [id, body] of attempts)
      expectErrorResponse(await hide(id, body), 401, NOT_LOGGED_IN);
    for (const token of [t.patient, t.doctor, t.reception])
      for (const [id, body] of attempts)
        expectErrorResponse(await hide(id, body, token), 403, FORBIDDEN);
    expect(await snapshot()).toEqual(before);
  });

  it('cả hai loại Quản trị viên gọi được route (Chi nhánh đúng phạm vi)', async () => {
    const t = await world();
    await hide(t.a1.danhGiaId, { lyDo: REASON }, t.system).expect(200);
    await hide(t.a2.danhGiaId, { lyDo: REASON }, t.adminA).expect(200);
  });
});

describe('KDD-13 KHÔNG có route hiện lại (Q8: ẩn là MỘT chiều)', () => {
  it('mọi đường hiện lại, sửa hay xoá ⇒ 404 (kể cả với Toàn hệ thống); đánh giá đã ẩn vẫn ẩn; không dòng nào đổi', async () => {
    const t = await world();
    await hide(t.a1.danhGiaId, { lyDo: REASON }, t.system).expect(200);
    const before = await snapshot();
    const id = t.a1.danhGiaId;
    const attempts: [Method, string][] = [
      ['post', `/${id}/show`],
      ['post', `/${id}/unhide`],
      ['post', `/${id}/restore`],
      ['post', `/${id}/reveal`],
      ['post', `/${id}`],
      ['put', `/${id}/hide`],
      ['patch', `/${id}/hide`],
      ['delete', `/${id}/hide`],
      ['get', `/${id}/hide`],
      ['put', `/${id}`],
      ['patch', `/${id}`],
      ['delete', `/${id}`],
    ];
    for (const [method, path] of attempts)
      expect(
        (
          await send(
            method,
            path,
            t.system,
            method === 'get' ? undefined : { biAn: false, lyDo: REASON },
          )
        ).status,
        `${method.toUpperCase()} ${path}`,
      ).toBe(404);
    expect(await snapshot()).toEqual(before);
    expect((await ratingRows(h.db)).find((r) => r.danhGiaId === id)?.biAn).toBe(
      1,
    );
  });
});

describe('TDK-05, BDK-01 không lộ dữ liệu cá nhân ở nhật ký và log', () => {
  it('nhật ký không có nhận xét, tên người đặt, tên bác sĩ, SĐT, email; chuỗi mẫu duy nhất của lý do KHÔNG vào log ở 200, 400, 404 và 409', async () => {
    const t = await world();
    const logs = captureProcessLogs();
    await hide(t.a1.danhGiaId, { lyDo: LY_DO_RIENG }, t.system).expect(200);
    await hide(t.a1.danhGiaId, { lyDo: LY_DO_RIENG }, t.system).expect(409);
    await hide('999999999', { lyDo: LY_DO_RIENG }, t.system).expect(404);
    await hide(t.a2.danhGiaId, { lyDo: 5 }, t.system).expect(400);
    await hide(t.a2.danhGiaId, { lyDo: LY_DO_RIENG }, t.adminB).expect(404);
    const text = logs.join('\n');
    for (const secret of [
      'LY-DO-RIENG-5521',
      NHAN_XET_RIENG,
      t.m.names.buyerOne,
      t.m.names.doctorA,
    ])
      expect(text, secret).not.toContain(secret);
    const audit = JSON.stringify(await hideAuditRows(h.db));
    for (const secret of [
      'NHAN-XET-RIENG',
      t.m.names.buyerOne,
      t.m.names.doctorA,
      '@example.com',
    ])
      expect(audit, secret).not.toContain(secret);
  });
});
