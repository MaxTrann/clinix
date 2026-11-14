import request from 'supertest';
import { vi } from 'vitest';
import { DOCTOR_LEAVE_PORT } from './../src/appointments/ports/doctor-leave.port.js';
import {
  BOOKABLE_DAY,
  BookingFixtures,
} from './../src/appointments/testing/booking-fixtures.js';
import { lichHenRows } from './../src/appointments/testing/create-appointment-world.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';
import { LeaveReader } from './../src/scheduling/leave/leave.reader.js';

// Task B16a (nửa `doctor` của B16; TRACKING 3.39 B16a-F) — LRP-03 (mã mới `[đề xuất]`, PLAN 7.45): cổng nghỉ phép THẬT qua HTTP: AppModule + MySQL thật + configureApp như main.ts, KHÔNG `overrideProvider` và KHÔNG `vi.spyOn` cổng (khác
// DL-17 của booking-checks.e2e-spec.ts, vốn thay kết quả cổng bằng spy). Yêu cầu nghỉ phép là HÀNG THẬT trong DB (`yeu_cau_nghi_phep`), nên chứng minh `AppointmentsModule` nối `LeaveReader` của `doctor` vào cả hai route: `POST /booking/checks`
// (chỉ đọc) và `POST /booking/appointments` (đường ghi, dưới khoá `bac_si`). Tầng dịch vụ và SQL: src/appointments/ports/doctor-leave.real-port.int-spec.ts (DL-17, CG-05, LRP-01). Đồng hồ giả: 08:00 ngày 02/11/2026; ô 0 của thế giới là 08:00 ngày 10/11/2026.
const CHECKS = '/booking/checks';
const APPOINTMENTS = '/booking/appointments';
const LEAVE_BLOCKED = 'BAC_SI_NGHI_PHEP';

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

const post = (path: string, body: unknown, accessToken: string) =>
  request(h.app.getHttpServer())
    .post(path)
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify(body));

async function world() {
  const w = await fx.world();
  const token = (await h.sessions.create(w.patient.account.taiKhoanId))
    .accessToken;
  const slot = w.slotIds[0]!;
  /** Yêu cầu nghỉ CẢ NGÀY `batDau` của bác sĩ thế giới, ở `trangThai`, chèn thẳng như `DoctorFixtures`. */
  const leave = (
    trangThai: 'ChoDuyet' | 'DaDuyet' | 'TuChoi',
    batDau: string = BOOKABLE_DAY,
  ) =>
    fx.doctor.leaveRequest({
      bacSiId: w.doctor.account.taiKhoanId,
      trangThai,
      batDau,
      ...(trangThai === 'ChoDuyet'
        ? {}
        : {
            nguoiXuLyId: w.systemAdmin.account.taiKhoanId,
            thoiDiemXuLy: '2026-11-01 09:00:00',
          }),
    });
  return {
    ...w,
    slot,
    leave,
    check: () => post(CHECKS, { khungGioId: slot }, token),
    book: () => post(APPOINTMENTS, { khungGioId: slot }, token),
  };
}

describe('LRP-03 AppModule thật, không overrideProvider: cổng nghỉ phép của đặt lịch là LeaveReader của doctor', () => {
  it('DOCTOR_LEAVE_PORT của app là đúng thể hiện LeaveReader của SchedulingModule (không còn Noop)', () => {
    const port = h.app.get(DOCTOR_LEAVE_PORT, { strict: false });
    expect(port).toBeInstanceOf(LeaveReader);
    expect(port).toBe(h.app.get(LeaveReader, { strict: false }));
  });

  it.each(['DaDuyet', 'ChoDuyet'] as const)(
    'DL-17, CG-05 yêu cầu %s THẬT trong DB ⇒ POST /booking/checks và POST /booking/appointments đều 409 BAC_SI_NGHI_PHEP; không ghi lịch, khung giờ vẫn ConTrong',
    async (trangThai) => {
      const w = await world();
      await w.leave(trangThai);

      expectErrorResponse(await w.check(), 409, LEAVE_BLOCKED);
      expectErrorResponse(await w.book(), 409, LEAVE_BLOCKED);

      expect(await lichHenRows(h.db)).toHaveLength(0);
      expect(await fx.slotState(w.slot)).toStrictEqual({
        trangThai: 'ConTrong',
        giuChoDen: null,
      });
    },
  );

  it.each([
    {
      name: 'TuChoi đúng ngày (không chặn)',
      trangThai: 'TuChoi',
      day: BOOKABLE_DAY,
    },
    {
      name: 'DaDuyet ngày liền sau (biên)',
      trangThai: 'DaDuyet',
      day: '2026-11-11',
    },
  ] as const)(
    'DL-17, CG-05 $name ⇒ checks 200 và appointments 201, lịch DaXacNhan',
    async ({ trangThai, day }) => {
      const w = await world();
      await w.leave(trangThai, day);

      expect((await w.check()).status).toBe(200);
      const res = await w.book();

      expect(res.status).toBe(201);
      expect(await lichHenRows(h.db)).toMatchObject([
        { khungGioId: w.slot, trangThai: 'DaXacNhan' },
      ]);
    },
  );
});
