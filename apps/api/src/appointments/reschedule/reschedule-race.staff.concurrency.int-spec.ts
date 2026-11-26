import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { cashRows } from '../../payment/testing/cash-stack.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { DEPOSIT } from '../testing/cancel-world.js';
import { captureMoneyTotals, type MoneyTotals } from '../testing/invariants.js';
import { OVERRIDE_REASON } from '../testing/override-world.js';
import {
  PAIR_ROUNDS,
  RaceStats,
  raceX2,
  rescheduleSide,
  sideOf,
} from '../testing/reschedule-race-checks.js';
import {
  closeRaceModules,
  raceWorld,
} from '../testing/reschedule-race-world.js';

// reschedule X2 — nhóm STAFF: TDL-07 (đổi × tiếp đón của Lễ tân), TDL-21 `[đề xuất]` (đổi × thu tiền mặt THẬT kèm tiếp đón), TDL-08 (đổi × Quản trị viên override) (PLAN reschedule 5.4, 7.5; TRACKING reschedule 1.17) ĐỒNG THỜI trên
// MySQL 8.4 THẬT với `AppointmentsModule` thật và ví thật. Cả ba đối tác đi theo `khung_gio ⇒ lich_hen ⇒ UPDATE trạng thái` (S ngầm ở `benh_nhan`, B12 Q, TECH_DEBT 113) mà đổi lịch đã giữ X ở `benh_nhan` từ tầng 2, nên
// CHO PHÉP thử lại 1213 và ghi số (nạn nhân là bên đổi lịch, như X1 M8); 503 luôn 0. TDL-07 và TDL-21 dùng MỘT đồng hồ 07:55 ngày 10/11 (trong cửa sổ tiếp đón 30 phút trước giờ hẹn và TRƯỚC giờ hẹn nên cả hai bên cùng hợp lệ:
// đua thật). INV-1…INV-10 và IVT-01…IVT-07 chạy SAU MỖI VÒNG. CHẠY MỘT MÌNH.
const TIMEOUT = 540_000;
const COC = DEPOSIT;
/** 07:55 ngày 10/11/2026: trong cửa sổ tiếp đón của khung giờ 08:00 và còn 5 phút trước giờ hẹn. */
const IN_WINDOW = new Date('2026-11-10T07:55:00+07:00');

let db: DataSource;
let fx: BookingFixtures;
let logs: string[] = [];
useIntegrationHooks((d, captured) => {
  db = d;
  fx = new BookingFixtures(d);
  logs = captured;
});
afterEach(closeRaceModules);

describe('TDL-07 đổi (TuDoi hay Lễ tân đổi hộ) × tiếp đón của Lễ tân (DaTiepDon) cùng lịch', () => {
  it.each(['TuDoi', 'DoiHo'] as const)(
    `(%s) ${String(PAIR_ROUNDS)} vòng: một thắng; tiếp đón thắng ⇒ đổi LICH_HEN_KHONG_CHO_DOI kèm DaTiepDon, không lịch mới; đổi thắng ⇒ tiếp đón bị từ chối có kiểu, lịch mới DaXacNhan; không 500; 0 lần 503; ghi số 1213`,
    async (variant) => {
      const w = await raceWorld(db, fx);
      vi.setSystemTime(IN_WINDOW);
      const stats = new RaceStats();
      await raceX2<{ a: LichHen; money: MoneyTotals }>({
        tag: `TDL-07-${variant}`,
        name: `đổi (${variant}) × tiếp đón`,
        db,
        logs,
        stats,
        setup: async () => {
          await w.resetRound();
          // Giá bằng cọc: còn phải thu 0 nên Lễ tân tiếp đón được mà không thu tiền mặt (đường thu tiền là TDL-21)
          const a = await w.book(0, { coc: COC, gia: COC });
          return { a, money: await captureMoneyTotals(db) };
        },
        first: ({ a }) =>
          variant === 'TuDoi'
            ? sideOf(
                stats,
                w.core.reschedule(w.tuDoi(a.maLichHen, 4)),
                rescheduleSide,
              )
            : sideOf(stats, w.doiHo(a.maLichHen, 4)),
        second: ({ a }) =>
          sideOf(
            stats,
            w.status.change(w.receptionId, a.maLichHen, {
              trangThai: 'DaTiepDon',
            }),
          ),
        check: async ({ a }, rescheduled, checkedIn, tally) => {
          expect([rescheduled.ok, checkedIn.ok].filter(Boolean)).toHaveLength(
            1,
          );
          if (checkedIn.ok) {
            tally.add('tiếp đón thắng');
            expect(rescheduled.code).toBe(
              BOOKING_ERROR_CODES.NOT_RESCHEDULABLE,
            );
            expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaTiepDon');
            expect(await w.childOf(a.lichHenId)).toBeNull();
            expect((await w.slotState(4)).trangThai).toBe('ConTrong');
          } else {
            tally.add('đổi thắng');
            expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaDoiLich');
            expect((await w.childOf(a.lichHenId))?.trangThai).toBe('DaXacNhan');
            expect((await w.slotState(0)).trangThai).toBe('ConTrong');
          }
          if (variant === 'DoiHo')
            expect(await w.countRows('nhat_ky_hanh_dong')).toBe(
              rescheduled.ok ? 1 : 0,
            );
        },
        settleOptions: ({ money }) => ({
          moneyBefore: money,
          requireDepositCovered: true,
        }),
        options: { retriesAllowed: true },
      });
    },
    TIMEOUT,
  );
});

describe('TDL-21 [đề xuất] đổi × thu tiền mặt THẬT kèm tiếp đón (payment B6) cùng lịch', () => {
  it(
    `${String(PAIR_ROUNDS)} vòng: một thắng; thu thắng ⇒ đúng MỘT khoản TienMatTaiQuay trỏ lịch GỐC, lịch DaTiepDon, đổi LICH_HEN_KHONG_CHO_DOI; đổi thắng ⇒ KHÔNG khoản nào, lịch cũ DaDoiLich; IVT-07; ghi số 1213; 0 lần 503`,
    async () => {
      const w = await raceWorld(db, fx);
      vi.setSystemTime(IN_WINDOW);
      const stats = new RaceStats();
      await raceX2<{ a: LichHen; money: MoneyTotals }>({
        tag: 'TDL-21',
        name: 'đổi × thu tiền mặt',
        db,
        logs,
        stats,
        setup: async () => {
          await w.resetRound();
          // Giá 300.000, cọc 100.000 đã trả bằng ví: còn phải thu 200.000 tại quầy
          const a = await w.book(0, { coc: COC });
          return { a, money: await captureMoneyTotals(db) };
        },
        first: ({ a }) =>
          sideOf(
            stats,
            w.core.reschedule(w.tuDoi(a.maLichHen, 4)),
            rescheduleSide,
          ),
        second: ({ a }) =>
          sideOf(
            stats,
            w.service.collect(w.receptionId, a.maLichHen, '200000'),
          ),
        check: async ({ a }, rescheduled, collected, tally) => {
          expect([rescheduled.ok, collected.ok].filter(Boolean)).toHaveLength(
            1,
          );
          const cash = await cashRows(db);
          if (collected.ok) {
            tally.add('thu tiền thắng');
            expect(rescheduled.code).toBe(
              BOOKING_ERROR_CODES.NOT_RESCHEDULABLE,
            );
            expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaTiepDon');
            expect(cash).toHaveLength(1);
            expect(cash[0]?.lichHenId).toBe(a.lichHenId);
            expect(cash[0]?.soTien).toBe('200000.00');
          } else {
            tally.add('đổi thắng');
            expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaDoiLich');
            expect(cash).toHaveLength(0);
          }
        },
        // Thu tiền mặt ghi một khoản HỢP LỆ: chỉ vòng đổi thắng mới so ba bảng tiền
        settleOptions: ({ money }, rescheduled) => ({
          requireDepositCovered: true,
          ...(rescheduled.ok ? { moneyBefore: money } : {}),
        }),
        options: { retriesAllowed: true },
      });
    },
    TIMEOUT,
  );
});

describe('TDL-08 đổi × Quản trị viên override cùng lịch', () => {
  it.each(['DaTiepDon', 'DaHuy'] as const)(
    `(→ %s) ${String(PAIR_ROUNDS)} vòng: một thắng; override thắng ⇒ đổi LICH_HEN_KHONG_CHO_DOI, đúng MỘT dòng nhật ký; đổi thắng ⇒ override bị từ chối có kiểu, KHÔNG nhật ký; DaHuy hoàn cọc đúng MỘT lần; ghi số 1213; 0 lần 503`,
    async (target) => {
      const w = await raceWorld(db, fx);
      const stats = new RaceStats();
      await raceX2<{ a: LichHen; money: MoneyTotals }>({
        tag: `TDL-08-${target}`,
        name: `đổi × override ${target}`,
        db,
        logs,
        stats,
        setup: async () => {
          await w.resetRound();
          const a = await w.book(0, { coc: COC, gia: COC });
          return { a, money: await captureMoneyTotals(db) };
        },
        first: ({ a }) =>
          sideOf(
            stats,
            w.core.reschedule(w.tuDoi(a.maLichHen, 2)),
            rescheduleSide,
          ),
        second: ({ a }) =>
          sideOf(
            stats,
            w.override.override(w.systemScope, w.adminId, a.maLichHen, {
              trangThai: target,
              lyDo: OVERRIDE_REASON,
            }),
          ),
        check: async ({ a }, rescheduled, overridden, tally) => {
          expect([rescheduled.ok, overridden.ok].filter(Boolean)).toHaveLength(
            1,
          );
          if (overridden.ok) {
            tally.add('override thắng');
            expect(rescheduled.code).toBe(
              BOOKING_ERROR_CODES.NOT_RESCHEDULABLE,
            );
            expect((await w.rowOf(a.lichHenId)).trangThai).toBe(target);
            expect(await w.childOf(a.lichHenId)).toBeNull();
            expect(await w.countRows('nhat_ky_hanh_dong')).toBe(1);
            expect(await w.refundCount()).toBe(target === 'DaHuy' ? 1 : 0);
          } else {
            tally.add('đổi thắng');
            expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaDoiLich');
            expect(await w.countRows('nhat_ky_hanh_dong')).toBe(0);
            expect(await w.refundCount()).toBe(0);
          }
        },
        // Override DaHuy hoàn cọc THẬT (đổi tiền hợp lệ): chỉ vòng đổi thắng, hay đích DaTiepDon, mới so ba bảng tiền
        settleOptions: ({ money }, rescheduled) => ({
          requireDepositCovered: true,
          ...(rescheduled.ok || target === 'DaTiepDon'
            ? { moneyBefore: money }
            : {}),
        }),
        options: { retriesAllowed: true },
      });
    },
    TIMEOUT,
  );
});
