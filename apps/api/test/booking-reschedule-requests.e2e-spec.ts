import request from 'supertest';
import { vi } from 'vitest';
import type {
  RescheduleRequestDetail,
  RescheduleRequestItem,
} from './../src/appointments/reschedule/reschedule-request-list.types.js';
import type { RescheduleRequestPage } from './../src/appointments/reschedule/reschedule-request-list.dto.js';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import {
  CODES,
  PATIENT_ONE,
} from './../src/appointments/testing/operations-list-fixtures.js';
import { DOCTOR_PHONE } from './../src/appointments/testing/appointment-list-fixtures.js';
import {
  requestListWorld,
  SENTINELS,
} from './../src/appointments/testing/reschedule-request-list-world.js';
import { DEFAULT_REASON } from './../src/appointments/testing/reschedule-request-world.js';
import {
  collectKeys,
  collectStrings,
} from './../src/appointments/testing/response-keys.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';

// reschedule B8 — bốn route CHỈ ĐỌC `GET /reception/reschedule-requests`, `/:yeuCauId`, `GET /admin/reschedule-requests`, `/:yeuCauId` qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts
// (PLAN reschedule 5.7, 5.8, 7.4, 7.6, 7.10). Phần tầng dịch vụ và SQL: src/appointments/reschedule/reschedule-request-list.int-spec.ts, reschedule-request-detail.int-spec.ts.
// Mã: XDL-03, XDL-04, XDL-05, XDL-13, XDL-15, QDL-02 (PLAN 7.4, 7.6) và XDL-31, QDL-11, BDL-10 (`[đề xuất]`, TRACKING reschedule 1.12). Dữ liệu giả (email đuôi example.com, SĐT minh hoạ).
// LƯU Ý: Lễ tân BỊ KHOÁ ở mức HTTP nhận 401 PHIEN_HET_HIEU_LUC (`JwtAuthGuard` thu hồi phiên, chạy TRƯỚC `@Roles` và phạm vi); lớp phạm vi 403 KHONG_DU_QUYEN của `ReceptionScopeService` (kể cả khi `:yeuCauId`
// sai dạng) được kiểm ở reschedule-request-detail.int-spec.ts và reschedule-request-list.service.spec.ts. Đồng hồ ứng dụng giả = T0 (02/11/2026 08:00 giờ VN); mọi token tạo SAU khi đặt giờ.
const RECEPTION = '/reception/reschedule-requests';
const ADMIN = '/admin/reschedule-requests';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const INVALID_TOKEN = 'TOKEN_KHONG_HOP_LE';
const SESSION_INACTIVE = 'PHIEN_HET_HIEU_LUC';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const NOT_FOUND = 'KHONG_TIM_THAY';
// Thân 404 chung (patient Q27): giống từng ký tự ở mọi nhánh, kể cả id sai dạng
const NOT_FOUND_TEXT =
  '{"maLoi":"KHONG_TIM_THAY","thongBao":"Không tìm thấy dữ liệu."}';

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

// `path` là đường dẫn đầy đủ gồm query nếu có, viết thẳng (đã mã hoá phần trăm nếu cần)
const get = (path: string, accessToken?: string) => {
  const req = request(h.app.getHttpServer()).get(path);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
const pageOf = (res: { body: unknown }) => res.body as RescheduleRequestPage;
const detailOf = (res: { body: unknown }) =>
  res.body as RescheduleRequestDetail;
const idsOf = (res: { body: unknown }) =>
  pageOf(res).items.map((item) => item.yeuCauId);

const ROOT_KEYS = ['items', 'page', 'pageSize', 'total'];
const ITEM_KEYS = [
  'bacSi',
  'chiNhanh',
  'maLichHen',
  'nguoiKham',
  'soLanDaTuDoi',
  'thoiDiemTao',
  'thoiGianCu',
  'thoiGianMongMuon',
  'trangThai',
  'yeuCauId',
];
const DETAIL_KEYS = [
  ...ITEM_KEYS,
  'coTheDuyet',
  'ghiChuXuLy',
  'khungGioMongMuon',
  'lyDoKhongDuyet',
  'lyDoYeuCau',
  'nguoiXuLy',
  'soLanToiDa',
  'thoiDiemXuLy',
  'trangThaiLichGoc',
].sort();

// Hai chi nhánh (`requestListWorld`) kèm token của mọi vai trò
async function world() {
  const w = await requestListWorld(h.db, fx);
  return {
    ...w,
    reception: await tokenOf(w.receptionA.account.taiKhoanId),
    receptionBToken: await tokenOf(w.receptionB.account.taiKhoanId),
    all: await tokenOf(w.adminAll.account.taiKhoanId),
    adminAToken: await tokenOf(w.adminA.account.taiKhoanId),
    adminBToken: await tokenOf(w.adminB.account.taiKhoanId),
    patient: await tokenOf(w.oneId),
    doctor: await tokenOf(w.doctorA1.account.taiKhoanId),
  };
}

describe('QDL-11, XDL-13 ma trận route × vai trò', () => {
  it.each([
    ['danh sách Lễ tân', RECEPTION, '', 'LeTan'],
    ['chi tiết Lễ tân', RECEPTION, '/', 'LeTan'],
    ['danh sách Quản trị viên', ADMIN, '', 'QuanTriVien'],
    ['chi tiết Quản trị viên', ADMIN, '/', 'QuanTriVien'],
  ] as const)(
    '%s: đúng vai ⇒ 200; vai khác ⇒ 403 KHONG_DU_QUYEN KỂ CẢ khi query sai hay id sai dạng (guard TRƯỚC pipe); khách ⇒ 401; token hỏng ⇒ 401',
    async (_name, base, detailSuffix, role) => {
      const w = await world();
      const wantedId = base === RECEPTION ? w.ids.p1 : w.ids.bPending;
      const path = (id: string, query = '') =>
        `${base}${detailSuffix === '' ? query : `/${id}`}`;
      const okTokens =
        role === 'LeTan'
          ? [w.reception]
          : [w.all, w.adminAToken, w.adminBToken];
      const deniedTokens =
        role === 'LeTan'
          ? [w.patient, w.doctor, w.all, w.adminAToken, w.adminBToken]
          : [w.patient, w.doctor, w.reception, w.receptionBToken];
      // Đúng vai (chi tiết: yêu cầu thuộc phạm vi của token đó)
      for (const token of okTokens) {
        if (detailSuffix === '') {
          expect((await get(path('', ''), token)).status).toBe(200);
        } else if (
          role === 'LeTan' ||
          token === w.all ||
          token === w.adminBToken
        ) {
          const id = role === 'LeTan' ? wantedId : w.ids.bPending;
          expect((await get(path(id), token)).status).toBe(200);
        } else {
          // Quản trị viên Chi nhánh A với yêu cầu chi nhánh A
          expect((await get(path(w.ids.p1), token)).status).toBe(200);
        }
      }
      for (const token of deniedTokens) {
        expectErrorResponse(await get(path(wantedId), token), 403, FORBIDDEN);
        // query sai và id sai dạng vẫn 403 (không 400 hay 404): người sai vai không biết dạng nào đúng
        expectErrorResponse(
          await get(
            detailSuffix === '' ? `${base}?trangThai=XXX&q=sai` : `${base}/abc`,
            token,
          ),
          403,
          FORBIDDEN,
        );
      }
      expectErrorResponse(await get(path(wantedId)), 401, NOT_LOGGED_IN);
      expectErrorResponse(
        await get(path(wantedId), 'khong-phai-token'),
        401,
        INVALID_TOKEN,
      );
    },
  );

  it('Lễ tân bị khoá giữa hai request: request sau 401 PHIEN_HET_HIEU_LUC ở cả danh sách và chi tiết (kể cả id sai dạng), không có dữ liệu', async () => {
    const w = await world();
    expect((await get(RECEPTION, w.reception)).status).toBe(200);
    await h.db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [w.receptionA.account.taiKhoanId],
    );
    for (const path of [
      RECEPTION,
      `${RECEPTION}/${w.ids.p1}`,
      `${RECEPTION}/abc`,
    ]) {
      const res = await get(path, w.reception);
      expectErrorResponse(res, 401, SESSION_INACTIVE);
      expect(JSON.stringify(res.body)).not.toContain('items');
    }
  });
});

describe('XDL-03 danh sách của Lễ tân qua HTTP', () => {
  it('chỉ chi nhánh của mình, chờ duyệt CŨ NHẤT TRƯỚC; Lễ tân B chỉ thấy yêu cầu của B; tab đã xử lý GIẢM dần', async () => {
    const w = await world();
    const a = await get(RECEPTION, w.reception);
    expect(a.status).toBe(200);
    expect(idsOf(a)).toStrictEqual([
      w.ids.pOld,
      w.ids.p1,
      w.ids.p2,
      w.ids.p3,
      w.ids.p4,
    ]);
    expect(pageOf(a)).toMatchObject({ total: 5, page: 1, pageSize: 20 });
    expect(idsOf(await get(RECEPTION, w.receptionBToken))).toStrictEqual([
      w.ids.bPending,
    ]);
    const handled = await get(
      `${RECEPTION}?trangThai=DaDuyet,TuChoi`,
      w.reception,
    );
    expect(idsOf(handled)).toStrictEqual([
      w.ids.hTuChoi,
      w.ids.hDaDuyet,
      w.ids.hTuChoi2,
      w.ids.hDaDuyet2,
    ]);
    // Lặp khoá cho kết quả y hệt dấu phẩy
    expect(
      (
        await get(
          `${RECEPTION}?trangThai=DaDuyet&trangThai=TuChoi`,
          w.reception,
        )
      ).body,
    ).toStrictEqual(handled.body);
  });

  it('phân trang, bác sĩ và q (mã chữ thường được chuẩn hoá chữ hoa) qua query', async () => {
    const w = await world();
    const page2 = await get(`${RECEPTION}?page=2&pageSize=2`, w.reception);
    expect(idsOf(page2)).toStrictEqual([w.ids.p2, w.ids.p3]);
    expect(pageOf(page2)).toMatchObject({ total: 5, page: 2, pageSize: 2 });
    expect(
      (
        await get(
          `${RECEPTION}?bacSiId=${w.doctorA2.profile.taiKhoanId}`,
          w.reception,
        )
      ).body,
    ).toMatchObject({ total: 2 });
    const byCode = await get(
      `${RECEPTION}?q=${CODES.a1.toLowerCase()}`,
      w.reception,
    );
    expect(idsOf(byCode)).toStrictEqual([w.ids.p1, w.ids.p3]);
    expect(
      await get(`${RECEPTION}?q=${CODES.b1}`, w.reception).then(pageOf),
    ).toMatchObject({ items: [], total: 0 });
    // trang vượt cuối: 200 với items rỗng, không 404
    const beyond = await get(`${RECEPTION}?page=99`, w.reception);
    expect(beyond.status).toBe(200);
    expect(pageOf(beyond)).toMatchObject({ items: [], total: 5 });
  });

  it('Lễ tân gửi chiNhanhId (dù đúng dạng) ⇒ 400 TRUONG_KHONG_DUOC_PHEP: chi nhánh không có đường nào từ client', async () => {
    const w = await world();
    for (const chiNhanhId of [
      w.branchB.chiNhanhId,
      w.branchA.chiNhanhId,
      'abc',
    ]) {
      const body = expectErrorResponse(
        await get(`${RECEPTION}?chiNhanhId=${chiNhanhId}`, w.reception),
        400,
        INVALID_DATA,
      );
      expect(body.loi).toStrictEqual([
        { truong: 'chiNhanhId', ma: NOT_ALLOWED },
      ]);
    }
  });
});

describe('XDL-04 danh sách của Quản trị viên qua HTTP', () => {
  it('Toàn hệ thống: mọi chi nhánh và lọc chiNhanhId; chi nhánh không tồn tại ⇒ rỗng', async () => {
    const w = await world();
    const all = await get(ADMIN, w.all);
    expect(idsOf(all)).toStrictEqual([
      w.ids.bPending,
      w.ids.pOld,
      w.ids.p1,
      w.ids.p2,
      w.ids.p3,
      w.ids.p4,
    ]);
    expect(
      idsOf(await get(`${ADMIN}?chiNhanhId=${w.branchB.chiNhanhId}`, w.all)),
    ).toStrictEqual([w.ids.bPending]);
    expect(
      pageOf(await get(`${ADMIN}?chiNhanhId=999999999`, w.all)),
    ).toMatchObject({
      items: [],
      total: 0,
    });
  });

  it('Chi nhánh: chỉ chi nhánh được gán; chiNhanhId đúng dạng (chi nhánh khác, không tồn tại) BỊ BỎ QUA (nếp DSV-02, ADL-01)', async () => {
    const w = await world();
    const own = await get(ADMIN, w.adminAToken);
    expect(idsOf(own)).toStrictEqual([
      w.ids.pOld,
      w.ids.p1,
      w.ids.p2,
      w.ids.p3,
      w.ids.p4,
    ]);
    for (const chiNhanhId of [w.branchB.chiNhanhId, '999999999'])
      expect(
        (await get(`${ADMIN}?chiNhanhId=${chiNhanhId}`, w.adminAToken)).body,
      ).toStrictEqual(own.body);
    expect(
      idsOf(
        await get(`${ADMIN}?chiNhanhId=${w.branchA.chiNhanhId}`, w.adminBToken),
      ),
    ).toStrictEqual([w.ids.bPending]);
  });
});

describe('XDL-31 query sai ⇒ 400 DU_LIEU_KHONG_HOP_LE kèm loi[]', () => {
  it.each([
    ['trangThai ngoài tập', 'trangThai=DaHuy', 'trangThai'],
    ['trangThai rỗng', 'trangThai=', 'trangThai'],
    ['bacSiId sai dạng', 'bacSiId=abc', 'bacSiId'],
    ['q sai dạng', 'q=CLX-sai', 'q'],
    ['q rỗng', 'q=', 'q'],
    ['page 0', 'page=0', 'page'],
    ['pageSize 101', 'pageSize=101', 'pageSize'],
    ['pageSize chữ', 'pageSize=abc', 'pageSize'],
  ])('%s', async (_name, query, field) => {
    const w = await world();
    for (const [base, token] of [
      [RECEPTION, w.reception],
      [ADMIN, w.all],
    ] as const) {
      const res = await get(`${base}?${query}`, token);
      const body = expectErrorResponse(res, 400, INVALID_DATA);
      expect(body.loi?.map((error) => error.truong)).toContain(field);
      expect(res.headers['cache-control']).toBe('no-store');
    }
  });

  it('khoá lạ (benhNhanId, lichHenId, tuNgay…) ⇒ 400 TRUONG_KHONG_DUOC_PHEP, không âm thầm bỏ qua', async () => {
    const w = await world();
    for (const key of ['benhNhanId', 'lichHenId', 'tuNgay', 'sort'])
      expect(
        expectErrorResponse(
          await get(`${ADMIN}?${key}=1`, w.all),
          400,
          INVALID_DATA,
        ).loi,
      ).toStrictEqual([{ truong: key, ma: NOT_ALLOWED }]);
  });

  it('chiNhanhId của Quản trị viên sai dạng ⇒ 400; thân lỗi KHÔNG lặp lại giá trị đã gửi (BDL-10)', async () => {
    const w = await world();
    const typed = 'CLX-20261110-GIA-TRI-NHAY-CAM';
    const res = await get(`${ADMIN}?chiNhanhId=abc&q=${typed}`, w.all);
    const body = expectErrorResponse(res, 400, INVALID_DATA);
    expect(body.loi?.map((error) => error.truong).sort()).toStrictEqual([
      'chiNhanhId',
      'q',
    ]);
    expect(JSON.stringify(res.body)).not.toContain('NHAY-CAM');
  });
});

describe('XDL-05, QDL-02 chi tiết qua HTTP và 404 CÙNG thân', () => {
  it('Lễ tân đúng chi nhánh xem được chi tiết đủ 19 khoá; Quản trị viên (cả hai phạm vi đúng) thấy y hệt', async () => {
    const w = await world();
    const res = await get(`${RECEPTION}/${w.ids.p1}`, w.reception);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body as object).sort()).toStrictEqual(DETAIL_KEYS);
    expect(detailOf(res)).toMatchObject({
      yeuCauId: w.ids.p1,
      maLichHen: CODES.a1,
      trangThai: 'ChoDuyet',
      nguoiKham: { hoTen: PATIENT_ONE.hoTen, laNguoiThan: false },
      lyDoYeuCau: DEFAULT_REASON,
      coTheDuyet: true,
      lyDoKhongDuyet: null,
      soLanToiDa: 2,
      trangThaiLichGoc: 'DaXacNhan',
      thoiGianCu: '2026-11-10T01:00:00.000Z',
      khungGioMongMuon: { khungGioId: w.slotsA1[1], trangThai: 'ConTrong' },
    });
    expect((await get(`${ADMIN}/${w.ids.p1}`, w.all)).body).toStrictEqual(
      res.body,
    );
    expect(
      (await get(`${ADMIN}/${w.ids.p1}`, w.adminAToken)).body,
    ).toStrictEqual(res.body);
  });

  it('QDL-02 yêu cầu ngoài chi nhánh, không tồn tại, id sai dạng: thân 404 GIỐNG TỪNG KÝ TỰ ở cả bốn người gọi (Lễ tân B, Quản trị viên B và Toàn hệ thống)', async () => {
    const w = await world();
    const badIds = [
      w.ids.p1, // có thật nhưng ở chi nhánh A
      '99999999',
      'abc',
      '0',
      '-1',
      '01',
      '1.5',
      '9223372036854775808',
      '1%20OR%201=1',
      '1;DROP',
    ];
    for (const id of badIds) {
      for (const [base, token] of [
        [RECEPTION, w.receptionBToken],
        [ADMIN, w.adminBToken],
      ] as const) {
        const res = await get(`${base}/${id}`, token);
        expectErrorResponse(res, 404, NOT_FOUND);
        expect(res.text, `${base}/${id}`).toBe(NOT_FOUND_TEXT);
        expect(res.headers['cache-control']).toBe('no-store');
      }
    }
    for (const id of badIds.slice(1))
      expect((await get(`${ADMIN}/${id}`, w.all)).text).toBe(NOT_FOUND_TEXT);
  });

  it('XDL-13 Quản trị viên Toàn hệ thống thấy yêu cầu của MỌI chi nhánh; Chi nhánh A 404 yêu cầu của B và ngược lại', async () => {
    const w = await world();
    expect((await get(`${ADMIN}/${w.ids.bPending}`, w.all)).status).toBe(200);
    expect((await get(`${ADMIN}/${w.ids.p1}`, w.all)).status).toBe(200);
    expectErrorResponse(
      await get(`${ADMIN}/${w.ids.bPending}`, w.adminAToken),
      404,
      NOT_FOUND,
    );
    expectErrorResponse(
      await get(`${ADMIN}/${w.ids.p1}`, w.adminBToken),
      404,
      NOT_FOUND,
    );
    expectErrorResponse(
      await get(`${RECEPTION}/${w.ids.bPending}`, w.reception),
      404,
      NOT_FOUND,
    );
  });

  it('XDL-37 coTheDuyet đổi theo trạng thái thật: lịch gốc đã huỷ ⇒ false kèm lý do và trangThaiLichGoc; yêu cầu đã xử lý ⇒ YEU_CAU_DA_XU_LY với ghi chú và người xử lý', async () => {
    const w = await world();
    await h.db.query(
      "UPDATE lich_hen SET trang_thai = 'DaHuy' WHERE lich_hen_id = ?",
      [w.apps.a1.lichHenId],
    );
    expect(
      detailOf(await get(`${RECEPTION}/${w.ids.p1}`, w.reception)),
    ).toMatchObject({
      coTheDuyet: false,
      lyDoKhongDuyet: 'LICH_HEN_KHONG_CHO_DOI',
      trangThaiLichGoc: 'DaHuy',
    });
    const handled = detailOf(
      await get(`${RECEPTION}/${w.ids.hDaDuyet}`, w.reception),
    );
    expect(handled).toMatchObject({
      coTheDuyet: false,
      lyDoKhongDuyet: 'YEU_CAU_DA_XU_LY',
      ghiChuXuLy: 'Đã xử lý',
    });
    expect(Object.keys(handled.nguoiXuLy ?? {})).toStrictEqual(['hoTen']);
  });

  it('thiếu cấu hình: chi tiết vẫn 200 với coTheDuyet false (không 409)', async () => {
    const w = await world();
    await h.db.query('DELETE FROM cau_hinh_he_thong');
    const res = await get(`${RECEPTION}/${w.ids.p1}`, w.reception);
    expect(res.status).toBe(200);
    expect(detailOf(res)).toMatchObject({
      coTheDuyet: false,
      lyDoKhongDuyet: 'HE_THONG_CHUA_CAU_HINH',
      soLanToiDa: null,
    });
  });
});

describe('XDL-15, BDL-03 danh sách trắng và no-store ở mọi thân', () => {
  it('quét JSON danh sách và chi tiết: đúng bốn khoá gốc, mười khoá mỗi dòng, mười chín khoá chi tiết; không SĐT, email, lý do khám, giá, id lịch', async () => {
    const w = await world();
    for (const [list, one, token] of [
      [RECEPTION, `${RECEPTION}/${w.ids.hDaDuyet}`, w.reception],
      [
        `${ADMIN}?trangThai=ChoDuyet,DaDuyet,TuChoi&pageSize=100`,
        `${ADMIN}/${w.ids.p1}`,
        w.all,
      ],
    ] as const) {
      const listRes = await get(
        list === RECEPTION
          ? `${RECEPTION}?trangThai=ChoDuyet,DaDuyet,TuChoi`
          : list,
        token,
      );
      expect(Object.keys(listRes.body as object).sort()).toStrictEqual(
        ROOT_KEYS,
      );
      for (const item of pageOf(listRes).items as RescheduleRequestItem[])
        expect(Object.keys(item).sort()).toStrictEqual([...ITEM_KEYS].sort());
      const detailRes = await get(one, token);
      expect(Object.keys(detailRes.body as object).sort()).toStrictEqual(
        DETAIL_KEYS,
      );
      for (const res of [listRes, detailRes]) {
        const keys = collectKeys(res.body);
        expect(
          keys.filter((key) =>
            /email|mat_?khau|bam$|dia_?chi|so_?dien_?thoai|gia_?snapshot|tien_?coc|lichHenId|benhNhan/i.test(
              key,
            ),
          ),
        ).toStrictEqual([]);
        const text = JSON.stringify(res.body);
        for (const secret of [
          SENTINELS.visitReason,
          SENTINELS.price,
          SENTINELS.patientPhone,
          DOCTOR_PHONE,
          '@example.com',
          'argon2',
        ])
          expect(text).not.toContain(secret);
        // Danh sách không có lý do yêu cầu (chữ tự do), chỉ chi tiết mới có
        if (res === listRes) expect(text).not.toContain(DEFAULT_REASON);
      }
      // Mọi chuỗi trong thân là dữ liệu của danh sách trắng: không chuỗi nào trông như SĐT
      expect(
        collectStrings(listRes.body).filter((value) => /^0\d{9}$/.test(value)),
      ).toStrictEqual([]);
    }
  });

  it('id yêu cầu là CHUỖI ở mọi khoá id (kể cả chiNhanh.id và khungGioId)', async () => {
    const w = await world();
    const list = await get(ADMIN, w.all);
    for (const item of pageOf(list).items) {
      expect(typeof item.yeuCauId).toBe('string');
      expect(typeof item.chiNhanh.id).toBe('string');
    }
    const detail = detailOf(await get(`${ADMIN}/${w.ids.p1}`, w.all));
    expect(typeof detail.khungGioMongMuon.khungGioId).toBe('string');
  });

  it('Cache-Control: no-store ở 200, 400 do DTO và 404 của cả bốn route', async () => {
    const w = await world();
    const cases: [string, string][] = [
      [RECEPTION, w.reception],
      [`${RECEPTION}?trangThai=XXX`, w.reception],
      [`${RECEPTION}/${w.ids.p1}`, w.reception],
      [`${RECEPTION}/abc`, w.reception],
      [ADMIN, w.all],
      [`${ADMIN}?trangThai=XXX`, w.all],
      [`${ADMIN}/${w.ids.p1}`, w.all],
      [`${ADMIN}/99999999`, w.all],
    ];
    for (const [path, token] of cases)
      expect((await get(path, token)).headers['cache-control'], path).toBe(
        'no-store',
      );
  });
});

describe('BDL-10, HDL-31 log sạch và chỉ đọc', () => {
  it('một loạt request (thành công, 400, 404) không để lại mã lịch, tên, SĐT, lý do hay ghi chú trong log; không ghi gì vào DB', async () => {
    const w = await world();
    const captured: string[] = [];
    const chunkToText = (chunk: unknown) =>
      typeof chunk === 'string'
        ? chunk
        : Buffer.from(chunk as Uint8Array).toString('utf8');
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      captured.push(chunkToText(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      captured.push(chunkToText(chunk));
      return true;
    });
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const)
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        captured.push(args.map(String).join(' '));
      });
    const count = () =>
      h.db.query<{ n: string }[]>(
        `SELECT (SELECT COUNT(*) FROM yeu_cau_doi_lich_ngoai_chinh_sach) + (SELECT COUNT(*) FROM thong_bao) + (SELECT COUNT(*) FROM email_thong_bao) + (SELECT COUNT(*) FROM nhat_ky_hanh_dong) AS n`,
      );
    const before = await count();
    await get(
      `${RECEPTION}?trangThai=ChoDuyet,DaDuyet,TuChoi&q=${CODES.a1}`,
      w.reception,
    );
    await get(`${RECEPTION}/${w.ids.hDaDuyet}`, w.reception);
    await get(`${RECEPTION}/${w.ids.p1}`, w.receptionBToken);
    await get(`${ADMIN}?q=sai-dang`, w.all);
    await get(`${ADMIN}/${w.ids.p1}`, w.all);
    const text = captured.join('');
    for (const secret of [
      CODES.a1,
      PATIENT_ONE.hoTen,
      PATIENT_ONE.soDienThoai,
      DEFAULT_REASON,
      'Đã xử lý',
      SENTINELS.visitReason,
    ])
      expect(text).not.toContain(secret);
    vi.restoreAllMocks();
    expect(await count()).toStrictEqual(before);
  });
});
