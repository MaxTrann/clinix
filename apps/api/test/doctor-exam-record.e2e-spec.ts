import request from 'supertest';
import { vi } from 'vitest';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import { assertBookingInvariants } from './../src/appointments/testing/invariants.js';
import { failAfterStatement } from './../src/appointments/testing/statement-recorder.js';
import { AUTH_ERROR_CODES } from './../src/auth/auth.constants.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { countRows } from './../src/doctor/examination/testing/exam-completion-stack.js';
import { ExamFixtures } from './../src/doctor/examination/testing/exam-fixtures.js';
import { assertExamInvariants } from './../src/doctor/examination/testing/exam-invariants.js';
import {
  editAuditRows,
  recordBody,
  recordRows,
} from './../src/doctor/examination/testing/exam-record-stack.js';
import { examWorld } from './../src/doctor/examination/testing/exam-world.js';

// doctor-exam B2 — PUT /doctor/appointments/:maLichHen/exam-record qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN 5.5, 5.11, 7.1 HSK-01, HSK-03, HSK-05, HSK-09, HSK-10, HSK-13, HSK-15, HSK-23; 7.7 QHK-01, QHK-02, QHK-04, QHK-10, QHK-12 phần của
// route này; 7.11 BDK-01, BDK-04; TRACKING 13). Phần dịch vụ và SQL: src/doctor/examination/exam-record/exam-record.int-spec.ts; đồng thời: exam-record.concurrency.int-spec.ts. QHK-01, QHK-02, QHK-12 là mã của MỌI route khám bệnh: ở đây chỉ phần B2.
// CA QHK-01 khẳng định ĐÚNG 403 KHONG_DU_QUYEN ở trạng thái mà dịch vụ sẽ trả mã KHÁC nếu thiếu `@Roles` (Bệnh nhân, Lễ tân, QTV: lịch của "bác sĩ" không khớp ⇒ 404; thân lạ ⇒ 400; mã sai dạng ⇒ 404): bài học ĐA-9b. Dữ liệu giả (email đuôi example.com, mã lịch minh hoạ).
const PATH = '/doctor/appointments';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
const NOT_FOUND = 'KHONG_TIM_THAY';
const NOT_WRITABLE = 'KHONG_THE_GHI_HO_SO_KHAM';
const CHANGED = 'HO_SO_KHAM_DA_THAY_DOI';
// Thân 404 chung (patient Q27): giống từng ký tự ở mọi nhánh, kể cả mã sai dạng bị pipe từ chối
const NOT_FOUND_TEXT =
  '{"maLoi":"KHONG_TIM_THAY","thongBao":"Không tìm thấy dữ liệu."}';
const CODE = 'CLX-20261110-CCC01';
const MISSING = 'CLX-20261110-ZZZZZ';
const MALFORMED = ['sai-dang', 'CLX-20261110-CCC0I', `${CODE}-THUA`];
/** 09:00 ngày 10/11/2026 giờ VN (ngày khám của các lịch trong thế giới test) */
const NOW = new Date('2026-11-10T09:00:00+07:00');

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
const put = (code: string, accessToken?: string, body?: object) => {
  const req = request(h.app.getHttpServer()).put(`${PATH}/${code}/exam-record`);
  const withBody = body === undefined ? req : req.send(body);
  return accessToken
    ? withBody.set('Authorization', `Bearer ${accessToken}`)
    : withBody;
};

/** Thế giới khám bệnh (một chi nhánh, bác sĩ phụ trách, Bệnh nhân, Lễ tân, hai Quản trị viên) kèm token và MỘT lịch DaTiepDon mã `CODE`. Đồng hồ ở NOW (ngày khám). */
async function world() {
  vi.setSystemTime(NOW);
  const w = await examWorld(h.db, fx);
  const lich = await w.w.booked('DaTiepDon', 0, { maLichHen: CODE });
  const stranger = (await fx.admin.doctor(w.w.branch)).profile.taiKhoanId;
  return {
    ...w,
    lich,
    exam: new ExamFixtures(h.db),
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

describe('PUT …/exam-record — thành công', () => {
  it('HSK-01, QHK-12 Bác sĩ phụ trách ghi lần đầu khi lịch DaTiepDon: 200 đúng NĂM khoá; Cache-Control no-store; một dòng ho_so_kham; lịch vẫn DaTiepDon; KHÔNG nhật ký, không thông báo; INV và IVK', async () => {
    const w = await world();
    const res = await put(
      CODE,
      w.doctor,
      recordBody({ ngayTaiKhamDuKien: '2026-12-01' }),
    );
    expect(res.status).toBe(200);
    expect(Object.keys(res.body as object).sort()).toEqual([
      'capNhatLanCuoi',
      'chanDoanSoBo',
      'huongXuLy',
      'ngayTaiKhamDuKien',
      'trieuChung',
    ]);
    expect(res.body).toEqual({
      trieuChung: 'Ho khan, sốt nhẹ hai ngày',
      chanDoanSoBo: 'Viêm họng cấp',
      huongXuLy: 'Uống đủ nước, nghỉ ngơi',
      ngayTaiKhamDuKien: '2026-12-01',
      capNhatLanCuoi: NOW.toISOString(),
    });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(await recordRows(h.db)).toHaveLength(1);
    expect(await stateOf(w)).toBe('DaTiepDon');
    expect(await editAuditRows(h.db)).toEqual([]);
    expect(await countRows(h.db, 'thong_bao')).toBe(0);
    await assertBookingInvariants(h.db);
    await assertExamInvariants(h.db);
  });

  it('thân lớn nhất hợp lệ (ba trường 2.000 chữ có dấu + ngày, ≈ 18 KB) và mã lịch viết thường đều được: 200 (X1 M9)', async () => {
    const w = await world();
    const long = 'ế'.repeat(2000);
    const res = await put(
      CODE.toLowerCase(),
      w.doctor,
      recordBody({
        trieuChung: long,
        chanDoanSoBo: long,
        huongXuLy: long,
        ngayTaiKhamDuKien: '2026-12-01',
      }),
    );
    expect(res.status).toBe(200);
    expect((res.body as { trieuChung: string }).trieuChung).toBe(long);
  });

  it('HSK-03 sửa khi HoanThanh: 200, token mới; nhật ký SuaGhiChuKham một dòng; gửi lại bằng TOKEN CỦA LẦN TRƯỚC nhận 409; bằng token mới được', async () => {
    const w = await world();
    const done = await w.w.booked('HoanThanh', 1, {
      maLichHen: 'CLX-20261110-CCC02',
    });
    await w.exam.record(done.lichHenId, {
      capNhatLanCuoi: '2026-11-10 08:00:00',
    });
    const first = await put(
      done.maLichHen,
      w.doctor,
      recordBody({
        huongXuLy: 'Nghỉ ngơi mới',
        capNhatLanCuoi: '2026-11-10T01:00:00.000Z',
      }),
    );
    expect(first.status).toBe(200);
    expect((await editAuditRows(h.db)).map((row) => row.chiTiet)).toEqual([
      {
        truoc: { huong_xu_ly: 'Uống đủ nước, nghỉ ngơi' },
        sau: { huong_xu_ly: 'Nghỉ ngơi mới' },
      },
    ]);
    const stale = await put(
      done.maLichHen,
      w.doctor,
      recordBody({
        huongXuLy: 'Lọt?',
        capNhatLanCuoi: '2026-11-10T01:00:00.000Z',
      }),
    );
    expectErrorResponse(stale, 409, CHANGED);
    expect(stale.headers['cache-control']).toBe('no-store');
    const next = await put(
      done.maLichHen,
      w.doctor,
      recordBody({
        huongXuLy: 'Lần ba',
        capNhatLanCuoi: (first.body as { capNhatLanCuoi: string })
          .capNhatLanCuoi,
      }),
    );
    expect(next.status).toBe(200);
    expect(await editAuditRows(h.db)).toHaveLength(2);
  });
});

describe('HSK-05, HSK-23, BDK-04 dữ liệu vào xấu ⇒ 400 không lặp lại giá trị', () => {
  it('HSK-05 thân `{}` ⇒ ba lỗi BAT_BUOC; thân đủ ba trường nhưng một trường rỗng ⇒ đúng một lỗi; no-store; DB không đổi', async () => {
    const w = await world();
    const all = await put(CODE, w.doctor, {});
    const body = expectErrorResponse(all, 400, INVALID_DATA);
    expect(body.loi).toEqual([
      { truong: 'trieuChung', ma: 'BAT_BUOC' },
      { truong: 'chanDoanSoBo', ma: 'BAT_BUOC' },
      { truong: 'huongXuLy', ma: 'BAT_BUOC' },
    ]);
    expect(all.headers['cache-control']).toBe('no-store');
    const one = await put(CODE, w.doctor, recordBody({ huongXuLy: '   ' }));
    expect(expectErrorResponse(one, 400, INVALID_DATA).loi).toEqual([
      { truong: 'huongXuLy', ma: 'BAT_BUOC' },
    ]);
    expect(await recordRows(h.db)).toEqual([]);
  });

  it('HSK-23 nội dung dạng bí mật ⇒ 400 NOI_DUNG_KHONG_HOP_LE THEO TRƯỜNG; thân lỗi không lặp lại giá trị; no-store; DB không đổi', async () => {
    const w = await world();
    for (const sample of [
      'Cookie: bánh quy dị ứng',
      'otp: 3 lần/ngày',
      'token=abc123',
    ]) {
      const res = await put(
        CODE,
        w.doctor,
        recordBody({ chanDoanSoBo: sample }),
      );
      const body = expectErrorResponse(res, 400, INVALID_DATA);
      expect(body.loi).toEqual([
        { truong: 'chanDoanSoBo', ma: 'NOI_DUNG_KHONG_HOP_LE' },
      ]);
      expect(res.text).not.toContain(sample.slice(0, 8));
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(await recordRows(h.db)).toEqual([]);
  });

  it('HSK-07 ngày tái khám ngoài khoảng (trước ngày khám, sau +365) ⇒ 400 NGAY_KHONG_HOP_LE; kiểu sai (số) ⇒ cùng mã; DB không đổi', async () => {
    const w = await world();
    for (const ngay of ['2026-11-09', '2027-11-11', '2026-02-30', 20261110]) {
      const res = await put(CODE, w.doctor, {
        ...recordBody(),
        ngayTaiKhamDuKien: ngay,
      });
      expect(expectErrorResponse(res, 400, INVALID_DATA).loi).toEqual([
        { truong: 'ngayTaiKhamDuKien', ma: 'NGAY_KHONG_HOP_LE' },
      ]);
    }
    expect(await recordRows(h.db)).toEqual([]);
  });

  it('HSK-15, QHK-02, QHK-12 khoá lạ ở thân (`bacSiId`, `lichHenId`, `benhNhanId`) ⇒ 400 TRUONG_KHONG_DUOC_PHEP; no-store; KHÔNG ghi; thân lỗi không lặp lại giá trị đã gửi', async () => {
    const w = await world();
    for (const key of ['bacSiId', 'lichHenId', 'benhNhanId']) {
      const res = await put(CODE, w.doctor, {
        ...recordBody(),
        [key]: 'GIATRI-NHAY-CAM',
      });
      const body = expectErrorResponse(res, 400, INVALID_DATA);
      expect(body.loi).toEqual([{ truong: key, ma: NOT_ALLOWED }]);
      expect(res.text).not.toContain('GIATRI-NHAY-CAM');
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(await recordRows(h.db)).toEqual([]);
  });
});

describe('HSK-09, HSK-10, QHK-04 trạng thái và sở hữu', () => {
  it('HSK-09 lịch DaXacNhan ⇒ 409 KHONG_THE_GHI_HO_SO_KHAM kèm chiTiet { trangThai }; no-store; không dòng', async () => {
    const w = await world();
    const confirmed = await w.w.booked('DaXacNhan', 1, {
      maLichHen: 'CLX-20261110-CCC02',
    });
    const res = await put(confirmed.maLichHen, w.doctor, recordBody());
    const body = expectErrorResponse(res, 409, NOT_WRITABLE);
    expect(body.chiTiet).toEqual({ trangThai: 'DaXacNhan' });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(await recordRows(h.db)).toEqual([]);
  });

  it('HSK-10, QHK-04 lịch của bác sĩ khác (kể cả khi lịch đó DaXacNhan), mã không tồn tại, mã sai dạng: 404 CÙNG thân từng ký tự; no-store; không dòng', async () => {
    const w = await world();
    const confirmed = await w.w.booked('DaXacNhan', 1, {
      maLichHen: 'CLX-20261110-CCC02',
    });
    const attempts = [
      put(CODE, w.stranger, recordBody()),
      put(confirmed.maLichHen, w.stranger, recordBody()),
      put(MISSING, w.doctor, recordBody()),
      ...MALFORMED.map((code) => put(code, w.doctor, recordBody())),
    ];
    for (const res of await Promise.all(attempts)) {
      expectErrorResponse(res, 404, NOT_FOUND);
      expect(res.text).toBe(NOT_FOUND_TEXT);
      expect(res.headers['cache-control']).toBe('no-store');
    }
    expect(await recordRows(h.db)).toEqual([]);
  });

  it('HSK-13 token sai ⇒ 409 HO_SO_KHAM_DA_THAY_DOI (hồ sơ đã có, token null); no-store; dòng không đổi', async () => {
    const w = await world();
    await w.exam.record(w.lich.lichHenId, {
      capNhatLanCuoi: '2026-11-10 08:00:00',
    });
    const before = await recordRows(h.db);
    const res = await put(CODE, w.doctor, recordBody({ huongXuLy: 'Ghi đè' }));
    expectErrorResponse(res, 409, CHANGED);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(await recordRows(h.db)).toEqual(before);
  });
});

describe('QHK-01, QHK-10 quyền', () => {
  it('QHK-01 chưa đăng nhập 401; Bệnh nhân, Lễ tân, QTV Chi nhánh, QTV Toàn hệ thống ĐÚNG 403 KHONG_DU_QUYEN với mã đúng, mã không tồn tại, mã SAI DẠNG và thân lạ; không ghi', async () => {
    const w = await world();
    expectErrorResponse(await put(CODE), 401, NOT_LOGGED_IN);
    for (const token of [w.patient, w.reception, w.branch, w.system])
      for (const [code, body] of [
        [CODE, recordBody()],
        [MISSING, recordBody()],
        [MALFORMED[0] as string, recordBody()],
        [CODE, { bacSiId: '1' }],
        [CODE, undefined],
      ] as const)
        expectErrorResponse(await put(code, token, body), 403, FORBIDDEN);
    expect(await recordRows(h.db)).toEqual([]);
  });

  it('QHK-10 bác sĩ đổi chi nhánh vẫn ghi được lịch cũ của mình; bác sĩ bị KHOÁ tài khoản ⇒ guard chặn (401 PHIEN_HET_HIEU_LUC), KHÔNG ghi', async () => {
    const w = await world();
    const otherBranch = await fx.admin.branch();
    await h.db.query(
      'UPDATE bac_si SET chi_nhanh_id = ? WHERE tai_khoan_id = ?',
      [otherBranch.chiNhanhId, w.doctorId],
    );
    expect((await put(CODE, w.doctor, recordBody())).status).toBe(200);

    await h.db.query(
      "UPDATE tai_khoan SET trang_thai = 'NgungHoatDong' WHERE tai_khoan_id = ?",
      [w.doctorId],
    );
    const blocked = await put(
      CODE,
      w.doctor,
      recordBody({ huongXuLy: 'Bị khoá' }),
    );
    expectErrorResponse(blocked, 401, AUTH_ERROR_CODES.SESSION_INACTIVE);
    expect((await recordRows(h.db))[0]?.huongXuLy).toBe(
      'Uống đủ nước, nghỉ ngơi',
    );
  });
});

describe('BDK-01 log không chứa nội dung hồ sơ (kể cả nhánh 400, 409, 500)', () => {
  it('quét stdout, stderr và console qua ghi lần đầu, sửa sau Hoàn thành, 400, 409 và 500 (nhật ký hỏng): chuỗi mẫu duy nhất của ba trường chữ không xuất hiện; 500 có requestId, không lộ nội dung', async () => {
    const mark = 'BDK01NOIDUNGMAU';
    const captured: string[] = [];
    const text = (chunk: unknown) =>
      typeof chunk === 'string'
        ? chunk
        : Buffer.from(chunk as Uint8Array).toString('utf8');
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      captured.push(text(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      captured.push(text(chunk));
      return true;
    });
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const)
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        captured.push(args.map(String).join(' '));
      });

    const w = await world();
    const content = (suffix: string) =>
      recordBody({
        trieuChung: `${mark} triệu chứng ${suffix}`,
        chanDoanSoBo: `${mark} chẩn đoán ${suffix}`,
        huongXuLy: `${mark} hướng xử lý ${suffix}`,
      });
    // ghi lần đầu (DaTiepDon)
    const first = await put(CODE, w.doctor, content('một'));
    expect(first.status).toBe(200);
    // 400: thiếu một trường (hai trường còn lại mang chuỗi mẫu)
    expect(
      (await put(CODE, w.doctor, { ...content('hai'), huongXuLy: '' })).status,
    ).toBe(400);
    // 409: token sai
    expect((await put(CODE, w.doctor, content('ba'))).status).toBe(409);
    // sửa sau Hoàn thành (nhật ký) rồi 500 (nhật ký hỏng sau khi INSERT chạy thật)
    const done = await w.w.booked('HoanThanh', 1, {
      maLichHen: 'CLX-20261110-CCC02',
    });
    await w.exam.record(done.lichHenId, {
      capNhatLanCuoi: '2026-11-10 08:00:00',
    });
    const edited = await put(done.maLichHen, w.doctor, {
      ...content('bốn'),
      capNhatLanCuoi: '2026-11-10T01:00:00.000Z',
    });
    expect(edited.status).toBe(200);
    failAfterStatement(
      h.db,
      /^INSERT INTO `?nhat_ky_hanh_dong/,
      new Error('nhật ký hỏng'),
    );
    const failing = await put(done.maLichHen, w.doctor, {
      ...content('năm'),
      capNhatLanCuoi: (edited.body as { capNhatLanCuoi: string })
        .capNhatLanCuoi,
    });
    expect(failing.status).toBe(500);
    expect(failing.text).not.toContain(mark);
    expect((failing.body as { requestId?: string }).requestId).toBeDefined();

    expect(captured.join('')).not.toContain(mark);
  });
});
