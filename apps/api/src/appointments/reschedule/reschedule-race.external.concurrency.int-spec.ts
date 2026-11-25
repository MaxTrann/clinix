import type { DataSource } from 'typeorm';
import { BranchImpactService } from '../../admin/branches/impact/branch-impact.service.js';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { deferred } from '../../auth/testing/verification-int-helpers.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { DEPOSIT } from '../testing/cancel-world.js';
import { holdRowLock, runRounds } from '../testing/concurrency-harness.js';
import { sleep, winnerTally } from '../testing/concurrency-report.js';
import { captureMoneyTotals, type MoneyTotals } from '../testing/invariants.js';
import { waitUntilWaiting } from '../testing/lock-wait.js';
import {
  closedRow,
  PendingChangeFixtures,
} from '../testing/pending-change-fixtures.js';
import {
  PAIR_ROUNDS,
  RaceStats,
  finishX2,
  raceX2,
  rescheduleSide,
  settleRound,
  sideOf,
  type Side,
} from '../testing/reschedule-race-checks.js';
import {
  branchApplyActor,
  closeRaceModules,
  leaveActors,
  raceWorld,
  type RaceWorld,
} from '../testing/reschedule-race-world.js';
import { interceptStatements } from '../testing/statement-recorder.js';

// reschedule X2 — nhóm EXTERNAL: TDL-09 (đổi × duyệt nghỉ phép của Bác sĩ), TDL-10 (đổi × áp dụng thay đổi chi nhánh `applyOne`), TDL-20 `[đề xuất]` (đổi × duyệt thay đổi chi nhánh B10) (PLAN reschedule 5.4, 7.5; TRACKING reschedule 1.17; X1 M6) ĐỒNG THỜI
// trên MySQL 8.4 THẬT với `AppointmentsModule` thật, ví thật và hai đối tác DỰNG TAY của module khác (chỉ ĐỌC và IMPORT): nghỉ phép THẬT của `doctor` (gửi yêu cầu rồi duyệt; bước huỷ qua dịch vụ huỷ THẬT nên hoàn cọc vào ví THẬT) và
// `BranchChangeApplyService` THẬT của `admin`. Ca CỔNG XÁC ĐỊNH dùng `raceInOrder`, `holdRowLock`, `waitUntilWaiting` và dừng đúng một câu bằng `interceptStatements` (không phụ thuộc thời gian); ca TỰ NHIÊN quét độ lệch (PHỤ THUỘC
// THỜI GIAN ở chỗ ai thắng, nhưng tính nhất quán thì không). INV-1…INV-10 và IVT-01…IVT-07 chạy SAU MỖI VÒNG. CHẠY MỘT MÌNH.
const TIMEOUT = 540_000;
const COC = DEPOSIT;
const LEAVE_FREE_ROUNDS = 40;
const GATED_ROUNDS = 8;
const OVERLAP_ROUNDS = 100;
const ORDERED_ROUNDS = 5;
/** Thứ Ba (`WEEKDAY + 1` của 10/11/2026) và Thứ Tư 11/11/2026. */
const TUESDAY = 2;
/** `hieu_luc_tu` mặc định của `PendingChangeFixtures` (Thứ Hai 09/11/2026 07:00): `applyOne` nhận mốc này và `findBlocking` của đổi lịch coi vùng Thứ Ba là "sắp loại". */
const EFFECTIVE = new Date('2026-11-09T07:00:00+07:00');

let db: DataSource;
let fx: BookingFixtures;
let logs: string[] = [];
useIntegrationHooks((d, captured) => {
  db = d;
  fx = new BookingFixtures(d);
  logs = captured;
});
afterEach(closeRaceModules);

// ───────────────────────────── TDL-09: nghỉ phép ─────────────────────────────
// LƯU Ý (lần chạy đầu của X2 phát hiện): `LeaveReader` coi yêu cầu nghỉ `ChoDuyet` LẪN `DaDuyet` là chặn khung giờ (`BLOCKING_LEAVE_STATES`), nên một yêu cầu nghỉ ĐÃ GỬI sẵn khiến đổi luôn bị từ chối `BAC_SI_NGHI_PHEP`
// (cuộc đua vô nghĩa). Cuộc đua thật là GỬI RỒI DUYỆT yêu cầu nghỉ (hai bước THẬT của `doctor`, như DT-09 của B16a) × đổi: bên nghỉ khoá `bac_si FOR UPDATE` ở bước GỬI, đổi xin `bac_si FOR SHARE`.

interface LeaveCtx {
  a: LichHen;
  money: MoneyTotals;
}

describe('TDL-09 đổi vào khung giờ TRONG kỳ nghỉ × GỬI RỒI DUYỆT nghỉ phép THẬT của Bác sĩ', () => {
  /** Lịch cọc > 0 ở tuần sau (17/11, ngoài kỳ nghỉ) sẽ đổi sang ô 2 của 10/11 (ngày bác sĩ sẽ nghỉ CẢ NGÀY); KHÔNG yêu cầu nghỉ nào có sẵn. */
  async function leaveWorld() {
    const w = await raceWorld(db, fx);
    const nextWeek = await fx.doctor.shiftWithSlots(w.doctor.profile, {
      ngay: '2026-11-17',
      ca: 'CaSang',
    });
    const leave = leaveActors(w);
    const open = async (): Promise<LeaveCtx> => {
      await w.resetRound();
      const a = await w.book(nextWeek.slotIds[0]!, { coc: COC });
      return { a, money: await captureMoneyTotals(db) };
    };
    return { w, leave, open };
  }

  /** Sau MỖI vòng: yêu cầu nghỉ luôn xong (`DaDuyet`); không lịch hoạt động nào của bác sĩ còn trong kỳ nghỉ; đổi thắng ⇒ lịch mới bị huỷ vì nghỉ phép và hoàn cọc đúng MỘT lần; nghỉ gửi trước ⇒ đổi bị BAC_SI_NGHI_PHEP, lịch còn nguyên, không hoàn. */
  async function expectLeaveOutcome(
    w: RaceWorld,
    { a }: LeaveCtx,
    rescheduled: Side,
    leaving: Side,
    tally: ReturnType<typeof winnerTally>,
  ) {
    expect(leaving.ok, `gửi và duyệt nghỉ: ${leaving.code}`).toBe(true);
    expect(
      await w.countRows('yeu_cau_nghi_phep', "trang_thai = 'DaDuyet'"),
    ).toBe(1);
    expect(
      await w.countRows(
        'lich_hen',
        "trang_thai IN ('ChoThanhToan', 'DaXacNhan') AND DATE(thoi_gian) = '2026-11-10'",
      ),
    ).toBe(0);
    if (rescheduled.ok) {
      tally.add('đổi trước');
      expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaDoiLich');
      expect((await w.childOf(a.lichHenId))?.trangThai).toBe('DaHuy');
      expect(await w.refundCount()).toBe(1);
      expect(await w.balanceOf(w.self.walletId)).toBe(COC);
    } else {
      tally.add('nghỉ phép trước');
      expect(rescheduled.code).toBe(BOOKING_ERROR_CODES.DOCTOR_ON_LEAVE);
      expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaXacNhan');
      expect(await w.childOf(a.lichHenId)).toBeNull();
      expect(await w.refundCount()).toBe(0);
    }
  }

  // Hoàn cọc ở vòng đổi thắng là đổi tiền HỢP LỆ (huỷ vì nghỉ phép): chỉ vòng đổi bị từ chối mới so ba bảng tiền
  const settleFor = (ctx: LeaveCtx, rescheduled: Side) => ({
    requireDepositCovered: true,
    ...(rescheduled.ok ? {} : { moneyBefore: ctx.money }),
  });

  it.each(['TuDoi', 'DoiHo'] as const)(
    `(%s) ${String(LEAVE_FREE_ROUNDS)} vòng tự do: đúng MỘT nhánh (nghỉ phép gửi trước ⇒ đổi bị BAC_SI_NGHI_PHEP, HOẶC đổi trước ⇒ lịch mới bị huỷ vì nghỉ và hoàn cọc đúng một lần); không lịch DaXacNhan nào còn trong kỳ nghỉ; 0 lần thử lại`,
    async (variant) => {
      const { w, leave, open } = await leaveWorld();
      const stats = new RaceStats();
      await raceX2<LeaveCtx>({
        tag: `TDL-09a-${variant}`,
        name: `đổi (${variant}) × gửi và duyệt nghỉ phép`,
        db,
        logs,
        stats,
        rounds: LEAVE_FREE_ROUNDS,
        setup: open,
        first: ({ a }) =>
          variant === 'TuDoi'
            ? sideOf(
                stats,
                w.core.reschedule(w.tuDoi(a.maLichHen, 2)),
                rescheduleSide,
              )
            : sideOf(stats, w.doiHo(a.maLichHen, 2)),
        second: () => sideOf(stats, leave.submitAndApprove()),
        check: (ctx, rescheduled, leaving, tally) =>
          expectLeaveOutcome(w, ctx, rescheduled, leaving, tally),
        settleOptions: (ctx, rescheduled) => settleFor(ctx, rescheduled),
      });
    },
    TIMEOUT,
  );

  // Hai ca cổng KHÔNG dùng khoá `bac_si` do test giữ để xếp hàng "S trước X sau" hay "X trước S sau": khi nhả, InnoDB cấp khoá cho người chờ KHÔNG nhất thiết theo thứ tự xếp hàng (lần chạy đầu của X2: bên X được cấp trước
  // bên S đã chờ trước). Thay bằng giữ THẬT khoá của bên đến TRƯỚC (`interceptStatements` dừng ngay SAU câu khoá), rồi bên kia mới bắt đầu và bị chặn ở `bac_si`: thứ tự quyết định, không phụ thuộc thời gian.
  it(
    `CA CỔNG (nghỉ phép đến trước), ${String(GATED_ROUNDS)} vòng: bước GỬI nghỉ giữ bac_si FOR UPDATE (dừng sau câu khoá), đổi bị chặn ở bac_si FOR SHARE; xác định: yêu cầu nghỉ commit TRƯỚC ⇒ đổi BAC_SI_NGHI_PHEP, lịch còn nguyên, không hoàn; 0 lần thử lại`,
    async () => {
      const { w, leave, open } = await leaveWorld();
      const pause = pauseAt(
        /FROM bac_si WHERE tai_khoan_id = \?\s+FOR UPDATE/,
        'after',
      );
      const stats = new RaceStats();
      const tally = winnerTally();
      await runRounds<LeaveCtx, Side[]>({
        rounds: GATED_ROUNDS,
        setup: open,
        race: ({ a }) => [
          async () => {
            const holding = pause.arm();
            const leaving = sideOf(stats, leave.submitAndApprove());
            let rescheduling: Promise<Side> | undefined;
            try {
              await arrived(
                holding,
                'bước gửi nghỉ phép đã giữ bac_si FOR UPDATE',
              );
              rescheduling = sideOf(
                stats,
                w.core.reschedule(w.tuDoi(a.maLichHen, 2)),
                rescheduleSide,
              );
              await waitUntilWaiting(db, 'bac_si', 1);
            } finally {
              holding.open.resolve();
            }
            return [await (rescheduling as Promise<Side>), await leaving];
          },
        ],
        check: async (ctx, results) => {
          const settled = results[0];
          if (settled?.status !== 'fulfilled') throw settled?.reason;
          const [rescheduled, leaving] = settled.value as [Side, Side];
          expect(rescheduled.ok, `đổi: ${rescheduled.code}`).toBe(false);
          await expectLeaveOutcome(w, ctx, rescheduled, leaving, tally);
          await settleRound(db, stats, settleFor(ctx, rescheduled));
        },
      });
      finishX2(
        'TDL-09b-nghi',
        'cổng bac_si, nghỉ phép đến trước',
        GATED_ROUNDS,
        tally.winners,
        logs,
        stats,
      );
    },
    TIMEOUT,
  );

  it(
    `CA CỔNG (đổi đến trước), ${String(GATED_ROUNDS)} vòng: đổi lịch GIỮ bac_si FOR SHARE (dừng sau câu khoá), bước GỬI nghỉ bị chặn ở bac_si FOR UPDATE; xác định: đổi commit TRƯỚC ⇒ lịch mới bị huỷ vì nghỉ phép, hoàn cọc đúng MỘT lần; 0 lần thử lại`,
    async () => {
      const { w, leave, open } = await leaveWorld();
      const pause = pauseAt(
        /FROM bac_si WHERE tai_khoan_id = \?\s+FOR SHARE/,
        'after',
      );
      const stats = new RaceStats();
      const tally = winnerTally();
      await runRounds<LeaveCtx, Side[]>({
        rounds: GATED_ROUNDS,
        setup: open,
        race: ({ a }) => [
          async () => {
            const holding = pause.arm();
            const rescheduling = sideOf(
              stats,
              w.core.reschedule(w.tuDoi(a.maLichHen, 2)),
              rescheduleSide,
            );
            let leaving: Promise<Side> | undefined;
            try {
              await arrived(holding, 'đổi lịch đã giữ bac_si FOR SHARE');
              leaving = sideOf(stats, leave.submitAndApprove());
              await waitUntilWaiting(db, 'bac_si', 1);
            } finally {
              holding.open.resolve();
            }
            return [await rescheduling, await (leaving as Promise<Side>)];
          },
        ],
        check: async (ctx, results) => {
          const settled = results[0];
          if (settled?.status !== 'fulfilled') throw settled?.reason;
          const [rescheduled, leaving] = settled.value as [Side, Side];
          expect(rescheduled, 'đổi').toEqual({ ok: true, code: 'OK' });
          await expectLeaveOutcome(w, ctx, rescheduled, leaving, tally);
          await settleRound(db, stats, settleFor(ctx, rescheduled));
        },
      });
      finishX2(
        'TDL-09b-doi',
        'cổng bac_si, đổi đến trước',
        GATED_ROUNDS,
        tally.winners,
        logs,
        stats,
      );
    },
    TIMEOUT,
  );
});

// ─────────────────── TDL-10 và TDL-20: thay đổi chi nhánh ───────────────────

/** Một cổng hai đầu: `reached` báo "bên kia đã tới đây", `open` cho phép đi tiếp. */
interface Gate {
  reached: ReturnType<typeof deferred>;
  open: ReturnType<typeof deferred>;
}
const newGate = (): Gate => ({ reached: deferred(), open: deferred() });

/** Chờ `gate.reached` nhưng không treo mãi: nếu không ai tới thì ném lỗi nêu tên chỗ chờ (ví dụ giả thuyết khoá sai). */
async function arrived(gate: Gate, what: string): Promise<void> {
  await Promise.race([
    gate.reached.promise,
    sleep(8000).then(() => {
      throw new Error(`không ai tới: ${what}`);
    }),
  ]);
}

/**
 * Dừng ĐÚNG MỘT LẦN, TRƯỚC khi câu `INSERT INTO lich_hen (…)` của giao dịch đổi lịch chạy: lúc đó đổi lịch đã khoá hai `khung_gio` và `lich_hen` nhưng CHƯA xin S ngầm ở `chi_nhanh` (X1 M5, M6). `arm()` đặt cổng cho
 * lần kế tiếp. Lần chạy lại của thân (sau 1213) đi qua vì cổng đã dùng. CHỈ gọi MỘT lần mỗi test (thay `createQueryRunner`).
 */
function pauseAt(pattern: RegExp, when: 'before' | 'after') {
  let current: Gate | null = null;
  interceptStatements(db, async (call, run) => {
    const gate = current;
    const hit = gate !== null && pattern.test(call.sql);
    if (hit && when === 'before') {
      current = null;
      gate.reached.resolve();
      await gate.open.promise;
    }
    const result = await run();
    if (hit && when === 'after') {
      current = null;
      gate.reached.resolve();
      await gate.open.promise;
    }
    return result;
  });
  return {
    arm: (): Gate => {
      current = newGate();
      return current;
    },
  };
}

/** Dừng TRƯỚC câu `INSERT INTO lich_hen (…)` của đổi lịch (đã khoá hai `khung_gio` và `lich_hen`, chưa xin S ngầm ở `chi_nhanh`). */
const pauseBeforeInsert = () =>
  pauseAt(/^\s*INSERT INTO lich_hen\s*\(/i, 'before');

/** `BranchImpactService` THẬT nhưng `lockSlotsOfDays` dừng trước khi xin khoá khi `arm()` (cổng ép chồng của M6: lúc đó `applyOne` đã giữ `yeu_cau` X và `chi_nhanh` X). */
class GatedImpact extends BranchImpactService {
  private current: Gate | null = null;
  arm(): Gate {
    this.current = newGate();
    return this.current;
  }
  override async lockSlotsOfDays(
    ...args: Parameters<BranchImpactService['lockSlotsOfDays']>
  ): Promise<void> {
    const gate = this.current;
    if (gate !== null) {
      this.current = null;
      gate.reached.resolve();
      await gate.open.promise;
    }
    return super.lockSlotsOfDays(...args);
  }
}

interface BranchCtx {
  a: LichHen;
  requestId: string;
  money: MoneyTotals;
}

async function branchWorld() {
  const w = await raceWorld(db, fx);
  // Thứ Tư 11/11: ca MỚI của bác sĩ (ngoài vùng bị loại là Thứ Ba)
  const wednesday = await fx.doctor.shiftWithSlots(w.doctor.profile, {
    ngay: '2026-11-11',
    ca: 'CaSang',
  });
  const wedSlot = wednesday.slotIds[0]!;
  /** Vòng sạch: lịch cọc > 0 ở ô 0 (Thứ Ba 10/11) và MỘT yêu cầu thay đổi chi nhánh `DaDuyet` chưa áp dụng đóng Thứ Ba từ 09/11 07:00. */
  const open = async (): Promise<BranchCtx> => {
    await w.resetRound();
    await db.query('DELETE FROM yeu_cau_thay_doi_chi_nhanh');
    const a = await w.book(0, { coc: COC });
    const requestId = await new PendingChangeFixtures(db).insert({
      chiNhanhId: w.branchId,
      proposerId: w.adminId,
      approverId: w.adminId,
      lichHoatDong: [closedRow(TUESDAY)],
    });
    return { a, requestId, money: await captureMoneyTotals(db) };
  };
  const requestRow = async (requestId: string) => {
    const rows: { apDung: string | null; quaHan: string | null }[] =
      await db.query(
        `SELECT ap_dung_luc AS apDung, qua_han_luc AS quaHan FROM yeu_cau_thay_doi_chi_nhanh WHERE yeu_cau_thay_doi_chi_nhanh_id = ?`,
        [requestId],
      );
    return rows[0]!;
  };
  return { w, wedSlot, open, requestRow };
}

const covered = ({ money }: BranchCtx) => ({
  moneyBefore: money,
  requireDepositCovered: true,
});

describe('TDL-10 đổi × áp dụng thay đổi chi nhánh (`applyOne`, job B11)', () => {
  it(
    `(a) đổi VÀO vùng bị loại, ${String(PAIR_ROUNDS)} vòng: đổi bị từ chối có kiểu KHUNG_GIO_NGOAI_LICH_MOI trước khi ghi (không S ngầm ở chi_nhanh nên không chu trình); applyOne QuaHan (lịch còn ở vùng); 0 lần 1213, 0 lần thử lại`,
    async () => {
      const { w, open, requestRow } = await branchWorld();
      const apply = branchApplyActor(w);
      const stats = new RaceStats();
      await raceX2<BranchCtx>({
        tag: 'TDL-10a',
        name: 'đổi vào vùng bị loại × applyOne',
        db,
        logs,
        stats,
        setup: open,
        first: ({ a }) =>
          sideOf(
            stats,
            w.core.reschedule(w.tuDoi(a.maLichHen, 2)),
            rescheduleSide,
          ),
        second: ({ requestId }) =>
          sideOf(
            stats,
            apply.service.applyOne(requestId, EFFECTIVE),
            (outcome) => ({
              ok: true,
              code: outcome.kind,
            }),
          ),
        check: async ({ a, requestId }, rescheduled, applied, tally) => {
          expect(rescheduled).toEqual({
            ok: false,
            code: BOOKING_ERROR_CODES.SLOT_OUTSIDE_NEW_SCHEDULE,
          });
          expect(applied).toEqual({ ok: true, code: 'QuaHan' });
          tally.add('đổi bị chặn, applyOne QuaHan');
          expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaXacNhan');
          expect(await w.countRows('lich_hen')).toBe(1);
          expect((await requestRow(requestId)).quaHan).not.toBeNull();
        },
        settleOptions: covered,
      });
    },
    TIMEOUT,
  );

  it(
    `(b) đổi RA NGOÀI vùng, ÉP CHỒNG bằng cổng, ${String(OVERLAP_ROUNDS)} vòng (X1 M6): đổi đã giữ khung_gio và lich_hen, applyOne đã giữ yeu_cau và chi_nhanh; ghi số 1213 NỔI: nạn nhân luôn là applyOne, đổi KHÔNG bị thử lại, đổi thành công; applyOne hoàn tác trọn (yêu cầu không đổi cột nào); lượt chạy lại của applyOne cho QuaHan`,
    async () => {
      const { w, wedSlot, open, requestRow } = await branchWorld();
      const impact = new GatedImpact();
      const apply = branchApplyActor(w, impact);
      const pause = pauseBeforeInsert();
      const stats = new RaceStats();
      const tally = winnerTally();
      await runRounds<BranchCtx, Side[]>({
        rounds: OVERLAP_ROUNDS,
        setup: open,
        race: ({ a, requestId }) => [
          async () => {
            const inserting = pause.arm();
            const applying = impact.arm();
            const rescheduling = sideOf(
              stats,
              w.core.reschedule(w.tuDoi(a.maLichHen, wedSlot)),
              rescheduleSide,
            );
            let applied: Promise<Side> | undefined;
            try {
              await arrived(inserting, 'đổi lịch tới câu INSERT lich_hen');
              applied = sideOf(
                stats,
                apply.service.applyOne(requestId, EFFECTIVE),
                (outcome) => ({ ok: true, code: outcome.kind }),
              );
              await arrived(applying, 'applyOne tới lockSlotsOfDays');
              inserting.open.resolve();
              await waitUntilWaiting(db, 'chi_nhanh', 1);
              applying.open.resolve();
            } finally {
              // Mở cả hai cổng kể cả khi lỗi, để không bỏ rơi việc đang chờ
              inserting.open.resolve();
              applying.open.resolve();
            }
            return [await rescheduling, await (applied as Promise<Side>)];
          },
        ],
        check: async ({ a, requestId, money }, results) => {
          const settled = results[0];
          if (settled?.status !== 'fulfilled') throw settled?.reason;
          const [rescheduled, applied] = settled.value as [Side, Side];
          expect(rescheduled, 'đổi lịch').toEqual({ ok: true, code: 'OK' });
          expect(applied, 'applyOne').toEqual({
            ok: false,
            code: 'MYSQL_1213',
          });
          tally.add('applyOne là nạn nhân 1213');
          // applyOne hoàn tác trọn: yêu cầu không có cột nào đổi
          expect(await requestRow(requestId)).toEqual({
            apDung: null,
            quaHan: null,
          });
          expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaDoiLich');
          expect((await w.childOf(a.lichHenId))?.khungGioId).toBe(wedSlot);
          // Lượt chạy lại (như job quét lại một phút sau): lịch cũ đã DaDoiLich nhưng ca của Thứ Ba còn nên QuaHan
          const again = await apply.service.applyOne(requestId, EFFECTIVE);
          expect(again.kind).toBe('QuaHan');
          await settleRound(db, stats, covered({ a, requestId, money }));
        },
      });
      finishX2(
        'TDL-10b',
        'đổi ra ngoài vùng × applyOne, ép chồng',
        OVERLAP_ROUNDS,
        tally.winners,
        logs,
        stats,
        { surfacedAllowed: true },
      );
      expect(stats.surfaced1213, 'số lần applyOne là nạn nhân 1213').toBe(
        OVERLAP_ROUNDS,
      );
    },
    TIMEOUT,
  );

  it(
    `(b) đổi RA NGOÀI vùng × applyOne, ${String(PAIR_ROUNDS)} vòng quét độ lệch (PHỤ THUỘC THỜI GIAN: chỉ khẳng định nhất quán): đổi LUÔN thành công và KHÔNG bị thử lại; applyOne hoặc QuaHan hoặc 1213 nổi (khi đó yêu cầu không đổi cột nào)`,
    async () => {
      const { w, wedSlot, open, requestRow } = await branchWorld();
      const apply = branchApplyActor(w);
      const stats = new RaceStats();
      await raceX2<BranchCtx>({
        tag: 'TDL-10b-tunhien',
        name: 'đổi ra ngoài vùng × applyOne, tự nhiên',
        db,
        logs,
        stats,
        setup: open,
        first: ({ a }) =>
          sideOf(
            stats,
            w.core.reschedule(w.tuDoi(a.maLichHen, wedSlot)),
            rescheduleSide,
          ),
        second: ({ requestId }) =>
          sideOf(
            stats,
            apply.service.applyOne(requestId, EFFECTIVE),
            (outcome) => ({
              ok: true,
              code: outcome.kind,
            }),
          ),
        check: async ({ a, requestId }, rescheduled, applied, tally) => {
          expect(rescheduled, 'đổi lịch').toEqual({ ok: true, code: 'OK' });
          expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaDoiLich');
          const row = await requestRow(requestId);
          if (applied.code === 'MYSQL_1213') {
            tally.add('applyOne nạn nhân 1213');
            expect(row).toEqual({ apDung: null, quaHan: null });
          } else {
            tally.add('applyOne QuaHan');
            expect(applied).toEqual({ ok: true, code: 'QuaHan' });
            expect(row.quaHan).not.toBeNull();
          }
        },
        settleOptions: covered,
        options: { surfacedAllowed: true },
      });
    },
    TIMEOUT,
  );
});

describe('TDL-20 [đề xuất] đổi × DUYỆT thay đổi chi nhánh (B10: khoá khung giờ của các thứ đổi rồi ghi DaDuyet) vào vùng sắp loại, hai thứ tự bằng cổng', () => {
  const approving = (w: RaceWorld, impact: BranchImpactService) =>
    holdRowLock(db, 'SELECT 1').then(async (held) => {
      const lock = impact.lockSlotsOfDays(held.manager, w.branchId, EFFECTIVE, [
        TUESDAY,
      ]);
      return { held, lock };
    });

  it(
    `duyệt đến TRƯỚC, ${String(ORDERED_ROUNDS)} vòng: đổi (vào Thứ Ba) chờ ở khung_gio rồi thấy yêu cầu đã commit ⇒ KHUNG_GIO_NGOAI_LICH_MOI, lịch không đổi; không 1205 hay 1213 lộ ra`,
    async () => {
      const { w } = await branchWorld();
      const impact = new BranchImpactService();
      const stats = new RaceStats();
      const tally = winnerTally();
      await runRounds<{ a: LichHen; money: MoneyTotals }, Side>({
        rounds: ORDERED_ROUNDS,
        setup: async () => {
          await w.resetRound();
          await db.query('DELETE FROM yeu_cau_thay_doi_chi_nhanh');
          const a = await w.book(0, { coc: COC });
          return { a, money: await captureMoneyTotals(db) };
        },
        race: ({ a }) => [
          async () => {
            const { held, lock } = await approving(w, impact);
            let rescheduling: Promise<Side> | undefined;
            try {
              await lock;
              await new PendingChangeFixtures(held.manager).insert({
                chiNhanhId: w.branchId,
                proposerId: w.adminId,
                approverId: w.adminId,
                lichHoatDong: [closedRow(TUESDAY)],
              });
              rescheduling = sideOf(
                stats,
                w.core.reschedule(w.tuDoi(a.maLichHen, 2)),
                rescheduleSide,
              );
              await waitUntilWaiting(db, 'khung_gio', 1);
              await held.release('commit');
            } finally {
              await held.release('rollback');
            }
            return rescheduling as Promise<Side>;
          },
        ],
        check: async ({ a, money }, results) => {
          const settled = results[0];
          if (settled?.status !== 'fulfilled') throw settled?.reason;
          expect(settled.value).toEqual({
            ok: false,
            code: BOOKING_ERROR_CODES.SLOT_OUTSIDE_NEW_SCHEDULE,
          });
          tally.add('duyệt trước, đổi bị chặn');
          expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaXacNhan');
          expect(await w.countRows('lich_hen')).toBe(1);
          await settleRound(db, stats, covered({ a, requestId: '', money }));
        },
      });
      finishX2(
        'TDL-20-duyet',
        'duyệt thay đổi chi nhánh đến trước',
        ORDERED_ROUNDS,
        tally.winners,
        logs,
        stats,
      );
    },
    TIMEOUT,
  );

  it(
    `đổi đến TRƯỚC, ${String(ORDERED_ROUNDS)} vòng: đổi đã giữ khung_gio và dừng trước INSERT; duyệt (lockSlotsOfDays) chờ; đổi commit ⇒ BranchImpactService.compute thấy lịch MỚI (không thấy lịch cũ DaDoiLich); không 1205 hay 1213; 0 lần thử lại`,
    async () => {
      const { w } = await branchWorld();
      const impact = new BranchImpactService();
      const pause = pauseBeforeInsert();
      const stats = new RaceStats();
      const tally = winnerTally();
      await runRounds<{ a: LichHen; money: MoneyTotals }, Side>({
        rounds: ORDERED_ROUNDS,
        setup: async () => {
          await w.resetRound();
          await db.query('DELETE FROM yeu_cau_thay_doi_chi_nhanh');
          const a = await w.book(0, { coc: COC });
          return { a, money: await captureMoneyTotals(db) };
        },
        race: ({ a }) => [
          async () => {
            const inserting = pause.arm();
            const rescheduling = sideOf(
              stats,
              w.core.reschedule(w.tuDoi(a.maLichHen, 2)),
              rescheduleSide,
            );
            const held = await holdRowLock(db, 'SELECT 1');
            try {
              await arrived(inserting, 'đổi lịch tới câu INSERT lich_hen');
              const locking = approving2(w, impact, held.manager);
              await waitUntilWaiting(db, 'khung_gio', 1);
              inserting.open.resolve();
              await locking;
              const affected = await impact.compute(held.manager, {
                chiNhanhId: w.branchId,
                tuLuc: EFFECTIVE,
                changedDays: [closedRow(TUESDAY)],
                removedServiceIds: [],
              });
              const child = await w.childOf(a.lichHenId);
              expect(child, 'lịch mới của đổi lịch').not.toBeNull();
              const codes = affected.lichHen.map((row) => row.maLichHen);
              expect(codes).toContain(child?.maLichHen);
              expect(codes).not.toContain(a.maLichHen);
            } finally {
              inserting.open.resolve();
              await held.release('rollback');
            }
            return rescheduling;
          },
        ],
        check: async ({ a, money }, results) => {
          const settled = results[0];
          if (settled?.status !== 'fulfilled') throw settled?.reason;
          expect(settled.value).toEqual({ ok: true, code: 'OK' });
          tally.add('đổi trước, duyệt thấy lịch mới');
          expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaDoiLich');
          await settleRound(db, stats, covered({ a, requestId: '', money }));
        },
      });
      finishX2(
        'TDL-20-doi',
        'đổi đến trước duyệt thay đổi chi nhánh',
        ORDERED_ROUNDS,
        tally.winners,
        logs,
        stats,
      );
    },
    TIMEOUT,
  );
});

/** Khoá các khung giờ của Thứ Ba bằng giao dịch `manager` (phía duyệt B10 làm TRƯỚC khi ghi `DaDuyet`). */
function approving2(
  w: RaceWorld,
  impact: BranchImpactService,
  manager: Parameters<BranchImpactService['lockSlotsOfDays']>[0],
): Promise<void> {
  return impact.lockSlotsOfDays(manager, w.branchId, EFFECTIVE, [TUESDAY]);
}
