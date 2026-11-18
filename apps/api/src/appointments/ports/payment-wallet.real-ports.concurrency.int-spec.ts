import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { depositStack } from '../../payment/testing/deposit-stack.js';
import { WalletFixtures } from '../../wallet/testing/wallet-fixtures.js';
import { assertWalletInvariants } from '../../wallet/testing/wallet-invariants.js';
import {
  BOOKING_ERROR_CODES,
  HOLD_EXPIRED_CANCEL_REASON,
} from '../appointments.constants.js';
import { FLOW_NOW } from '../testing/booking-flow.js';
import { runRounds } from '../testing/concurrency-harness.js';
import {
  createAppointmentWorld,
  lichHenRows,
} from '../testing/create-appointment-world.js';
import { readAppointment } from '../testing/expiry-fixtures.js';
import { assertBookingInvariants } from '../testing/invariants.js';
import { raceInOrder } from '../testing/lock-wait.js';
import { resetBookingRound } from '../testing/payment-doctor-fakes.js';
import {
  db,
  fx,
  logs,
  useStatusWorldHooks,
} from '../testing/status-int-kit.js';

// PWR-06 — DT-04 với lớp thật (payment B7 = booking B17a lần 1; PLAN booking 7.10 DT-04, PLAN payment HDT-07, M4; TRACKING booking 3.47.3) trên MySQL 8.4 THẬT: hết hạn LƯỜI (người mới đặt đúng khung giờ bằng `create` THẬT
// của B8) đúng lúc thanh toán cọc ví THẬT của người cũ (`DepositPaymentService.pay` của payment B5, dựng bằng `payment/testing/deposit-stack.ts`: chỉ ĐỌC, không sửa mã của `payment`). Bản gốc (confirm-paid.concurrency.int-spec.ts)
// dùng `payment` GIẢ ghi `thong_bao`; ở đây tiền thật đi qua sổ cái và ví. Cùng cách dựng thứ tự: vòng chẵn thanh toán xin khoá khung giờ TRƯỚC, vòng lẻ `create` trước (`raceInOrder`, đọc `data_lock_waits`).
// CHẠY MỘT MÌNH (nhạy với tải máy). Mỗi vòng: dọn dòng thanh toán và sổ cái (khoá ngoại tới `lich_hen`), nạp lại ví 350.000, tạo lịch cũ `ChoThanhToan` hạn 08:15 (đã quá hạn lúc 09:00).
const ROUNDS = 30;
const COC = '50000.00';
const WALLET_START = '350000.00';
const LOCK_SLOT_SQL =
  'SELECT khung_gio_id FROM khung_gio WHERE khung_gio_id = ? FOR UPDATE';

useStatusWorldHooks();

/** Kết quả một bên: `ok` là thành công, ngược lại `maLoi` là mã lỗi API của lời từ chối (lỗi khác ném ra làm vòng đó đỏ). */
interface Side {
  who: 'pay' | 'book';
  ok: boolean;
  maLoi: string | null;
  maLichHen: string | null;
  trangThai: string | null;
}

const settle = <T>(
  who: Side['who'],
  work: Promise<T>,
  pick: (value: T) => Pick<Side, 'maLichHen' | 'trangThai'>,
): Promise<Side> =>
  work.then(
    (value): Side => ({ who, ok: true, maLoi: null, ...pick(value) }),
    (error: unknown): Side => {
      if (!(error instanceof AppException)) throw error;
      return {
        who,
        ok: false,
        maLoi: error.maLoi,
        maLichHen: null,
        trangThai: null,
      };
    },
  );

const count = async (sql: string): Promise<number> =>
  Number(((await db.query(sql)) as { n: string }[])[0]!.n);

describe('PWR-06 DT-04 với lớp thật: hết hạn LƯỜI do create thật đua thanh toán cọc ví thật', () => {
  it('30 vòng luân phiên: thanh toán thắng ⇒ (DaXacNhan + DaDat, ví trừ MỘT cọc, người mới 409 KHUNG_GIO_DA_DAT); create thắng ⇒ (người cũ DaHuy do hết hạn, thanh toán HET_HAN_GIU_CHO, ví nguyên, lịch mới ChoThanhToan giữ khung giờ); INV và IVT; 0 lỗi 1213 và 1205', async () => {
    vi.setSystemTime(FLOW_NOW); // 09:00: lịch cũ (hạn 08:15) đã quá hạn; `create` và `pay` đọc đồng hồ ứng dụng
    const w = await createAppointmentWorld(db, fx);
    await w.deposit(COC); // cọc > 0 để `create` giữ khung giờ (ChoThanhToan) thay vì INSERT thẳng DaXacNhan
    const newcomer = (await fx.admin.patient()).account.taiKhoanId;
    const wallets = new WalletFixtures(db);
    const walletId = (
      (await db.query(
        'SELECT vi_noi_bo_id AS id FROM vi_noi_bo WHERE benh_nhan_id = ?',
        [w.patientId],
      )) as { id: string }[]
    )[0]!.id;
    const service = depositStack(db).service;
    const wins = { pay: 0, book: 0 };

    await runRounds({
      rounds: ROUNDS,
      setup: async (round) => {
        await db.query('DELETE FROM giao_dich_vi');
        await db.query('DELETE FROM giao_dich_thanh_toan');
        await resetBookingRound(db);
        // `fundWallet` ghi cả dòng nạp lẫn sổ cái nên IVT-01 và IVT-04 đúng ngay từ đầu mỗi vòng
        await wallets.fundWallet(walletId, WALLET_START);
        const lich = await fx.appointmentIn('ChoThanhToan', {
          doctor: w.doctor.profile,
          khungGioId: w.slot(0),
          patientId: w.patientId,
          tienCocSnapshot: COC,
        });
        return { lich, payFirst: round % 2 === 0 };
      },
      race: ({ lich, payFirst }) => {
        const pay = () =>
          settle('pay', service.pay(w.patientId, lich.maLichHen), () => ({
            maLichHen: lich.maLichHen,
            trangThai: 'DaXacNhan',
          }));
        const book = () =>
          settle('book', w.create(0, {}, newcomer), (created) => ({
            maLichHen: created.maLichHen,
            trangThai: created.trangThai,
          }));
        return [
          () =>
            raceInOrder<Side>(
              db,
              {
                sql: LOCK_SLOT_SQL,
                params: [lich.khungGioId],
                table: 'khung_gio',
              },
              payFirst ? pay : book,
              payFirst ? book : pay,
            ),
        ];
      },
      check: async ({ lich }, results) => {
        const only = results[0];
        if (only?.status !== 'fulfilled')
          throw new Error(`không dựng được thứ tự: ${String(only?.reason)}`);
        const sides = only.value.map((side) => {
          if (side.status !== 'fulfilled')
            throw new Error(`một bên ném lỗi: ${String(side.reason)}`);
          return side.value;
        });
        const paid = sides.find((side) => side.who === 'pay')!;
        const booked = sides.find((side) => side.who === 'book')!;
        const oldRow = await readAppointment(db, lich.lichHenId);
        const slot = await fx.slotState(lich.khungGioId);
        const rows = await lichHenRows(db);
        const debits = await count(
          "SELECT COUNT(*) AS n FROM giao_dich_vi WHERE loai = 'ThanhToan'",
        );
        const notices = await count('SELECT COUNT(*) AS n FROM thong_bao');

        if (paid.ok) {
          wins.pay += 1;
          expect(booked).toMatchObject({
            ok: false,
            maLoi: BOOKING_ERROR_CODES.SLOT_BOOKED,
          });
          expect(oldRow).toMatchObject({ trangThai: 'DaXacNhan', han: null });
          expect(slot).toEqual({ trangThai: 'DaDat', giuChoDen: null });
          expect(rows).toHaveLength(1);
          expect(debits).toBe(1);
          expect(await wallets.readWallet(walletId)).toMatchObject({
            soDu: '300000.00',
          });
          expect(notices).toBe(1);
        } else {
          wins.book += 1;
          expect(paid).toMatchObject({ ok: false, maLoi: 'HET_HAN_GIU_CHO' });
          expect(booked).toMatchObject({ ok: true, trangThai: 'ChoThanhToan' });
          expect(oldRow).toMatchObject({
            trangThai: 'DaHuy',
            lyDo: HOLD_EXPIRED_CANCEL_REASON,
          });
          expect(slot).toEqual({
            trangThai: 'DangGiuCho',
            giuChoDen: '2026-11-02 09:15:00',
          });
          expect(rows).toHaveLength(2);
          expect(rows.find((row) => row.ma === booked.maLichHen)).toMatchObject(
            { trangThai: 'ChoThanhToan', benhNhanId: newcomer },
          );
          expect(debits).toBe(0);
          expect(await wallets.readWallet(walletId)).toMatchObject({
            soDu: WALLET_START,
          });
          expect(notices).toBe(0);
        }
        await assertBookingInvariants(db);
        await assertWalletInvariants(db);
      },
    });

    console.info(
      `[B7-PWR] PWR-06 DT-04 lớp thật: thanh toán thắng ${String(wins.pay)}, create lười thắng ${String(wins.book)}, tổng ${String(ROUNDS)} vòng`,
    );
    expect(wins.pay + wins.book).toBe(ROUNDS);
    expect(wins.pay).toBeGreaterThanOrEqual(10);
    expect(wins.book).toBeGreaterThanOrEqual(10);
    expect(logs.filter((line) => /MySQL 12(13|05)/.test(line))).toEqual([]);
  });
});
