import request from 'supertest';
import { vi } from 'vitest';
import { AppointmentListFixtures } from './../src/appointments/testing/appointment-list-fixtures.js';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import {
  DOCTOR_CODES,
  DoctorListFixtures,
  RECORD_MARKER,
} from './../src/appointments/testing/doctor-list-fixtures.js';
import {
  CODES,
  OperationsListFixtures,
} from './../src/appointments/testing/operations-list-fixtures.js';
import {
  collectKeys,
  HEALTH_RECORD_KEY,
} from './../src/appointments/testing/response-keys.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { resetTables } from './../src/database/testing/test-database.js';

// doctor-exam B3 — QHK-08 qua HTTP THẬT (AppModule + MySQL thật + configureApp như main.ts; PLAN 7.7 QHK-08, H10; TRACKING doctor-exam 17): Lễ tân, Quản trị viên (cả hai phạm vi) và Bệnh nhân KHÔNG đọc được
// nội dung hồ sơ khám ở bất kỳ route ĐỌC lịch hẹn nào của booking (danh sách và chi tiết của `reception/`, `admin/`, `patient/`). Thế giới có MỌI lịch đều có dòng `ho_so_kham` (kể cả ở trạng thái mà vai trò đang xem), nội dung mẫu mang
// dấu hiệu duy nhất `RECORD_MARKER`: route nào lỡ trả hồ sơ sẽ lộ dấu hiệu hoặc khoá của `HEALTH_RECORD_KEY`. Ca đối chứng dương: chính Bác sĩ phụ trách THẤY nội dung (chứng minh dữ liệu có thật và đọc được), bác sĩ khác thì 404.
// Quét tĩnh (AR-09: không file nào của appointments/ ngoài doctor-appointments.repository.ts đọc `ho_so_kham`): src/appointments/architecture.spec.ts. Dữ liệu giả (email đuôi example.com, SĐT minh hoạ).
const C = { ...CODES, ...DOCTOR_CODES };

let h: RefreshHarness;
let fx: BookingFixtures;
let lf: AppointmentListFixtures;
let ofx: OperationsListFixtures;
let dfx: DoctorListFixtures;

beforeAll(async () => {
  h = await openRefreshHarness();
  fx = new BookingFixtures(h.db);
});

beforeEach(async () => {
  await resetTables(h.db);
  h.mail.reset();
  // Bộ nhớ khung giờ đã dùng của fixture phải làm lại sau mỗi lần xoá bảng
  lf = new AppointmentListFixtures(fx, h.db);
  ofx = new OperationsListFixtures(fx, lf, h.db);
  dfx = new DoctorListFixtures(fx, ofx, h.db);
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
const get = (path: string, accessToken: string) =>
  request(h.app.getHttpServer())
    .get(path)
    .set('Authorization', `Bearer ${accessToken}`);

// Mỗi vai trò: đường danh sách và các mã chi tiết mà vai trò đó THẤY được (đủ ba trạng thái có hồ sơ hiện ở Bác sĩ: DaXacNhan, DaTiepDon, HoanThanh)
const ROLES = [
  'Lễ tân',
  'QTV Chi nhánh',
  'QTV Toàn hệ thống',
  'Bệnh nhân một',
  'Bệnh nhân hai',
] as const;

async function world() {
  const w = await dfx.world();
  // MỌI lịch đều có hồ sơ: một route lỡ trả hồ sơ thì lộ ở lịch nào vai trò đó xem được
  for (const app of Object.values(w.apps))
    await dfx.insertRecord(app.lichHenId);
  const branchAdmin = await fx.admin.admin(w.branchA);
  const systemAdmin = await fx.admin.admin();
  return {
    ...w,
    doctorToken: await tokenOf(w.doctorA1.account.taiKhoanId),
    strangerToken: await tokenOf(w.doctorA2.account.taiKhoanId),
    roles: {
      'Lễ tân': {
        token: await tokenOf(w.receptionA.account.taiKhoanId),
        list: '/reception/appointments',
        detail: (code: string) => `/reception/appointments/${code}`,
        codes: [C.a1, C.a3, C.c2],
      },
      'QTV Chi nhánh': {
        token: await tokenOf(branchAdmin.account.taiKhoanId),
        list: '/admin/appointments',
        detail: (code: string) => `/admin/appointments/${code}`,
        codes: [C.a1, C.a3, C.c2],
      },
      'QTV Toàn hệ thống': {
        token: await tokenOf(systemAdmin.account.taiKhoanId),
        list: '/admin/appointments',
        detail: (code: string) => `/admin/appointments/${code}`,
        codes: [C.a1, C.a3, C.c2],
      },
      'Bệnh nhân một': {
        token: await tokenOf(w.oneId),
        list: '/patient/appointments',
        detail: (code: string) => `/patient/appointments/${code}`,
        codes: [C.a1, C.c2],
      },
      'Bệnh nhân hai': {
        token: await tokenOf(w.twoId),
        list: '/patient/appointments',
        detail: (code: string) => `/patient/appointments/${code}`,
        codes: [C.a3, C.c1],
      },
    },
  };
}

describe('QHK-08 vai trò khác Bác sĩ không đọc được nội dung hồ sơ khám ở route ĐỌC lịch hẹn nào của booking', () => {
  it.each(ROLES)(
    'QHK-08 %s: danh sách và chi tiết (mọi lịch đều có hồ sơ ở DB) trả 200, KHÔNG khoá khớp `HEALTH_RECORD_KEY`, KHÔNG dấu hiệu nội dung hồ sơ trong thân',
    async (role) => {
      const w = await world();
      const records = await h.db.query<{ total: string }[]>(
        'SELECT COUNT(*) AS total FROM ho_so_kham',
      );
      expect(Number(records[0]?.total)).toBe(Object.keys(w.apps).length);
      const target = w.roles[role];

      const list = await get(target.list, target.token);
      expect(list.status, role).toBe(200);
      expect(
        (list.body as { items: unknown[] }).items.length,
        role,
      ).toBeGreaterThan(0);
      for (const code of target.codes) {
        const detail = await get(target.detail(code), target.token);
        expect(detail.status, `${role} ${code}`).toBe(200);
        for (const body of [list.body, detail.body]) {
          expect(
            collectKeys(body).filter((key) => HEALTH_RECORD_KEY.test(key)),
            `${role} ${code}`,
          ).toStrictEqual([]);
          expect(JSON.stringify(body), `${role} ${code}`).not.toContain(
            RECORD_MARKER,
          );
        }
      }
    },
  );

  it('QHK-08 đối chứng dương: Bác sĩ phụ trách THẤY nội dung ở cùng lịch (dữ liệu có thật và đọc được qua API của Bác sĩ), còn bác sĩ khác nhận 404 và không có dấu hiệu nào', async () => {
    const w = await world();
    const own = await get(`/doctor/appointments/${C.c2}`, w.doctorToken);
    expect(own.status).toBe(200);
    expect(JSON.stringify(own.body)).toContain(RECORD_MARKER);
    expect(Object.keys(own.body as object)).toContain('ghiChuKham');
    const stranger = await get(`/doctor/appointments/${C.c2}`, w.strangerToken);
    expect(stranger.status).toBe(404);
    expect(JSON.stringify(stranger.body)).not.toContain(RECORD_MARKER);
  });
});
