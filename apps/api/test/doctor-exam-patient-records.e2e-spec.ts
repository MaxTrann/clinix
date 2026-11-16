import request from 'supertest';
import { vi } from 'vitest';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import { failAfterStatement } from './../src/appointments/testing/statement-recorder.js';
import { statusWorld } from './../src/appointments/testing/status-world.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { ExamFixtures } from './../src/doctor/examination/testing/exam-fixtures.js';
import {
  FORBIDDEN_DETAIL_KEYS,
  FORBIDDEN_LIST_KEYS,
  keysDeep,
  nameDoctorAndPatient,
  seedVisits,
} from './../src/doctor/examination/testing/patient-exam-stack.js';

// doctor-exam B4 — GET /patient/exam-records qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN 5.6, 5.11, 7.3 XHS-01…XHS-05, XHS-10…XHS-13; 7.7 QHK-01, QHK-03, QHK-05, QHK-12; 7.11 BDK-01 phần của route này; TRACKING 15).
// Phần dịch vụ và SQL: src/doctor/examination/patient-view/patient-exam-records.int-spec.ts. QHK-01, QHK-12, BDK-01 là mã của MỌI route khám bệnh: ở đây chỉ phần B4. Dữ liệu giả (email đuôi example.com).
// CA QHK-01 khẳng định ĐÚNG 403 KHONG_DU_QUYEN cả khi query SAI (guard chạy TRƯỚC pipe: người sai vai trò nhận 403, không phải 400).
// doctor-exam B5 thêm bốn `describe` cuối file cho GET /patient/exam-records/:maLichHen (chi tiết một lịch) trên cùng khung dựng và đăng nhập.
const PATH = '/patient/exam-records';
const NOT_LOGGED_IN = 'CHUA_DANG_NHAP';
const FORBIDDEN = 'KHONG_DU_QUYEN';
const INVALID_DATA = 'DU_LIEU_KHONG_HOP_LE';
const NOT_ALLOWED = 'TRUONG_KHONG_DUOC_PHEP';
/** 09:00 ngày 10/11/2026 giờ VN: năm mặc định 2026 */
const NOW = new Date('2026-11-10T09:00:00+07:00');
const TOP_KEYS = [
  'demTheoThang',
  'items',
  'nguoiKham',
  'page',
  'pageSize',
  'total',
];

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

/** Gom mọi thứ ghi ra stdout, stderr và console (để quét log không chứa dữ liệu cá nhân: BDK-01). */
function captureLogs(): string[] {
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
  return captured;
}

const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
// `query` viết thẳng (kể cả `?` đầu) để thử query sai dạng, lặp khoá, khoá lạ
const get = (query = '', accessToken?: string) => {
  const req = request(h.app.getHttpServer()).get(`${PATH}${query}`);
  return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
};

/** Thế giới (một chi nhánh, bác sĩ, Bệnh nhân kèm hồ sơ người thân, Bệnh nhân thứ hai, Lễ tân, hai Quản trị viên) kèm token. Đồng hồ ở NOW. */
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

describe('XHS-01, XHS-02, XHS-10, QHK-12 Bệnh nhân xem danh sách', () => {
  it('200: đúng sáu khoá ở gốc; Cache-Control no-store; chỉ lịch HoanThanh của mình (bản thân và người thân) theo thứ tự; cờ đúng; không khoá cấm ở độ sâu nào', async () => {
    const t = await world();
    const v = await seedVisits(h.db, fx, t.w, {
      self: { at: '2026-11-03 09:00:00' },
      rel: { at: '2026-11-05 10:00:00', hoSoNguoiThanId: t.w.relativeId },
      active: { state: 'DaTiepDon' },
      other: { patientId: t.w.secondPatientId },
    });
    await t.exam.record(v.self.lichHenId);
    await t.exam.rating(v.rel.lichHenId, {
      biAn: true,
      lyDoAn: 'Vi phạm quy định',
    });

    const res = await get('', t.patient);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.body as object).toSorted()).toEqual(TOP_KEYS);
    const body = res.body as {
      items: { maLichHen: string; coHoSoKham: boolean; daDanhGia: boolean }[];
      total: number;
      demTheoThang: Record<string, number>;
      nguoiKham: { id: string | null }[];
    };
    expect(body.items.map((item) => item.maLichHen)).toEqual([
      v.rel.maLichHen,
      v.self.maLichHen,
    ]);
    expect(body.items.map((item) => [item.coHoSoKham, item.daDanhGia])).toEqual(
      [
        [false, true],
        [true, false],
      ],
    );
    expect(body.total).toBe(2);
    expect(body.demTheoThang['11']).toBe(2);
    expect(body.nguoiKham.map((option) => option.id)).toEqual([
      null,
      t.w.relativeId,
    ]);
    const leaked = keysDeep(res.body).filter((key) =>
      (FORBIDDEN_LIST_KEYS as readonly string[]).includes(key),
    );
    expect(leaked).toEqual([]);
  });

  it('XHS-03 chưa có lịch HoanThanh: 200, items rỗng, total 0, đủ 12 khoá tháng bằng 0, nguoiKham rỗng (không 404)', async () => {
    const t = await world();
    const res = await get('', t.patient);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ items: [], total: 0, nguoiKham: [] });
    expect(
      Object.keys((res.body as { demTheoThang: object }).demTheoThang),
    ).toHaveLength(12);
  });

  it('XHS-04, XHS-05 query hợp lệ đi qua pipe thật: nam, thang, nguoiKham, page, pageSize; pageSize 50 đạt; trang vượt cuối nhỏ và cực lớn ⇒ 200 rỗng', async () => {
    const t = await world();
    const v = await seedVisits(h.db, fx, t.w, {
      nov: { at: '2026-11-30 23:30:00' },
      dec: { at: '2026-12-01 00:00:00' },
    });
    const month = await get(
      '?nam=2026&thang=11&nguoiKham=BanThan&pageSize=50',
      t.patient,
    );
    expect(month.status).toBe(200);
    expect((month.body as { items: { maLichHen: string }[] }).items).toEqual([
      expect.objectContaining({ maLichHen: v.nov.maLichHen }),
    ]);
    for (const query of ['?page=999', '?page=1000000000000000000']) {
      const past = await get(query, t.patient);
      expect(past.status).toBe(200);
      expect(past.body).toMatchObject({ items: [], total: 2 });
    }
  });
});

describe('XHS-12, XHS-13, QHK-03 query sai ⇒ 400 có no-store, không lặp lại giá trị', () => {
  it('QHK-03 khoá lạ (`benhNhanId`, `bacSiId`, `hoSoNguoiThanId`, tuỳ ý) ⇒ 400 TRUONG_KHONG_DUOC_PHEP đúng một lỗi của trường đó; giá trị không xuất hiện trong phản hồi', async () => {
    const t = await world();
    for (const key of ['benhNhanId', 'bacSiId', 'hoSoNguoiThanId', 'tuyY']) {
      const res = await get(`?${key}=GIA-TRI-NHAY-CAM-9`, t.patient);
      expect(expectErrorResponse(res, 400, INVALID_DATA).loi).toEqual([
        { truong: key, ma: NOT_ALLOWED },
      ]);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.text).not.toContain('GIA-TRI-NHAY-CAM-9');
    }
  });

  it.each([
    'nam=1999',
    'nam=2101',
    'nam=abc',
    'nam=',
    'nam=2026&nam=2027',
    'thang=0',
    'thang=13',
    'thang=1.5',
    'nguoiKham=abc',
    'nguoiKham=banThan',
    'nguoiKham=9223372036854775808',
    'nguoiKham=1&nguoiKham=2',
    'pageSize=51',
    'pageSize=0',
    'page=0',
  ])(
    'XHS-13, XHS-05 `?%s` ⇒ 400 DU_LIEU_KHONG_HOP_LE, có no-store',
    async (query) => {
      const t = await world();
      const res = await get(`?${query}`, t.patient);
      expectErrorResponse(res, 400, INVALID_DATA);
      expect(res.headers['cache-control']).toBe('no-store');
    },
  );
});

describe('XHS-11, QHK-01, QHK-05 quyền và phạm vi', () => {
  it('QHK-01 khách ⇒ 401; Bác sĩ, Lễ tân, QTV Chi nhánh, QTV Toàn hệ thống ⇒ ĐÚNG 403 KHONG_DU_QUYEN, kể cả khi query SAI (guard trước pipe)', async () => {
    const t = await world();
    for (const query of ['', '?nam=abc', '?benhNhanId=1'])
      expectErrorResponse(await get(query), 401, NOT_LOGGED_IN);
    for (const token of [t.doctor, t.reception, t.branch, t.system])
      for (const query of ['', '?nam=abc', '?benhNhanId=1', '?pageSize=51'])
        expectErrorResponse(await get(query, token), 403, FORBIDDEN);
  });

  it('QHK-05 Bệnh nhân B chỉ thấy lịch của mình; truyền id hồ sơ người thân của A ⇒ 200 rỗng (không 404, không lộ)', async () => {
    const t = await world();
    const aRel = await fx.relative(t.w.patientId, {
      hoTen: 'Người thân của A',
    });
    const v = await seedVisits(h.db, fx, t.w, {
      a1: { at: '2026-11-02 09:00:00', hoSoNguoiThanId: aRel },
      b1: { at: '2026-11-04 09:00:00', patientId: t.w.secondPatientId },
    });
    const own = await get('', t.second);
    expect(
      (own.body as { items: { maLichHen: string }[] }).items.map(
        (item) => item.maLichHen,
      ),
    ).toEqual([v.b1.maLichHen]);
    expect(own.text).not.toContain('Người thân của A');
    const probe = await get(`?nguoiKham=${aRel}`, t.second);
    expect(probe.status).toBe(200);
    expect(probe.body).toMatchObject({ items: [], total: 0 });
  });
});

describe('BDK-01 log không chứa tên người khám hay mã lịch (kể cả nhánh 400 và 500)', () => {
  it('quét stdout, stderr và console qua 200, 400 và 500 (câu trang hỏng): tên người thân và mã lịch mẫu không xuất hiện; 500 có requestId, không lộ tên', async () => {
    const name = 'BDK01TENNGUOITHAN';
    const captured = captureLogs();

    const t = await world();
    const rel = await fx.relative(t.w.patientId, { hoTen: name });
    const v = await seedVisits(h.db, fx, t.w, {
      one: { at: '2026-11-03 09:00:00', hoSoNguoiThanId: rel },
    });
    const ok = await get('', t.patient);
    expect(ok.status).toBe(200);
    expect(ok.text).toContain(name);
    expect((await get('?nam=abc', t.patient)).status).toBe(400);
    failAfterStatement(
      h.db,
      /^\s*SELECT lh\.ma_lich_hen AS maLichHen/,
      new Error('MySQL hỏng'),
    );
    const failing = await get('', t.patient);
    expect(failing.status).toBe(500);
    expect(failing.text).not.toContain(name);
    expect((failing.body as { requestId?: string }).requestId).toBeDefined();

    const log = captured.join('');
    expect(log).not.toContain(name);
    expect(log).not.toContain(v.one.maLichHen);
  });
});

// ───────────── doctor-exam B5: GET /patient/exam-records/:maLichHen (chi tiết một lịch HoanThanh; PLAN 5.6, 5.11; XHS-06…XHS-11, XHS-20; QHK-01, QHK-05, QHK-12; BDK-01 phần của route này) ─────────────
// Dùng chung khung `world()`, đăng nhập và `get` ở trên. Phần dịch vụ và SQL: src/doctor/examination/patient-view/patient-exam-detail.int-spec.ts.
const NOT_FOUND = 'KHONG_TIM_THAY';
const DETAIL_KEYS = [
  'bacSi',
  'chiNhanh',
  'chuyenKhoa',
  'coTheDanhGia',
  'danhGia',
  'hoSoKham',
  'maLichHen',
  'nguoiKham',
  'thoiGian',
];
const RECORD_KEYS = [
  'capNhatBoi',
  'capNhatLanCuoi',
  'chanDoanSoBo',
  'huongXuLy',
  'ngayTaiKhamDuKien',
  'trieuChung',
];

interface DetailBody {
  maLichHen: string;
  nguoiKham: { hoTen: string; quanHe: string | null };
  hoSoKham: Record<string, unknown> | null;
  danhGia: Record<string, unknown> | null;
  coTheDanhGia: boolean;
}

/** `GET /patient/exam-records/<code><suffix>`: `code` viết thẳng vào đường dẫn (mã sai dạng tự `encodeURIComponent` nếu có ký tự đặc biệt). */
const detail = (code: string, accessToken?: string, suffix = '') =>
  get(`/${code}${suffix}`, accessToken);

describe('XHS-06, XHS-10, XHS-20, QHK-12 (B5) Bệnh nhân xem chi tiết một lịch', () => {
  it('200 khám cho người thân: đúng chín khoá, sáu khoá hồ sơ, ba khoá đánh giá; no-store; giá trị đúng; đánh giá bị ẩn vẫn nguyên vẹn, không lộ lý do; không khoá cấm ở độ sâu nào', async () => {
    const t = await world();
    const names = await nameDoctorAndPatient(h.db, t.w);
    const v = await seedVisits(h.db, fx, t.w, {
      rel: { at: '2026-11-03 09:00:00', hoSoNguoiThanId: t.w.relativeId },
    });
    await t.exam.record(v.rel.lichHenId, {
      ngayTaiKhamDuKien: '2026-11-24',
      capNhatLanCuoi: '2026-11-03 11:30:15',
    });
    await t.exam.rating(v.rel.lichHenId, {
      soSao: 3,
      nhanXet: 'Nhận xét thật',
      biAn: true,
      lyDoAn: 'Lý do ẩn nhạy cảm',
    });

    const res = await detail(v.rel.maLichHen, t.patient);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.body as DetailBody;
    expect(Object.keys(body).toSorted()).toEqual(DETAIL_KEYS);
    expect(Object.keys(body.hoSoKham ?? {}).toSorted()).toEqual(RECORD_KEYS);
    expect(Object.keys(body.danhGia ?? {}).toSorted()).toEqual([
      'nhanXet',
      'soSao',
      'thoiDiemTao',
    ]);
    expect(body).toMatchObject({
      maLichHen: v.rel.maLichHen,
      thoiGian: '2026-11-03T02:00:00.000Z',
      nguoiKham: { hoTen: 'Người thân mẫu' },
      hoSoKham: {
        ngayTaiKhamDuKien: '2026-11-24',
        capNhatLanCuoi: '2026-11-03T04:30:15.000Z',
        capNhatBoi: names.doctorName,
      },
      danhGia: {
        soSao: 3,
        nhanXet: 'Nhận xét thật',
        thoiDiemTao: '2026-11-10T02:00:00.000Z',
      },
      coTheDanhGia: false,
    });
    const forbidden = keysDeep(res.body).filter((key) =>
      (FORBIDDEN_DETAIL_KEYS as readonly string[]).includes(key),
    );
    expect(forbidden).toEqual([]);
    expect(res.text).not.toContain('Lý do ẩn nhạy cảm');
  });

  it('200 khám cho bản thân, chưa hồ sơ, chưa đánh giá: hoSoKham và danhGia null, coTheDanhGia true, nguoiKham là tên tài khoản và quanHe null', async () => {
    const t = await world();
    const names = await nameDoctorAndPatient(h.db, t.w);
    const v = await seedVisits(h.db, fx, t.w, {
      me: { at: '2026-11-03 09:00:00' },
    });
    const res = await detail(v.me.maLichHen, t.patient);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      hoSoKham: null,
      danhGia: null,
      coTheDanhGia: true,
      nguoiKham: {
        hoTen: names.patientName,
        quanHe: null,
      },
    });
  });

  it('XHS-20 nội dung nguyên văn qua HTTP: HTML, emoji 4 byte, CRLF, khoảng trắng đầu cuối về y nguyên trong JSON', async () => {
    const t = await world();
    const v = await seedVisits(h.db, fx, t.w, {
      raw: { at: '2026-11-03 09:00:00' },
    });
    const tricky =
      '  <b>đậm</b> <script>alert(1)</script> 😷\r\nDòng hai\n\n  ';
    await t.exam.record(v.raw.lichHenId, {
      trieuChung: tricky,
      chanDoanSoBo: `${tricky}2`,
      huongXuLy: 'ế'.repeat(2000),
    });
    await t.exam.rating(v.raw.lichHenId, { nhanXet: ` ${tricky} ` });
    const body = (await detail(v.raw.maLichHen, t.patient)).body as DetailBody;
    expect(body.hoSoKham).toMatchObject({
      trieuChung: tricky,
      chanDoanSoBo: `${tricky}2`,
      huongXuLy: 'ế'.repeat(2000),
    });
    expect(body.danhGia?.['nhanXet']).toBe(` ${tricky} `);
  });
});

describe('XHS-07, QHK-05 (B5) mọi trường hợp "không thấy" ra CÙNG 404 KHONG_TIM_THAY, cùng thân, có no-store', () => {
  it('lịch của người khác (kể cả khám cho hồ sơ người thân), sáu trạng thái khác HoanThanh, mã không tồn tại và mã SAI DẠNG: thân giống hệt nhau từng byte; không lộ tên người thân', async () => {
    const t = await world();
    const aRel = await fx.relative(t.w.patientId, {
      hoTen: 'Người thân của A',
    });
    const v = await seedVisits(h.db, fx, t.w, {
      a1: { at: '2026-11-02 09:00:00' },
      aRel: { at: '2026-11-03 09:00:00', hoSoNguoiThanId: aRel },
      b1: { at: '2026-11-04 09:00:00', patientId: t.w.secondPatientId },
      hold: { state: 'ChoThanhToan' },
      confirmed: { state: 'DaXacNhan' },
      inVisit: { state: 'DaTiepDon' },
      cancelled: { state: 'DaHuy' },
      absent: { state: 'VangMat' },
      moved: { state: 'DaDoiLich' },
    });
    // (mã, token): tuần tự để mỗi yêu cầu độc lập
    const asks: [string, string][] = [
      [v.a1.maLichHen, t.second],
      [v.aRel.maLichHen, t.second],
      [v.b1.maLichHen, t.patient],
      ['CLX-20990101-ZZZZZ', t.patient],
      ...[v.hold, v.confirmed, v.inVisit, v.cancelled, v.absent, v.moved].map(
        (lich): [string, string] => [lich.maLichHen, t.patient],
      ),
      ...[
        'abc',
        'CLX-2026111-7K3QD',
        'CLX-20261110-7K3Q',
        'CLX-20261110-7K3QD-X',
        'x'.repeat(300),
        encodeURIComponent("CLX-20261110-7K3Q'D"),
      ].map((code): [string, string] => [code, t.patient]),
    ];
    let reference: { text: string; body: unknown } | undefined;
    for (const [code, token] of asks) {
      const res = await detail(code, token);
      const body = expectErrorResponse(res, 404, NOT_FOUND);
      reference ??= { text: res.text, body };
      expect(body).toEqual({
        maLoi: NOT_FOUND,
        thongBao: 'Không tìm thấy dữ liệu.',
      });
      expect(res.text).toBe(reference.text);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.text).not.toContain('Người thân của A');
    }
    expect(asks).toHaveLength(16);
  });

  it('mã chữ thường, có khoảng trắng đầu cuối ⇒ 200 (chuẩn hoá ở pipe); khoá lạ ở query bị BỎ QUA (khác danh sách): chủ sở hữu vẫn chỉ từ token', async () => {
    const t = await world();
    const v = await seedVisits(h.db, fx, t.w, {
      mine: { at: '2026-11-03 09:00:00' },
      theirs: { at: '2026-11-04 09:00:00', patientId: t.w.secondPatientId },
    });
    const loose = encodeURIComponent(`  ${v.mine.maLichHen.toLowerCase()} `);
    expect((await detail(loose, t.patient)).status).toBe(200);
    const withKey = await detail(
      v.mine.maLichHen,
      t.patient,
      `?benhNhanId=${t.w.secondPatientId}&tuyY=1`,
    );
    expect(withKey.status).toBe(200);
    expect((withKey.body as DetailBody).maLichHen).toBe(v.mine.maLichHen);
    const probe = await detail(
      v.theirs.maLichHen,
      t.patient,
      `?benhNhanId=${t.w.secondPatientId}`,
    );
    expectErrorResponse(probe, 404, NOT_FOUND);
  });
});

describe('XHS-11, QHK-01 (B5) quyền của route chi tiết', () => {
  it('khách ⇒ 401; Bác sĩ, Lễ tân, QTV Chi nhánh, QTV Toàn hệ thống ⇒ ĐÚNG 403 KHONG_DU_QUYEN, kể cả với mã SAI DẠNG (guard trước pipe); Bệnh nhân ⇒ 200', async () => {
    const t = await world();
    const v = await seedVisits(h.db, fx, t.w, {
      me: { at: '2026-11-03 09:00:00' },
    });
    for (const code of [v.me.maLichHen, 'abc'])
      expectErrorResponse(await detail(code), 401, NOT_LOGGED_IN);
    for (const token of [t.doctor, t.reception, t.branch, t.system])
      for (const code of [v.me.maLichHen, 'abc'])
        expectErrorResponse(await detail(code, token), 403, FORBIDDEN);
    expect((await detail(v.me.maLichHen, t.patient)).status).toBe(200);
  });
});

// Mã lịch nằm TRONG đường dẫn nên dòng log 5xx của bộ lọc lỗi toàn cục (`ExceptionFilter`: "GET <đường dẫn> → 500 account=…", module chung, ngoài phạm vi B5) có mã lịch: lần chạy đầu của B5 thấy đúng điều đó.
// Vì vậy mã lịch chỉ được khẳng định vắng ở nhánh 200 và 404 (như kế hoạch 18.2); nội dung khám, nhận xét, tên người khám vắng ở MỌI nhánh kể cả 500 (như BDK-01 của B2).
describe('BDK-01 (B5) log không chứa nội dung khám, nhận xét, tên người khám (mọi nhánh) hay mã lịch (nhánh 200 và 404)', () => {
  it('quét stdout, stderr và console qua 200, 404 do service, 404 do pipe và 500 (câu chi tiết hỏng): dữ liệu mẫu không xuất hiện; mã lịch vắng trước nhánh 500; 500 có requestId, không lộ nội dung', async () => {
    const name = 'BDK01B5TENNGUOITHAN';
    const content = 'BDK01B5NOIDUNGKHAM';
    const comment = 'BDK01B5NHANXET';
    const captured = captureLogs();

    const t = await world();
    const rel = await fx.relative(t.w.patientId, { hoTen: name });
    const v = await seedVisits(h.db, fx, t.w, {
      one: { at: '2026-11-03 09:00:00', hoSoNguoiThanId: rel },
      other: { at: '2026-11-04 09:00:00', patientId: t.w.secondPatientId },
    });
    await t.exam.record(v.one.lichHenId, { trieuChung: content });
    await t.exam.rating(v.one.lichHenId, { nhanXet: comment });
    const ok = await detail(v.one.maLichHen, t.patient);
    expect(ok.status).toBe(200);
    expect(ok.text).toContain(content);
    expect((await detail(v.other.maLichHen, t.patient)).status).toBe(404);
    expect((await detail('abc', t.patient)).status).toBe(404);
    // mốc: mọi thứ ghi ra TRƯỚC nhánh 500 (200 và hai 404) không có mã lịch
    const beforeFailure = captured.join('');
    for (const code of [v.one.maLichHen, v.other.maLichHen])
      expect(beforeFailure).not.toContain(code);
    failAfterStatement(
      h.db,
      /^\s*SELECT lh\.ma_lich_hen AS maLichHen/,
      new Error('MySQL hỏng'),
    );
    const failing = await detail(v.one.maLichHen, t.patient);
    expect(failing.status).toBe(500);
    for (const piece of [name, content, comment])
      expect(failing.text).not.toContain(piece);
    expect((failing.body as { requestId?: string }).requestId).toBeDefined();

    const log = captured.join('');
    for (const piece of [name, content, comment])
      expect(log).not.toContain(piece);
  });
});
