import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import {
  BOOKING_ERROR_CODES,
  BOOKING_NOTIFICATION_EVENTS,
  HOLD_EXPIRED_CANCEL_REASON,
} from '../appointments.constants.js';
import type { HoldExpirySummary } from '../expiry/hold-expiry.job.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { FLOW_NOW } from '../testing/booking-flow.js';
import {
  createAppointmentWorld,
  lichHenRows,
} from '../testing/create-appointment-world.js';
import {
  createGate,
  runRounds,
  summarize,
} from '../testing/concurrency-harness.js';
import { expiryWorld, readAppointment } from '../testing/expiry-fixtures.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import { raceInOrder, waitUntilWaiting } from '../testing/lock-wait.js';
import {
  createTransitionStack,
  FAKE_PAYMENT_EVENT,
  notificationRows,
  resetBookingRound,
  type TransitionStack,
} from '../testing/payment-doctor-fakes.js';
import type {
  ConfirmPaidOutcome,
  ExpireOutcome,
} from './appointment-transition.service.js';

// Task B11 — DT-03, DT-04, CFP-08 (PLAN booking 7.10, 7.30; TRACKING 3.24.3) trên MySQL 8.4 THẬT, mỗi ca ≥ 30 vòng, INV-01…INV-05 sau MỖI vòng, đếm cảnh báo 1213 và 1205 của `withBookingTransaction`.
// Thứ tự "bên nào đi trước" ĐỊNH TRƯỚC và luân phiên (vòng chẵn thanh toán trước, vòng lẻ hết hạn trước): một kết nối riêng giữ khoá hàng `khung_gio`, bên thứ nhất bắt đầu và bị chặn (đọc
// `performance_schema.data_lock_waits`, `testing/lock-wait.ts`), bên thứ hai bắt đầu và bị chặn, rồi nhả khoá. CHẠY MỘT MÌNH (nhạy với tải). `payment` là bản GIẢ (`fakePayment`), B17 chạy lại với bản thật.
const ROUNDS = 30;
const CONFIRMED_EVENT = BOOKING_NOTIFICATION_EVENTS.CONFIRMED;
const LOCK_SLOT_SQL =
  'SELECT khung_gio_id FROM khung_gio WHERE khung_gio_id = ? FOR UPDATE';
const EXPIRED_AT_TEXT = '2026-11-02 09:00:00';

let db: DataSource;
let fx: BookingFixtures;
let logs: string[];
useIntegrationHooks((d, l) => {
  db = d;
  fx = new BookingFixtures(d);
  logs = l;
});

/** Cảnh báo 1213 và 1205 của `withBookingTransaction` (mỗi lần thử lại một dòng): "0 lỗi 1213 và 1205" là danh sách này rỗng. */
const contentionWarnings = () => logs.filter((l) => /MySQL 12(13|05)/.test(l));

type ExpireValue = ExpireOutcome | HoldExpirySummary | undefined;
/** Kết quả của `CreateAppointmentService.create` THẬT (B8): tạo được (mã lịch mới) hay bị từ chối (mã lỗi API). */
type BookValue =
  | { kind: 'Created'; maLichHen: string; trangThai: string }
  | { kind: 'Rejected'; maLoi: string };
type Raced =
  | { who: 'pay'; value: ConfirmPaidOutcome }
  | { who: 'expire'; value: ExpireValue }
  | { who: 'book'; value: BookValue };
type Settled = [PromiseSettledResult<Raced>, PromiseSettledResult<Raced>];

interface RoundContext {
  lichHenId: string;
  khungGioId: string;
  /** Bên thanh toán xin khoá khung giờ TRƯỚC (vòng chẵn) */
  payFirst: boolean;
}

/** Hai kết quả của một vòng đua đã dựng thứ tự; lỗi của một bên (khác kết quả có kiểu) làm vòng đó đỏ, kèm lý do. */
function unwrap(results: PromiseSettledResult<Settled>[]): Raced[] {
  const only = results[0];
  if (only?.status !== 'fulfilled')
    throw new Error(`không dựng được thứ tự: ${String(only?.reason)}`);
  return only.value.map((side) => {
    if (side.status !== 'fulfilled')
      throw new Error(`một bên ném lỗi: ${String(side.reason)}`);
    return side.value;
  });
}

const pick = <W extends Raced['who']>(raced: Raced[], who: W) =>
  raced.find((r): r is Extract<Raced, { who: W }> => r.who === who);

/** Dựng một vòng: dọn dữ liệu vòng trước, tạo lịch bằng `makeTarget`, luân phiên bên đi trước (vòng chẵn: bên thanh toán trước). */
const roundSetup =
  (makeTarget: () => Promise<{ lichHenId: string; khungGioId: string }>) =>
  async (round: number): Promise<RoundContext> => {
    await resetBookingRound(db);
    const { lichHenId, khungGioId } = await makeTarget();
    return { lichHenId, khungGioId, payFirst: round % 2 === 0 };
  };

/** Một vòng đua có thứ tự định trước: bên `pay` (confirmPaid của payment giả) và bên `other` cùng xin khoá khung giờ, bên đi trước theo `ctx.payFirst`. */
function orderedRace(
  ctx: RoundContext,
  stack: TransitionStack,
  other: () => Promise<Raced>,
): [() => Promise<Settled>] {
  const pay = async (): Promise<Raced> => ({
    who: 'pay',
    value: await stack.pay(ctx.lichHenId),
  });
  return [
    () =>
      raceInOrder<Raced>(
        db,
        { sql: LOCK_SLOT_SQL, params: [ctx.khungGioId], table: 'khung_gio' },
        ctx.payFirst ? pay : other,
        ctx.payFirst ? other : pay,
      ),
  ];
}

describe('DT-03 hết hạn đúng lúc thanh toán thành công: đúng MỘT bên thắng, không bao giờ "đã xác nhận mà khung giờ ConTrong"', () => {
  it.each([['service' as const], ['job' as const]])(
    'expire qua %s đua với confirmPaid của payment giả, 30 vòng luân phiên bên đi trước: (DaXacNhan + DaDat + 1 thông báo) hoặc (DaHuy + HetHanGiuCho + ConTrong + 0 thông báo); 0 lỗi 1213 và 1205; INV mỗi vòng',
    async (expireBy) => {
      const w = await expiryWorld(fx);
      const stack = createTransitionStack(db, w.patientId);
      const wins = { pay: 0, expire: 0 };

      await runRounds<RoundContext, Settled>({
        rounds: ROUNDS,
        setup: roundSetup(() => w.pending(0)),
        race: (ctx) =>
          orderedRace(ctx, stack, async (): Promise<Raced> => ({
            who: 'expire',
            value:
              expireBy === 'service'
                ? await stack.service.expire({
                    lichHenId: ctx.lichHenId,
                    now: FLOW_NOW,
                  })
                : await stack.job.run(FLOW_NOW),
          })),
        check: async (ctx, results) => {
          const raced = unwrap(results);
          const paid = pick(raced, 'pay')?.value;
          const expired = pick(raced, 'expire')?.value;
          if (paid === undefined) throw new Error('thiếu kết quả thanh toán');
          const row = await readAppointment(db, ctx.lichHenId);
          const slot = await fx.slotState(ctx.khungGioId);

          if (paid.kind === 'Confirmed') {
            wins.pay += 1;
            // hết hạn thua: lịch không còn ChoThanhToan dưới khoá
            if (expireBy === 'service')
              expect(expired).toEqual({ kind: 'NotDue', reason: 'NotPending' });
            else
              expect(expired).toEqual({
                expired: 0,
                notDue: 1,
                failed: 0,
                more: false,
              });
            expect(row).toEqual({
              trangThai: 'DaXacNhan',
              huy: null,
              lyDo: null,
              han: null,
            });
            expect(slot).toEqual({ trangThai: 'DaDat', giuChoDen: null });
            expect(await notificationRows(db, CONFIRMED_EVENT)).toHaveLength(1);
          } else {
            wins.expire += 1;
            expect(paid).toEqual({ kind: 'HetHanGiuCho' });
            if (expireBy === 'service')
              expect(expired).toMatchObject({ kind: 'Expired' });
            else expect(expired).toMatchObject({ expired: 1, failed: 0 });
            expect(row).toMatchObject({
              trangThai: 'DaHuy',
              huy: EXPIRED_AT_TEXT,
              lyDo: HOLD_EXPIRED_CANCEL_REASON,
            });
            expect(slot).toEqual({ trangThai: 'ConTrong', giuChoDen: null });
            expect(await notificationRows(db)).toEqual([]);
          }
          await assertBookingInvariants(db);
        },
      });

      // Số THẬT để báo cáo (TRACKING 3.24 B11-P): mỗi bên thắng bao nhiêu vòng trong tổng ROUNDS
      console.info(
        `[B11-DT] DT-03 expire qua ${expireBy}: thanh toán thắng ${String(wins.pay)}, hết hạn thắng ${String(wins.expire)}, tổng ${String(ROUNDS)} vòng`,
      );
      expect(wins.pay + wins.expire).toBe(ROUNDS);
      // thứ tự định trước luân phiên nên MỖI bên phải thắng nhiều lần (không chỉ một chiều)
      expect(wins.pay).toBeGreaterThanOrEqual(10);
      expect(wins.expire).toBeGreaterThanOrEqual(10);
      expect(contentionWarnings()).toEqual([]);
    },
  );
});

describe('DT-04 hết hạn LƯỜI (người mới đặt đúng khung giờ bằng create THẬT của B8) đúng lúc confirmPaid của người cũ', () => {
  it('30 vòng luân phiên: người cũ thắng ⇒ (DaXacNhan + DaDat, người mới bị 409 KHUNG_GIO_DA_DAT); người mới thắng ⇒ (người cũ DaHuy do hết hạn + HetHanGiuCho, lịch mới ChoThanhToan giữ khung giờ); INV; 0 lỗi 1213 và 1205', async () => {
    vi.setSystemTime(FLOW_NOW); // 09:00: lịch cũ (hạn 08:15) đã quá hạn; `create` đọc đồng hồ ứng dụng (nowVN)
    const w = await createAppointmentWorld(db, fx);
    await w.deposit('50000.00'); // cọc > 0: nếu không, `create` INSERT thẳng DaXacNhan (cọc 0đ) thay vì ChoThanhToan giữ khung giờ (cùng dạng TAO-11 của B8)
    const newcomer = (await fx.admin.patient()).account.taiKhoanId;
    const stack = createTransitionStack(db, w.patientId);
    const wins = { pay: 0, book: 0 };
    // người mới đặt đúng khung giờ bằng `create` thật: tạo được hay bị từ chối bằng mã lỗi API
    const book = async (): Promise<Raced> => ({
      who: 'book',
      value: await w.create(0, {}, newcomer).then(
        (created): BookValue => ({
          kind: 'Created',
          maLichHen: created.maLichHen,
          trangThai: created.trangThai,
        }),
        (error: unknown): BookValue => {
          if (!(error instanceof AppException)) throw error;
          return { kind: 'Rejected', maLoi: error.maLoi };
        },
      ),
    });

    await runRounds<RoundContext, Settled>({
      rounds: ROUNDS,
      setup: roundSetup(() => w.book('ChoThanhToan', 0)),
      race: (ctx) => orderedRace(ctx, stack, book),
      check: async (ctx, results) => {
        const raced = unwrap(results);
        const paid = pick(raced, 'pay')?.value;
        const booked = pick(raced, 'book')?.value;
        if (paid === undefined || booked === undefined)
          throw new Error('thiếu kết quả của một bên');
        const oldRow = await readAppointment(db, ctx.lichHenId);
        const slot = await fx.slotState(ctx.khungGioId);
        const rows = await lichHenRows(db);

        if (paid.kind === 'Confirmed') {
          wins.pay += 1;
          expect(booked).toEqual({
            kind: 'Rejected',
            maLoi: BOOKING_ERROR_CODES.SLOT_BOOKED,
          });
          expect(oldRow).toMatchObject({ trangThai: 'DaXacNhan', han: null });
          expect(slot).toEqual({ trangThai: 'DaDat', giuChoDen: null });
          expect(rows).toHaveLength(1);
          expect(await notificationRows(db, CONFIRMED_EVENT)).toHaveLength(1);
        } else {
          wins.book += 1;
          expect(paid).toEqual({ kind: 'HetHanGiuCho' });
          if (booked.kind !== 'Created')
            throw new Error(
              `người mới phải đặt được: ${JSON.stringify(booked)}`,
            );
          expect(booked.trangThai).toBe('ChoThanhToan');
          expect(oldRow).toMatchObject({
            trangThai: 'DaHuy',
            lyDo: HOLD_EXPIRED_CANCEL_REASON,
          });
          const fresh = rows.find((row) => row.ma === booked.maLichHen);
          expect(fresh).toMatchObject({
            trangThai: 'ChoThanhToan',
            benhNhanId: newcomer,
            khungGioId: ctx.khungGioId,
          });
          expect(slot).toEqual({
            trangThai: 'DangGiuCho',
            giuChoDen: '2026-11-02 09:15:00',
          });
          expect(rows).toHaveLength(2);
          expect(await notificationRows(db)).toEqual([]);
        }
        await assertBookingInvariants(db);
      },
    });

    console.info(
      `[B11-DT] DT-04 create thật: người cũ (thanh toán) thắng ${String(wins.pay)}, người mới thắng ${String(wins.book)}, tổng ${String(ROUNDS)} vòng`,
    );
    expect(wins.pay + wins.book).toBe(ROUNDS);
    expect(wins.pay).toBeGreaterThanOrEqual(10);
    expect(wins.book).toBeGreaterThanOrEqual(10);
    expect(contentionWarnings()).toEqual([]);
  });
});

describe('CFP-08 điều kiện thứ tự gọi của payment: confirmPaid TRƯỚC mọi ghi vào bảng có khoá ngoại tới lich_hen', () => {
  it('ĐÚNG thứ tự (confirmPaid rồi ghi dòng có khoá ngoại): 30 vòng đua tự do với expire, 0 lỗi 1213 và 1205; mỗi vòng đúng một bên thắng; INV', async () => {
    const w = await expiryWorld(fx);
    const stack = createTransitionStack(db, w.patientId);

    await runRounds<RoundContext, Raced>({
      rounds: ROUNDS,
      setup: roundSetup(() => w.pending(0)),
      race: (ctx) => {
        const gate = createGate(2);
        return [
          async (): Promise<Raced> => {
            await gate.arrive();
            return { who: 'pay', value: await stack.pay(ctx.lichHenId) };
          },
          async (): Promise<Raced> => {
            await gate.arrive();
            return {
              who: 'expire',
              value: await stack.service.expire({
                lichHenId: ctx.lichHenId,
                now: FLOW_NOW,
              }),
            };
          },
        ];
      },
      check: async (ctx, results) => {
        const { values, reasons } = summarize(results);
        expect(reasons).toEqual([]);
        const paid = pick(values, 'pay')?.value;
        const expired = pick(values, 'expire')?.value as ExpireOutcome;
        const row = await readAppointment(db, ctx.lichHenId);
        if (paid?.kind === 'Confirmed') {
          expect(expired).toEqual({ kind: 'NotDue', reason: 'NotPending' });
          expect(row.trangThai).toBe('DaXacNhan');
        } else {
          expect(paid).toEqual({ kind: 'HetHanGiuCho' });
          expect(expired.kind).toBe('Expired');
          expect(row.trangThai).toBe('DaHuy');
        }
        await assertBookingInvariants(db);
      },
    });

    expect(contentionWarnings()).toEqual([]);
  });

  it('thứ tự ĐẢO (ghi dòng có khoá ngoại TRƯỚC rồi mới confirmPaid), dựng bằng kịch bản xác định: bên expire bị chặn ở lich_hen (khoá chia sẻ do khoá ngoại), rồi confirmPaid xin khung giờ ⇒ vòng chờ ⇒ có cảnh báo 1213; cuối cùng vẫn đúng MỘT bên thắng và INV', async () => {
    const w = await expiryWorld(fx);
    const target = await w.pending(0);
    const stack = createTransitionStack(db, w.patientId);
    const holder: { expiring?: Promise<ExpireOutcome> } = {};

    const paid = await stack.pay(target.lichHenId, {
      order: 'writeFirst',
      afterFirstWrite: async () => {
        // chỉ lần chạy đầu của thân (thử lại thì expire đã chạy): bắt đầu expire, đợi nó bị chặn ở lich_hen
        if (holder.expiring !== undefined) return;
        holder.expiring = stack.service.expire({
          lichHenId: target.lichHenId,
          now: FLOW_NOW,
        });
        await waitUntilWaiting(db, 'lich_hen', 1);
      },
    });
    const expired = await holder.expiring;

    expect(contentionWarnings().some((line) => /MySQL 1213/.test(line))).toBe(
      true,
    );
    const row = await readAppointment(db, target.lichHenId);
    if (paid.kind === 'Confirmed') {
      expect(expired).toEqual({ kind: 'NotDue', reason: 'NotPending' });
      expect(row.trangThai).toBe('DaXacNhan');
      expect(await notificationRows(db, FAKE_PAYMENT_EVENT)).toHaveLength(1);
    } else {
      expect(paid).toEqual({ kind: 'HetHanGiuCho' });
      expect(expired).toMatchObject({ kind: 'Expired' });
      expect(row.trangThai).toBe('DaHuy');
    }
    await assertBookingInvariants(db);
  });
});
