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
  FORBIDDEN_LIST_KEYS,
  keysDeep,
  seedVisits,
} from './../src/doctor/examination/testing/patient-exam-stack.js';

// doctor-exam B4 — GET /patient/exam-records qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN 5.6, 5.11, 7.3 XHS-01…XHS-05, XHS-10…XHS-13; 7.7 QHK-01, QHK-03, QHK-05, QHK-12; 7.11 BDK-01 phần của route này; TRACKING 15).
// Phần dịch vụ và SQL: src/doctor/examination/patient-view/patient-exam-records.int-spec.ts. QHK-01, QHK-12, BDK-01 là mã của MỌI route khám bệnh: ở đây chỉ phần B4. Dữ liệu giả (email đuôi example.com).
// CA QHK-01 khẳng định ĐÚNG 403 KHONG_DU_QUYEN cả khi query SAI (guard chạy TRƯỚC pipe: người sai vai trò nhận 403, không phải 400).
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
