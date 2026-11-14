import { Logger } from '@nestjs/common';
import request from 'supertest';
import { vi } from 'vitest';
import { withBookingTransaction } from './../src/appointments/locking/booking-transaction.js';
import {
  DOCTOR_LEAVE_PORT,
  type DoctorLeavePort,
} from './../src/appointments/ports/doctor-leave.port.js';
import {
  PAYMENT_SUMMARY_PORT,
  type PaymentSummaryPort,
} from './../src/appointments/ports/payment.port.js';
import { AppointmentTransitionService } from './../src/appointments/state/appointment-transition.service.js';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import { SLOT0_TIME } from './../src/appointments/testing/cancel-world.js';
import { secondDoctorOf } from './../src/appointments/testing/create-appointment-world.js';
import {
  createGate,
  runConcurrently,
  withRowLock,
} from './../src/appointments/testing/concurrency-harness.js';
import { assertBookingInvariants } from './../src/appointments/testing/invariants.js';
import {
  firstTableOf,
  isLockingStatement,
} from './../src/appointments/testing/query-spy.js';
import { AFTER_ALL_WINDOWS } from './../src/appointments/testing/status-world.js';
import { recordStatements } from './../src/appointments/testing/statement-recorder.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { deferred } from './../src/auth/testing/verification-int-helpers.js';
import { resetTables } from './../src/database/testing/test-database.js';
import {
  expectLocksReleased,
  LOCK_PATIENT_SQL,
  waitForLockWaiterOn,
} from './../src/patient/testing/relatives-deactivate-helpers.js';

// Task X3 (booking #264 cặp patient #154) — hợp đồng khoá với `patient` qua HTTP THẬT: AppModule + MySQL thật + configureApp như main.ts (PLAN booking 5.3, 7.12, 7.47; PLAN patient 5.3, NT-10…NT-17, NT-24;
// TRACKING booking 3.41). Mọi lịch hẹn do `POST /booking/appointments` TẠO; hồ sơ do `POST /patient/relatives/:id/deactivate` NGỪNG; huỷ, tiếp đón, vắng mặt bằng route thật của `patient` và Lễ tân.
// Mã KTH-nn là [đề xuất]. Phần mức dịch vụ đã có từ B8 (`create-appointment.concurrency.int-spec.ts`, `create-appointment.service.int-spec.ts`) và B5 (`relatives.service.deactivate.*`).
// Ô i của thế giới bắt đầu 08:00 + 30 phút × i giờ Việt Nam ngày 10/11/2026; đồng hồ giả (chỉ `Date`) là T0 = 08:00 ngày 02/11/2026; `vi.setSystemTime` đổi giờ của CẢ token truy cập nên ca nào đổi giờ phải
// tạo token SAU khi đặt giờ. Cổng thanh toán, thông báo là bản `Noop` của app; cổng nghỉ phép là cổng của module (spy lấy từ AppModule, nên đúng cả khi B16a thay `Noop` bằng `LeaveReader`). Dữ liệu giả.
const CONFLICT_ACTIVE = 'HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN';
const CONFLICT_STOPPED = 'HO_SO_NGUOI_THAN_DA_NGUNG';
const NOT_FOUND = 'KHONG_TIM_THAY';
const DETAIL_KEYS = ['bacSi', 'chiNhanh', 'maLichHen', 'thoiGian', 'trangThai'];
const ROUNDS = 30;
const SLOW = 300_000;
const SLOT_MS = 30 * 60_000;

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

const sleepMs = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
const bodyOf = (res: { body: unknown }) => res.body as Record<string, unknown>;
const tokenOf = async (accountId: string) =>
  (await h.sessions.create(accountId)).accessToken;
/** Giờ bắt đầu của ô `index` (08:00 giờ Việt Nam ngày 10/11/2026 cộng 30 phút mỗi ô). */
const slotTime = (index: number) =>
  new Date(SLOT0_TIME.getTime() + index * SLOT_MS);

const post = (path: string, accessToken: string, body: unknown = {}) =>
  request(h.app.getHttpServer())
    .post(path)
    .set('Authorization', `Bearer ${accessToken}`)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify(body));
const book = (
  accessToken: string,
  khungGioId: string,
  hoSoNguoiThanId: string | null = null,
) =>
  post('/booking/appointments', accessToken, { khungGioId, hoSoNguoiThanId });
const deactivate = (accessToken: string, relativeId: string) =>
  post(`/patient/relatives/${relativeId}/deactivate`, accessToken);
const cancel = (accessToken: string, code: string) =>
  post(`/patient/appointments/${code}/cancel`, accessToken);
const receptionStatus = (
  accessToken: string,
  code: string,
  trangThai: 'DaTiepDon' | 'VangMat',
) => post(`/reception/appointments/${code}/status`, accessToken, { trangThai });

/** Thế giới đặt được (`BookingFixtures.world`) cộng token của Bệnh nhân, mã bác sĩ và hàm ô. */
async function world() {
  const w = await fx.world();
  const patientId = w.patient.account.taiKhoanId;
  return {
    ...w,
    patientId,
    doctorId: w.doctor.account.taiKhoanId,
    dichVuKhamId: w.doctor.profile.dichVuKhamId,
    slot: (index: number) => w.slotIds[index]!,
    token: await tokenOf(patientId),
  };
}
type World = Awaited<ReturnType<typeof world>>;

/** Đặt lịch qua route thật vào khung giờ `khungGioId`, khẳng định 201 và trả mã lịch. */
async function bookSlotOk(
  accessToken: string,
  khungGioId: string,
  relativeId: string | null,
): Promise<string> {
  const res = await book(accessToken, khungGioId, relativeId);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return bodyOf(res)['maLichHen'] as string;
}
/** Như `bookSlotOk` cho ô `index` của bác sĩ của thế giới. */
const bookOk = (
  accessToken: string,
  w: World,
  index: number,
  relativeId: string | null,
) => bookSlotOk(accessToken, w.slot(index), relativeId);

const setDeposit = (w: World, tienCoc: string) =>
  fx.depositService(w.dichVuKhamId, tienCoc, [
    [2, 50],
    [24, 100],
  ]);

/** Cọc 0đ ⇒ Lễ tân chuyển `DaTiepDon` bằng route thật khi đồng hồ ở đúng giờ hẹn của ô `index` (trong cửa sổ tiếp đón); cổng thanh toán là `Noop` nên "còn phải thu" được ép về 0. */
async function checkIn(w: World, code: string, index: number) {
  vi.setSystemTime(slotTime(index));
  const payments = h.app.get<PaymentSummaryPort>(PAYMENT_SUMMARY_PORT, {
    strict: false,
  });
  vi.spyOn(payments, 'remainingToCollect').mockResolvedValue('0.00');
  const res = await receptionStatus(
    await tokenOf(w.receptionist.account.taiKhoanId),
    code,
    'DaTiepDon',
  );
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  expect(bodyOf(res)).toStrictEqual({
    maLichHen: code,
    trangThai: 'DaTiepDon',
  });
}

/** Ngày giờ và tên đúng như `chiTiet` của ngừng hồ sơ sẽ trả, đọc từ DB (tên bác sĩ, tên chi nhánh). */
async function detailOf(
  w: World,
  code: string,
  index: number,
  trangThai: string,
  doctorId: string = w.doctorId,
) {
  const [doctor] = (await h.db.query(
    'SELECT ho_ten AS ten FROM tai_khoan WHERE tai_khoan_id = ?',
    [doctorId],
  )) as { ten: string }[];
  const [branch] = (await h.db.query(
    'SELECT ten FROM chi_nhanh WHERE chi_nhanh_id = ?',
    [w.branch.chiNhanhId],
  )) as { ten: string }[];
  return {
    maLichHen: code,
    thoiGian: slotTime(index).toISOString(),
    trangThai,
    bacSi: doctor!.ten,
    chiNhanh: branch!.ten,
  };
}

/** Hiệu lực của một hồ sơ và số lịch ĐANG HOẠT ĐỘNG của nó (tập mà ngừng hồ sơ coi là chặn). */
async function relativeState(
  relativeId: string,
): Promise<{ active: boolean; lich: number }> {
  const [row] = (await h.db.query(
    `SELECT h.trang_thai_hieu_luc AS hl,
       (SELECT COUNT(*) FROM lich_hen l WHERE l.ho_so_nguoi_than_id = h.ho_so_nguoi_than_id
          AND l.trang_thai IN ('ChoThanhToan', 'DaXacNhan', 'DaTiepDon')) AS n
     FROM ho_so_nguoi_than h WHERE h.ho_so_nguoi_than_id = ?`,
    [relativeId],
  )) as { hl: number | string; n: number | string }[];
  return { active: Number(row!.hl) === 1, lich: Number(row!.n) };
}

const lichHenRows = () =>
  h.db.query('SELECT * FROM lich_hen ORDER BY lich_hen_id') as Promise<
    Record<string, unknown>[]
  >;
const slotStatus = async (khungGioId: string) =>
  (
    (await h.db.query(
      'SELECT trang_thai AS t FROM khung_gio WHERE khung_gio_id = ?',
      [khungGioId],
    )) as { t: string }[]
  )[0]!.t;

/** Số giao dịch đang CHỜ khoá một hàng của bảng `table` (performance_schema; chỉ schema của DB test). */
const waitersOn = async (table: string) => {
  const rows = (await h.db.query(
    `SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits w
     JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID = w.REQUESTING_ENGINE_LOCK_ID
     WHERE l.OBJECT_SCHEMA = DATABASE() AND l.OBJECT_NAME = ?`,
    [table],
  )) as { n: string | number }[];
  return Number(rows[0]!.n);
};

/** Đếm số lần `withBookingTransaction` ĐÃ thử lại vì 1213 hay 1205 (cảnh báo "MySQL 1213 ở lần chạy …"); không đổi hành vi. KHÔNG dùng `serverDeadlocks` (nó `SET GLOBAL`). */
function watchRetries() {
  const messages: string[] = [];
  vi.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
    if (typeof message === 'string' && /MySQL (1213|1205)/.test(message))
      messages.push(message);
  });
  return {
    deadlocks: () => messages.filter((m) => m.includes('MySQL 1213')).length,
    timeouts: () => messages.filter((m) => m.includes('MySQL 1205')).length,
  };
}

/** Các câu BÊN TRONG giao dịch có `INSERT INTO lich_hen` (giữa `START TRANSACTION` và `COMMIT` kế tiếp) trong danh sách câu đã ghi. */
function createTransactionOf(statements: readonly string[]): string[] {
  for (let start = 0; start < statements.length; start += 1) {
    if (!/^START TRANSACTION/i.test(statements[start]!)) continue;
    const end = statements.findIndex(
      (sql, index) => index > start && /^(COMMIT|ROLLBACK)/i.test(sql),
    );
    const inside = statements.slice(start + 1, end < 0 ? undefined : end);
    if (inside.some((sql) => /INSERT INTO\s+`?lich_hen`?\s/i.test(sql)))
      return inside;
  }
  throw new Error('không thấy giao dịch tạo lịch (INSERT INTO lich_hen)');
}

// ───────────────────────────── Nhóm hợp đồng khoá (KTH-05…KTH-08) ─────────────────────────────

describe('KTH-05 (KT-02, KT-05, NT-18) ngừng bằng route patient THẬT rồi đặt bằng route booking THẬT', () => {
  it('hồ sơ vừa ngừng ⇒ 409 HO_SO_NGUOI_THAN_DA_NGUNG, không lịch mới, khung giờ vẫn ConTrong; hồ sơ của Bệnh nhân khác ⇒ 404 KHONG_TIM_THAY cùng thân với id không tồn tại; hồ sơ còn hiệu lực ⇒ 201', async () => {
    const w = await world();
    const other = await fx.admin.patient();
    const theirs = await fx.relative(other.account.taiKhoanId);
    const toStop = await fx.relative(w.patientId, { hoTen: 'Sắp ngừng' });

    const stopped = await deactivate(w.token, toStop);
    expect(stopped.status).toBe(200);
    expect(bodyOf(stopped)).toStrictEqual({ trangThaiHieuLuc: false });

    const afterStop = await book(w.token, w.slot(0), toStop);
    expect(afterStop.status).toBe(409);
    expect(bodyOf(afterStop)['maLoi']).toBe(CONFLICT_STOPPED);
    expect(await lichHenRows()).toHaveLength(0);
    expect(await slotStatus(w.slot(0))).toBe('ConTrong');

    const ofOther = await book(w.token, w.slot(0), theirs);
    const missing = await book(w.token, w.slot(0), '999999999');
    expect(ofOther.status).toBe(404);
    expect(bodyOf(ofOther)['maLoi']).toBe(NOT_FOUND);
    expect(ofOther.text).toBe(missing.text);
    expect(await lichHenRows()).toHaveLength(0);

    const mine = await book(w.token, w.slot(0), w.relativeId);
    expect(mine.status).toBe(201);
    expect(await slotStatus(w.slot(0))).toBe('DaDat');
    await assertBookingInvariants(h.db);
  });
});

describe('KTH-06 (NT-24, KT-04) "tạo đến trước" TẤT ĐỊNH qua HTTP và thứ tự câu khoá của giao dịch tạo', () => {
  it('KTH-06a POST /booking/appointments dừng ở cổng nghỉ phép (dưới khoá); POST …/deactivate ĐỨNG CHỜ benh_nhan (data_lock_waits, không sleep cố định); nhả ⇒ 201 và 409 kèm chiTiet có ĐÚNG lịch vừa tạo; hồ sơ vẫn hiệu lực', async () => {
    const w = await world();
    const leave = h.app.get<DoctorLeavePort>(DOCTOR_LEAVE_PORT, {
      strict: false,
    });
    const reached = deferred();
    const proceed = deferred();
    vi.spyOn(leave, 'findBlockingLeave').mockImplementation(async () => {
      reached.resolve();
      await proceed.promise;
      return null;
    });

    const creating = book(w.token, w.slot(0), w.relativeId).then((res) => res);
    creating.catch(() => undefined);
    let stopping: Promise<request.Response> | undefined;
    try {
      // nếu tạo xong mà không qua cổng nghỉ phép thì ca đỏ ngay (không treo)
      await Promise.race([
        reached.promise,
        creating.then(() => {
          throw new Error('tạo xong mà không đi qua cổng nghỉ phép');
        }),
      ]);
      stopping = deactivate(w.token, w.relativeId).then((res) => res);
      stopping.catch(() => undefined);
      await waitForLockWaiterOn(h.db, 'benh_nhan');
    } finally {
      // nhả cổng KỂ CẢ khi ca đỏ giữa chừng (nếu không, yêu cầu tạo đang dừng giữ giao dịch mở và cả bộ ca treo tới hết hạn), rồi chờ cả hai yêu cầu kết thúc
      proceed.resolve();
      await Promise.allSettled([creating, stopping]);
    }

    const created = await creating;
    const stoppedRes = await stopping!;
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(stoppedRes.status).toBe(409);
    expect(bodyOf(stoppedRes)['maLoi']).toBe(CONFLICT_ACTIVE);
    expect(bodyOf(stoppedRes)['chiTiet']).toStrictEqual([
      await detailOf(w, bodyOf(created)['maLichHen'] as string, 0, 'DaXacNhan'),
    ]);
    expect(await relativeState(w.relativeId)).toStrictEqual({
      active: true,
      lich: 1,
    });
    await assertBookingInvariants(h.db);
    await expectLocksReleased(h.db, w.patientId, w.relativeId);
  });

  it('KTH-06b giao dịch của POST /booking/appointments cho hồ sơ người thân: hai câu ĐẦU chạm bảng là benh_nhan FOR UPDATE rồi ho_so_nguoi_than FOR UPDATE; trước chúng chỉ có SELECT @@ và SET SESSION của withBookingTransaction; câu thứ ba là đọc thường', async () => {
    const w = await world();
    const statements = recordStatements(h.db);

    const res = await book(w.token, w.slot(0), w.relativeId);

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const tx = createTransactionOf(statements);
    const isSetup = (sql: string) => /^\s*(SELECT @@|SET )/i.test(sql);
    const firstReal = tx.findIndex((sql) => !isSetup(sql));
    expect(tx.slice(0, firstReal).every(isSetup)).toBe(true);
    const [first, second, third] = tx.slice(firstReal);
    expect(isLockingStatement(first!)).toBe(true);
    expect(firstTableOf(first!)).toBe('benh_nhan');
    expect(isLockingStatement(second!)).toBe(true);
    expect(firstTableOf(second!)).toBe('ho_so_nguoi_than');
    expect(isLockingStatement(third!)).toBe(false);
  });
});

describe('KTH-07 (KT-03) tất định qua HTTP: giao dịch giả giữ benh_nhan', () => {
  it('POST /booking/appointments CHỜ ở benh_nhan (chưa xin ho_so_nguoi_than, bac_si, khung_gio); sau commit của giao dịch giả đã ngừng hồ sơ thì trả 409 HO_SO_NGUOI_THAN_DA_NGUNG; không lịch mới', async () => {
    const w = await world();

    await withRowLock(
      h.db,
      { sql: LOCK_PATIENT_SQL, params: [w.patientId] },
      async (held) => {
        const pending = book(w.token, w.slot(0), w.relativeId).then(
          (res) => res,
        );
        pending.catch(() => undefined);

        await waitForLockWaiterOn(h.db, 'benh_nhan');
        expect(await waitersOn('ho_so_nguoi_than')).toBe(0);
        expect(await waitersOn('bac_si')).toBe(0);
        expect(await waitersOn('khung_gio')).toBe(0);
        await held.manager.query(
          'UPDATE ho_so_nguoi_than SET trang_thai_hieu_luc = 0 WHERE ho_so_nguoi_than_id = ?',
          [w.relativeId],
        );
        await held.release('commit');

        const res = await pending;
        expect(res.status, JSON.stringify(res.body)).toBe(409);
        expect(bodyOf(res)['maLoi']).toBe(CONFLICT_STOPPED);
      },
    );

    expect(await lichHenRows()).toHaveLength(0);
    expect(await slotStatus(w.slot(0))).toBe('ConTrong');
    await assertBookingInvariants(h.db);
  });
});

describe('KTH-08 (NT-17, KT-01) đua qua HTTP: đặt lịch và ngừng hồ sơ cùng lúc (≥ 30 vòng)', () => {
  it(
    'mỗi vòng đúng MỘT trong hai: (ngừng 200 và đặt 409 HO_SO_NGUOI_THAN_DA_NGUNG, 0 lịch) hoặc (đặt 201 và ngừng 409 HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN, 1 lịch); 0 lỗi 5xx, 0 lần 503; INV-01…INV-05 sau mỗi vòng',
    async () => {
      const retries = watchRetries();
      const branches = { ngungThang: 0, taoThang: 0 };
      let serverErrors = 0;
      let unavailable = 0;

      for (let round = 1; round <= ROUNDS; round += 1) {
        await resetTables(h.db);
        const w = await world();
        const gate = createGate(2);
        const stop = async (delay: number) => {
          await gate.arrive();
          if (delay > 0) await sleepMs(delay);
          return deactivate(w.token, w.relativeId);
        };
        const create = async (delay: number) => {
          await gate.arrive();
          if (delay > 0) await sleepMs(delay);
          return book(w.token, w.slot(0), w.relativeId);
        };
        // vòng chẵn: ngừng xuất phát trước, đặt trễ 0 đến 2 ms; vòng lẻ: đặt xuất phát trước, ngừng trễ 0 đến 14 ms
        const results = await runConcurrently(
          round % 2 === 0
            ? [() => stop(0), () => create(round % 3)]
            : [() => create(0), () => stop((round % 8) * 2)],
        );
        const [stopResult, createResult] =
          round % 2 === 0
            ? [results[0]!, results[1]!]
            : [results[1]!, results[0]!];
        const label = (r: PromiseSettledResult<request.Response>) => {
          if (r.status === 'rejected') return `LỖI-MẠNG:${String(r.reason)}`;
          if (r.value.status >= 500) {
            serverErrors += 1;
            if (r.value.status === 503) unavailable += 1;
          }
          return r.value.status === 200 || r.value.status === 201
            ? 'ok'
            : `${String(r.value.status)}:${String(bodyOf(r.value)['maLoi'])}`;
        };
        const stopLabel = label(stopResult);
        const createLabel = label(createResult);
        const key = `vòng ${String(round)}: tạo=${createLabel} + ngừng=${stopLabel}`;
        const state = await relativeState(w.relativeId);
        // bất biến H1: hồ sơ đã ngừng thì KHÔNG còn lịch đang hoạt động nào
        expect(state.active || state.lich === 0, key).toBe(true);
        if (stopLabel === 'ok') {
          branches.ngungThang += 1;
          expect(createLabel, key).toBe(`409:${CONFLICT_STOPPED}`);
          expect(state, key).toStrictEqual({ active: false, lich: 0 });
          expect(await lichHenRows(), key).toHaveLength(0);
        } else {
          branches.taoThang += 1;
          expect(stopLabel, key).toBe(`409:${CONFLICT_ACTIVE}`);
          expect(createLabel, key).toBe('ok');
          expect(state, key).toStrictEqual({ active: true, lich: 1 });
        }
        await assertBookingInvariants(h.db);
      }

      expect(serverErrors).toBe(0);
      expect(unavailable).toBe(0);
      process.stderr.write(
        `KTH-08: ${String(ROUNDS)} vòng; phân bố ${JSON.stringify(branches)}; 5xx=${String(serverErrors)} 503=${String(unavailable)}; đã thử lại 1213=${String(retries.deadlocks())} 1205=${String(retries.timeouts())}\n`,
      );
    },
    SLOW,
  );
});

// ───────────────────────── Nhóm lịch hẹn thật và tập trạng thái chặn (KTH-01…KTH-04) ─────────────────────────

describe('KTH-01 (NT-12) ngừng hồ sơ có đúng MỘT lịch ở từng trạng thái chặn, lịch đặt bằng route thật', () => {
  it.each(['ChoThanhToan', 'DaXacNhan', 'DaTiepDon'] as const)(
    'lịch %s ⇒ 409 HO_SO_NGUOI_THAN_DANG_CO_LICH_HEN; chiTiet đúng MỘT phần tử, đúng năm khoá, giá trị khớp thân 201 và DB; hồ sơ vẫn hiệu lực; lich_hen không đổi; khoá đã nhả',
    async (trangThai) => {
      const w = await world();
      if (trangThai === 'ChoThanhToan') await setDeposit(w, '50000.00');
      const code = await bookOk(w.token, w, 0, w.relativeId);
      if (trangThai === 'DaTiepDon') await checkIn(w, code, 0);
      const token = await tokenOf(w.patientId);
      const before = await lichHenRows();
      expect(before).toHaveLength(1);
      expect(before[0]!['trang_thai']).toBe(trangThai);

      const res = await deactivate(token, w.relativeId);

      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(bodyOf(res)['maLoi']).toBe(CONFLICT_ACTIVE);
      const details = bodyOf(res)['chiTiet'] as Record<string, unknown>[];
      expect(details).toStrictEqual([await detailOf(w, code, 0, trangThai)]);
      expect(Object.keys(details[0]!).sort()).toEqual(DETAIL_KEYS);
      expect(await relativeState(w.relativeId)).toStrictEqual({
        active: true,
        lich: 1,
      });
      expect(await lichHenRows()).toStrictEqual(before);
      await expectLocksReleased(h.db, w.patientId, w.relativeId);
    },
  );
});

describe('KTH-02 (NT-13) nhiều lịch chặn đặt thật cộng một lịch đã huỷ bằng route thật', () => {
  it('ba lịch chặn (DaTiepDon, ChoThanhToan, DaXacNhan) của HAI bác sĩ, tạo KHÔNG theo thứ tự thời gian, cộng một lịch DaHuy ⇒ 409; chiTiet đủ ba lịch, sắp theo thời gian tăng dần, KHÔNG có lịch DaHuy', async () => {
    const w = await world();
    // Bác sĩ thứ hai (mã lớn hơn) giữ lịch SỚM NHẤT: khi câu truy vấn mất ORDER BY, trình tối ưu đi theo chỉ mục (bac_si_id, thoi_gian) và trả bác sĩ thứ nhất trước, nên thứ tự sai lộ ra
    // (cả ba lịch cùng một bác sĩ thì thứ tự chỉ mục tình cờ trùng thứ tự thời gian: đột biến M5 đã sống sót ở bản đầu của ca này)
    const second = await secondDoctorOf(fx, w.branch);
    const secondDoctorId = second.doctor.account.taiKhoanId;
    // ô 6 đặt rồi huỷ ở T0 (giữ cọc 0đ nên đặt xong là DaXacNhan, huỷ được ngay)
    const cancelled = await bookOk(w.token, w, 6, w.relativeId);
    const cancelRes = await cancel(w.token, cancelled);
    expect(cancelRes.status, JSON.stringify(cancelRes.body)).toBe(200);
    // thứ tự TẠO là (bác sĩ 1, ô 5), (bác sĩ 2, ô 1), (bác sĩ 1, ô 3); lịch ô 1 được tiếp đón đúng giờ hẹn 08:30, lịch ô 3 đặt SAU mốc đó (cọc > 0 nên ChoThanhToan) nên chỉ chọn ô muộn hơn 08:30
    const confirmed = await bookOk(w.token, w, 5, w.relativeId);
    const checkedIn = await bookSlotOk(
      w.token,
      second.slotIds[1]!,
      w.relativeId,
    );
    await checkIn(w, checkedIn, 1);
    const token = await tokenOf(w.patientId);
    await setDeposit(w, '50000.00');
    const pending = await bookOk(token, w, 3, w.relativeId);

    const res = await deactivate(token, w.relativeId);

    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(bodyOf(res)['maLoi']).toBe(CONFLICT_ACTIVE);
    expect(bodyOf(res)['chiTiet']).toStrictEqual([
      await detailOf(w, checkedIn, 1, 'DaTiepDon', secondDoctorId),
      await detailOf(w, pending, 3, 'ChoThanhToan'),
      await detailOf(w, confirmed, 5, 'DaXacNhan'),
    ]);
    expect(await relativeState(w.relativeId)).toStrictEqual({
      active: true,
      lich: 3,
    });
  });
});

describe('KTH-03 (NT-14) lịch đặt thật của BẢN THÂN, của người thân khác và của Bệnh nhân khác không chặn hồ sơ đang ngừng', () => {
  it('ngừng R1 (không có lịch) ⇒ 200 { trangThaiHieuLuc: false }; ba lịch kia và mọi hàng lich_hen giống hệt trước', async () => {
    const w = await world();
    const r1 = await fx.relative(w.patientId, { hoTen: 'Người thân một' });
    const r2 = await fx.relative(w.patientId, { hoTen: 'Người thân hai' });
    const other = await fx.admin.patient();
    const otherToken = await tokenOf(other.account.taiKhoanId);
    await bookOk(w.token, w, 0, null);
    await bookOk(w.token, w, 1, r2);
    await bookOk(otherToken, w, 2, null);
    const before = await lichHenRows();
    expect(before).toHaveLength(3);

    const res = await deactivate(w.token, r1);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(bodyOf(res)).toStrictEqual({ trangThaiHieuLuc: false });
    expect(await relativeState(r1)).toStrictEqual({ active: false, lich: 0 });
    expect(await relativeState(r2)).toStrictEqual({ active: true, lich: 1 });
    expect(await lichHenRows()).toStrictEqual(before);
  });
});

describe('KTH-04 (NT-11) hồ sơ chỉ còn lịch đã kết thúc, lịch đặt thật rồi đưa về trạng thái cuối bằng đường thật', () => {
  it('DaHuy (route huỷ), HoanThanh (AppointmentTransitionService.complete THẬT, chưa có route) và VangMat (route Lễ tân) ⇒ ngừng 200, hồ sơ ngừng; lich_hen giống hệt từng cột. DaDoiLich không có đường thật nên vẫn ở RDI-02', async () => {
    const w = await world();
    const cancelled = await bookOk(w.token, w, 0, w.relativeId);
    const absent = await bookOk(w.token, w, 1, w.relativeId);
    const done = await bookOk(w.token, w, 2, w.relativeId);
    const cancelRes = await cancel(w.token, cancelled);
    expect(cancelRes.status, JSON.stringify(cancelRes.body)).toBe(200);

    // ô 2 (09:00): tiếp đón đúng giờ hẹn rồi bác sĩ hoàn thành (hàm của B11; route của doctor chưa có)
    await checkIn(w, done, 2);
    const [doneRow] = (await h.db.query(
      'SELECT CAST(lich_hen_id AS CHAR) AS id FROM lich_hen WHERE ma_lich_hen = ?',
      [done],
    )) as { id: string }[];
    const outcome = await withBookingTransaction(
      h.db,
      (em) =>
        h.app
          .get(AppointmentTransitionService, { strict: false })
          .complete(em, { lichHenId: doneRow!.id, bacSiId: w.doctorId }),
      { label: 'kth-04-complete' },
    );
    expect(outcome).toStrictEqual({ kind: 'Completed' });

    // sau hết cửa sổ của mọi ô: Lễ tân đánh Vắng mặt lịch ô 1
    vi.setSystemTime(AFTER_ALL_WINDOWS);
    const absentRes = await receptionStatus(
      await tokenOf(w.receptionist.account.taiKhoanId),
      absent,
      'VangMat',
    );
    expect(absentRes.status, JSON.stringify(absentRes.body)).toBe(200);

    const before = await lichHenRows();
    expect(before.map((row) => row['trang_thai'])).toStrictEqual([
      'DaHuy',
      'VangMat',
      'HoanThanh',
    ]);

    const res = await deactivate(await tokenOf(w.patientId), w.relativeId);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(bodyOf(res)).toStrictEqual({ trangThaiHieuLuc: false });
    expect(await relativeState(w.relativeId)).toStrictEqual({
      active: false,
      lich: 0,
    });
    expect(await lichHenRows()).toStrictEqual(before);
    await expectLocksReleased(h.db, w.patientId, w.relativeId);
  });
});
