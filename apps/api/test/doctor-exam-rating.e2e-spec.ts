import request from 'supertest';
import { vi } from 'vitest';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import { assertBookingInvariants } from './../src/appointments/testing/invariants.js';
import { statusWorld } from './../src/appointments/testing/status-world.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { ExamFixtures } from './../src/doctor/examination/testing/exam-fixtures.js';
import { assertExamInvariants } from './../src/doctor/examination/testing/exam-invariants.js';
import {
  keysDeep,
  seedVisits,
} from './../src/doctor/examination/testing/patient-exam-stack.js';
import {
  captureProcessLogs,
  NOT_COMPLETED_STATES,
  ratingBody,
  ratingRows,
  untouchedByRating,
} from './../src/doctor/examination/testing/rating-stack.js';

// doctor-exam B6 — POST /patient/exam-records/:maLichHen/rating qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN 5.7, 5.11; 7.4 DGB-01…DGB-06, DGB-08, DGB-10, DGB-19; 7.7 QHK-01, QHK-03, QHK-05, QHK-12; 7.11 BDK-01 phần của route này).
// Phần dịch vụ và SQL: src/doctor/examination/rating/rating.int-spec.ts; đồng thời: rating.concurrency.int-spec.ts. QHK-01, QHK-12, BDK-01 là mã của MỌI route khám bệnh: ở đây chỉ phần B6.
// CA QHK-01 khẳng định ĐÚNG 403 KHONG_DU_QUYEN ở trạng thái mà dịch vụ sẽ trả mã KHÁC nếu thiếu `@Roles` (lịch người khác ⇒ 404; thân lạ ⇒ 400; mã sai dạng ⇒ 404): bài học ĐA-9b. `Cache-Control: no-store` được khẳng định ở 201, 400, 404, 409
// (QHK-12 theo PLAN 7.7); 401 và 403 do guard trả TRƯỚC khi `@Header` áp (Nest áp header sau guard) nên không khẳng định. Dữ liệu giả (email đuôi example.com, mã lịch minh hoạ).
const PATH = '/patient/exam-records';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const NOT_COMPLETED = 'LICH_HEN_CHUA_HOAN_THANH';
const ALREADY_RATED = 'DA_DANH_GIA';
const NOT_FOUND = 'KHONG_TIM_THAY';
// Thân 404 chung (patient Q27): giống từng ký tự ở mọi nhánh, kể cả mã sai dạng bị pipe từ chối
const NOT_FOUND_TEXT =
  '{"maLoi":"KHONG_TIM_THAY","thongBao":"Không tìm thấy dữ liệu."}';
const MISSING = 'CLX-20261110-ZZZZZ';
const MALFORMED = ['sai-dang', 'CLX-20261110-CCC0I', 'CLX-20261110-DGB01-THUA'];
/** 09:00 ngày 10/11/2026 giờ VN (ngày khám của các lịch trong thế giới test) */
const NOW = new Date('2026-11-10T09:00:00+07:00');
const NONE_TOUCHED = { nhatKy: 0, thongBao: 0, email: 0, hoSoKham: 0 };

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
// `code` là phần SAU `/patient/exam-records/`, viết thẳng để thử cả mã sai dạng; thân tuỳ chọn (không gửi thân khi `body` là undefined)
const post = (code: string, accessToken?: string, body?: object) => {
  const req = request(h.app.getHttpServer()).post(`${PATH}/${code}/rating`);
  const withBody = body === undefined ? req : req.send(body);
  return accessToken
    ? withBody.set('Authorization', `Bearer ${accessToken}`)
    : withBody;
};
const get = (path: string, accessToken: string) =>
  request(h.app.getHttpServer())
    .get(`${PATH}${path}`)
    .set('Authorization', `Bearer ${accessToken}`);

/** Thế giới (một chi nhánh, bác sĩ phụ trách, Bệnh nhân kèm hồ sơ người thân, Bệnh nhân thứ hai, Lễ tân, hai Quản trị viên) kèm token. Đồng hồ ở NOW (ngày khám). */
async function world() {
  vi.setSystemTime(NOW);
  const w = await statusWorld(h.db, fx);
  return {
    w,
    exam: new ExamFixtures(h.db),
    patient: await tokenOf(w.patientId),
    second: await tokenOf(w.secondPatientId),
    doctor: await tokenOf(w.doctor.account.taiKhoanId),
    reception: await tokenOf(w.receptionId),
    system: await tokenOf(w.systemAdmin.account.taiKhoanId),
    branch: await tokenOf(w.branchAdmin.account.taiKhoanId),
  };
}
type World = Awaited<ReturnType<typeof world>>;

/** Một lịch `HoanThanh` của Bệnh nhân (khung giờ ngày 11/11/2026 trở đi, đi tiếp ngày mỗi lần gọi trong cùng một ca). */
async function mine(t: World) {
  return (await seedVisits(h.db, fx, t.w, { mine: {} })).mine;
}
const expectInvariants = async () => {
  await assertBookingInvariants(h.db);
  await assertExamInvariants(h.db);
};

describe('DGB-01, QHK-12 thành công', () => {
  it('201 đúng BA khoá { soSao, nhanXet, thoiDiemTao }; Cache-Control no-store; một dòng bi_an = 0 và ly_do_an NULL; lịch vẫn HoanThanh; KHÔNG nhật ký, thông báo, email, hồ sơ; INV và IVK', async () => {
    const t = await world();
    const lich = await mine(t);
    const res = await post(
      lich.maLichHen,
      t.patient,
      ratingBody({ soSao: 4, nhanXet: 'Tốt' }),
    );
    expect(res.status).toBe(201);
    expect(Object.keys(res.body as object).sort()).toEqual([
      'nhanXet',
      'soSao',
      'thoiDiemTao',
    ]);
    expect(res.body).toEqual({
      soSao: 4,
      nhanXet: 'Tốt',
      thoiDiemTao: NOW.toISOString(),
    });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(await ratingRows(h.db)).toEqual([
      {
        danhGiaId: expect.any(String) as string,
        lichHenId: lich.lichHenId,
        soSao: 4,
        nhanXet: 'Tốt',
        biAn: 0,
        lyDoAn: null,
        thoiDiemTao: '2026-11-10 09:00:00',
      },
    ]);
    const state = await h.db.query<{ trangThai: string }[]>(
      'SELECT trang_thai AS trangThai FROM lich_hen WHERE lich_hen_id = ?',
      [lich.lichHenId],
    );
    expect(state[0]?.trangThai).toBe('HoanThanh');
    expect(await untouchedByRating(h.db)).toEqual(NONE_TOUCHED);
    await expectInvariants();
  });

  it('mã lịch viết thường vẫn đánh giá được (chuẩn hoá ở pipe): 201', async () => {
    const t = await world();
    const lich = await mine(t);
    const res = await post(
      lich.maLichHen.toLowerCase(),
      t.patient,
      ratingBody(),
    );
    expect(res.status).toBe(201);
    expect(await ratingRows(h.db, lich.lichHenId)).toHaveLength(1);
  });
});

describe('DGB-02 số sao sai ⇒ 400 loi[] đúng mã; no-store; KHÔNG ghi; thân lỗi không lặp lại giá trị', () => {
  const INVALID = 'SO_SAO_KHONG_HOP_LE';
  const REQUIRED = 'SO_SAO_BAT_BUOC';
  const CASES: [string, unknown, string][] = [
    ['vắng', undefined, REQUIRED],
    ['null', null, REQUIRED],
    ['0', 0, INVALID],
    ['6', 6, INVALID],
    ['-1', -1, INVALID],
    ['3.5', 3.5, INVALID],
    ['"3" (chuỗi)', '3', INVALID],
    ['true', true, INVALID],
    ['[4]', [4], INVALID],
    ['{ a: 1 }', { a: 1 }, INVALID],
  ];

  it('mười dạng số sao sai: đúng một lỗi của trường soSao với đúng mã', async () => {
    const t = await world();
    const lich = await mine(t);
    for (const [name, value, ma] of CASES) {
      const res = await post(lich.maLichHen, t.patient, {
        ...(value === undefined ? {} : { soSao: value }),
        nhanXet: 'Tốt',
      });
      const body = expectErrorResponse(res, 400, INVALID_DATA);
      expect(body.loi, name).toEqual([{ truong: 'soSao', ma }]);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(await ratingRows(h.db)).toEqual([]);
  });

  it('thân `{}` ⇒ SO_SAO_BAT_BUOC; 1 và 5 (hai biên) nhận', async () => {
    const t = await world();
    const lich = await mine(t);
    const res = await post(lich.maLichHen, t.patient, {});
    expect(expectErrorResponse(res, 400, INVALID_DATA).loi).toEqual([
      { truong: 'soSao', ma: REQUIRED },
    ]);
    expect((await post(lich.maLichHen, t.patient, { soSao: 1 })).status).toBe(
      201,
    );
    const other = (await seedVisits(h.db, fx, t.w, { other: {} })).other;
    expect((await post(other.maLichHen, t.patient, { soSao: 5 })).status).toBe(
      201,
    );
  });

  it('thân lỗi KHÔNG chứa chuỗi dấu hiệu đặt trong giá trị sai của soSao và nhanXet', async () => {
    const t = await world();
    const lich = await mine(t);
    const mark = 'DGB02LEAKMARK';
    const res = await post(lich.maLichHen, t.patient, {
      soSao: mark,
      nhanXet: [mark],
    });
    expect(res.status).toBe(400);
    expect(res.text).not.toContain(mark);
  });
});

describe('DGB-03 nhận xét: tuỳ chọn; rỗng ⇒ null; quá dài và sai kiểu ⇒ 400', () => {
  it('bỏ trống, null, rỗng, chỉ khoảng trắng ⇒ 201 nhanXet null ở phản hồi và cột NULL', async () => {
    const t = await world();
    const bodies: object[] = [
      { soSao: 3 },
      { soSao: 3, nhanXet: null },
      { soSao: 3, nhanXet: '' },
      { soSao: 3, nhanXet: '  \n\t ' },
    ];
    const visits = await seedVisits(h.db, fx, t.w, {
      a: {},
      b: {},
      c: {},
      d: {},
    });
    for (const [index, lich] of Object.values(visits).entries()) {
      const res = await post(lich.maLichHen, t.patient, bodies[index]);
      expect(res.status).toBe(201);
      expect((res.body as { nhanXet: unknown }).nhanXet).toBeNull();
      expect((await ratingRows(h.db, lich.lichHenId))[0]?.nhanXet).toBeNull();
    }
  });

  it('phản hồi mang nhận xét ĐÃ CHUẨN HOÁ (trim, CRLF ⇒ LF), giống cột đã lưu', async () => {
    const t = await world();
    const lich = await mine(t);
    const res = await post(
      lich.maLichHen,
      t.patient,
      ratingBody({ nhanXet: '  Tốt lắm\r\nXin cảm ơn \u0001 ' }),
    );
    expect(res.status).toBe(201);
    expect((res.body as { nhanXet: string }).nhanXet).toBe(
      'Tốt lắm\nXin cảm ơn',
    );
    expect((await ratingRows(h.db))[0]?.nhanXet).toBe('Tốt lắm\nXin cảm ơn');
  });

  it('1.001 đơn vị ⇒ 400 QUA_DAI (no-store, không ghi); 1.000 nhận; nhận xét không phải chuỗi ⇒ 400 IS_STRING', async () => {
    const t = await world();
    const visits = await seedVisits(h.db, fx, t.w, { over: {}, ok: {} });
    const long = await post(
      visits.over.maLichHen,
      t.patient,
      ratingBody({ nhanXet: 'ế'.repeat(1001) }),
    );
    expect(expectErrorResponse(long, 400, INVALID_DATA).loi).toEqual([
      { truong: 'nhanXet', ma: 'QUA_DAI' },
    ]);
    expect(long.headers['cache-control']).toBe('no-store');
    for (const bad of [5, ['x'], { a: 1 }, true]) {
      const res = await post(visits.over.maLichHen, t.patient, {
        soSao: 5,
        nhanXet: bad,
      });
      expect(expectErrorResponse(res, 400, INVALID_DATA).loi).toEqual([
        { truong: 'nhanXet', ma: 'IS_STRING' },
      ]);
    }
    expect(await ratingRows(h.db, visits.over.lichHenId)).toEqual([]);
    const ok = await post(
      visits.ok.maLichHen,
      t.patient,
      ratingBody({ nhanXet: 'ế'.repeat(1000) }),
    );
    expect(ok.status).toBe(201);
  });
});

describe('DGB-04 lịch chưa HoanThanh ⇒ 409 LICH_HEN_CHUA_HOAN_THANH kèm chiTiet { trangThai }; no-store; không dòng', () => {
  it('sáu trạng thái khác HoanThanh', async () => {
    const t = await world();
    // khoá của kế hoạch là CHÍNH tên trạng thái (đọc lại làm giá trị mong đợi của `chiTiet.trangThai`)
    const visits = await seedVisits(h.db, fx, t.w, {
      ChoThanhToan: { state: 'ChoThanhToan' },
      DaXacNhan: { state: 'DaXacNhan' },
      DaTiepDon: { state: 'DaTiepDon' },
      DaHuy: { state: 'DaHuy' },
      VangMat: { state: 'VangMat' },
      DaDoiLich: { state: 'DaDoiLich' },
    });
    const entries = Object.entries(visits);
    expect(entries.map(([state]) => state).toSorted()).toEqual(
      [...NOT_COMPLETED_STATES].toSorted(),
    );
    for (const [state, lich] of entries) {
      const res = await post(lich.maLichHen, t.patient, ratingBody());
      const body = expectErrorResponse(res, 409, NOT_COMPLETED);
      expect(body.chiTiet).toEqual({ trangThai: state });
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(await ratingRows(h.db)).toEqual([]);
  });
});

describe('DGB-05 một lần mỗi lịch: lần hai ⇒ 409 DA_DANH_GIA; đánh giá cũ không đổi (kể cả đã bị ẩn, Q19)', () => {
  it('lần hai ⇒ 409 có no-store; dòng cũ nguyên; đánh giá bị ẩn (UPDATE tay) vẫn 409 và dòng ẩn giữ nguyên', async () => {
    const t = await world();
    const lich = await mine(t);
    const first = await post(
      lich.maLichHen,
      t.patient,
      ratingBody({ soSao: 2, nhanXet: 'Lần một' }),
    );
    expect(first.status).toBe(201);
    const before = await ratingRows(h.db);
    const second = await post(
      lich.maLichHen,
      t.patient,
      ratingBody({ soSao: 5, nhanXet: 'Lần hai' }),
    );
    expectErrorResponse(second, 409, ALREADY_RATED);
    expect(second.headers['cache-control']).toBe('no-store');
    expect(await ratingRows(h.db)).toEqual(before);
    // Bất biến TRƯỚC khi ẩn thủ công: `UPDATE bi_an = 1` ở dưới KHÔNG có dòng nhật ký `AnDanhGia` (việc của B8) nên IVK-04 sẽ đỏ đúng nếu kiểm sau đó
    await expectInvariants();

    await h.db.query(
      'UPDATE danh_gia_bac_si SET bi_an = 1, ly_do_an = ? WHERE lich_hen_id = ?',
      ['Nội dung vi phạm quy định', lich.lichHenId],
    );
    const hidden = await ratingRows(h.db);
    const third = await post(lich.maLichHen, t.patient, ratingBody());
    expectErrorResponse(third, 409, ALREADY_RATED);
    expect(await ratingRows(h.db)).toEqual(hidden);
  });
});

describe('DGB-06, QHK-05 mọi trường hợp "không thấy" ra CÙNG 404 KHONG_TIM_THAY, cùng thân từng byte, có no-store; không dòng', () => {
  it('lịch của Bệnh nhân khác (HoanThanh và DaXacNhan), lịch khám cho hồ sơ người thân của A (Bệnh nhân B gửi), mã không tồn tại và ba mã SAI DẠNG', async () => {
    const t = await world();
    const v = await seedVisits(h.db, fx, t.w, {
      theirs: { patientId: t.w.secondPatientId },
      theirsConfirmed: {
        state: 'DaXacNhan',
        patientId: t.w.secondPatientId,
      },
      rel: { hoSoNguoiThanId: t.w.relativeId },
    });
    const asks: [string, string][] = [
      [v.theirs.maLichHen, t.patient],
      [v.theirsConfirmed.maLichHen, t.patient],
      [v.rel.maLichHen, t.second],
      [MISSING, t.patient],
      ...MALFORMED.map((code): [string, string] => [code, t.patient]),
    ];
    for (const [code, token] of asks) {
      const res = await post(code, token, ratingBody());
      expectErrorResponse(res, 404, NOT_FOUND);
      expect(res.text).toBe(NOT_FOUND_TEXT);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(asks).toHaveLength(7);
    expect(await ratingRows(h.db)).toEqual([]);
  });
});

describe('DGB-08, QHK-01 quyền: chỉ Bệnh nhân', () => {
  it('chưa đăng nhập 401; Bác sĩ (kể cả bác sĩ của lịch), Lễ tân, QTV Chi nhánh, QTV Toàn hệ thống ĐÚNG 403 KHONG_DU_QUYEN với mã đúng, mã không tồn tại, mã SAI DẠNG, thân lạ và không thân; không ghi', async () => {
    const t = await world();
    const lich = await mine(t);
    expectErrorResponse(
      await post(lich.maLichHen, undefined, ratingBody()),
      401,
      NOT_LOGGED_IN,
    );
    for (const token of [t.doctor, t.reception, t.branch, t.system])
      for (const [code, body] of [
        [lich.maLichHen, ratingBody()],
        [MISSING, ratingBody()],
        [MALFORMED[0] as string, ratingBody()],
        [lich.maLichHen, { bacSiId: '1' }],
        [lich.maLichHen, undefined],
      ] as const)
        expectErrorResponse(await post(code, token, body), 403, FORBIDDEN);
    expect(await ratingRows(h.db)).toEqual([]);
  });

  it('QHK-01 đối chứng dương: Bệnh nhân chủ lịch đánh giá được cùng yêu cầu mà bốn vai trò kia bị 403', async () => {
    const t = await world();
    const lich = await mine(t);
    expect((await post(lich.maLichHen, t.patient, ratingBody())).status).toBe(
      201,
    );
  });
});

describe('DGB-10, QHK-03 khoá lạ ở thân ⇒ 400 TRUONG_KHONG_DUOC_PHEP; no-store; KHÔNG ghi; thân lỗi không lặp lại giá trị đã gửi', () => {
  it('bacSiId, biAn, lyDoAn, lichHenId, thoiDiemTao, benhNhanId: mã TRƯỜNG; chủ sở hữu và lịch không bao giờ lấy từ thân', async () => {
    const t = await world();
    const lich = await mine(t);
    const mark = 'DGB10LEAKMARK';
    for (const extra of [
      'bacSiId',
      'biAn',
      'lyDoAn',
      'lichHenId',
      'thoiDiemTao',
      'benhNhanId',
    ]) {
      const res = await post(lich.maLichHen, t.patient, {
        ...ratingBody(),
        [extra]: mark,
      });
      expect(expectErrorResponse(res, 400, INVALID_DATA).loi).toEqual([
        { truong: extra, ma: NOT_ALLOWED },
      ]);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.text).not.toContain(mark);
    }
    expect(await ratingRows(h.db)).toEqual([]);
  });

  it('lịch của người KHÁC kèm lichHenId trong thân và mã của lịch của mình: 400, KHÔNG dòng nào (cho cả hai lịch)', async () => {
    const t = await world();
    const v = await seedVisits(h.db, fx, t.w, {
      own: {},
      theirs: { patientId: t.w.secondPatientId },
    });
    const res = await post(v.own.maLichHen, t.patient, {
      ...ratingBody(),
      lichHenId: v.theirs.lichHenId,
      benhNhanId: t.w.secondPatientId,
    });
    expect(res.status).toBe(400);
    expect(await ratingRows(h.db)).toEqual([]);
  });
});

describe('DGB-19 [đề xuất] sau 201, chi tiết (B5) và danh sách của Bệnh nhân thấy đúng đánh giá; Q19', () => {
  it('GET chi tiết trả danhGia đúng ba khoá khớp thân 201, coTheDanhGia false; danh sách có daDanhGia true; đánh giá bị ẩn vẫn hiện nguyên (không biAn, lyDoAn) và gửi lại vẫn 409', async () => {
    const t = await world();
    const lich = await mine(t);
    const before = await get(`/${lich.maLichHen}`, t.patient);
    expect(before.status).toBe(200);
    expect((before.body as { danhGia: unknown }).danhGia).toBeNull();
    expect((before.body as { coTheDanhGia: unknown }).coTheDanhGia).toBe(true);

    const created = await post(
      lich.maLichHen,
      t.patient,
      ratingBody({ soSao: 3, nhanXet: 'Khá ổn' }),
    );
    expect(created.status).toBe(201);
    const detail = await get(`/${lich.maLichHen}`, t.patient);
    const danhGia = (detail.body as { danhGia: object }).danhGia;
    expect(Object.keys(danhGia).sort()).toEqual([
      'nhanXet',
      'soSao',
      'thoiDiemTao',
    ]);
    expect(danhGia).toEqual(created.body);
    expect((detail.body as { coTheDanhGia: unknown }).coTheDanhGia).toBe(false);
    const list = await get('', t.patient);
    const item = (
      list.body as { items: { maLichHen: string; daDanhGia: boolean }[] }
    ).items.find((entry) => entry.maLichHen === lich.maLichHen);
    expect(item?.daDanhGia).toBe(true);

    await h.db.query(
      'UPDATE danh_gia_bac_si SET bi_an = 1, ly_do_an = ? WHERE lich_hen_id = ?',
      ['Nội dung vi phạm quy định', lich.lichHenId],
    );
    const hidden = await get(`/${lich.maLichHen}`, t.patient);
    expect((hidden.body as { danhGia: unknown }).danhGia).toEqual(created.body);
    expect(keysDeep(hidden.body)).not.toContain('biAn');
    expect(keysDeep(hidden.body)).not.toContain('lyDoAn');
    expect(hidden.text).not.toContain('Nội dung vi phạm quy định');
    expectErrorResponse(
      await post(lich.maLichHen, t.patient, ratingBody()),
      409,
      ALREADY_RATED,
    );
  });
});

describe('BDK-01 log không chứa nhận xét hay mã lịch (201, 400, 404, 409)', () => {
  it('quét stdout, stderr và console: chuỗi mẫu trong nhận xét và mã lịch không xuất hiện ở log; thân lỗi 400, 404, 409 không lặp lại nhận xét', async () => {
    const mark = 'BDK01NHANXETMAU';
    const captured = captureProcessLogs();
    const t = await world();
    const v = await seedVisits(h.db, fx, t.w, {
      own: {},
      theirs: { patientId: t.w.secondPatientId },
    });
    const content = (suffix: string) =>
      ratingBody({ nhanXet: `${mark} ${suffix}` });
    const created = await post(v.own.maLichHen, t.patient, content('một'));
    expect(created.status).toBe(201);
    const tooLong = await post(
      v.own.maLichHen,
      t.patient,
      ratingBody({ nhanXet: `${mark} ${'x'.repeat(1001)}` }),
    );
    expect(tooLong.status).toBe(400);
    const notMine = await post(v.theirs.maLichHen, t.patient, content('hai'));
    expect(notMine.status).toBe(404);
    const twice = await post(v.own.maLichHen, t.patient, content('ba'));
    expect(twice.status).toBe(409);
    for (const res of [tooLong, notMine, twice])
      expect(res.text).not.toContain(mark);

    const log = captured.join('');
    expect(log).not.toContain(mark);
    expect(log).not.toContain(v.own.maLichHen);
    expect(log).not.toContain(v.theirs.maLichHen);
  });
});
