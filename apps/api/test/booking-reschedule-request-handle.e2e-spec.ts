import request from 'supertest';
import { vi } from 'vitest';
import { AuditError } from './../src/audit/audit-error.js';
import { AuditService } from './../src/audit/audit.service.js';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import { assertBookingInvariants } from './../src/appointments/testing/invariants.js';
import {
  handleHttpWorld,
  HANDLING_NOTE,
  type HandleHttpWorld,
} from './../src/appointments/testing/reschedule-request-handle-world.js';
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

// reschedule B9 — bốn route GHI `POST /reception|admin/reschedule-requests/:yeuCauId/approve|reject` qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN reschedule 5.8, 7.4, 7.6, 7.10; TRACKING
// reschedule 1.13). Phần dịch vụ và SQL: `reschedule-request-approve.service.int-spec.ts`, `…reject.service.int-spec.ts`, `…handle.concurrency.int-spec.ts`. Ma trận vai trò, 401, no-store, thứ tự guard:
// `booking-reschedule-request-handle-roles.e2e-spec.ts`. File này: XDL-06, XDL-08, XDL-09, XDL-10, XDL-11, XDL-13 (404 cùng thân), XDL-49 (bấm đúp), HDL-30 (hợp đồng "đọc NGHIÊM"), NDL-05, BDL-11 (log), BDL-12 (danh sách
// trắng khoá), BDL-08 (AuditError ra 500). Mã HDL-30, BDL-08, BDL-11, BDL-12 là `[đề xuất]`. Dữ liệu giả (email đuôi example.com). Đồng hồ giả = T0 (02/11/2026 08:00 giờ Việt Nam): token tạo SAU khi đặt giờ.
const RECEPTION = '/reception/reschedule-requests';
const ADMIN = '/admin/reschedule-requests';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const NOTE_REQUIRED = 'LY_DO_BAT_BUOC';
// Thân 404 chung của route GHI: giống từng ký tự ở mọi nhánh, kể cả id sai dạng (KHÁC GET của B8: KHONG_TIM_THAY)
const NOT_FOUND_TEXT =
  '{"maLoi":"YEU_CAU_DOI_LICH_KHONG_TON_TAI","thongBao":"Không tìm thấy yêu cầu đổi lịch."}';
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
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
const world = () => handleHttpWorld(h.db, fx, tokenOf);

/** `POST {base}/{id}/{action}`; `id` viết thẳng (để thử id sai dạng). */
const post = (
  base: string,
  id: string,
  action: 'approve' | 'reject',
  accessToken?: string,
  body: unknown = { ghiChu: HANDLING_NOTE },
) => {
  const req = request(h.app.getHttpServer())
    .post(`${base}/${id}/${action}`)
    .send(body as object);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};
const approve = (
  id: string,
  token: string,
  body?: unknown,
  base: string = RECEPTION,
) => post(base, id, 'approve', token, body);
const reject = (
  id: string,
  token: string,
  body?: unknown,
  base: string = RECEPTION,
) => post(base, id, 'reject', token, body);

/** Hợp đồng 200 của DUYỆT như web F4 đọc NGHIÊM: ĐÚNG ba khoá cấp 1, hai khoá của yeuCau và ba khoá của lichHenMoi; giờ ISO 8601 UTC giữ mili giây; id không bao giờ ra. */
function assertApprovedContract(body: unknown): void {
  const root = body as Record<string, unknown>;
  expect(Object.keys(root).sort()).toEqual([
    'lichHenMoi',
    'thoiGianMayChu',
    'yeuCau',
  ]);
  expect(root.yeuCau).toStrictEqual({ trangThai: 'DaDuyet' });
  const created = root.lichHenMoi as Record<string, unknown>;
  expect(Object.keys(created).sort()).toEqual([
    'maLichHen',
    'thoiGian',
    'trangThai',
  ]);
  expect(created.maLichHen).toMatch(/^CLX-\d{8}-[0-9A-Z]{5}$/);
  expect(created.thoiGian).toMatch(ISO_UTC);
  expect(created.trangThai).toBe('DaXacNhan');
  expect(root.thoiGianMayChu).toMatch(ISO_UTC);
}

/** Hợp đồng 200 của TỪ CHỐI: ĐÚNG hai khoá, không lichHenMoi. */
function assertRejectedContract(body: unknown): void {
  const root = body as Record<string, unknown>;
  expect(Object.keys(root).sort()).toEqual(['thoiGianMayChu', 'yeuCau']);
  expect(root.yeuCau).toStrictEqual({ trangThai: 'TuChoi' });
  expect(root.thoiGianMayChu).toMatch(ISO_UTC);
}

describe('XDL-06, XDL-08, HDL-30 duyệt và từ chối qua HTTP: 200, đúng hợp đồng, no-store', () => {
  it('Lễ tân DUYỆT: 200 (không 201), no-store, JSON; lịch mới DaXacNhan nối chuỗi và bộ đếm giữ nguyên, lịch cũ DaDoiLich, khung giờ đổi chỗ; yêu cầu DaDuyet; ĐÚNG một Audit và một thông báo; INV', async () => {
    const w = await world();
    const { lich, yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });

    const res = await approve(yeuCauId, w.tokens.reception);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(String(res.headers['content-type'])).toContain('application/json');
    assertApprovedContract(res.body);
    const body = res.body as {
      lichHenMoi: { maLichHen: string; thoiGian: string };
    };
    expect(body.lichHenMoi.thoiGian).toBe(SLOT_NINE_ISO);
    const created = await w.rowOf(await w.idOfCode(body.lichHenMoi.maLichHen));
    expect(created).toMatchObject({
      trangThai: 'DaXacNhan',
      truoc: lich.lichHenId,
    });
    expect(Number(created.soLan)).toBe(2);
    expect((await w.rowOf(lich.lichHenId)).trangThai).toBe('DaDoiLich');
    await w.expectSlot(0, 'ConTrong');
    await w.expectSlot(2, 'DaDat');
    expect(await w.requestRow(yeuCauId)).toMatchObject({
      trangThai: 'DaDuyet',
      ghiChuXuLy: HANDLING_NOTE,
      nguoiXuLyId: w.receptionId,
    });
    const audit = await w.auditRows();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      taiKhoanId: w.receptionId,
      chiNhanhId: w.branchId,
      hanhDong: 'XuLyDoiLichNgoaiChinhSach',
      maDoiTuong: yeuCauId,
    });
    expect((await w.notices()).map((n) => n.loai)).toEqual([
      'YeuCauDoiLichDaDuyet',
    ]);
    await assertBookingInvariants(h.db);
  });

  it('Lễ tân TỪ CHỐI: 200 đúng hai khoá; lịch gốc và khung giờ NGUYÊN, không lịch mới; yêu cầu TuChoi; một Audit và một thông báo YeuCauDoiLichBiTuChoi', async () => {
    const w = await world();
    const { lich, yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const before = await w.rawRow(lich.lichHenId);

    const res = await reject(yeuCauId, w.tokens.reception);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    assertRejectedContract(res.body);
    expect(await w.rawRow(lich.lichHenId)).toEqual(before);
    expect(await w.countRows('lich_hen')).toBe(1);
    await w.expectSlot(0, 'DaDat');
    await w.expectSlot(2, 'ConTrong');
    expect((await w.requestRow(yeuCauId)).trangThai).toBe('TuChoi');
    expect(await w.auditCount()).toBe(1);
    expect((await w.notices()).map((n) => n.loai)).toEqual([
      'YeuCauDoiLichBiTuChoi',
    ]);
  });

  it('Quản trị viên Toàn hệ thống DUYỆT và Quản trị viên Chi nhánh TỪ CHỐI qua route admin: 200; người xử lý là Quản trị viên; Audit ghi chi nhánh của LỊCH', async () => {
    const w = await world();
    const first = await w.openRequest(0, 2, { soLan: 2 });
    const second = await w.openRequest(1, 3, { soLan: 2 });

    const approved = await approve(
      first.yeuCauId,
      w.tokens.all,
      undefined,
      ADMIN,
    );
    const rejected = await reject(
      second.yeuCauId,
      w.tokens.branchAdmin,
      undefined,
      ADMIN,
    );

    expect(approved.status).toBe(200);
    assertApprovedContract(approved.body);
    expect(rejected.status).toBe(200);
    assertRejectedContract(rejected.body);
    const audit = await w.auditRows();
    expect(audit.map((row) => row.chiNhanhId)).toEqual([
      w.branchId,
      w.branchId,
    ]);
    expect(audit.map((row) => row.maDoiTuong)).toEqual([
      first.yeuCauId,
      second.yeuCauId,
    ]);
    expect((await w.requestRow(first.yeuCauId)).nguoiXuLyId).not.toBe(
      w.receptionId,
    );
    await assertBookingInvariants(h.db);
  });

  it('XDL-07 duyệt với khungGioId THAY THẾ: lịch mới ở khung giờ thay thế; khung giờ mong muốn của yêu cầu giữ nguyên', async () => {
    const w = await world();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });

    const res = await approve(yeuCauId, w.tokens.reception, {
      ghiChu: HANDLING_NOTE,
      khungGioId: w.slot(4),
    });

    expect(res.status).toBe(200);
    expect(
      (res.body as { lichHenMoi: { thoiGian: string } }).lichHenMoi.thoiGian,
    ).toBe(new Date('2026-11-10T10:00:00+07:00').toISOString());
    expect(await w.requestRow(yeuCauId)).toMatchObject({
      trangThai: 'DaDuyet',
      khungGioMongMuonId: w.slot(2),
    });
    await w.expectSlot(2, 'ConTrong');
    await w.expectSlot(4, 'DaDat');
  });
});

describe('XDL-16, Q10 Bệnh nhân thấy kết quả xử lý ở chi tiết lịch (ghi chú nguyên văn)', () => {
  const patientDetail = (code: string, token: string) =>
    request(h.app.getHttpServer())
      .get(`/patient/appointments/${code}`)
      .set('Authorization', `Bearer ${token}`);

  it('sau TỪ CHỐI: chi tiết lịch gốc có yeuCauDoiLich mới nhất là TuChoi kèm ghiChuXuLy NGUYÊN VĂN, giờ mong muốn ISO, đúng bốn khoá; lịch gốc vẫn xem được', async () => {
    const w = await world();
    const { lich, yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const note = 'Bác sĩ không còn khung giờ đó, mời chọn ngày khác';

    expect(
      (await reject(yeuCauId, w.tokens.reception, { ghiChu: note })).status,
    ).toBe(200);

    const res = await patientDetail(lich.maLichHen, w.tokens.patient);
    expect(res.status).toBe(200);
    const latest = (res.body as { yeuCauDoiLich: Record<string, unknown> })
      .yeuCauDoiLich;
    expect(Object.keys(latest).sort()).toEqual([
      'ghiChuXuLy',
      'thoiDiemTao',
      'thoiGianMongMuon',
      'trangThai',
    ]);
    expect(latest).toMatchObject({
      trangThai: 'TuChoi',
      ghiChuXuLy: note,
      thoiGianMongMuon: SLOT_NINE_ISO,
    });
  });

  it('sau DUYỆT: lịch cũ (DaDoiLich) 404 KHONG_TIM_THAY với Bệnh nhân (Q31), lịch mới theo mã trong phản hồi hiện DaXacNhan', async () => {
    const w = await world();
    const { lich, yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });

    const approved = await approve(yeuCauId, w.tokens.reception);
    const code = (approved.body as { lichHenMoi: { maLichHen: string } })
      .lichHenMoi.maLichHen;

    expectErrorResponse(
      await patientDetail(lich.maLichHen, w.tokens.patient),
      404,
      'KHONG_TIM_THAY',
    );
    const created = await patientDetail(code, w.tokens.patient);
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({
      maLichHen: code,
      trangThai: 'DaXacNhan',
    });
  });
});

describe('XDL-10, XDL-11, XDL-49 các 409 và bấm đúp qua HTTP', () => {
  it('duyệt hai lần, duyệt sau từ chối, từ chối hai lần, từ chối sau duyệt ⇒ 409 YEU_CAU_DA_XU_LY; nhật ký và thông báo không tăng thêm', async () => {
    const w = await world();
    const a = await w.openRequest(0, 2, { soLan: 2 });
    const b = await w.openRequest(1, 3, { soLan: 2 });
    expect((await approve(a.yeuCauId, w.tokens.reception)).status).toBe(200);
    expect((await reject(b.yeuCauId, w.tokens.reception)).status).toBe(200);
    const base = await w.untouched();

    for (const res of [
      await approve(a.yeuCauId, w.tokens.reception),
      await reject(a.yeuCauId, w.tokens.reception),
      await approve(b.yeuCauId, w.tokens.reception),
      await reject(b.yeuCauId, w.tokens.reception),
    ])
      expectErrorResponse(res, 409, 'YEU_CAU_DA_XU_LY');
    expect(await w.untouched()).toEqual(base);
  });

  it('XDL-49 bấm đúp: hai DUYỆT đồng thời ⇒ một 200 và một 409; đúng một lịch mới', async () => {
    const w = await world();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });

    const results = await Promise.all([
      approve(yeuCauId, w.tokens.reception),
      approve(yeuCauId, w.tokens.reception),
    ]);

    expect(results.map((res) => res.status).sort((x, y) => x - y)).toEqual([
      200, 409,
    ]);
    expect(await w.countRows('lich_hen')).toBe(2);
    expect(await w.auditCount()).toBe(1);
    await assertBookingInvariants(h.db);
  });

  it.each(['DaHuy', 'DaTiepDon', 'VangMat', 'DaDoiLich'] as const)(
    'XDL-11 lịch gốc %s: DUYỆT 409 LICH_HEN_KHONG_CHO_DOI kèm chiTiet.trangThai, yêu cầu vẫn ChoDuyet; TỪ CHỐI vẫn 200 (R6)',
    async (state) => {
      const w = await world();
      const { yeuCauId } = await w.openRequest(0, 2, { state });
      const base = await w.untouched();

      const body = expectErrorResponse(
        await approve(yeuCauId, w.tokens.reception),
        409,
        'LICH_HEN_KHONG_CHO_DOI',
      );
      expect(body.chiTiet).toMatchObject({ trangThai: state });
      expect(await w.untouched()).toEqual(base);

      const res = await reject(yeuCauId, w.tokens.reception);
      expect(res.status).toBe(200);
      assertRejectedContract(res.body);
    },
  );

  it('khung giờ mong muốn đã bị người khác đặt: DUYỆT 409 KHUNG_GIO_DA_DAT (yêu cầu vẫn ChoDuyet, có thể thử khung giờ thay thế); TỪ CHỐI vẫn 200', async () => {
    const w = await world();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const [other] = await fx.patients(1);
    await w.book(2, { patientId: other!.account.taiKhoanId });
    const base = await w.untouched();

    expectErrorResponse(
      await approve(yeuCauId, w.tokens.reception),
      409,
      'KHUNG_GIO_DA_DAT',
    );
    expect(await w.untouched()).toEqual(base);
    expect(
      (
        await approve(yeuCauId, w.tokens.reception, {
          ghiChu: HANDLING_NOTE,
          khungGioId: w.slot(4),
        })
      ).status,
    ).toBe(200);
  });
});

describe('XDL-13, QDL-13 404 CÙNG thân cho "không có", "ngoài chi nhánh", "đã xử lý ở chi nhánh khác" và "sai dạng"', () => {
  it.each(['approve', 'reject'] as const)(
    '%s: Lễ tân chi nhánh KHÁC, Quản trị viên Chi nhánh KHÁC, id không tồn tại và id sai dạng ⇒ 404 YEU_CAU_DOI_LICH_KHONG_TON_TAI GIỐNG TỪNG KÝ TỰ; không ghi gì',
    async (action) => {
      const w = await world();
      const open = await w.openRequest(0, 2, { soLan: 2 });
      const handled = await w.openRequest(1, 3, { soLan: 2 });
      await w.reject(handled.yeuCauId);
      const base = await w.untouched();
      const texts: string[] = [];
      const attempts: [string, string, string][] = [
        [RECEPTION, open.yeuCauId, w.tokens.otherReception],
        [RECEPTION, handled.yeuCauId, w.tokens.otherReception],
        [ADMIN, open.yeuCauId, w.tokens.otherAdmin],
        [ADMIN, handled.yeuCauId, w.tokens.otherAdmin],
        [RECEPTION, '999999999', w.tokens.reception],
        [RECEPTION, 'abc', w.tokens.reception],
        [RECEPTION, '0', w.tokens.reception],
        [RECEPTION, '9223372036854775808', w.tokens.reception],
        [ADMIN, 'abc', w.tokens.all],
      ];
      for (const [base_, id, token] of attempts) {
        const res = await post(base_, id, action, token);
        expectErrorResponse(res, 404, 'YEU_CAU_DOI_LICH_KHONG_TON_TAI');
        texts.push(res.text);
      }
      expect(new Set(texts)).toEqual(new Set([NOT_FOUND_TEXT]));
      expect(await w.untouched()).toEqual(base);
    },
  );
});

describe('XDL-09, XDL-41, XDL-42 thân sai ⇒ 400 trước khi đụng DB; thân lỗi không lặp lại giá trị đã gửi', () => {
  const NOTE_CASES: [string, unknown][] = [
    ['thiếu hẳn', undefined],
    ['null', null],
    ['số JSON', 12],
    ['mảng', ['x']],
    ['rỗng', ''],
    ['toàn khoảng trắng', '    '],
    ['có ký tự NUL', 'Đã xếp\u0000lịch'],
    ['có tab', 'Đã xếp\tlịch'],
    ['256 đơn vị UTF-16', 'a'.repeat(256)],
    ['128 emoji (256 đơn vị)', '😀'.repeat(128)],
    ['giống mật khẩu', 'password=abc12345'],
  ];

  it.each(NOTE_CASES)(
    'ghiChu %s ⇒ 400 DU_LIEU_KHONG_HOP_LE, loi[ghiChu, LY_DO_BAT_BUOC], no-store, không ghi gì (cả duyệt và từ chối)',
    async (_name, value) => {
      const w = await world();
      const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
      const base = await w.untouched();
      const body = value === undefined ? {} : { ghiChu: value };

      for (const res of [
        await approve(yeuCauId, w.tokens.reception, body),
        await reject(yeuCauId, w.tokens.reception, body),
      ]) {
        const error = expectErrorResponse(res, 400, INVALID_DATA);
        expect(error.loi).toEqual([{ truong: 'ghiChu', ma: NOTE_REQUIRED }]);
        expect(res.headers['cache-control']).toBe('no-store');
        if (typeof value === 'string' && value.length > 6)
          expect(res.text).not.toContain(value);
      }
      expect(await w.untouched()).toEqual(base);
    },
  );

  it('XDL-41 khungGioId sai dạng, null, số JSON ⇒ 400 IS_BIGINT_ID; khoá lạ (chiNhanhId, yeuCauId, trangThai, lyDoYeuCau) và khungGioId ở thân TỪ CHỐI ⇒ 400 TRUONG_KHONG_DUOC_PHEP', async () => {
    const w = await world();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    const base = await w.untouched();

    for (const khungGioId of [
      '0',
      '012',
      '',
      null,
      12,
      '9223372036854775808',
    ]) {
      const error = expectErrorResponse(
        await approve(yeuCauId, w.tokens.reception, {
          ghiChu: HANDLING_NOTE,
          khungGioId,
        }),
        400,
        INVALID_DATA,
      );
      expect(error.loi).toEqual([{ truong: 'khungGioId', ma: 'IS_BIGINT_ID' }]);
    }
    for (const key of ['chiNhanhId', 'yeuCauId', 'trangThai', 'lyDoYeuCau']) {
      for (const call of [approve, reject]) {
        const error = expectErrorResponse(
          await call(yeuCauId, w.tokens.reception, {
            ghiChu: HANDLING_NOTE,
            [key]: '1',
          }),
          400,
          INVALID_DATA,
        );
        expect(error.loi).toEqual([{ truong: key, ma: NOT_ALLOWED }]);
      }
    }
    const rejectWithSlot = expectErrorResponse(
      await reject(yeuCauId, w.tokens.reception, {
        ghiChu: HANDLING_NOTE,
        khungGioId: w.slot(4),
      }),
      400,
      INVALID_DATA,
    );
    expect(rejectWithSlot.loi).toEqual([
      { truong: 'khungGioId', ma: NOT_ALLOWED },
    ]);
    expect(await w.untouched()).toEqual(base);
  });

  it('thân SAI đứng TRƯỚC 404 phạm vi (ValidationPipe chạy trước handler, 400 không lộ yêu cầu có tồn tại hay không); id đúng, thân đúng ở chi nhánh khác vẫn 404', async () => {
    const w = await world();
    const { yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
    for (const id of [yeuCauId, '999999999', 'abc'])
      expectErrorResponse(
        await approve(id, w.tokens.otherReception, {}),
        400,
        INVALID_DATA,
      );
    expectErrorResponse(
      await approve(yeuCauId, w.tokens.otherReception),
      404,
      'YEU_CAU_DOI_LICH_KHONG_TON_TAI',
    );
  });
});

describe('BDL-11, BDL-12, BDL-08 log sạch, danh sách trắng khoá, AuditError ra 500 không lộ gì', () => {
  it('BDL-11 log của mọi đường (200, 400, 404, 409) KHÔNG chứa ghi chú, mã lịch, email, SĐT, họ tên của Bệnh nhân và Lễ tân', async () => {
    const w = await world();
    const logs = captureLogsByLevel();
    const consoleSpies = (
      ['log', 'warn', 'error', 'info', 'debug'] as const
    ).map((name) =>
      vi.spyOn(console, name).mockImplementation(() => undefined),
    );
    const privateNote = 'Ghi chú riêng tư ZXQ-9137 của nhân viên';
    const a = await w.openRequest(0, 2, { soLan: 2 });
    const b = await w.openRequest(1, 3, { soLan: 2 });
    const note = { ghiChu: privateNote };
    const responses = [
      await approve(a.yeuCauId, w.tokens.reception, note),
      await approve(a.yeuCauId, w.tokens.reception, note),
      await approve(b.yeuCauId, w.tokens.reception, { ghiChu: '' }),
      await approve('999999999', w.tokens.reception, note),
      await reject(b.yeuCauId, w.tokens.reception, note),
      await reject(b.yeuCauId, w.tokens.reception, note),
    ];
    expect(responses.map((res) => res.status)).toEqual([
      200, 409, 400, 404, 200, 409,
    ]);

    const lines = [
      ...allLines(logs),
      ...consoleSpies.flatMap((spy) =>
        spy.mock.calls.map((call) => call.map(String).join(' ')),
      ),
    ].join('\n');
    const patient = w.patient.account;
    const receptionist = w.receptionist.account;
    for (const secret of [
      privateNote,
      'ZXQ-9137',
      a.lich.maLichHen,
      b.lich.maLichHen,
      patient.email,
      patient.soDienThoai,
      patient.hoTen,
      receptionist.email,
      receptionist.soDienThoai,
    ])
      expect(lines).not.toContain(secret);
  });

  it('BDL-12 mọi thân (200 VÀ lỗi, kể cả chiTiet): KHÔNG khoá kết thúc bằng Id, KHÔNG email, SĐT, tên, lý do khám hay giá; thân 200 không lặp lại ghi chú thô', async () => {
    const w = await world();
    const a = await w.openRequest(0, 2, { soLan: 2 });
    const b = await w.openRequest(1, 3, { soLan: 2 });
    const c = await w.openRequest(4, 5, { state: 'DaHuy' });
    const responses = [
      await approve(a.yeuCauId, w.tokens.reception),
      await approve(a.yeuCauId, w.tokens.reception),
      await approve(c.yeuCauId, w.tokens.reception),
      await reject(b.yeuCauId, w.tokens.reception),
      await approve('999999999', w.tokens.reception),
      await approve(b.yeuCauId, w.tokens.reception, {}),
    ];
    expect(responses.map((res) => res.status)).toEqual([
      200, 409, 409, 200, 404, 400,
    ]);

    const keys = new Set<string>();
    const strings: string[] = [];
    for (const res of responses) {
      for (const key of collectKeys(res.body)) keys.add(key);
      strings.push(...collectStrings(res.body));
    }
    expect([...keys].filter((key) => FORBIDDEN_KEY.test(key))).toEqual([]);
    expect(keys.has('lich_hen_id')).toBe(false);
    expect(keys.has('yeuCauId')).toBe(false);
    const patient = w.patient.account;
    const receptionist = w.receptionist.account;
    for (const text of strings) {
      for (const secret of [
        patient.email,
        patient.soDienThoai,
        patient.hoTen,
        receptionist.email,
        receptionist.soDienThoai,
        receptionist.hoTen,
        'Đau đầu',
        '200000.00',
        HANDLING_NOTE,
      ])
        expect(text).not.toContain(secret);
    }
  });

  it.each(['approve', 'reject'] as const)(
    'BDL-08 %s: Audit ném AuditError (giả lập ngay ở bản của app) ⇒ 500 LOI_HE_THONG có requestId, KHÔNG lộ ghi chú, mã lịch hay payload; log không có ghi chú; DB nguyên; gửi lại thành công',
    async (action) => {
      const w = await world();
      const logs = captureLogsByLevel();
      const { lich, yeuCauId } = await w.openRequest(0, 2, { soLan: 2 });
      const base = await w.untouched();
      const audit = h.app.get(AuditService);
      vi.spyOn(audit, 'record').mockRejectedValueOnce(
        new AuditError('AUDIT_WRITE_FAILED'),
      );
      const privateNote = 'Ghi chú riêng tư QWV-5521 của nhân viên';
      const call = action === 'approve' ? approve : reject;

      const failed = await call(yeuCauId, w.tokens.reception, {
        ghiChu: privateNote,
      });

      const body = expectErrorResponse(failed, 500, 'LOI_HE_THONG');
      const text = JSON.stringify(failed.body);
      for (const leaked of [privateNote, 'QWV-5521', lich.maLichHen])
        expect(text).not.toContain(leaked);
      expect(body.thongBao).not.toContain('AUDIT');
      expect(allLines(logs).join('\n')).not.toContain('QWV-5521');
      expect(await w.untouched()).toEqual(base);
      expect((await w.requestRow(yeuCauId)).trangThai).toBe('ChoDuyet');
      await w.expectSlot(0, 'DaDat');
      await w.expectSlot(2, 'ConTrong');

      const retry = await call(yeuCauId, w.tokens.reception);
      expect(retry.status).toBe(200);
      expect(await w.auditCount()).toBe(base.audit + 1);
      await assertBookingInvariants(h.db);
    },
  );
});

describe('NDL-05 mọi 4xx của B9 KHÔNG đổi nhật ký, thông báo hay thư', () => {
  it('một loạt 400, 404, 409 liên tiếp: số dòng nhật ký, thông báo và thư không đổi so với trước; chỉ lần thành công tăng đúng 1', async () => {
    const w = await world();
    const a = await w.openRequest(0, 2, { soLan: 2 });
    const done = await w.openRequest(1, 3, { soLan: 2 });
    await w.reject(done.yeuCauId);
    const before = await counts(w);

    for (const res of [
      await approve(done.yeuCauId, w.tokens.reception),
      await approve('abc', w.tokens.reception),
      await approve(a.yeuCauId, w.tokens.otherReception),
      await approve(a.yeuCauId, w.tokens.reception, {}),
      await reject(a.yeuCauId, w.tokens.reception, { ghiChu: '' }),
    ])
      expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await counts(w)).toEqual(before);

    expect((await approve(a.yeuCauId, w.tokens.reception)).status).toBe(200);
    expect(await counts(w)).toEqual({
      audit: before.audit + 1,
      thongBao: before.thongBao + 1,
      email: before.email + 1,
    });
  });
});

async function counts(w: HandleHttpWorld) {
  return {
    audit: await w.auditCount(),
    thongBao: await w.countRows('thong_bao'),
    email: await w.countRows('email_thong_bao'),
  };
}
