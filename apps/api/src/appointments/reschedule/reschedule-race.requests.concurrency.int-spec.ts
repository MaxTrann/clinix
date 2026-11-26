import type { DataSource } from 'typeorm';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { DEPOSIT } from '../testing/cancel-world.js';
import { createGate, runRounds } from '../testing/concurrency-harness.js';
import { winnerTally } from '../testing/concurrency-report.js';
import { captureMoneyTotals, type MoneyTotals } from '../testing/invariants.js';
import {
  PAIR_ROUNDS,
  RaceStats,
  cancelSide,
  finishX2,
  raceX2,
  settleRound,
  sideOf,
  type Side,
} from '../testing/reschedule-race-checks.js';
import {
  closeRaceModules,
  raceWorld,
  type RaceWorld,
} from '../testing/reschedule-race-world.js';
import { HANDLING_NOTE } from '../testing/reschedule-request-handle-world.js';
import { DEFAULT_REASON } from '../testing/reschedule-request-world.js';
import type { CreateRescheduleRequestOutcome } from './reschedule-request.types.js';

// reschedule X2 — nhóm REQUESTS: TDL-12 (hai nhân sự cùng DUYỆT), TDL-13 (DUYỆT × TỪ CHỐI), TDL-14 (DUYỆT × Bệnh nhân huỷ lịch gốc), TDL-15 (DUYỆT × Lễ tân đổi hộ cùng lịch gốc), TDL-16 (mười yêu cầu cho MỘT lịch) (PLAN reschedule
// 5.4, 5.7, 7.5; TRACKING reschedule 1.17) ĐỒNG THỜI trên MySQL 8.4 THẬT với `AppointmentsModule` thật (duyệt, từ chối, đổi hộ, huỷ, tạo yêu cầu), Audit và thông báo THẬT, ví thật. Hai loại ca: (1) CA ĐÔI quét độ lệch (56 vòng, hai bên xuất phát cùng
// lúc: PHỤ THUỘC THỜI GIAN ở chỗ ai thắng, nhưng tính nhất quán của kết quả thì không); (2) CA CỔNG XÁC ĐỊNH (`raceInOrder`: một kết nối giữ khoá, bên thứ nhất bị chặn rồi bên thứ hai, nhả khoá: hai thứ tự, KHÔNG phụ thuộc thời gian,
// là ca QUYẾT ĐỊNH). INV-1…INV-10 và IVT-01…IVT-07 chạy SAU MỖI VÒNG. CHẠY MỘT MÌNH.
const TIMEOUT = 540_000;
const COC = DEPOSIT;
/** Số vòng của mỗi ca cổng (hai thứ tự, mỗi thứ tự một test): kết quả xác định nên ít vòng là đủ để chắc không chập chờn. */
const GATED_ROUNDS = 8;
const TEN_REQUESTS = 10;
const TEN_REQUESTS_ROUNDS = 30;

let db: DataSource;
let fx: BookingFixtures;
let logs: string[] = [];
useIntegrationHooks((d, captured) => {
  db = d;
  fx = new BookingFixtures(d);
  logs = captured;
});
afterEach(closeRaceModules);

interface Ctx {
  a: LichHen;
  yeuCauId: string;
  money: MoneyTotals;
}

/** Vòng sạch: một lịch cọc > 0 ĐÃ HẾT lần tự đổi (`so_lan_tu_doi_lich` = 2) ở ô 0 và MỘT yêu cầu `ChoDuyet` mong muốn ô 2. */
async function openCase(w: RaceWorld): Promise<Ctx> {
  await w.resetRound();
  const a = await w.book(0, { coc: COC, soLan: 2 });
  const yeuCauId = await w.openRequest(a.lichHenId, 2);
  return { a, yeuCauId, money: await captureMoneyTotals(db) };
}

const covered = ({ money }: Ctx) => ({
  moneyBefore: money,
  requireDepositCovered: true,
});

/** Duyệt THÀNH CÔNG: yêu cầu DaDuyet, đúng MỘT lịch mới ở ô 2, lịch cũ DaDoiLich, ô 0 trống; đúng một nhật ký, một thông báo, một thư. */
async function expectApproved(w: RaceWorld, { a, yeuCauId }: Ctx) {
  expect(await w.requestStatus(yeuCauId)).toBe('DaDuyet');
  expect(await w.countRows('lich_hen')).toBe(2);
  expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaDoiLich');
  expect((await w.childOf(a.lichHenId))?.khungGioId).toBe(w.slot(2));
  expect((await w.slotState(0)).trangThai).toBe('ConTrong');
  expect((await w.slotState(2)).trangThai).toBe('DaDat');
  await expectWrittenOnce(w);
}

/** Từ chối THÀNH CÔNG: yêu cầu TuChoi, KHÔNG lịch mới, lịch cũ còn DaXacNhan, hai khung giờ như cũ; đúng một nhật ký, một thông báo, một thư. */
async function expectRejected(w: RaceWorld, { a, yeuCauId }: Ctx) {
  expect(await w.requestStatus(yeuCauId)).toBe('TuChoi');
  expect(await w.countRows('lich_hen')).toBe(1);
  expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaXacNhan');
  expect((await w.slotState(0)).trangThai).toBe('DaDat');
  expect((await w.slotState(2)).trangThai).toBe('ConTrong');
  await expectWrittenOnce(w);
}

async function expectWrittenOnce(w: RaceWorld) {
  expect(await w.countRows('nhat_ky_hanh_dong')).toBe(1);
  expect(await w.countRows('thong_bao')).toBe(1);
  expect(await w.countRows('email_thong_bao')).toBe(1);
}

/** Khoá hàng yêu cầu: giữ nó, cả hai bên duyệt và từ chối đều bị chặn ở đúng bảng này (duyệt sau khi đã xin tầng 2 đến 6). */
const requestLock = (yeuCauId: string) => ({
  sql: 'SELECT yeu_cau_doi_lich_ngoai_chinh_sach_id FROM yeu_cau_doi_lich_ngoai_chinh_sach WHERE yeu_cau_doi_lich_ngoai_chinh_sach_id = ? FOR UPDATE',
  params: [yeuCauId],
  table: 'yeu_cau_doi_lich_ngoai_chinh_sach',
});

describe('TDL-12 hai nhân sự cùng DUYỆT một yêu cầu', () => {
  it.each(['hai Lễ tân', 'Lễ tân và Quản trị viên Toàn hệ thống'] as const)(
    `(%s) ${String(PAIR_ROUNDS)} vòng: đúng MỘT thắng; bên thua 409 YEU_CAU_DA_XU_LY; yêu cầu DaDuyet, đúng MỘT lịch mới, một nhật ký, một thông báo, một thư; 0 lần thử lại`,
    async (variant) => {
      const w = await raceWorld(db, fx);
      const second = await w.secondReceptionist();
      const admin = await w.secondAdmin();
      const stats = new RaceStats();
      await raceX2<Ctx>({
        tag: `TDL-12-${variant === 'hai Lễ tân' ? 'LeTan' : 'Admin'}`,
        name: `hai nhân sự duyệt (${variant})`,
        db,
        logs,
        stats,
        setup: () => openCase(w),
        first: ({ yeuCauId }) =>
          sideOf(
            stats,
            w.approveService.approveAsReception(w.receptionId, yeuCauId, {
              ghiChu: HANDLING_NOTE,
            }),
          ),
        second: ({ yeuCauId }) =>
          sideOf(
            stats,
            variant === 'hai Lễ tân'
              ? w.approveService.approveAsReception(second, yeuCauId, {
                  ghiChu: HANDLING_NOTE,
                })
              : w.approveService.approveAsAdmin(
                  admin.scope,
                  admin.accountId,
                  yeuCauId,
                  { ghiChu: HANDLING_NOTE },
                ),
          ),
        check: async (ctx, first, second2, tally) => {
          expect([first.ok, second2.ok].filter(Boolean)).toHaveLength(1);
          expect((first.ok ? second2 : first).code).toBe(
            BOOKING_ERROR_CODES.REQUEST_HANDLED,
          );
          tally.add(first.ok ? 'bên thứ nhất' : 'bên thứ hai');
          await expectApproved(w, ctx);
        },
        settleOptions: covered,
      });
    },
    TIMEOUT,
  );

  it.each(['Lễ tân đến trước', 'Quản trị viên đến trước'] as const)(
    `CA CỔNG (%s), ${String(GATED_ROUNDS)} vòng: giữ khoá benh_nhan của chủ lịch, hai bên cùng bị chặn ở đó theo thứ tự định trước; bên đến TRƯỚC luôn thắng, bên sau 409 YEU_CAU_DA_XU_LY (quyết định bằng hàng đã khoá, không bằng lần đọc cũ); 0 lần thử lại`,
    async (order) => {
      const w = await raceWorld(db, fx);
      const admin = await w.secondAdmin();
      const stats = new RaceStats();
      const staffFirst = order === 'Lễ tân đến trước';
      const byStaff = ({ yeuCauId }: Ctx) =>
        sideOf(
          stats,
          w.approveService.approveAsReception(w.receptionId, yeuCauId, {
            ghiChu: HANDLING_NOTE,
          }),
        );
      const byAdmin = ({ yeuCauId }: Ctx) =>
        sideOf(
          stats,
          w.approveService.approveAsAdmin(
            admin.scope,
            admin.accountId,
            yeuCauId,
            { ghiChu: HANDLING_NOTE },
          ),
        );
      await raceX2<Ctx>({
        tag: `TDL-12-cong-${staffFirst ? 'LeTan' : 'Admin'}`,
        name: `cổng, ${order}`,
        db,
        logs,
        stats,
        rounds: GATED_ROUNDS,
        gate: () => ({
          sql: 'SELECT tai_khoan_id FROM benh_nhan WHERE tai_khoan_id = ? FOR UPDATE',
          params: [w.self.accountId],
          table: 'benh_nhan',
        }),
        setup: () => openCase(w),
        first: staffFirst ? byStaff : byAdmin,
        second: staffFirst ? byAdmin : byStaff,
        check: async (ctx, first, second, tally) => {
          expect(first.ok, `bên đến trước: ${first.code}`).toBe(true);
          expect(second.code).toBe(BOOKING_ERROR_CODES.REQUEST_HANDLED);
          tally.add(`${order} thắng`);
          await expectApproved(w, ctx);
        },
        settleOptions: covered,
      });
    },
    TIMEOUT,
  );
});

describe('TDL-13 DUYỆT × TỪ CHỐI cùng một yêu cầu', () => {
  const approveBy = (w: RaceWorld, stats: RaceStats, { yeuCauId }: Ctx) =>
    sideOf(
      stats,
      w.approveService.approveAsReception(w.receptionId, yeuCauId, {
        ghiChu: HANDLING_NOTE,
      }),
    );
  const rejectBy = (
    w: RaceWorld,
    stats: RaceStats,
    accountId: string,
    { yeuCauId }: Ctx,
  ) =>
    sideOf(
      stats,
      w.rejectService.rejectAsReception(accountId, yeuCauId, {
        ghiChu: HANDLING_NOTE,
      }),
    );

  it(
    `(PHỤ THUỘC THỜI GIAN) ${String(PAIR_ROUNDS)} vòng quét độ lệch: một thắng; KHÔNG BAO GIỜ vừa lịch mới vừa TuChoi; thông báo đúng loại và đúng MỘT; 0 lần thử lại (chỉ khẳng định tính nhất quán, ai thắng tuỳ độ lệch)`,
    async () => {
      const w = await raceWorld(db, fx);
      const other = await w.secondReceptionist();
      const stats = new RaceStats();
      await raceX2<Ctx>({
        tag: 'TDL-13-quet',
        name: 'duyệt × từ chối, quét độ lệch',
        db,
        logs,
        stats,
        setup: () => openCase(w),
        first: (ctx) => approveBy(w, stats, ctx),
        second: (ctx) => rejectBy(w, stats, other, ctx),
        check: async (ctx, approved, rejected, tally) => {
          expect([approved.ok, rejected.ok].filter(Boolean)).toHaveLength(1);
          expect((approved.ok ? rejected : approved).code).toBe(
            BOOKING_ERROR_CODES.REQUEST_HANDLED,
          );
          if (approved.ok) {
            tally.add('duyệt thắng');
            await expectApproved(w, ctx);
          } else {
            tally.add('từ chối thắng');
            await expectRejected(w, ctx);
          }
        },
        settleOptions: covered,
      });
    },
    TIMEOUT,
  );

  it.each(['duyệt đến trước', 'từ chối đến trước'] as const)(
    `CA CỔNG (%s), ${String(GATED_ROUNDS)} vòng: giữ khoá hàng yêu cầu (tầng 6c), cả hai cùng bị chặn ở đó theo thứ tự định trước; bên đến TRƯỚC thắng, bên sau 409 YEU_CAU_DA_XU_LY; không BAO GIỜ vừa lịch mới vừa TuChoi; 0 lần thử lại`,
    async (order) => {
      const w = await raceWorld(db, fx);
      const other = await w.secondReceptionist();
      const stats = new RaceStats();
      const approveFirst = order === 'duyệt đến trước';
      await raceX2<Ctx>({
        tag: `TDL-13-cong-${approveFirst ? 'duyet' : 'tuchoi'}`,
        name: `cổng, ${order}`,
        db,
        logs,
        stats,
        rounds: GATED_ROUNDS,
        gate: ({ yeuCauId }) => requestLock(yeuCauId),
        setup: () => openCase(w),
        first: (ctx) =>
          approveFirst
            ? approveBy(w, stats, ctx)
            : rejectBy(w, stats, other, ctx),
        second: (ctx) =>
          approveFirst
            ? rejectBy(w, stats, other, ctx)
            : approveBy(w, stats, ctx),
        check: async (ctx, first, second, tally) => {
          expect(first.ok, `bên đến trước: ${first.code}`).toBe(true);
          expect(second.code).toBe(BOOKING_ERROR_CODES.REQUEST_HANDLED);
          tally.add(`${order} thắng`);
          if (approveFirst) await expectApproved(w, ctx);
          else await expectRejected(w, ctx);
        },
        settleOptions: covered,
      });
    },
    TIMEOUT,
  );
});

describe('TDL-14 DUYỆT × Bệnh nhân HUỶ lịch gốc (cọc trả bằng ví, hoàn cọc THẬT)', () => {
  it(
    `${String(PAIR_ROUNDS)} vòng: một thắng; huỷ thắng ⇒ duyệt 409 LICH_HEN_KHONG_CHO_DOI, yêu cầu VẪN ChoDuyet, KHÔNG lịch mới, đúng MỘT dòng hoàn và ví +cọc, không nhật ký; duyệt thắng ⇒ huỷ không còn Cancelled, lịch cũ DaDoiLich, KHÔNG dòng hoàn; ghi số 1213; 0 lần 503`,
    async () => {
      const w = await raceWorld(db, fx);
      const stats = new RaceStats();
      await raceX2<Ctx>({
        tag: 'TDL-14',
        name: 'duyệt × huỷ lịch gốc',
        db,
        logs,
        stats,
        setup: () => openCase(w),
        first: ({ yeuCauId }) =>
          sideOf(
            stats,
            w.approveService.approveAsReception(w.receptionId, yeuCauId, {
              ghiChu: HANDLING_NOTE,
            }),
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
        check: async (ctx, approved, cancelled, tally) => {
          expect([approved.ok, cancelled.ok].filter(Boolean)).toHaveLength(1);
          if (approved.ok) {
            tally.add('duyệt thắng');
            await expectApproved(w, ctx);
            expect(await w.refundCount()).toBe(0);
          } else {
            tally.add('huỷ thắng');
            expect(approved.code).toBe(BOOKING_ERROR_CODES.NOT_RESCHEDULABLE);
            expect(await w.requestStatus(ctx.yeuCauId)).toBe('ChoDuyet');
            expect(await w.countRows('lich_hen')).toBe(1);
            expect((await w.rowOf(ctx.a.lichHenId)).trangThai).toBe('DaHuy');
            expect((await w.slotState(0)).trangThai).toBe('ConTrong');
            expect((await w.slotState(2)).trangThai).toBe('ConTrong');
            expect(await w.refundCount()).toBe(1);
            expect(await w.balanceOf(w.self.walletId)).toBe(COC);
            expect(await w.countRows('nhat_ky_hanh_dong')).toBe(0);
          }
        },
        // Hoàn cọc là đổi tiền HỢP LỆ: chỉ vòng duyệt thắng mới so ba bảng tiền (INV-10)
        settleOptions: (ctx, approved) =>
          approved.ok ? covered(ctx) : { requireDepositCovered: true },
        options: { retriesAllowed: true },
      });
    },
    TIMEOUT,
  );
});

describe('TDL-15 DUYỆT × Lễ tân ĐỔI HỘ cùng lịch gốc (hai khung giờ đích khác nhau)', () => {
  it(
    `${String(PAIR_ROUNDS)} vòng: một thắng; bên thua 409 LICH_HEN_KHONG_CHO_DOI; duyệt thắng ⇒ yêu cầu DaDuyet, lịch mới ở ô 2; đổi hộ thắng ⇒ yêu cầu VẪN ChoDuyet (R6: yêu cầu tồn), lịch mới ở ô 4; đúng MỘT nhật ký; 0 lần thử lại`,
    async () => {
      const w = await raceWorld(db, fx);
      const other = await w.secondReceptionist();
      const stats = new RaceStats();
      await raceX2<Ctx>({
        tag: 'TDL-15',
        name: 'duyệt × đổi hộ',
        db,
        logs,
        stats,
        setup: () => openCase(w),
        first: ({ yeuCauId }) =>
          sideOf(
            stats,
            w.approveService.approveAsReception(w.receptionId, yeuCauId, {
              ghiChu: HANDLING_NOTE,
            }),
          ),
        second: ({ a }) => sideOf(stats, w.doiHo(a.maLichHen, 4, other)),
        check: async ({ a, yeuCauId }, approved, proxied, tally) => {
          expect([approved.ok, proxied.ok].filter(Boolean)).toHaveLength(1);
          expect((approved.ok ? proxied : approved).code).toBe(
            BOOKING_ERROR_CODES.NOT_RESCHEDULABLE,
          );
          expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaDoiLich');
          expect(await w.countRows('lich_hen')).toBe(2);
          expect(await w.countRows('nhat_ky_hanh_dong')).toBe(1);
          if (approved.ok) {
            tally.add('duyệt thắng');
            expect(await w.requestStatus(yeuCauId)).toBe('DaDuyet');
            expect((await w.childOf(a.lichHenId))?.khungGioId).toBe(w.slot(2));
          } else {
            tally.add('đổi hộ thắng');
            expect(await w.requestStatus(yeuCauId)).toBe('ChoDuyet');
            expect((await w.childOf(a.lichHenId))?.khungGioId).toBe(w.slot(4));
          }
        },
        settleOptions: covered,
      });
    },
    TIMEOUT,
  );
});

/** Kết quả tạo yêu cầu ⇒ `Side`: `RequestCreated` là thành công, từ chối mang mã của luật. */
function createdSide(outcome: CreateRescheduleRequestOutcome): Side {
  if (outcome.kind === 'RequestCreated') return { ok: true, code: 'OK' };
  if (outcome.kind === 'Rejected')
    return {
      ok: false,
      code:
        outcome.failure.kind === 'Rule'
          ? outcome.failure.code
          : outcome.failure.kind,
    };
  return { ok: false, code: outcome.kind };
}

describe('TDL-16 mười yêu cầu cùng lúc cho MỘT lịch', () => {
  it(
    `${String(TEN_REQUESTS_ROUNDS)} vòng × ${String(TEN_REQUESTS)} yêu cầu qua MỘT cổng: đúng MỘT ChoDuyet, chín DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET; đúng một thông báo và một thư; lịch và khung giờ không đổi; 0 lần thử lại, 0 lần 503`,
    async () => {
      const w = await raceWorld(db, fx);
      const stats = new RaceStats();
      const tally = winnerTally();
      await runRounds<
        { a: LichHen; money: MoneyTotals; gate: ReturnType<typeof createGate> },
        Side
      >({
        rounds: TEN_REQUESTS_ROUNDS,
        setup: async () => {
          await w.resetRound();
          const a = await w.book(0, { coc: COC, soLan: 2 });
          return {
            a,
            money: await captureMoneyTotals(db),
            gate: createGate(TEN_REQUESTS),
          };
        },
        race: ({ a, gate }) =>
          Array.from(
            { length: TEN_REQUESTS },
            () => async (): Promise<Side> => {
              await gate.arrive();
              return sideOf(
                stats,
                w.request.create({
                  maLichHen: a.maLichHen,
                  khungGioMongMuonId: w.slot(2),
                  lyDoYeuCau: DEFAULT_REASON,
                  accountId: w.self.accountId,
                }),
                createdSide,
              );
            },
          ),
        check: async ({ a, money }, results) => {
          const sides = results.map((result) => {
            if (result.status === 'rejected') throw result.reason;
            return result.value;
          });
          expect(sides.filter((side) => side.ok)).toHaveLength(1);
          expect(
            sides.filter(
              (side) =>
                side.code === BOOKING_ERROR_CODES.RESCHEDULE_REQUEST_PENDING,
            ),
          ).toHaveLength(TEN_REQUESTS - 1);
          expect(await w.countRows('yeu_cau_doi_lich_ngoai_chinh_sach')).toBe(
            1,
          );
          expect(
            await w.countRows(
              'yeu_cau_doi_lich_ngoai_chinh_sach',
              "trang_thai = 'ChoDuyet'",
            ),
          ).toBe(1);
          expect(await w.countRows('thong_bao')).toBe(1);
          expect(await w.countRows('email_thong_bao')).toBe(1);
          expect(await w.countRows('lich_hen')).toBe(1);
          expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaXacNhan');
          expect((await w.slotState(0)).trangThai).toBe('DaDat');
          expect((await w.slotState(2)).trangThai).toBe('ConTrong');
          tally.add('một ChoDuyet');
          await settleRound(db, stats, {
            moneyBefore: money,
            requireDepositCovered: true,
          });
        },
      });
      finishX2(
        'TDL-16',
        'mười yêu cầu cùng một lịch',
        TEN_REQUESTS_ROUNDS,
        tally.winners,
        logs,
        stats,
      );
    },
    TIMEOUT,
  );
});
