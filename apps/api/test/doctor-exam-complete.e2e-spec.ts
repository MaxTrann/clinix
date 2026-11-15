import request from 'supertest';
import { vi } from 'vitest';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import { assertBookingInvariants } from './../src/appointments/testing/invariants.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import {
  countRows,
  thongBaoRows,
} from './../src/doctor/examination/testing/exam-completion-stack.js';
import { assertExamInvariants } from './../src/doctor/examination/testing/exam-invariants.js';
import { examWorld } from './../src/doctor/examination/testing/exam-world.js';

// doctor-exam B1 — POST /doctor/appointments/:maLichHen/complete qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN 5.4, 5.11, 7.2 HTK-01, HTK-04, HTK-05, HTK-10; 7.7 QHK-01, QHK-02, QHK-12 phần của route này;
// TRACKING 12). Phần dịch vụ và SQL: src/doctor/examination/completion/exam-completion.int-spec.ts; đồng thời: exam-completion.concurrency.int-spec.ts. QHK-01, QHK-02, QHK-12 là mã của MỌI route khám bệnh: ở đây chỉ phần B1.
// CA QHK-01 khẳng định ĐÚNG 403 KHONG_DU_QUYEN ở trạng thái mà dịch vụ sẽ trả mã KHÁC nếu thiếu `@Roles` (Bệnh nhân, Lễ tân, QTV: lịch của "bác sĩ" không khớp ⇒ 404; thân lạ ⇒ 400; mã sai dạng ⇒ 404): bài học ĐA-9b.
// Dữ liệu giả (email đuôi example.com, mã lịch minh hoạ).
const PATH = '/doctor/appointments';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const NOT_FOUND = 'KHONG_TIM_THAY';
const INVALID_TRANSITION = 'CHUYEN_TRANG_THAI_KHONG_HOP_LE';
const ONLY_DOCTOR = 'CHI_BAC_SI_HOAN_THANH';
// Thân 404 chung (patient Q27): giống từng ký tự ở mọi nhánh, kể cả mã sai dạng bị pipe từ chối
const NOT_FOUND_TEXT =
  '{"maLoi":"KHONG_TIM_THAY","thongBao":"Không tìm thấy dữ liệu."}';
const CODE = 'CLX-20261110-CCC01';
const MISSING = 'CLX-20261110-ZZZZZ';
const MALFORMED = ['sai-dang', 'CLX-20261110-CCC0I', `${CODE}-THUA`];

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
// `code` là phần SAU `/doctor/appointments/`, viết thẳng để thử cả mã sai dạng; thân tuỳ chọn (không gửi thân khi `body` là undefined)
const complete = (code: string, accessToken?: string, body?: object) => {
  const req = request(h.app.getHttpServer()).post(`${PATH}/${code}/complete`);
  const withBody = body === undefined ? req : req.send(body);
  return accessToken
    ? withBody.set('Authorization', `Bearer ${accessToken}`)
    : withBody;
};

/** Thế giới khám bệnh (một chi nhánh, bác sĩ phụ trách, Bệnh nhân, Lễ tân, hai Quản trị viên) kèm token và MỘT lịch DaTiepDon mã `CODE`. */
async function world() {
  const w = await examWorld(h.db, fx);
  const lich = await w.w.booked('DaTiepDon', 0, { maLichHen: CODE });
  const stranger = (await fx.admin.doctor(w.w.branch)).profile.taiKhoanId;
  return {
    ...w,
    lich,
    doctor: await tokenOf(w.doctorId),
    stranger: await tokenOf(stranger),
    patient: await tokenOf(w.patientId),
    reception: await tokenOf(w.w.receptionist.account.taiKhoanId),
    system: await tokenOf(w.w.systemAdmin.account.taiKhoanId),
    branch: await tokenOf(w.w.branchAdmin.account.taiKhoanId),
  };
}
type World = Awaited<ReturnType<typeof world>>;
const stateOf = async (w: World) =>
  (await w.w.snapshot(w.lich, 0)).row.trangThai;

describe('POST …/complete — thành công', () => {
  it('HTK-01, QHK-12 Bác sĩ phụ trách hoàn thành lịch DaTiepDon: 200 đúng HAI khoá { maLichHen, trangThai: HoanThanh }; Cache-Control no-store; lịch HoanThanh; khung giờ DaDat; MỘT thông báo cho Bệnh nhân; INV và IVK', async () => {
    const w = await world();
    const res = await complete(CODE, w.doctor);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ maLichHen: CODE, trangThai: 'HoanThanh' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(await stateOf(w)).toBe('HoanThanh');
    await w.w.expectSlot(0, 'DaDat', null);
    expect(await thongBaoRows(h.db)).toMatchObject([
      {
        taiKhoanId: w.patientId,
        lichHenId: w.lich.lichHenId,
        loai: 'LichHenHoanThanh',
      },
    ]);
    await assertBookingInvariants(h.db);
    await assertExamInvariants(h.db);
  });

  it('thân rỗng `{}` và mã viết thường đều được (pipe chuẩn hoá chữ hoa): 200', async () => {
    const w = await world();
    const res = await complete(CODE.toLowerCase(), w.doctor, {});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ maLichHen: CODE, trangThai: 'HoanThanh' });
  });
});

describe('HTK-04 trạng thái sai ⇒ 409; bấm lần hai', () => {
  it('lịch DaXacNhan: 409 CHUYEN_TRANG_THAI_KHONG_HOP_LE kèm { tuTrangThai, denTrangThai }; bấm hai lần liên tiếp: lần hai 409 với tuTrangThai HoanThanh; một thông báo; no-store ở cả hai', async () => {
    const w = await world();
    const confirmed = await w.w.booked('DaXacNhan', 1, {
      maLichHen: 'CLX-20261110-CCC02',
    });
    const res = await complete(confirmed.maLichHen, w.doctor);
    const body = expectErrorResponse(res, 409, INVALID_TRANSITION);
    expect(body.chiTiet).toEqual({
      tuTrangThai: 'DaXacNhan',
      denTrangThai: 'HoanThanh',
    });
    expect(res.headers['cache-control']).toBe('no-store');

    expect((await complete(CODE, w.doctor)).status).toBe(200);
    const second = await complete(CODE, w.doctor);
    expect(
      expectErrorResponse(second, 409, INVALID_TRANSITION).chiTiet,
    ).toEqual({ tuTrangThai: 'HoanThanh', denTrangThai: 'HoanThanh' });
    expect(second.headers['cache-control']).toBe('no-store');
    expect(await thongBaoRows(h.db, 'LichHenHoanThanh')).toHaveLength(1);
  });
});

describe('HTK-05 không phải của bác sĩ này ⇒ 404 CÙNG THÂN', () => {
  it('lịch của bác sĩ khác, mã không tồn tại, mã sai dạng: thân giống từng ký tự (kể cả bác sĩ khác ở lịch DaTiepDon); no-store; lịch không đổi', async () => {
    const w = await world();
    const attempts = [
      complete(CODE, w.stranger),
      complete(MISSING, w.doctor),
      ...MALFORMED.map((code) => complete(code, w.doctor)),
    ];
    for (const res of await Promise.all(attempts)) {
      expectErrorResponse(res, 404, NOT_FOUND);
      expect(res.text).toBe(NOT_FOUND_TEXT);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(await stateOf(w)).toBe('DaTiepDon');
    expect(await countRows(h.db, 'thong_bao')).toBe(0);
  });
});

describe('QHK-01, QHK-02, QHK-12 quyền và thân (phần B1)', () => {
  it('QHK-01 chưa đăng nhập 401; Bệnh nhân, Lễ tân, QTV Chi nhánh, QTV Toàn hệ thống ĐÚNG 403 KHONG_DU_QUYEN với mã đúng, mã không tồn tại, mã SAI DẠNG và thân lạ; lịch không đổi', async () => {
    const w = await world();
    expectErrorResponse(await complete(CODE), 401, NOT_LOGGED_IN);
    for (const token of [w.patient, w.reception, w.branch, w.system])
      for (const [code, body] of [
        [CODE, undefined],
        [MISSING, undefined],
        [MALFORMED[0] as string, undefined],
        [CODE, { bacSiId: '1' }],
      ] as const)
        expectErrorResponse(await complete(code, token, body), 403, FORBIDDEN);
    expect(await stateOf(w)).toBe('DaTiepDon');
    expect(await countRows(h.db, 'thong_bao')).toBe(0);
  });

  it('QHK-02, QHK-12 khoá lạ ở thân (`bacSiId`, `lichHenId`, `benhNhanId`) ⇒ 400 DU_LIEU_KHONG_HOP_LE kèm loi[{ truong, ma: TRUONG_KHONG_DUOC_PHEP }]; no-store; KHÔNG hoàn thành; thân lỗi không lặp lại giá trị đã gửi', async () => {
    const w = await world();
    for (const key of ['bacSiId', 'lichHenId', 'benhNhanId']) {
      const res = await complete(CODE, w.doctor, { [key]: 'GIATRI-NHAY-CAM' });
      const body = expectErrorResponse(res, 400, INVALID_DATA);
      expect(body.loi).toEqual([{ truong: key, ma: NOT_ALLOWED }]);
      expect(res.text).not.toContain('GIATRI-NHAY-CAM');
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(await stateOf(w)).toBe('DaTiepDon');
  });
});

describe('HTK-10 chọn đích HoanThanh qua route của booking (Lễ tân, Quản trị viên) ⇒ 409 CHI_BAC_SI_HOAN_THANH', () => {
  it('Lễ tân POST …/status và Quản trị viên POST …/override-status với trangThai HoanThanh trên lịch DaTiepDon: 409 CHI_BAC_SI_HOAN_THANH; lịch không đổi; không thông báo (chạy với AppModule đủ module khám bệnh)', async () => {
    const w = await world();
    const reception = await request(h.app.getHttpServer())
      .post(`/reception/appointments/${CODE}/status`)
      .set('Authorization', `Bearer ${w.reception}`)
      .send({ trangThai: 'HoanThanh' });
    expectErrorResponse(reception, 409, ONLY_DOCTOR);
    for (const token of [w.system, w.branch]) {
      const override = await request(h.app.getHttpServer())
        .post(`/admin/appointments/${CODE}/override-status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ trangThai: 'HoanThanh', lyDo: 'Thử đích Hoàn thành' });
      expectErrorResponse(override, 409, ONLY_DOCTOR);
    }
    expect(await stateOf(w)).toBe('DaTiepDon');
    expect(await countRows(h.db, 'thong_bao')).toBe(0);
  });
});
