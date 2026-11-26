import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { DEPOSIT } from '../testing/cancel-world.js';
import { captureMoneyTotals, type MoneyTotals } from '../testing/invariants.js';
import {
  PAIR_ROUNDS,
  RaceStats,
  cancelSide,
  raceX2,
  rescheduleSide,
  sideOf,
  type Side,
} from '../testing/reschedule-race-checks.js';
import {
  closeRaceModules,
  raceWorld,
  type RaceWorld,
} from '../testing/reschedule-race-world.js';
import { AFTER_ALL_WINDOWS, readNoShow } from '../testing/status-world.js';

// reschedule X2 — nhóm LIFECYCLE: TDL-04 (đổi × huỷ, hoàn cọc THẬT), TDL-05 (đổi × hết hạn giữ chỗ), TDL-06 (đổi × tự Vắng mặt) (PLAN reschedule 5.4, 7.5; TRACKING reschedule 1.17) ĐỒNG THỜI trên MySQL 8.4 THẬT với
// `AppointmentsModule` thật và ví thật. Hai bên xuất phát CÙNG LÚC qua MỘT cổng (xen kẽ ai đi trước + quét độ lệch 0 đến 20 ms); INV-1…INV-10 và IVT-01…IVT-07 chạy SAU MỖI VÒNG. TDL-04 chạy 100 vòng (PLAN) và CHO PHÉP thử
// lại 1213 (rủi ro B12 Q, TECH_DEBT 113: huỷ xin `khung_gio` rồi `lich_hen` rồi S ngầm ở `benh_nhan` mà đổi lịch đang giữ X; X1 M8: nạn nhân luôn là bên đổi); TDL-05 và TDL-06 khẳng định 0 lần thử lại. CHẠY MỘT MÌNH.
const TIMEOUT = 540_000;
const COC = DEPOSIT;
const CANCEL_ROUNDS = 100;
/** 09:00 ngày 02/11/2026: lịch giữ chỗ hạn 08:15 cùng ngày đã quá hạn. */
const AFTER_LAPSE = new Date('2026-11-02T09:00:00+07:00');

let db: DataSource;
let fx: BookingFixtures;
let logs: string[] = [];
useIntegrationHooks((d, captured) => {
  db = d;
  fx = new BookingFixtures(d);
  logs = captured;
});
afterEach(closeRaceModules);

describe('TDL-04 đổi × huỷ CÙNG MỘT lịch (cọc trả bằng ví, hoàn cọc THẬT)', () => {
  it(
    `${String(CANCEL_ROUNDS)} vòng: đúng MỘT thắng; huỷ thắng ⇒ đổi LICH_HEN_KHONG_CHO_DOI, khung giờ đích không bị giữ, đúng MỘT dòng hoàn và ví +cọc; đổi thắng ⇒ huỷ không còn Cancelled, KHÔNG dòng hoàn nào, ví nguyên; ghi số 1213 nội bộ (B12 Q); 0 lần 503`,
    async () => {
      const w = await raceWorld(db, fx);
      const stats = new RaceStats();
      await raceX2<{ a: LichHen; money: MoneyTotals }>({
        tag: 'TDL-04',
        name: 'đổi × huỷ cùng lịch',
        db,
        logs,
        stats,
        rounds: CANCEL_ROUNDS,
        setup: async () => {
          await w.resetRound();
          const a = await w.book(0, { coc: COC });
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
            w.cancel.cancel({
              maLichHen: a.maLichHen,
              actor: { kind: 'BenhNhan', accountId: w.self.accountId },
              reason: 'BenhNhanHuy',
            }),
            cancelSide,
          ),
        check: async ({ a }, rescheduled, cancelled, tally) => {
          expect([rescheduled.ok, cancelled.ok].filter(Boolean)).toHaveLength(
            1,
          );
          if (cancelled.ok) {
            tally.add('huỷ thắng');
            expect(rescheduled.code).toBe(
              BOOKING_ERROR_CODES.NOT_RESCHEDULABLE,
            );
            expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaHuy');
            expect(await w.countRows('lich_hen')).toBe(1);
            expect((await w.slotState(0)).trangThai).toBe('ConTrong');
            expect((await w.slotState(2)).trangThai).toBe('ConTrong');
            expect(await w.refundCount()).toBe(1);
            expect(await w.balanceOf(w.self.walletId)).toBe(COC);
          } else {
            tally.add('đổi thắng');
            expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaDoiLich');
            expect(await w.countRows('lich_hen')).toBe(2);
            expect((await w.slotState(0)).trangThai).toBe('ConTrong');
            expect((await w.slotState(2)).trangThai).toBe('DaDat');
            expect(await w.refundCount()).toBe(0);
            expect(Number(await w.balanceOf(w.self.walletId))).toBe(0);
          }
        },
        // Hoàn cọc là đổi tiền HỢP LỆ: chỉ vòng đổi thắng mới so ba bảng tiền (INV-10); IVT-01…IVT-07 luôn chạy
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

/** Summary của job hết hạn ⇒ `Side`: thành công khi lượt không bị bỏ qua và không lịch nào `failed`; `code` ghi số `expired` và `notDue` để phân biệt bên thắng. */
const expirySide = (
  summary: Awaited<ReturnType<RaceWorld['expiryJob']['run']>>,
): Side => ({
  ok: summary !== undefined && summary.failed === 0,
  code:
    summary === undefined
      ? 'JOB_SKIPPED'
      : `JOB expired=${String(summary.expired)} notDue=${String(summary.notDue)} failed=${String(summary.failed)}`,
});

describe('TDL-05 đổi vào khung giờ đích đang DangGiuCho đã QUÁ HẠN (hết hạn lười)', () => {
  it(
    `(a) × HoldExpiryJob (hết hạn chủ động), ${String(PAIR_ROUNDS)} vòng: đổi LUÔN thành công; lịch giữ chỗ cũ DaHuy đúng MỘT lần (job hay hết hạn lười, bên kia thấy notDue); khung giờ đích DaDat đúng một lịch; job không failed; 0 lần thử lại`,
    async () => {
      const w = await raceWorld(db, fx);
      const holder = await w.newPatient();
      vi.setSystemTime(AFTER_LAPSE);
      const stats = new RaceStats();
      await raceX2<{ a: LichHen; held: LichHen; money: MoneyTotals }>({
        tag: 'TDL-05a',
        name: 'đổi × job hết hạn',
        db,
        logs,
        stats,
        setup: async () => {
          await w.resetRound();
          const held = await fx.appointmentIn('ChoThanhToan', {
            doctor: w.doctor.profile,
            khungGioId: w.slot(4),
            patientId: holder.accountId,
          });
          const a = await w.book(0, { coc: COC });
          return { a, held, money: await captureMoneyTotals(db) };
        },
        first: ({ a }) =>
          sideOf(
            stats,
            w.core.reschedule(w.tuDoi(a.maLichHen, 4)),
            rescheduleSide,
          ),
        second: () => sideOf(stats, w.expiryJob.run(), expirySide),
        check: async ({ a, held }, rescheduled, job, tally) => {
          expect(rescheduled).toEqual({ ok: true, code: 'OK' });
          expect(job.ok, `job: ${job.code}`).toBe(true);
          tally.add(
            job.code.startsWith('JOB expired=1')
              ? 'job hết hạn trước'
              : 'đổi hết hạn lười trước',
          );
          expect((await w.rowOf(held.lichHenId)).trangThai).toBe('DaHuy');
          expect(await w.countRows('lich_hen', "trang_thai = 'DaHuy'")).toBe(1);
          expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaDoiLich');
          expect((await w.childOf(a.lichHenId))?.khungGioId).toBe(w.slot(4));
          expect(await w.slotState(4)).toEqual({
            trangThai: 'DaDat',
            giuChoDen: null,
          });
        },
        settleOptions: ({ money }) => ({
          moneyBefore: money,
          requireDepositCovered: true,
        }),
      });
    },
    TIMEOUT,
  );

  it(
    `(b) × create của người thứ ba vào CÙNG khung giờ (hết hạn lười hai phía), ${String(PAIR_ROUNDS)} vòng: đúng MỘT trong {đổi, create} thắng; bên thua KHUNG_GIO_DA_DAT hay KHUNG_GIO_DANG_GIU; lịch giữ chỗ cũ DaHuy đúng MỘT lần; không hai lịch giữ một khung giờ; 0 lần thử lại`,
    async () => {
      const w = await raceWorld(db, fx);
      const holder = await w.newPatient();
      const creator = await w.newPatient();
      await fx.depositService(w.doctor.profile.dichVuKhamId, '50000.00');
      vi.setSystemTime(AFTER_LAPSE);
      const stats = new RaceStats();
      await raceX2<{ a: LichHen; held: LichHen; money: MoneyTotals }>({
        tag: 'TDL-05b',
        name: 'đổi × create trên khung giờ quá hạn',
        db,
        logs,
        stats,
        setup: async () => {
          await w.resetRound();
          const held = await fx.appointmentIn('ChoThanhToan', {
            doctor: w.doctor.profile,
            khungGioId: w.slot(4),
            patientId: holder.accountId,
          });
          const a = await w.book(0, { coc: COC });
          return { a, held, money: await captureMoneyTotals(db) };
        },
        first: ({ a }) =>
          sideOf(
            stats,
            w.core.reschedule(w.tuDoi(a.maLichHen, 4)),
            rescheduleSide,
          ),
        second: () =>
          sideOf(
            stats,
            w.create.create(creator.accountId, {
              khungGioId: w.slot(4),
              hoSoNguoiThanId: null,
              lyDoKham: null,
            }),
          ),
        check: async ({ a, held }, rescheduled, created, tally) => {
          expect([rescheduled.ok, created.ok].filter(Boolean)).toHaveLength(1);
          expect((await w.rowOf(held.lichHenId)).trangThai).toBe('DaHuy');
          expect(await w.countRows('lich_hen', "trang_thai = 'DaHuy'")).toBe(1);
          if (rescheduled.ok) {
            tally.add('đổi thắng');
            expect(created.code).toBe(BOOKING_ERROR_CODES.SLOT_BOOKED);
            expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaDoiLich');
            expect((await w.slotState(4)).trangThai).toBe('DaDat');
          } else {
            tally.add('create thắng');
            expect(rescheduled.code).toBe(BOOKING_ERROR_CODES.SLOT_HELD);
            expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaXacNhan');
            expect((await w.slotState(4)).trangThai).toBe('DangGiuCho');
            expect(
              await w.countRows('lich_hen', "trang_thai = 'ChoThanhToan'"),
            ).toBe(1);
          }
        },
        settleOptions: ({ money }) => ({
          moneyBefore: money,
          requireDepositCovered: true,
        }),
      });
    },
    TIMEOUT,
  );
});

describe('TDL-06 đổi × tự Vắng mặt (job NoShowJob) cùng lịch', () => {
  // Hai đồng hồ KHÁC NHAU có chủ đích (TRACKING 1.17 B.4): đổi lịch đọc đồng hồ ứng dụng (02/11/2026), job nhận `now` sau cửa sổ của ca (12:00 ngày 10/11). Với CÙNG một đồng hồ hai bên không bao giờ cùng hợp lệ;
  // ca này chứng minh KHOÁ và kiểm lại dưới khoá (như CKI-09, DT-06 của B12 và B13), KHÔNG chứng minh đồng hồ.
  it.each(['TuDoi', 'DoiHo'] as const)(
    `(%s) ${String(PAIR_ROUNDS)} vòng: một thắng; KHÔNG BAO GIỜ lịch vừa DaDoiLich vừa VangMat (cha của lịch con luôn DaDoiLich); so_lan_no_show bằng số lịch VangMat (tối đa một); job không lỗi; 0 lần thử lại`,
    async (variant) => {
      const w = await raceWorld(db, fx);
      const stats = new RaceStats();
      await raceX2<{ a: LichHen; money: MoneyTotals }>({
        tag: `TDL-06-${variant}`,
        name: `đổi (${variant}) × job vắng mặt`,
        db,
        logs,
        stats,
        setup: async () => {
          await w.resetRound();
          const a = await w.book(0, { coc: COC });
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
        second: () =>
          sideOf(stats, w.noShowJob.run(AFTER_ALL_WINDOWS), (summary) => ({
            ok:
              summary !== undefined &&
              !summary.configMissing &&
              summary.failedBusy + summary.failedError === 0,
            code:
              summary === undefined
                ? 'JOB_SKIPPED'
                : `JOB noShowed=${String(summary.noShowed)} failed=${String(summary.failedBusy + summary.failedError)}`,
          })),
        check: async ({ a }, rescheduled, job, tally) => {
          expect(job.ok, `job: ${job.code}`).toBe(true);
          const old = await w.rowOf(a.lichHenId);
          const child = await w.childOf(a.lichHenId);
          if (rescheduled.ok) {
            tally.add('đổi trước');
            expect(old.trangThai).toBe('DaDoiLich');
            expect(child).not.toBeNull();
          } else {
            tally.add('vắng mặt trước');
            expect(rescheduled.code).toBe(
              BOOKING_ERROR_CODES.NOT_RESCHEDULABLE,
            );
            expect(old.trangThai).toBe('VangMat');
            expect(child).toBeNull();
          }
          const noShows = await w.countRows(
            'lich_hen',
            "trang_thai = 'VangMat'",
          );
          expect(noShows).toBeLessThanOrEqual(1);
          expect((await readNoShow(db, w.self.accountId)).soLan).toBe(noShows);
          if (variant === 'DoiHo')
            expect(await w.countRows('nhat_ky_hanh_dong')).toBe(
              rescheduled.ok ? 1 : 0,
            );
        },
        settleOptions: ({ money }) => ({
          moneyBefore: money,
          requireDepositCovered: true,
        }),
      });
    },
    TIMEOUT,
  );
});
