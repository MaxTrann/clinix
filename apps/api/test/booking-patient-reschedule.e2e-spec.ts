import request from 'supertest';
import { vi } from 'vitest';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import { assertBookingInvariants } from './../src/appointments/testing/invariants.js';
import {
  assertPreviewContract,
  assertRequestSentContract,
  assertRescheduledContract,
} from './../src/appointments/testing/patient-reschedule-contract.js';
import {
  lockNoShow,
  patientRescheduleWorld,
  VALID_REASON,
} from './../src/appointments/testing/patient-reschedule-world.js';
import {
  insertRequestAt,
  requestRows,
  untouchedState,
  writeCounts,
} from './../src/appointments/testing/reschedule-request-world.js';
import {
  collectKeys,
  collectStrings,
  FORBIDDEN_KEY,
} from './../src/appointments/testing/response-keys.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  allLines,
  captureLogsByLevel,
} from './../src/auth/testing/log-levels.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';

// reschedule B6 — `GET …/reschedule-preview` và `POST …/reschedule` của Bệnh nhân qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN reschedule 5.8, 7.2, 7.6, 7.9, 7.10; TRACKING reschedule 1.10).
// Phần dịch vụ và SQL: `reschedule/patient-reschedule.service.int-spec.ts`, `reschedule/reschedule-preview.service.int-spec.ts`. Ma trận vai trò, 401, no-store, thứ tự guard: `booking-patient-reschedule-roles.e2e-spec.ts`.
// File này: DLH-48 (đổi ngay), DLH-56, DLH-59 (hết lần, lý do), DLH-11, QDL-08 (DTO), DLH-09, DLH-62, QDL-05, QDL-06 (404 cùng thân, hồ sơ người thân), DLH-22, DLH-23, DLH-60, DLH-61 (preview), DLH-55 (thiếu cấu hình),
// DLH-58 (bấm đúp), HDL-26, HDL-27 (hợp đồng web), BDL-01, BDL-02, BDL-06 (log và khoá). Mã DLH-48 trở đi, HDL-26, HDL-27, BDL-06 là `[đề xuất]`. Dữ liệu giả (email đuôi example.com). Đồng hồ giả = T0 (02/11/2026 08:00
// giờ Việt Nam): ca đổi giờ tạo token SAU khi đặt giờ.
const BASE = '/patient/appointments';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
// Thân 404 chung (patient Q27): giống từng ký tự ở mọi nhánh, kể cả mã sai dạng bị pipe từ chối
const NOT_FOUND_TEXT =
  '{"maLoi":"KHONG_TIM_THAY","thongBao":"Không tìm thấy dữ liệu."}';
const MISSING = 'CLX-20261110-ZZZZZ';
const MALFORMED = [
  'sai-dang',
  'CLX-20261110-CCC0I', // có chữ I (không thuộc bảng Crockford của mã)
  'CLX-20261110-CCC01-THUA',
  'CLX-2026111-CCC01',
];
const SLOT_NINE_ISO = new Date('2026-11-10T09:00:00+07:00').toISOString();

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
// `code` là phần SAU `/patient/appointments/`, viết thẳng (để thử cả mã sai dạng)
const preview = (code: string, accessToken?: string, query = '') => {
  const req = request(h.app.getHttpServer()).get(
    `${BASE}/${code}/reschedule-preview${query}`,
  );
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const reschedule = (code: string, accessToken?: string, body: unknown = {}) => {
  const req = request(h.app.getHttpServer())
    .post(`${BASE}/${code}/reschedule`)
    .send(body as object);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const detail = (code: string, accessToken: string) =>
  request(h.app.getHttpServer())
    .get(`${BASE}/${code}`)
    .set('Authorization', `Bearer ${accessToken}`);

/** Thế giới đổi lịch (Bệnh nhân A kèm hồ sơ người thân, bác sĩ, 8 khung giờ ngày 10/11, `soLanTuDoiLichToiDa` 2) và token của A. */
async function world(
  options: Parameters<typeof patientRescheduleWorld>[2] = {},
) {
  const w = await patientRescheduleWorld(h.db, fx, options);
  return { ...w, token: await tokenOf(w.patientId) };
}
type World = Awaited<ReturnType<typeof world>>;

const bodyOf = (res: { body: unknown }) => res.body as Record<string, unknown>;
const slotBody = (w: World, index: number, extra: object = {}) => ({
  khungGioId: w.slot(index),
  ...extra,
});

describe('DLH-48, HDL-27 POST đổi ngay qua HTTP', () => {
  it('201 DaDoi đúng hợp đồng, no-store; lịch mới DaXacNhan nối chuỗi, lịch cũ DaDoiLich, khung giờ đổi chỗ; một thông báo; INV', async () => {
    const w = await world();
    const old = await w.book(0);
    const res = await reschedule(old.maLichHen, w.token, slotBody(w, 2));
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    assertRescheduledContract(res.body);
    const body = bodyOf(res) as {
      lichHenMoi: { maLichHen: string; thoiGian: string };
      lichHenCu: { maLichHen: string };
    };
    expect(body.lichHenCu.maLichHen).toBe(old.maLichHen);
    expect(body.lichHenMoi.thoiGian).toBe(SLOT_NINE_ISO);
    const created = await w.rowOf(await w.idOfCode(body.lichHenMoi.maLichHen));
    expect(created).toMatchObject({
      trangThai: 'DaXacNhan',
      truoc: old.lichHenId,
    });
    expect((await w.rowOf(old.lichHenId)).trangThai).toBe('DaDoiLich');
    await w.expectSlot(0, 'ConTrong');
    await w.expectSlot(2, 'DaDat');
    await assertBookingInvariants(h.db);
    // lịch cũ giờ là DaDoiLich: Bệnh nhân không còn xem được (Q31); lịch mới xem được
    expect((await detail(old.maLichHen, w.token)).text).toBe(NOT_FOUND_TEXT);
    expect((await detail(body.lichHenMoi.maLichHen, w.token)).status).toBe(200);
  });

  it('DLH-11 lý do thừa khi còn lần tự đổi (cả hợp lệ lẫn quá ngắn) bị bỏ qua: 201 DaDoi, không yêu cầu', async () => {
    const w = await world();
    const first = await w.book(0);
    const second = await w.book(4);
    const a = await reschedule(
      first.maLichHen,
      w.token,
      slotBody(w, 2, { lyDoYeuCau: 'abc' }),
    );
    const b = await reschedule(
      second.maLichHen,
      w.token,
      slotBody(w, 6, { lyDoYeuCau: VALID_REASON }),
    );
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(bodyOf(a).ketQua).toBe('DaDoi');
    expect(await requestRows(h.db)).toEqual([]);
  });

  it('DLH-22 cờ khoá đặt lịch do no-show bật KHÔNG chặn đổi lịch (Q7 (b)): preview hopLe true và POST 201', async () => {
    const w = await world();
    const old = await w.book(0);
    await lockNoShow(h.db, w.patientId);
    const res = await preview(
      old.maLichHen,
      w.token,
      `?khungGioId=${w.slot(2)}`,
    );
    expect(res.status).toBe(200);
    expect((bodyOf(res).lichMoi as { hopLe: boolean }).hopLe).toBe(true);
    expect(
      (await reschedule(old.maLichHen, w.token, slotBody(w, 2))).status,
    ).toBe(201);
  });

  it('QDL-06 lịch của HỒ SƠ NGƯỜI THÂN của chính mình: preview 200 và POST 201; của tài khoản khác ⇒ 404 cùng thân cả hai route', async () => {
    const w = await world();
    const mineRel = await w.book(0, { hoSoNguoiThanId: w.relativeId });
    const other = await w.otherPatient(4);
    expect((await preview(mineRel.maLichHen, w.token)).status).toBe(200);
    expect(
      (await reschedule(mineRel.maLichHen, w.token, slotBody(w, 2))).status,
    ).toBe(201);
    for (const code of [other.viaRelative.maLichHen, other.own.maLichHen]) {
      const res = await reschedule(code, w.token, slotBody(w, 6));
      expect(res.status).toBe(404);
      expect(res.text).toBe(NOT_FOUND_TEXT);
      expect((await preview(code, w.token)).text).toBe(NOT_FOUND_TEXT);
    }
  });
});

describe('DLH-56, DLH-59 POST đã hết lần tự đổi qua HTTP', () => {
  it('KHÔNG lý do (vắng, rỗng, chỉ khoảng trắng, null) ⇒ 409 VUOT_SO_LAN_TU_DOI chiTiet { soLanDaDoi, toiDa }, DB nguyên', async () => {
    const w = await world();
    const old = await w.book(0, { soLan: 2 });
    const before = await untouchedState(h.db);
    const counts = await writeCounts(h.db);
    for (const extra of [
      {},
      { lyDoYeuCau: '' },
      { lyDoYeuCau: '   ' },
      { lyDoYeuCau: null },
    ]) {
      const res = await reschedule(
        old.maLichHen,
        w.token,
        slotBody(w, 2, extra),
      );
      const body = expectErrorResponse(res, 409, 'VUOT_SO_LAN_TU_DOI');
      expect(body.chiTiet).toEqual({ soLanDaDoi: 2, toiDa: 2 });
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(await untouchedState(h.db)).toEqual(before);
    expect(await writeCounts(h.db)).toEqual(counts);
  });

  it('CÓ lý do ⇒ 201 DaGuiYeuCau đúng hợp đồng (KHÔNG yeuCauId); DB: một yêu cầu ChoDuyet, lịch và khung giờ nguyên; bấm lần hai ⇒ 409 DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET', async () => {
    const w = await world();
    const old = await w.book(0, { soLan: 2 });
    const before = await untouchedState(h.db);
    const res = await reschedule(
      old.maLichHen,
      w.token,
      slotBody(w, 2, { lyDoYeuCau: `  ${VALID_REASON}  ` }),
    );
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    assertRequestSentContract(res.body);
    expect(
      (bodyOf(res).yeuCau as { thoiGianMongMuon: string }).thoiGianMongMuon,
    ).toBe(SLOT_NINE_ISO);
    expect(await requestRows(h.db)).toMatchObject([
      {
        lichHenId: old.lichHenId,
        khungGioMongMuonId: w.slot(2),
        lyDoYeuCau: VALID_REASON,
        trangThai: 'ChoDuyet',
      },
    ]);
    expect(await untouchedState(h.db)).toEqual(before);

    const again = await reschedule(
      old.maLichHen,
      w.token,
      slotBody(w, 2, { lyDoYeuCau: VALID_REASON }),
    );
    expectErrorResponse(again, 409, 'DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET');
    expect(await requestRows(h.db)).toHaveLength(1);
  });

  it.each([
    ['ngắn (3 ký tự)', 'abc'],
    ['dài (501 ký tự)', 'a'.repeat(501)],
  ])(
    'lý do %s khi dùng đến ⇒ 400 DU_LIEU_KHONG_HOP_LE loi lyDoYeuCau LY_DO_YEU_CAU_KHONG_HOP_LE; DB nguyên',
    async (_name, reason) => {
      const w = await world();
      const old = await w.book(0, { soLan: 2 });
      const before = await untouchedState(h.db);
      const res = await reschedule(
        old.maLichHen,
        w.token,
        slotBody(w, 2, { lyDoYeuCau: reason }),
      );
      const body = expectErrorResponse(res, 400, INVALID_DATA);
      expect(body.loi).toEqual([
        { truong: 'lyDoYeuCau', ma: 'LY_DO_YEU_CAU_KHONG_HOP_LE' },
      ]);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(await untouchedState(h.db)).toEqual(before);
      expect(await requestRows(h.db)).toEqual([]);
    },
  );
});

describe('DLH-11, QDL-08 DTO qua HTTP', () => {
  it('thân sai ⇒ 400 DU_LIEU_KHONG_HOP_LE kèm loi đúng trường và mã; DB nguyên', async () => {
    const w = await world();
    const old = await w.book(0);
    const before = await untouchedState(h.db);
    const cases: [unknown, { truong: string; ma: string }[]][] = [
      [{}, [{ truong: 'khungGioId', ma: 'IS_BIGINT_ID' }]],
      [{ khungGioId: 12 }, [{ truong: 'khungGioId', ma: 'IS_BIGINT_ID' }]],
      [{ khungGioId: '012' }, [{ truong: 'khungGioId', ma: 'IS_BIGINT_ID' }]],
      [{ khungGioId: '0' }, [{ truong: 'khungGioId', ma: 'IS_BIGINT_ID' }]],
      [
        { khungGioId: '9223372036854775808' },
        [{ truong: 'khungGioId', ma: 'IS_BIGINT_ID' }],
      ],
      [
        { khungGioId: w.slot(2), lyDoYeuCau: 123 },
        [{ truong: 'lyDoYeuCau', ma: 'IS_STRING' }],
      ],
    ];
    for (const [body, loi] of cases) {
      const res = await reschedule(old.maLichHen, w.token, body);
      expect(expectErrorResponse(res, 400, INVALID_DATA).loi).toEqual(loi);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(await untouchedState(h.db)).toEqual(before);
  });

  it('QDL-08 khoá lạ ở thân (benhNhanId, accountId, trangThai) hay ở query ⇒ 400 TRUONG_KHONG_DUOC_PHEP; chủ sở hữu chỉ từ access token', async () => {
    const w = await world();
    const old = await w.book(0);
    const before = await untouchedState(h.db);
    for (const key of ['benhNhanId', 'accountId', 'trangThai']) {
      const res = await reschedule(
        old.maLichHen,
        w.token,
        slotBody(w, 2, { [key]: '1' }),
      );
      expect(expectErrorResponse(res, 400, INVALID_DATA).loi).toEqual([
        { truong: key, ma: NOT_ALLOWED },
      ]);
    }
    const query = await preview(old.maLichHen, w.token, '?benhNhanId=1');
    expect(expectErrorResponse(query, 400, INVALID_DATA).loi).toEqual([
      { truong: 'benhNhanId', ma: NOT_ALLOWED },
    ]);
    expect(await untouchedState(h.db)).toEqual(before);
  });

  it('DLH-11 query khungGioId sai dạng (chữ, rỗng, lặp khoá) ⇒ 400 IS_BIGINT_ID; id lớn hơn 2^53 giữ nguyên chuỗi (không tồn tại ⇒ 404 KHUNG_GIO_KHONG_TON_TAI, không trỏ nhầm dòng khác)', async () => {
    const w = await world();
    const old = await w.book(0);
    for (const query of [
      '?khungGioId=abc',
      '?khungGioId=',
      `?khungGioId=${w.slot(1)}&khungGioId=${w.slot(2)}`,
    ]) {
      const res = await preview(old.maLichHen, w.token, query);
      expect(expectErrorResponse(res, 400, INVALID_DATA).loi).toEqual([
        { truong: 'khungGioId', ma: 'IS_BIGINT_ID' },
      ]);
    }
    for (const id of ['9007199254740993', '999999999']) {
      expectErrorResponse(
        await preview(old.maLichHen, w.token, `?khungGioId=${id}`),
        404,
        'KHUNG_GIO_KHONG_TON_TAI',
      );
      expectErrorResponse(
        await reschedule(old.maLichHen, w.token, { khungGioId: id }),
        404,
        'KHUNG_GIO_KHONG_TON_TAI',
      );
    }
  });
});

describe('DLH-09, DLH-62, QDL-05 lịch không xem được ⇒ 404 CÙNG thân từng ký tự ở cả hai route', () => {
  it('của người khác, hồ sơ người thân của tài khoản khác, không tồn tại, đã DaDoiLich, mã sai dạng: status 404 và thân giống nhau; DB nguyên', async () => {
    const w = await world();
    const other = await w.otherPatient(4);
    const mine = await w.book(0);
    expect(
      (await reschedule(mine.maLichHen, w.token, slotBody(w, 2))).status,
    ).toBe(201);
    const before = await untouchedState(h.db);
    const codes = [
      other.own.maLichHen,
      other.viaRelative.maLichHen,
      MISSING,
      mine.maLichHen,
      ...MALFORMED,
    ];
    for (const code of codes) {
      const posted = await reschedule(
        code,
        w.token,
        slotBody(w, 6, { lyDoYeuCau: VALID_REASON }),
      );
      const previewed = await preview(code, w.token);
      const withSlot = await preview(code, w.token, `?khungGioId=${w.slot(6)}`);
      for (const res of [posted, previewed, withSlot]) {
        expect(res.status, code).toBe(404);
        expect(res.text, code).toBe(NOT_FOUND_TEXT);
        expect(res.headers['cache-control']).toBe('no-store');
      }
    }
    expect(await untouchedState(h.db)).toEqual(before);
  });

  it('DLH-62 mã sai dạng KÈM thân sai ⇒ vẫn 404 (pipe của :maLichHen đứng trước DTO), không phải 400', async () => {
    const w = await world();
    for (const code of MALFORMED) {
      const res = await reschedule(code, w.token, {
        khungGioId: 'sai',
        benhNhanId: '1',
      });
      expect(res.status, code).toBe(404);
      expect(res.text, code).toBe(NOT_FOUND_TEXT);
      expect((await preview(code, w.token, '?khungGioId=abc')).text).toBe(
        NOT_FOUND_TEXT,
      );
    }
  });

  it('QDL-05 Bệnh nhân đọc chi tiết (yeuCauDoiLich) của lịch NGƯỜI KHÁC dù lịch đó có yêu cầu ⇒ 404 cùng thân', async () => {
    const w = await world();
    const other = await w.otherPatient(4);
    await insertRequestAt(h.db, {
      lichHenId: other.own.lichHenId,
      khungGioMongMuonId: w.slot(7),
      thoiDiemTao: '2026-11-02 08:00:00',
    });
    for (const code of [other.own.maLichHen, other.viaRelative.maLichHen]) {
      const res = await detail(code, w.token);
      expect(res.status).toBe(404);
      expect(res.text).toBe(NOT_FOUND_TEXT);
    }
  });
});

describe('DLH-23, DLH-60, DLH-61, HDL-26 GET preview qua HTTP', () => {
  it('không khungGioId: 200 đúng hợp đồng web (lyDoKhongDoi VẮNG, lichMoi null, lichCu hai khoá, bacSiId chuỗi), no-store', async () => {
    const w = await world();
    const old = await w.book(0, { soLan: 1 });
    const res = await preview(old.maLichHen, w.token);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    assertPreviewContract(res.body);
    expect(res.body).toMatchObject({
      choPhepDoi: true,
      loai: 'TuDoi',
      soLanDaDoi: 1,
      soLanToiDa: 2,
      coYeuCauChoDuyet: false,
      lichMoi: null,
      lichCu: {
        thoiGian: new Date('2026-11-10T08:00:00+07:00').toISOString(),
        bacSiId: w.doctor.taiKhoanId,
      },
    });
    expect('lyDoKhongDoi' in bodyOf(res)).toBe(false);
  });

  it('có khungGioId: trống ⇒ hopLe true; đã có người đặt ⇒ hopLe false KHUNG_GIO_DA_DAT; chính khung giờ hiện tại ⇒ KHUNG_GIO_TRUNG_LICH_CU; mọi thân đúng hợp đồng', async () => {
    const w = await world();
    const old = await w.book(0);
    const other = await fx.admin.patient();
    await w.book(3, { patientId: other.account.taiKhoanId });
    const lichMoi = async (index: number) => {
      const res = await preview(
        old.maLichHen,
        w.token,
        `?khungGioId=${w.slot(index)}`,
      );
      expect(res.status).toBe(200);
      assertPreviewContract(res.body);
      return bodyOf(res).lichMoi;
    };
    expect(await lichMoi(2)).toEqual({
      khungGioId: w.slot(2),
      thoiGian: SLOT_NINE_ISO,
      hopLe: true,
    });
    expect(await lichMoi(3)).toMatchObject({
      hopLe: false,
      lyDoKhongHopLe: 'KHUNG_GIO_DA_DAT',
    });
    expect(await lichMoi(0)).toMatchObject({
      hopLe: false,
      lyDoKhongHopLe: 'KHUNG_GIO_TRUNG_LICH_CU',
    });
  });

  it('lỗi của LỊCH ra 200 choPhepDoi false kèm lyDoKhongDoi (không 409): ChoThanhToan, DaHuy, quá giờ; mọi thân đúng hợp đồng', async () => {
    const w = await world();
    const pending = await fx.appointmentIn('ChoThanhToan', {
      doctor: w.doctor,
      khungGioId: w.slot(1),
      patientId: w.patientId,
    });
    const cancelled = await fx.appointmentIn('DaHuy', {
      doctor: w.doctor,
      khungGioId: w.slot(2),
      patientId: w.patientId,
    });
    const late = await w.book(3);
    for (const [row, code] of [
      [pending, 'LICH_HEN_KHONG_CHO_DOI'],
      [cancelled, 'LICH_HEN_KHONG_CHO_DOI'],
    ] as const) {
      const res = await preview(row.maLichHen, w.token);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ choPhepDoi: false, lyDoKhongDoi: code });
      assertPreviewContract(res.body);
    }
    // 09:45 ngày 10/11: lịch 09:30 (ô 3) đã quá giờ; token tạo lại SAU khi đổi giờ (hạn 15 phút của token)
    vi.setSystemTime(new Date('2026-11-10T09:45:00+07:00'));
    const token = await tokenOf(w.patientId);
    const res = await preview(late.maLichHen, token);
    expect(res.body).toMatchObject({
      choPhepDoi: false,
      lyDoKhongDoi: 'LICH_HEN_DA_QUA_GIO',
    });
    assertPreviewContract(res.body);
  });

  it('hết lần: loai GuiYeuCau ngay cả khi chưa có khungGioId; sau khi gửi yêu cầu ⇒ choPhepDoi false, coYeuCauChoDuyet true, lyDoKhongDoi DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET', async () => {
    const w = await world();
    const old = await w.book(0, { soLan: 2 });
    const before = await preview(old.maLichHen, w.token);
    expect(before.body).toMatchObject({ choPhepDoi: true, loai: 'GuiYeuCau' });
    await reschedule(
      old.maLichHen,
      w.token,
      slotBody(w, 2, { lyDoYeuCau: VALID_REASON }),
    );
    const after = await preview(old.maLichHen, w.token);
    expect(after.body).toMatchObject({
      choPhepDoi: false,
      lyDoKhongDoi: 'DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET',
      loai: 'GuiYeuCau',
      coYeuCauChoDuyet: true,
    });
    assertPreviewContract(after.body);
  });

  it('DLH-23 preview KHÔNG ghi: số hàng ba bảng ghi và ảnh chụp lịch, khung giờ nguyên sau nhiều lần gọi', async () => {
    const w = await world();
    const old = await w.book(0, { soLan: 2 });
    const before = await untouchedState(h.db);
    const counts = await writeCounts(h.db);
    for (const query of [
      '',
      `?khungGioId=${w.slot(2)}`,
      `?khungGioId=${w.slot(3)}`,
    ])
      expect((await preview(old.maLichHen, w.token, query)).status).toBe(200);
    expect(await untouchedState(h.db)).toEqual(before);
    expect(await writeCounts(h.db)).toEqual(counts);
  });
});

describe('DLH-55 thiếu cấu hình hệ thống', () => {
  it('xoá cau_hinh_he_thong ⇒ preview và POST 409 HE_THONG_CHUA_CAU_HINH; chi tiết lịch vẫn 200 (choPhepDoiLich false)', async () => {
    const w = await world();
    const old = await w.book(0);
    await h.db.query('DELETE FROM cau_hinh_he_thong');
    expectErrorResponse(
      await preview(old.maLichHen, w.token),
      409,
      'HE_THONG_CHUA_CAU_HINH',
    );
    expectErrorResponse(
      await preview(old.maLichHen, w.token, `?khungGioId=${w.slot(2)}`),
      409,
      'HE_THONG_CHUA_CAU_HINH',
    );
    expectErrorResponse(
      await reschedule(old.maLichHen, w.token, slotBody(w, 2)),
      409,
      'HE_THONG_CHUA_CAU_HINH',
    );
    const detailRes = await detail(old.maLichHen, w.token);
    expect(detailRes.status).toBe(200);
    expect(bodyOf(detailRes).choPhepDoiLich).toBe(false);
  });
});

describe('DLH-58 bấm đúp qua HTTP', () => {
  it('hai POST cùng lúc cùng thân: đúng một 201 và một 404 cùng thân; một lịch mới; INV', async () => {
    const w = await world();
    const old = await w.book(0);
    const results = await Promise.all([
      reschedule(old.maLichHen, w.token, slotBody(w, 2)),
      reschedule(old.maLichHen, w.token, slotBody(w, 2)),
    ]);
    expect(results.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      201, 404,
    ]);
    expect(results.find((res) => res.status === 404)?.text).toBe(
      NOT_FOUND_TEXT,
    );
    expect(await w.countRows('lich_hen')).toBe(2);
    await assertBookingInvariants(h.db);
  });
});

describe('BDL-01, BDL-02, BDL-06 log sạch và danh sách trắng khoá ở mọi thân', () => {
  it('log của mọi đường (201 DaDoi, 201 DaGuiYeuCau, 400, 404, 409) KHÔNG chứa lý do, email, SĐT, họ tên', async () => {
    const w = await world();
    const logs = captureLogsByLevel();
    const consoleSpies = (
      ['log', 'warn', 'error', 'info', 'debug'] as const
    ).map((name) =>
      vi.spyOn(console, name).mockImplementation(() => undefined),
    );
    const privateReason = 'Lý do riêng tư ZXQ-9137 của bệnh nhân';
    const changeable = await w.book(0);
    const exhausted = await w.book(1, { soLan: 2 });
    const responses = [
      await reschedule(
        changeable.maLichHen,
        w.token,
        slotBody(w, 2, { lyDoYeuCau: privateReason }),
      ),
      await reschedule(
        exhausted.maLichHen,
        w.token,
        slotBody(w, 3, { lyDoYeuCau: privateReason }),
      ),
      await reschedule(
        exhausted.maLichHen,
        w.token,
        slotBody(w, 3, { lyDoYeuCau: privateReason }),
      ),
      await reschedule(exhausted.maLichHen, w.token, slotBody(w, 3)),
      await reschedule(
        exhausted.maLichHen,
        w.token,
        slotBody(w, 3, { lyDoYeuCau: 'ab' }),
      ),
      await reschedule(
        MISSING,
        w.token,
        slotBody(w, 3, { lyDoYeuCau: privateReason }),
      ),
      await preview(exhausted.maLichHen, w.token, `?khungGioId=${w.slot(3)}`),
    ];
    expect(responses.map((res) => res.status)).toEqual([
      201, 201, 409, 409, 400, 404, 200,
    ]);

    const lines = [
      ...allLines(logs),
      ...consoleSpies.flatMap((spy) =>
        spy.mock.calls.map((call) => call.map(String).join(' ')),
      ),
    ].join('\n');
    const account = w.patient.account;
    for (const secret of [
      privateReason,
      'ZXQ-9137',
      account.email,
      account.soDienThoai,
      account.hoTen,
    ])
      expect(lines).not.toContain(secret);
  });

  it('BDL-02, BDL-06 mọi thân (thành công VÀ lỗi, kể cả chiTiet): không khoá lich_hen_id, yeuCauId hay khoá kết thúc bằng Id nào khác ngoài bacSiId, khungGioId; không email, SĐT', async () => {
    const w = await world();
    const open = await w.book(0);
    const exhausted = await w.book(1, { soLan: 2 });
    const responses = [
      await preview(open.maLichHen, w.token),
      await preview(open.maLichHen, w.token, `?khungGioId=${w.slot(2)}`),
      await preview(MISSING, w.token),
      await reschedule(exhausted.maLichHen, w.token, slotBody(w, 3)),
      await reschedule(
        exhausted.maLichHen,
        w.token,
        slotBody(w, 3, { lyDoYeuCau: 'ab' }),
      ),
      await reschedule(
        exhausted.maLichHen,
        w.token,
        slotBody(w, 3, { lyDoYeuCau: VALID_REASON }),
      ),
      await reschedule(
        exhausted.maLichHen,
        w.token,
        slotBody(w, 3, { lyDoYeuCau: VALID_REASON }),
      ),
      await reschedule(open.maLichHen, w.token, slotBody(w, 2)),
      await reschedule(open.maLichHen, w.token, slotBody(w, 2)),
    ];
    expect(responses.map((res) => res.status)).toEqual([
      200, 200, 404, 409, 400, 201, 409, 201, 404,
    ]);
    const keys = new Set<string>();
    const strings: string[] = [];
    for (const res of responses) {
      for (const key of collectKeys(res.body)) keys.add(key);
      strings.push(...collectStrings(res.body));
    }
    expect([...keys].filter((key) => FORBIDDEN_KEY.test(key)).sort()).toEqual([
      'bacSiId',
      'khungGioId',
    ]);
    expect(keys.has('lich_hen_id')).toBe(false);
    expect(keys.has('yeuCauId')).toBe(false);
    const account = w.patient.account;
    for (const text of strings) {
      expect(text).not.toContain(account.email);
      expect(text).not.toContain(account.soDienThoai);
    }
  });
});
