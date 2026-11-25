import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { DEPOSIT } from '../testing/cancel-world.js';
import { createGate, runRounds } from '../testing/concurrency-harness.js';
import { sleep, winnerTally } from '../testing/concurrency-report.js';
import {
  RaceStats,
  cancelSide,
  finishX2,
  pickDistinct,
  rescheduleSide,
  seededRandom,
  settleRound,
  sideOf,
  type Side,
} from '../testing/reschedule-race-checks.js';
import {
  closeRaceModules,
  raceWorld,
  type PatientRef,
  type RaceWorld,
} from '../testing/reschedule-race-world.js';
import { HANDLING_NOTE } from '../testing/reschedule-request-handle-world.js';

// reschedule X2 — TDL-17: 100 VÒNG HỖN HỢP (đổi, đổi hộ, huỷ, create, duyệt, từ chối, hết hạn) trên CÙNG tập lịch (PLAN reschedule 5.4, 7.5, 10; TRACKING reschedule 1.17) trên MySQL 8.4 THẬT, `AppointmentsModule` thật, ví thật, thông báo và
// nhật ký thật. Mỗi vòng dựng lại MỘT tập nhỏ (4 Bệnh nhân; ba lịch cọc > 0, hai trong số đó đã hết lần tự đổi và có một yêu cầu ChoDuyet; một lịch giữ chỗ ChoThanhToan đã QUÁ HẠN; năm khung giờ trống), rồi chạy 4 đến 6 thao tác RÚT NGẪU NHIÊN có
// HẠT GIỐNG (`SEED + vòng`: cùng vòng cùng kịch bản, in trong thông báo lỗi) CÙNG LÚC qua MỘT cổng, mỗi thao tác chậm thêm 0 đến 12 ms (cũng rút theo hạt giống). KHÔNG kiểm "ai thắng" (kịch bản tuỳ ý): kiểm BẤT BIẾN: INV-1…INV-9 và IVT-01…IVT-07
// (kể cả IVT-07 đủ cọc) sau MỖI vòng, không lỗi lạ, 0 lần 503, 0 lần 1213 và 1205 NỔI, và mỗi khoản cọc được hoàn TỐI ĐA MỘT lần. Thử lại 1213 và 1205 của `withBookingTransaction` CHO PHÉP (B12 Q) và được ghi theo nhãn. CHẠY MỘT MÌNH.
const TIMEOUT = 540_000;
const ROUNDS = 100;
const SEED = 20_261_125;
const COC = DEPOSIT;
/** 09:00 ngày 02/11/2026: lịch giữ chỗ hạn 08:15 cùng ngày đã quá hạn. */
const AFTER_LAPSE = new Date('2026-11-02T09:00:00+07:00');
/** Ô trống của mỗi vòng (ô 0 đến 2 là ba lịch; ô 7 là khung giờ giữ chỗ quá hạn của Bệnh nhân thứ tư). */
const FREE_SLOTS = [3, 4, 5, 6, 7] as const;

let db: DataSource;
let fx: BookingFixtures;
let logs: string[] = [];
useIntegrationHooks((d, captured) => {
  db = d;
  fx = new BookingFixtures(d);
  logs = captured;
});
afterEach(closeRaceModules);

interface MixCtx {
  /** Mô tả kịch bản của vòng (thao tác, độ lệch), in khi vòng đỏ */
  plan: string;
  chosen: { name: string; lag: number; run: () => Promise<Side> }[];
}
interface MixResult {
  name: string;
  side: Side;
}

describe('TDL-17 100 vòng hỗn hợp trên cùng tập lịch', () => {
  it(
    `${String(ROUNDS)} vòng, hạt giống ${String(SEED)} + vòng: INV-1…INV-9 và IVT-01…IVT-07 xanh sau MỖI vòng; không lỗi lạ; 0 lần 503; 0 lần 1213 và 1205 nổi; mỗi khoản cọc hoàn tối đa MỘT lần; ghi số thử lại theo nhãn`,
    async () => {
      const w = await raceWorld(db, fx);
      const [p2, p3, p4] = await Promise.all([
        w.newPatient(),
        w.newPatient(),
        w.newPatient(),
      ]);
      // Cọc dịch vụ > 0 để `create` ra ChoThanhToan (giữ khung giờ, không ghi thanh toán 0đ)
      await fx.depositService(w.doctor.profile.dichVuKhamId, '50000.00');
      vi.setSystemTime(AFTER_LAPSE);
      const stats = new RaceStats();
      const tally = winnerTally();

      await runRounds<MixCtx, MixResult>({
        rounds: ROUNDS,
        setup: async (round) => {
          const { l1, l2, l3, r2, r3 } = await openScenario(w, [p2, p3, p4]);
          const random = seededRandom(SEED + round);
          const slotOf = () =>
            FREE_SLOTS[Math.floor(random() * FREE_SLOTS.length)] as number;
          const cancelBy = (lich: LichHen, patient: PatientRef) =>
            sideOf(
              stats,
              w.cancel.cancel({
                maLichHen: lich.maLichHen,
                actor: { kind: 'BenhNhan', accountId: patient.accountId },
                reason: 'BenhNhanHuy',
              }),
              cancelSide,
            );
          const approve = (yeuCauId: string) =>
            sideOf(
              stats,
              w.approveService.approveAsReception(w.receptionId, yeuCauId, {
                ghiChu: HANDLING_NOTE,
              }),
            );
          const reject = (yeuCauId: string) =>
            sideOf(
              stats,
              w.rejectService.rejectAsReception(w.receptionId, yeuCauId, {
                ghiChu: HANDLING_NOTE,
              }),
            );
          const toSlot = slotOf();
          const toSlotProxy = slotOf();
          const createSlot = slotOf();
          const all: Record<string, () => Promise<Side>> = {
            [`doi-L1-o${String(toSlot)}`]: () =>
              sideOf(
                stats,
                w.core.reschedule(w.tuDoi(l1.maLichHen, toSlot)),
                rescheduleSide,
              ),
            [`doiHo-L1-o${String(toSlotProxy)}`]: () =>
              sideOf(stats, w.doiHo(l1.maLichHen, toSlotProxy)),
            'huy-L1': () => cancelBy(l1, w.self),
            'huy-L2': () => cancelBy(l2, p2),
            'huy-L3': () => cancelBy(l3, p3),
            [`create-P4-o${String(createSlot)}`]: () =>
              sideOf(
                stats,
                w.create.create(p4.accountId, {
                  khungGioId: w.slot(createSlot),
                  hoSoNguoiThanId: null,
                  lyDoKham: null,
                }),
              ),
            'duyet-R2': () => approve(r2),
            'tuchoi-R2': () => reject(r2),
            'duyet-R3': () => approve(r3),
            'tuchoi-R3': () => reject(r3),
            hethan: () =>
              sideOf(stats, w.expiryJob.run(), (summary) => ({
                ok: summary !== undefined && summary.failed === 0,
                code: summary === undefined ? 'JOB_SKIPPED' : 'JOB',
              })),
          };
          const count = 4 + Math.floor(random() * 3);
          const chosen = pickDistinct(random, Object.keys(all), count).map(
            (name) => ({
              name,
              lag: Math.floor(random() * 13),
              run: all[name] as () => Promise<Side>,
            }),
          );
          return {
            plan: chosen
              .map((op) => `${op.name}+${String(op.lag)}ms`)
              .join(', '),
            chosen,
          };
        },
        race: ({ chosen }) => {
          const gate = createGate(chosen.length);
          return chosen.map((op) => async (): Promise<MixResult> => {
            await gate.arrive();
            if (op.lag > 0) await sleep(op.lag);
            return { name: op.name, side: await op.run() };
          });
        },
        check: async ({ plan }, results) => {
          try {
            const done = results.map((result) => {
              if (result.status === 'rejected') throw result.reason;
              return result.value;
            });
            for (const { name, side } of done) if (side.ok) tally.add(name);
            // Mỗi khoản cọc (một giao dịch thanh toán) được hoàn TỐI ĐA MỘT lần dù chuỗi đổi lịch và các đường huỷ chen nhau
            expect(await refundedTwice(db)).toBe(0);
            await settleRound(db, stats, { requireDepositCovered: true });
          } catch (error) {
            throw new Error(`kịch bản [${plan}]: ${(error as Error).message}`, {
              cause: error,
            });
          }
        },
      });
      finishX2(
        'TDL-17',
        'hỗn hợp 100 vòng',
        ROUNDS,
        tally.winners,
        logs,
        stats,
        { retriesAllowed: true },
      );
    },
    TIMEOUT,
  );
});

/**
 * Tập lịch của MỘT vòng: L1 của Bệnh nhân chính (ô 0, cọc, còn lần tự đổi), L2 của P2 (ô 1) và L3 của P3 (ô 2), cọc, ĐÃ HẾT lần tự đổi và mỗi cái có một yêu cầu ChoDuyet (mong muốn ô 5 và ô 6); P4 giữ chỗ ô 7 (ChoThanhToan quá hạn).
 */
async function openScenario(w: RaceWorld, [p2, p3, p4]: PatientRef[]) {
  await w.resetRound();
  const l1 = await w.book(0, { coc: COC });
  const l2 = await w.book(1, { patient: p2, coc: COC, soLan: 2 });
  const l3 = await w.book(2, { patient: p3, coc: COC, soLan: 2 });
  await w.fx.appointmentIn('ChoThanhToan', {
    doctor: w.doctor.profile,
    khungGioId: w.slot(7),
    patientId: (p4 as PatientRef).accountId,
  });
  const r2 = await w.openRequest(l2.lichHenId, 5);
  const r3 = await w.openRequest(l3.lichHenId, 6);
  return { l1, l2, l3, r2, r3 };
}

/** Số khoản thanh toán được hoàn thành công HƠN MỘT lần (phải bằng 0). */
async function refundedTwice(source: DataSource): Promise<number> {
  const rows: { n: number | string }[] = await source.query(
    `SELECT COUNT(*) AS n FROM (
       SELECT giao_dich_thanh_toan_id FROM lich_su_hoan_tien WHERE trang_thai = 'ThanhCong'
        GROUP BY giao_dich_thanh_toan_id HAVING COUNT(*) > 1) hai_lan`,
  );
  return Number(rows[0]?.n);
}
