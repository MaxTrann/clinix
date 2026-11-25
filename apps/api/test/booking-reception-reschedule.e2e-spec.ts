import request from 'supertest';
import { vi } from 'vitest';
import { AuditError } from './../src/audit/audit-error.js';
import { AuditService } from './../src/audit/audit.service.js';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import { assertBookingInvariants } from './../src/appointments/testing/invariants.js';
import { assertRescheduledContract } from './../src/appointments/testing/patient-reschedule-contract.js';
import { assertReceptionPreviewContract } from './../src/appointments/testing/reception-reschedule-contract.js';
import {
  PROXY_REASON,
  receptionRescheduleWorld,
} from './../src/appointments/testing/reception-reschedule-world.js';
import { insertRescheduleRequest } from './../src/appointments/testing/reschedule-notification-world.js';
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

// reschedule B7 — `GET …/reschedule-preview` và `POST …/reschedule` của Lễ tân đổi hộ qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN reschedule 5.8, 7.3, 7.6, 7.8, 7.9, 7.10; TRACKING reschedule 1.11).
// Phần dịch vụ và SQL: `reschedule/reception-reschedule.service.int-spec.ts`, `…audit.int-spec.ts`, `…preview.service.int-spec.ts`, `…concurrency.int-spec.ts`. Ma trận vai trò, 401, no-store, thứ tự guard:
// `booking-reception-reschedule-roles.e2e-spec.ts`. File này: DLO-01, DLO-02, HDL-30 (đổi hộ 201, Audit, thông báo, hợp đồng), DLO-07, DLO-20 (DTO, chi nhánh chỉ từ máy chủ), QDL-02 (404 cùng thân), DLO-05, DLO-15
// (tranh chấp, bấm hai lần), HDL-28 (preview "đọc NGHIÊM"), NDL-05 (không ghi nhật ký khi bị từ chối), BDL-01, BDL-02, BDL-08 (log, khoá, AuditError ra 500). Mã DLO-15, DLO-20, HDL-28, HDL-30, BDL-08 là
// `[đề xuất]`. Dữ liệu giả (email đuôi example.com). Đồng hồ giả = T0 (02/11/2026 08:00 giờ Việt Nam): ca đổi giờ tạo token SAU khi đặt giờ.
const BASE = '/reception/appointments';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const REASON_REQUIRED = 'LY_DO_BAT_BUOC';
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
// `code` là phần SAU `/reception/appointments/`, viết thẳng (để thử cả mã sai dạng)
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

/** Thế giới đổi hộ (Lễ tân của chi nhánh, Bệnh nhân kèm hồ sơ người thân, bác sĩ, 8 khung giờ ngày 10/11, `soLanTuDoiLichToiDa` 2) và token của Lễ tân. */
async function world() {
  const w = await receptionRescheduleWorld(h.db, fx);
  return { ...w, token: await tokenOf(w.receptionId) };
}
type World = Awaited<ReturnType<typeof world>>;

const bodyOf = (res: { body: unknown }) => res.body as Record<string, unknown>;
const slotBody = (w: World, index: number, extra: object = {}) => ({
  khungGioId: w.slot(index),
  lyDo: PROXY_REASON,
  ...extra,
});

describe('DLO-01, DLO-02, HDL-30 POST đổi hộ qua HTTP', () => {
  it('201 DaDoi đúng hợp đồng, no-store; lịch mới DaXacNhan nối chuỗi và bộ đếm giữ nguyên, lịch cũ DaDoiLich, khung giờ đổi chỗ; đúng MỘT dòng Audit DoiLichHo, MỘT thông báo cho Bệnh nhân; nhân sự vẫn xem được cả hai lịch; INV', async () => {
    const w = await world();
    const old = await w.book(0, { soLan: 2 });

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
    expect(Number(created.soLan)).toBe(2);
    expect((await w.rowOf(old.lichHenId)).trangThai).toBe('DaDoiLich');
    await w.expectSlot(0, 'ConTrong');
    await w.expectSlot(2, 'DaDat');
    const audit = await w.auditRows();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      taiKhoanId: w.receptionId,
      hanhDong: 'DoiLichHo',
      loaiDoiTuong: 'lich_hen',
      maDoiTuong: old.lichHenId,
      ketQua: 'ThanhCong',
    });
    expect(await w.countRows('thong_bao')).toBe(1);
    await assertBookingInvariants(h.db);
    // nhân sự thấy được cả lịch cũ (DaDoiLich) lẫn lịch mới, khác Bệnh nhân (Q31)
    const oldDetail = await detail(old.maLichHen, w.token);
    expect(oldDetail.status).toBe(200);
    expect(bodyOf(oldDetail).trangThai).toBe('DaDoiLich');
    expect((await detail(body.lichHenMoi.maLichHen, w.token)).status).toBe(200);
  });

  it('HDL-30 thân LỖI (409 khung giờ đã đặt, 409 lịch đã đổi) đúng dạng chuẩn; chiTiet chỉ chứa trangThai; không id nội bộ, không lý do', async () => {
    const w = await world();
    const old = await w.book(0);
    const other = await fx.admin.patient();
    await w.book(3, { patientId: other.account.taiKhoanId });
    const taken = await reschedule(old.maLichHen, w.token, slotBody(w, 3));
    const body = expectErrorResponse(taken, 409, 'KHUNG_GIO_DA_DAT');
    expect(body.chiTiet).toBeUndefined();
    await reschedule(old.maLichHen, w.token, slotBody(w, 2));
    const replaced = await reschedule(old.maLichHen, w.token, slotBody(w, 2));
    const replacedBody = expectErrorResponse(
      replaced,
      409,
      'LICH_HEN_KHONG_CHO_DOI',
    );
    expect(replacedBody.chiTiet).toEqual({ trangThai: 'DaDoiLich' });
    const text = JSON.stringify([taken.body, replaced.body]);
    expect(text).not.toContain(PROXY_REASON);
    expect(text).not.toContain(old.lichHenId);
  });

  it('DLO-15 bấm hai lần liên tiếp cùng thân: 201 rồi 409 LICH_HEN_KHONG_CHO_DOI; đúng một lịch mới, một dòng Audit, một thông báo', async () => {
    const w = await world();
    const old = await w.book(0);
    const first = await reschedule(old.maLichHen, w.token, slotBody(w, 2));
    const second = await reschedule(old.maLichHen, w.token, slotBody(w, 2));
    expect([first.status, second.status]).toEqual([201, 409]);
    expect(await w.auditCount()).toBe(1);
    expect(await w.countRows('thong_bao')).toBe(1);
    await assertBookingInvariants(h.db);
  });
});

describe('DLO-07, DLO-20 thân và query: lyDo bắt buộc, chi nhánh chỉ từ máy chủ', () => {
  it.each([
    ['thiếu lyDo', { khungGioId: 'SLOT' }, REASON_REQUIRED],
    ['lyDo rỗng', { khungGioId: 'SLOT', lyDo: '' }, REASON_REQUIRED],
    [
      'lyDo toàn khoảng trắng',
      { khungGioId: 'SLOT', lyDo: '   ' },
      REASON_REQUIRED,
    ],
    [
      'lyDo 256 ký tự',
      { khungGioId: 'SLOT', lyDo: 'a'.repeat(256) },
      REASON_REQUIRED,
    ],
    ['lyDo là số', { khungGioId: 'SLOT', lyDo: 12 }, REASON_REQUIRED],
    [
      'lyDo giống bí mật',
      { khungGioId: 'SLOT', lyDo: 'password=abc12345' },
      REASON_REQUIRED,
    ],
    [
      'khoá lạ lyDoYeuCau',
      { khungGioId: 'SLOT', lyDo: PROXY_REASON, lyDoYeuCau: PROXY_REASON },
      NOT_ALLOWED,
    ],
    [
      'khoá lạ chiNhanhId',
      { khungGioId: 'SLOT', lyDo: PROXY_REASON, chiNhanhId: '1' },
      NOT_ALLOWED,
    ],
    [
      'khoá lạ benhNhanId',
      { khungGioId: 'SLOT', lyDo: PROXY_REASON, benhNhanId: '1' },
      NOT_ALLOWED,
    ],
  ])(
    '%s ⇒ 400 DU_LIEU_KHONG_HOP_LE, DB nguyên (không Audit, không thông báo)',
    async (_name, template, ma) => {
      const w = await world();
      const old = await w.book(0);
      const before = await w.untouched();
      const payload = JSON.parse(
        JSON.stringify(template).replace('SLOT', w.slot(2)),
      ) as object;
      const res = await reschedule(old.maLichHen, w.token, payload);
      const body = expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE');
      expect(body.loi?.map((entry) => entry.ma)).toEqual([ma]);
      expect(await w.untouched()).toEqual(before);
    },
  );

  it('mã sai dạng + thân sai ⇒ 404 của pipe (đứng TRƯỚC 400 của DTO), thân giống từng ký tự; query có khoá lạ chiNhanhId ⇒ 400', async () => {
    const w = await world();
    const old = await w.book(0);
    for (const code of MALFORMED) {
      const res = await reschedule(code, w.token, {
        khungGioId: 'sai',
        chiNhanhId: '1',
      });
      expect(res.status).toBe(404);
      expect(res.text).toBe(NOT_FOUND_TEXT);
      expect((await preview(code, w.token, '?chiNhanhId=1')).text).toBe(
        NOT_FOUND_TEXT,
      );
    }
    const res = await preview(old.maLichHen, w.token, '?chiNhanhId=1');
    expect(expectErrorResponse(res, 400, 'DU_LIEU_KHONG_HOP_LE').loi).toEqual([
      { truong: 'chiNhanhId', ma: NOT_ALLOWED },
    ]);
  });
});

describe('QDL-02, DLO-03 phạm vi chi nhánh: 404 cùng thân, đứng TRƯỚC trạng thái và thân', () => {
  it('Lễ tân chi nhánh khác: 404 giống HỆT "không tồn tại" và "mã sai dạng" cho cả hai route, kể cả khi thân hợp lệ và khi lịch DaDoiLich; DB nguyên. Lễ tân đúng chi nhánh: lịch DaDoiLich ⇒ 409', async () => {
    const w = await world();
    const old = await w.book(0);
    const replaced = await fx.appointmentIn('DaDoiLich', {
      doctor: w.doctor,
      khungGioId: w.slot(4),
      patientId: w.patientId,
    });
    const other = await w.otherBranch();
    const otherToken = await tokenOf(other.receptionId);
    const before = await w.untouched();

    for (const code of [old.maLichHen, replaced.maLichHen, MISSING]) {
      const p = await preview(code, otherToken, `?khungGioId=${w.slot(2)}`);
      const q = await reschedule(code, otherToken, slotBody(w, 2));
      expect([p.status, q.status]).toEqual([404, 404]);
      expect([p.text, q.text]).toEqual([NOT_FOUND_TEXT, NOT_FOUND_TEXT]);
      expect(p.headers['cache-control']).toBe('no-store');
      expect(q.headers['cache-control']).toBe('no-store');
    }
    expect(await w.untouched()).toEqual(before);

    const inside = await reschedule(
      replaced.maLichHen,
      w.token,
      slotBody(w, 2),
    );
    expectErrorResponse(inside, 409, 'LICH_HEN_KHONG_CHO_DOI');
  });

  it('DLO-20 phạm vi theo DB HIỆN TẠI chứ không theo token: Lễ tân bị chuyển sang chi nhánh khác thì cùng token cũ không còn thấy lịch của chi nhánh cũ (404 cùng thân, cả hai route)', async () => {
    const w = await world();
    const old = await w.book(0);
    expect((await preview(old.maLichHen, w.token)).status).toBe(200);
    const other = await w.otherBranch();
    await h.db.query(
      'UPDATE le_tan SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
      [other.branchId, w.receptionId],
    );
    const before = await w.untouched();

    const p = await preview(old.maLichHen, w.token);
    const q = await reschedule(old.maLichHen, w.token, slotBody(w, 2));

    expect([p.text, q.text]).toEqual([NOT_FOUND_TEXT, NOT_FOUND_TEXT]);
    expect(await w.untouched()).toEqual(before);
  });
});

describe('DLO-05, NDL-05 khung giờ tranh chấp và mọi từ chối không ghi nhật ký', () => {
  it('khung giờ đích đã có người đặt ⇒ 409 KHUNG_GIO_DA_DAT; 0 dòng nhật ký, 0 thông báo, 0 thư; khung giờ cũ vẫn DaDat', async () => {
    const w = await world();
    const old = await w.book(0);
    const other = await fx.admin.patient();
    await w.book(2, { patientId: other.account.taiKhoanId });
    const before = await w.untouched();
    const res = await reschedule(old.maLichHen, w.token, slotBody(w, 2));
    expectErrorResponse(res, 409, 'KHUNG_GIO_DA_DAT');
    expect(await w.untouched()).toEqual(before);
    await w.expectSlot(0, 'DaDat');
    await assertBookingInvariants(h.db);
  });
});

describe('HDL-28 preview qua HTTP: hợp đồng "đọc NGHIÊM" trên mọi thân 200', () => {
  it('đổi được (không và có khungGioId), khung giờ hợp lệ và không hợp lệ, lịch có yêu cầu chờ, lịch DaDoiLich, lịch DaHuy: 200, no-store, đúng khoá, không loai, soLanDaDoi, soLanToiDa', async () => {
    const w = await world();
    const open = await w.book(0, { soLan: 2 });
    const pending = await w.book(1);
    await insertRescheduleRequest(h.db, {
      lichHenId: pending.lichHenId,
      khungGioMongMuonId: w.slot(7),
    });
    const dead = await fx.appointmentIn('DaHuy', {
      doctor: w.doctor,
      khungGioId: w.slot(4),
      patientId: w.patientId,
    });
    const replaced = await fx.appointmentIn('DaDoiLich', {
      doctor: w.doctor,
      khungGioId: w.slot(5),
      patientId: w.patientId,
    });
    const other = await fx.admin.patient();
    await w.book(3, { patientId: other.account.taiKhoanId });

    const responses = [
      await preview(open.maLichHen, w.token),
      await preview(open.maLichHen, w.token, `?khungGioId=${w.slot(2)}`),
      await preview(open.maLichHen, w.token, `?khungGioId=${w.slot(3)}`),
      await preview(open.maLichHen, w.token, `?khungGioId=${w.slot(0)}`),
      await preview(pending.maLichHen, w.token),
      await preview(dead.maLichHen, w.token),
      await preview(replaced.maLichHen, w.token),
    ];

    expect(responses.map((res) => res.status)).toEqual([
      200, 200, 200, 200, 200, 200, 200,
    ]);
    for (const res of responses) {
      expect(res.headers['cache-control']).toBe('no-store');
      assertReceptionPreviewContract(res.body);
    }
    const [plain, free, taken, same, withRequest, cancelled, swapped] =
      responses.map(bodyOf);
    expect(plain).toMatchObject({ choPhepDoi: true, lichMoi: null });
    expect(free?.lichMoi).toMatchObject({
      hopLe: true,
      thoiGian: SLOT_NINE_ISO,
    });
    expect(taken?.lichMoi).toMatchObject({
      hopLe: false,
      lyDoKhongHopLe: 'KHUNG_GIO_DA_DAT',
    });
    expect(same?.lichMoi).toMatchObject({
      hopLe: false,
      lyDoKhongHopLe: 'KHUNG_GIO_TRUNG_LICH_CU',
    });
    expect(withRequest).toMatchObject({
      choPhepDoi: true,
      coYeuCauChoDuyet: true,
    });
    expect(cancelled).toMatchObject({
      choPhepDoi: false,
      lyDoKhongDoi: 'LICH_HEN_KHONG_CHO_DOI',
    });
    expect(swapped).toMatchObject({
      choPhepDoi: false,
      lyDoKhongDoi: 'LICH_HEN_KHONG_CHO_DOI',
    });
  });

  it('khung giờ không tồn tại ⇒ 404 KHUNG_GIO_KHONG_TON_TAI; thiếu cấu hình ⇒ 409 HE_THONG_CHUA_CAU_HINH ở cả hai route (chi tiết lịch vẫn 200)', async () => {
    const w = await world();
    const old = await w.book(0);
    expectErrorResponse(
      await preview(old.maLichHen, w.token, '?khungGioId=987654321'),
      404,
      'KHUNG_GIO_KHONG_TON_TAI',
    );
    await h.db.query('DELETE FROM cau_hinh_he_thong');
    expectErrorResponse(
      await preview(old.maLichHen, w.token),
      409,
      'HE_THONG_CHUA_CAU_HINH',
    );
    expectErrorResponse(
      await reschedule(old.maLichHen, w.token, slotBody(w, 2)),
      409,
      'HE_THONG_CHUA_CAU_HINH',
    );
    expect((await detail(old.maLichHen, w.token)).status).toBe(200);
  });
});

describe('BDL-01, BDL-02, BDL-08 log sạch, danh sách trắng khoá, AuditError ra 500 không lộ gì', () => {
  it('log của mọi đường (201, 400, 404, 409) KHÔNG chứa lý do, email, SĐT, họ tên của Bệnh nhân và Lễ tân', async () => {
    const w = await world();
    const logs = captureLogsByLevel();
    const consoleSpies = (
      ['log', 'warn', 'error', 'info', 'debug'] as const
    ).map((name) =>
      vi.spyOn(console, name).mockImplementation(() => undefined),
    );
    const privateReason = 'Lý do riêng tư ZXQ-9137 của bệnh nhân';
    const old = await w.book(0);
    const replacedAlready = await w.book(1);
    await reschedule(replacedAlready.maLichHen, w.token, slotBody(w, 3));
    const responses = [
      await reschedule(
        old.maLichHen,
        w.token,
        slotBody(w, 2, { lyDo: privateReason }),
      ),
      await reschedule(
        old.maLichHen,
        w.token,
        slotBody(w, 2, { lyDo: privateReason }),
      ),
      await reschedule(
        replacedAlready.maLichHen,
        w.token,
        slotBody(w, 4, { lyDo: privateReason }),
      ),
      await reschedule(old.maLichHen, w.token, { khungGioId: w.slot(2) }),
      await reschedule(
        MISSING,
        w.token,
        slotBody(w, 2, { lyDo: privateReason }),
      ),
      await preview(old.maLichHen, w.token, `?khungGioId=${w.slot(4)}`),
    ];
    expect(responses.map((res) => res.status)).toEqual([
      201, 409, 409, 400, 404, 200,
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
      privateReason,
      'ZXQ-9137',
      patient.email,
      patient.soDienThoai,
      patient.hoTen,
      receptionist.email,
      receptionist.soDienThoai,
    ])
      expect(lines).not.toContain(secret);
  });

  it('BDL-02 mọi thân (thành công VÀ lỗi, kể cả chiTiet): không khoá lich_hen_id, yeuCauId hay khoá kết thúc bằng Id nào khác ngoài bacSiId, khungGioId; không email, SĐT, tên của Bệnh nhân và Lễ tân', async () => {
    const w = await world();
    const open = await w.book(0);
    const pending = await w.book(1);
    await insertRescheduleRequest(h.db, {
      lichHenId: pending.lichHenId,
      khungGioMongMuonId: w.slot(7),
    });
    const responses = [
      await preview(open.maLichHen, w.token),
      await preview(open.maLichHen, w.token, `?khungGioId=${w.slot(2)}`),
      await preview(pending.maLichHen, w.token),
      await preview(MISSING, w.token),
      await reschedule(open.maLichHen, w.token, slotBody(w, 2)),
      await reschedule(open.maLichHen, w.token, slotBody(w, 2)),
      await reschedule(open.maLichHen, w.token, { khungGioId: w.slot(3) }),
      await reschedule(MISSING, w.token, slotBody(w, 3)),
    ];
    expect(responses.map((res) => res.status)).toEqual([
      200, 200, 200, 404, 201, 409, 400, 404,
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
    for (const account of [w.patient.account, w.receptionist.account])
      for (const text of strings) {
        expect(text).not.toContain(account.email);
        expect(text).not.toContain(account.soDienThoai);
        expect(text).not.toContain(account.hoTen);
      }
  });

  it('BDL-08 Audit ném AuditError (giả lập ngay ở bản của app) ⇒ 500 LOI_HE_THONG có requestId, KHÔNG lộ lý do, mã lịch hay payload; log chỉ tên lớp lỗi; DB nguyên; gửi lại thành công (không kẹt trạng thái)', async () => {
    const w = await world();
    const logs = captureLogsByLevel();
    const old = await w.book(0);
    const before = await w.untouched();
    const audit = h.app.get(AuditService);
    vi.spyOn(audit, 'record').mockRejectedValueOnce(
      new AuditError('AUDIT_WRITE_FAILED'),
    );
    const privateReason = 'Lý do riêng tư QWV-5521 của bệnh nhân';

    const failed = await reschedule(
      old.maLichHen,
      w.token,
      slotBody(w, 2, { lyDo: privateReason }),
    );

    const body = expectErrorResponse(failed, 500, 'LOI_HE_THONG');
    const text = JSON.stringify(failed.body);
    for (const leaked of [privateReason, 'QWV-5521', old.maLichHen])
      expect(text).not.toContain(leaked);
    expect(body.thongBao).not.toContain('AUDIT');
    expect(allLines(logs).join('\n')).not.toContain('QWV-5521');
    expect(await w.untouched()).toEqual(before);
    await w.expectSlot(0, 'DaDat');
    await w.expectSlot(2, 'ConTrong');

    const retry = await reschedule(old.maLichHen, w.token, slotBody(w, 2));
    expect(retry.status).toBe(201);
    expect(await w.auditCount()).toBe(before.audit + 1);
    await assertBookingInvariants(h.db);
  });
});
