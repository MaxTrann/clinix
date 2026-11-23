import request from 'supertest';
import { vi } from 'vitest';
import { PendingBranchChangesAdapter } from './../src/appointments/ports/pending-branch-changes.adapter.js';
import {
  NoopPendingBranchChangesPort,
  PENDING_BRANCH_CHANGES_PORT,
} from './../src/appointments/ports/pending-branch-changes.port.js';
import { BookingFixtures } from './../src/appointments/testing/booking-fixtures.js';
import { lichHenRows } from './../src/appointments/testing/create-appointment-world.js';
import {
  closedRow,
  PendingChangeFixtures,
  type PendingChangeInput,
} from './../src/appointments/testing/pending-change-fixtures.js';
import { T0 } from './../src/auth/testing/otp-int-helpers.js';
import {
  openRefreshHarness,
  type RefreshHarness,
} from './../src/auth/testing/refresh-http-helpers.js';
import { expectErrorResponse } from './../src/common/testing/error-assertions.js';
import { resetTables } from './../src/database/testing/test-database.js';

// Task B16b (nửa `admin` của B16; TRACKING 3.50.3) — PBC-30, PBC-31 (mã mới `[đề xuất]`, PLAN 7.53): cổng thay đổi chi nhánh THẬT qua HTTP: AppModule + MySQL thật + configureApp như main, KHÔNG `overrideProvider` và KHÔNG spy (khác DL-18 của
// booking-checks.e2e-spec.ts, vốn thay kết quả cổng bằng spy). Yêu cầu thay đổi chi nhánh là HÀNG THẬT trong DB (`yeu_cau_thay_doi_chi_nhanh`), nên chứng minh `AppointmentsModule` nối đúng adapter và module lá của admin trong app thật, cho cả
// `POST /booking/checks` (chỉ đọc) và `POST /booking/appointments` (đường ghi, dưới khoá). Tầng dịch vụ và SQL: src/appointments/ports/pending-branch-changes.real-port.int-spec.ts. Dữ liệu giả.
const CHECKS = '/booking/checks';
const APPOINTMENTS = '/booking/appointments';
const OUTSIDE_NEW_SCHEDULE = 'KHUNG_GIO_NGOAI_LICH_MOI';
const TUESDAY = 2;

let h: RefreshHarness;
let fx: BookingFixtures;
let changes: PendingChangeFixtures;

beforeAll(async () => {
  h = await openRefreshHarness();
  fx = new BookingFixtures(h.db);
  changes = new PendingChangeFixtures(h.db);
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
  const slot = w.slotIds[0]!; // 10/11/2026 08:00, CaSang, Thứ Ba
  /** Yêu cầu thay đổi của chi nhánh của thế giới (mặc định `DaDuyet` chưa áp dụng, đóng Thứ Ba). */
  const change = (over: Partial<PendingChangeInput> = {}) =>
    changes.insert({
      chiNhanhId: w.branch.chiNhanhId,
      proposerId: w.systemAdmin.account.taiKhoanId,
      approverId: w.systemAdmin.account.taiKhoanId,
      lichHoatDong: [closedRow(TUESDAY)],
      ...over,
    });
  return {
    ...w,
    slot,
    change,
    check: () => post(CHECKS, { khungGioId: slot }, token),
    book: () => post(APPOINTMENTS, { khungGioId: slot }, token),
  };
}

describe('PBC-30 AppModule thật, không overrideProvider: cổng thay đổi chi nhánh của đặt lịch là PendingBranchChangesAdapter của booking nối hàm đọc của admin', () => {
  it('PENDING_BRANCH_CHANGES_PORT của app là PendingBranchChangesAdapter (không còn Noop)', () => {
    const port = h.app.get(PENDING_BRANCH_CHANGES_PORT, { strict: false });
    expect(port).toBeInstanceOf(PendingBranchChangesAdapter);
    expect(port).not.toBeInstanceOf(NoopPendingBranchChangesPort);
  });

  it('DL-18, CG-06 yêu cầu DaDuyet THẬT đóng Thứ Ba ⇒ POST /booking/checks và POST /booking/appointments đều 409 KHUNG_GIO_NGOAI_LICH_MOI; không ghi lịch, khung giờ vẫn ConTrong', async () => {
    const w = await world();
    await w.change();

    expectErrorResponse(await w.check(), 409, OUTSIDE_NEW_SCHEDULE);
    expectErrorResponse(await w.book(), 409, OUTSIDE_NEW_SCHEDULE);

    expect(await lichHenRows(h.db)).toHaveLength(0);
    expect(await fx.slotState(w.slot)).toStrictEqual({
      trangThai: 'ConTrong',
      giuChoDen: null,
    });
  });

  it.each([
    {
      name: 'yêu cầu TuChoi đóng Thứ Ba (không chặn)',
      over: { trangThai: 'TuChoi' },
    },
    {
      name: 'DaDuyet nhưng khung giờ NGAY TRƯỚC hieu_luc_tu (10/11 08:30 so với ô 08:00, biên)',
      over: { hieuLucTu: '2026-11-10 08:30:00' },
    },
  ] as const)(
    'DL-18, CG-06 $name ⇒ checks 200 và appointments 201, lịch DaXacNhan',
    async ({ over }) => {
      const w = await world();
      await w.change(over);

      expect((await w.check()).status).toBe(200);
      const res = await w.book();

      expect(res.status).toBe(201);
      expect(await lichHenRows(h.db)).toMatchObject([
        { khungGioId: w.slot, trangThai: 'DaXacNhan' },
      ]);
    },
  );
});

describe('PBC-31 yêu cầu quá hạn vẫn chặn; chi nhánh khác không bị chặn (CN-108, Q48)', () => {
  it('yêu cầu quá hạn (qua_han_luc có) THẬT ⇒ checks và appointments vẫn 409 KHUNG_GIO_NGOAI_LICH_MOI', async () => {
    const w = await world();
    await w.change({ quaHanLuc: '2026-11-09 07:00:00' });

    expectErrorResponse(await w.check(), 409, OUTSIDE_NEW_SCHEDULE);
    expectErrorResponse(await w.book(), 409, OUTSIDE_NEW_SCHEDULE);

    expect(await lichHenRows(h.db)).toHaveLength(0);
  });

  it('yêu cầu của chi nhánh KHÁC đóng Thứ Ba ⇒ checks 200 và appointments 201', async () => {
    const w = await world();
    const other = await fx.admin.branch();
    await w.change({ chiNhanhId: other.chiNhanhId });

    expect((await w.check()).status).toBe(200);
    expect((await w.book()).status).toBe(201);
  });
});
