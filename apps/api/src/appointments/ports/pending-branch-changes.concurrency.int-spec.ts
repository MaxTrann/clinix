import type { DataSource } from 'typeorm';
import { PendingBranchChangesReader } from '../../admin/branch-change-requests/pending-branch-changes.reader.js';
import { BranchImpactService } from '../../admin/branches/impact/branch-impact.service.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { deferred } from '../../auth/testing/verification-int-helpers.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { holdRowLock } from '../testing/concurrency-harness.js';
import {
  createAppointmentWorld,
  dataState,
  failureOf,
  lichHenRows,
  type CreateWorld,
} from '../testing/create-appointment-world.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import { countWaitingOn, waitUntilWaiting } from '../testing/lock-wait.js';
import {
  closedRow,
  PendingChangeFixtures,
} from '../testing/pending-change-fixtures.js';
import { PendingBranchChangesAdapter } from './pending-branch-changes.adapter.js';
import type { PendingBranchChangesPort } from './pending-branch-changes.port.js';

// Task B16b (PLAN booking H6; admin Q6, Q48, TRACKING 3.50.3, 9B.3 của admin) — PBC-20, PBC-21, PBC-22 và PBC-14: đua giữa BOOKING (`CreateAppointmentService` THẬT với cổng thay đổi chi nhánh THẬT) và phía DUYỆT của admin trên MySQL 8.4 THẬT.
// Phía duyệt dựng bằng chính hai việc B10 làm TRƯỚC khi commit: `BranchImpactService.lockSlotsOfDays` (khoá `khung_gio` của chi nhánh ở các thứ đổi `FOR UPDATE OF kg`) rồi ghi `DaDuyet` (hàng yêu cầu), trong MỘT giao dịch giữ mở bằng `holdRowLock`.
// Thứ tự chạy ĐỊNH TRƯỚC bằng việc đợi giao dịch bị chặn (`waitUntilWaiting`), không bằng ngủ. Dữ liệu giả.
const TIMEOUT = 60_000;
const TUESDAY = 2;
const EFFECTIVE_FROM = new Date('2026-11-09T07:00:00+07:00');

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const realPending = (): PendingBranchChangesPort =>
  new PendingBranchChangesAdapter(new PendingBranchChangesReader());
const impact = new BranchImpactService();

/** Giao dịch giả lập "đang duyệt": khoá các khung giờ Thứ Ba của chi nhánh và ghi yêu cầu `DaDuyet` đóng Thứ Ba, CHƯA commit. */
async function startApproval(w: CreateWorld) {
  const held = await holdRowLock(db, 'SELECT 1');
  try {
    await impact.lockSlotsOfDays(
      held.manager,
      w.branch.chiNhanhId,
      EFFECTIVE_FROM,
      [TUESDAY],
    );
    const requestId = await new PendingChangeFixtures(held.manager).insert({
      chiNhanhId: w.branch.chiNhanhId,
      proposerId: w.systemAdmin.account.taiKhoanId,
      approverId: w.systemAdmin.account.taiKhoanId,
      lichHoatDong: [closedRow(TUESDAY)],
    });
    return { held, requestId };
  } catch (error) {
    await held.release('rollback').catch(() => undefined);
    throw error;
  }
}

describe('PBC-20 duyệt chạy TRƯỚC, đặt lịch chờ khoá khung_gio rồi thấy yêu cầu đã commit (H6, Q6)', () => {
  it(
    'create chờ ở khung_gio khi giao dịch duyệt còn mở; duyệt commit ⇒ create trả 409 KHUNG_GIO_NGOAI_LICH_MOI, không có lich_hen, không 1205 hay 1213 lộ ra, INV đủ',
    async () => {
      const w = await createAppointmentWorld(db, fx, {
        pending: realPending(),
      });
      const { held } = await startApproval(w);
      let outcome: ReturnType<typeof failureOf> | undefined;
      try {
        outcome = failureOf(w.create(0));
        await waitUntilWaiting(db, 'khung_gio', 1);
        await held.release('commit');
        const { status, body } = await outcome;

        expect(status).toBe(409);
        expect(body.maLoi).toBe(BOOKING_ERROR_CODES.SLOT_OUTSIDE_NEW_SCHEDULE);
      } finally {
        await held.release('rollback');
        await outcome?.catch(() => undefined);
      }
      expect(await lichHenRows(db)).toStrictEqual([]);
      expect(w.payment.recordZeroPaymentCall.count).toBe(0);
      expect(w.notifier.notifyCall.count).toBe(0);
      await w.expectSettled(0);
    },
    TIMEOUT,
  );

  it(
    'duyệt hoàn tác thay vì commit ⇒ create đang chờ chạy tiếp và THÀNH CÔNG (không thấy yêu cầu chưa commit)',
    async () => {
      const w = await createAppointmentWorld(db, fx, {
        pending: realPending(),
      });
      const { held } = await startApproval(w);
      let creating: ReturnType<typeof w.create> | undefined;
      try {
        creating = w.create(0);
        await waitUntilWaiting(db, 'khung_gio', 1);
        await held.release('rollback');
        const created = await creating;

        expect(created.trangThai).toBe('DaXacNhan');
      } finally {
        await held.release('rollback');
        await creating?.catch(() => undefined);
      }
      expect(await lichHenRows(db)).toHaveLength(1);
      await w.expectSettled(0);
    },
    TIMEOUT,
  );
});

describe('PBC-21 đặt lịch chạy TRƯỚC, duyệt chờ khoá rồi thấy lịch hẹn mới trong danh sách ảnh hưởng (CN-54)', () => {
  it(
    'create đã giữ khoá khung_gio và vừa đọc "chưa có yêu cầu"; duyệt (lockSlotsOfDays) chờ; create commit ⇒ BranchImpactService.compute thấy lịch hẹn mới (NgayNghi); không 1205 hay 1213',
    async () => {
      const gate = deferred();
      const reached = deferred();
      const real = realPending();
      const gated: PendingBranchChangesPort = {
        findBlocking: async (em, input) => {
          const found = await real.findBlocking(em, input);
          reached.resolve();
          await gate.promise;
          return found;
        },
      };
      const w = await createAppointmentWorld(db, fx, { pending: gated });
      let creating: ReturnType<typeof w.create> | undefined;
      let locking: Promise<void> | undefined;
      const held = await holdRowLock(db, 'SELECT 1');
      try {
        creating = w.create(0);
        await reached.promise; // create đã giữ khoá khung_gio và đã đọc cổng (chưa có yêu cầu nào)
        locking = impact.lockSlotsOfDays(
          held.manager,
          w.branch.chiNhanhId,
          EFFECTIVE_FROM,
          [TUESDAY],
        );
        await waitUntilWaiting(db, 'khung_gio', 1);
        gate.resolve();
        await creating;
        await locking;

        const result = await impact.compute(held.manager, {
          chiNhanhId: w.branch.chiNhanhId,
          tuLuc: EFFECTIVE_FROM,
          changedDays: [closedRow(TUESDAY)],
          removedServiceIds: [],
        });
        const [created] = await lichHenRows(db);
        expect(created?.trangThai).toBe('DaXacNhan');
        expect(result.lichHen.map((a) => a.maLichHen)).toStrictEqual([
          created?.ma,
        ]);
        expect(result.lichHen[0]?.lyDoAnhHuong).toBe('NgayNghi');
      } finally {
        gate.resolve();
        await held.release('rollback');
        await creating?.catch(() => undefined);
        await locking?.catch(() => undefined);
      }
      await w.expectSettled(0);
    },
    TIMEOUT,
  );
});

describe('PBC-22 và PBC-14 cổng chỉ ĐỌC bản đã commit, không chờ khoá', () => {
  it(
    'PBC-22 checks (chế độ none) KHÔNG chờ giao dịch duyệt đang mở và không thấy yêu cầu chưa commit ⇒ 200; duyệt commit ⇒ checks trả 409 KHUNG_GIO_NGOAI_LICH_MOI',
    async () => {
      const w = await createAppointmentWorld(db, fx, {
        pending: realPending(),
      });
      const { held } = await startApproval(w);
      try {
        const before = await dataState(db);

        await expect(w.check(0)).resolves.toBeDefined();

        expect(await countWaitingOn(db, 'khung_gio')).toBe(0);
        expect(await dataState(db)).toStrictEqual(before);
        await held.release('commit');
        const { status, body } = await failureOf(w.check(0));
        expect(status).toBe(409);
        expect(body.maLoi).toBe(BOOKING_ERROR_CODES.SLOT_OUTSIDE_NEW_SCHEDULE);
      } finally {
        await held.release('rollback');
      }
    },
    TIMEOUT,
  );

  it(
    'PBC-14 hàng yêu cầu đã commit đang bị giao dịch khác giữ FOR UPDATE (áp dụng, dời hay huỷ đang chạy) ⇒ create và checks vẫn đọc bản commit, không chờ, không 1205',
    async () => {
      const w = await createAppointmentWorld(db, fx, {
        pending: realPending(),
      });
      const requestId = await new PendingChangeFixtures(db).insert({
        chiNhanhId: w.branch.chiNhanhId,
        proposerId: w.systemAdmin.account.taiKhoanId,
        approverId: w.systemAdmin.account.taiKhoanId,
        lichHoatDong: [closedRow(TUESDAY)],
      });
      const held = await holdRowLock(
        db,
        'SELECT yeu_cau_thay_doi_chi_nhanh_id FROM yeu_cau_thay_doi_chi_nhanh WHERE yeu_cau_thay_doi_chi_nhanh_id = ? FOR UPDATE',
        [requestId],
      );
      try {
        const checked = await failureOf(w.check(0));
        const created = await failureOf(w.create(0));

        expect(checked.body.maLoi).toBe(
          BOOKING_ERROR_CODES.SLOT_OUTSIDE_NEW_SCHEDULE,
        );
        expect(created.body.maLoi).toBe(
          BOOKING_ERROR_CODES.SLOT_OUTSIDE_NEW_SCHEDULE,
        );
        expect(await countWaitingOn(db, 'yeu_cau_thay_doi_chi_nhanh')).toBe(0);
      } finally {
        await held.release('rollback');
      }
      await assertBookingInvariants(db);
    },
    TIMEOUT,
  );
});
