import type { DataSource } from 'typeorm';
import type { LichHen } from '../../admin/entities/lich-hen.entity.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { DEPOSIT } from '../testing/cancel-world.js';
import { secondDoctorOf } from '../testing/create-appointment-world.js';
import { captureMoneyTotals, type MoneyTotals } from '../testing/invariants.js';
import {
  PAIR_ROUNDS,
  RaceStats,
  raceX2,
  rescheduleSide,
  sideOf,
  slotLockOrder,
  watchSlotLocks,
} from '../testing/reschedule-race-checks.js';
import {
  closeRaceModules,
  raceWorld,
} from '../testing/reschedule-race-world.js';

// reschedule X2 — nhóm SLOTS: TDL-01, TDL-02, TDL-03, TDL-19, TDL-11, TDL-22 (PLAN reschedule 5.4, 7.5; TRACKING reschedule 1.17) ĐỒNG THỜI trên MySQL 8.4 THẬT: `AppointmentsModule` thật (đổi lịch, create) trên dữ liệu `cashWorld` có ví
// thật; mỗi vòng dựng lại dữ liệu, hai bên xuất phát CÙNG LÚC qua MỘT cổng (40 vòng xen kẽ ai đi trước + 16 vòng quét độ lệch 0 đến 20 ms), rồi INV-1…INV-10 và IVT-01…IVT-07 chạy SAU MỖI VÒNG (`settleRound`). Số lần thử lại
// 1213 và 1205, hết lượt (503) in ở dòng `[X2-TDL-nn]` (`reportRounds`): ở mọi ca của file này thứ tự khoá 5.4 KHÔNG có chu trình nên khẳng định 0 lần thử lại. CHẠY MỘT MÌNH (nhạy với tải máy; không chạy cùng test web).
const TIMEOUT = 300_000;
// Cọc ĐÃ TRẢ bằng ví thật để INV-10 và IVT-07 có nghĩa: đổi lịch không được đụng một đồng
const COC = DEPOSIT;

let db: DataSource;
let fx: BookingFixtures;
let logs: string[] = [];
useIntegrationHooks((d, captured) => {
  db = d;
  fx = new BookingFixtures(d);
  logs = captured;
});
afterEach(closeRaceModules);

const covered = (money: MoneyTotals) => ({
  moneyBefore: money,
  requireDepositCovered: true,
});

describe('TDL-01 hai Bệnh nhân, hai lịch KHÁC, đổi vào CÙNG một khung giờ trống', () => {
  it(
    `${String(PAIR_ROUNDS)} vòng: đúng MỘT thắng; bên thua KHUNG_GIO_DA_DAT, lịch bên thua còn DaXacNhan; khung giờ đích DaDat đúng một lịch; 0 lần thử lại`,
    async () => {
      const w = await raceWorld(db, fx);
      const other = await w.newPatient();
      const stats = new RaceStats();
      await raceX2<{ a: LichHen; b: LichHen; money: MoneyTotals }>({
        tag: 'TDL-01',
        name: 'hai Bệnh nhân vào cùng khung giờ trống',
        db,
        logs,
        stats,
        setup: async () => {
          await w.resetRound();
          const a = await w.book(0, { coc: COC });
          const b = await w.book(1, { patient: other, coc: COC });
          return { a, b, money: await captureMoneyTotals(db) };
        },
        first: ({ a }) =>
          sideOf(
            stats,
            w.core.reschedule(w.tuDoi(a.maLichHen, 4)),
            rescheduleSide,
          ),
        second: ({ b }) =>
          sideOf(
            stats,
            w.core.reschedule(w.tuDoi(b.maLichHen, 4, other.accountId)),
            rescheduleSide,
          ),
        check: async ({ a, b }, first, second, tally) => {
          expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
          expect((first.ok ? second : first).code).toBe(
            BOOKING_ERROR_CODES.SLOT_BOOKED,
          );
          const [won, lost] = first.ok ? [a, b] : [b, a];
          tally.add(first.ok ? 'bên A' : 'bên B');
          expect((await w.rowOf(won.lichHenId)).trangThai).toBe('DaDoiLich');
          expect((await w.rowOf(lost.lichHenId)).trangThai).toBe('DaXacNhan');
          expect(await w.countRows('lich_hen')).toBe(3);
          expect(await w.slotState(4)).toEqual({
            trangThai: 'DaDat',
            giuChoDen: null,
          });
        },
        settleOptions: ({ money }) => covered(money),
      });
    },
    TIMEOUT,
  );
});

describe('TDL-02 hai tab của CÙNG một Bệnh nhân đổi MỘT lịch sang hai khung giờ KHÁC nhau', () => {
  it(
    `${String(PAIR_ROUNDS)} vòng: đúng MỘT thắng; bên thua NotFound (lịch cũ đã DaDoiLich, Bệnh nhân không thấy, Q31); không chuỗi rẽ nhánh (đúng 2 lịch); 1062 của lich_hen_truoc_id không lộ (không lỗi lạ); 0 lần thử lại`,
    async () => {
      const w = await raceWorld(db, fx);
      const stats = new RaceStats();
      await raceX2<{ a: LichHen; money: MoneyTotals }>({
        tag: 'TDL-02',
        name: 'hai tab cùng một lịch',
        db,
        logs,
        stats,
        setup: async () => {
          await w.resetRound();
          const a = await w.book(0, { coc: COC });
          return { a, money: await captureMoneyTotals(db) };
        },
        first: ({ a }) =>
          sideOf(
            stats,
            w.core.reschedule(w.tuDoi(a.maLichHen, 3)),
            rescheduleSide,
          ),
        second: ({ a }) =>
          sideOf(
            stats,
            w.core.reschedule(w.tuDoi(a.maLichHen, 4)),
            rescheduleSide,
          ),
        check: async ({ a }, first, second, tally) => {
          expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
          expect((first.ok ? second : first).code).toBe('NotFound');
          const [wonSlot, lostSlot] = first.ok ? [3, 4] : [4, 3];
          tally.add(first.ok ? 'tab thứ nhất' : 'tab thứ hai');
          expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaDoiLich');
          expect(await w.countRows('lich_hen')).toBe(2);
          expect((await w.childOf(a.lichHenId))?.khungGioId).toBe(
            w.slot(wonSlot),
          );
          expect(await w.slotState(wonSlot)).toEqual({
            trangThai: 'DaDat',
            giuChoDen: null,
          });
          expect(await w.slotState(lostSlot)).toEqual({
            trangThai: 'ConTrong',
            giuChoDen: null,
          });
        },
        settleOptions: ({ money }) => covered(money),
      });
    },
    TIMEOUT,
  );
});

describe('TDL-03 hoán vị X↔Y (id 9 và 10): A đổi 9 → 10, B đổi 10 → 9', () => {
  async function swapWorld() {
    const w = await raceWorld(db, fx);
    const afternoon = await fx.doctor.shiftWithSlots(w.doctor.profile, {
      ngay: '2026-11-10',
      ca: 'CaChieu',
    });
    expect(afternoon.slotIds.slice(0, 2)).toEqual(['9', '10']);
    return { w, other: await w.newPatient() };
  }

  it(
    `${String(PAIR_ROUNDS)} vòng, giữ 20 ms sau mỗi câu khoá khung giờ: CẢ HAI KHUNG_GIO_DA_DAT (khung giờ đích của mỗi bên đang DaDat bởi lịch của bên kia, X1), không lịch nào mất, 0 lần thử lại (1213 và 1205 bằng 0; đối chứng đảo thứ tự ra 1213 ở TDL-18)`,
    async () => {
      const { w, other } = await swapWorld();
      const stats = new RaceStats();
      // 20 ms SAU mỗi câu khoá khung giờ (như X1 M1, B1 HDL-14, B4 DLH-34): hai bên chắc chắn gặp nhau GIỮA hai khoá, nên thứ tự "cũ rồi mới" ra 1213 ở mọi vòng (đột biến 1)
      watchSlotLocks(db, 20);
      await raceX2<{ a: LichHen; b: LichHen; money: MoneyTotals }>({
        tag: 'TDL-03',
        name: 'hoán vị 9 và 10',
        db,
        logs,
        stats,
        setup: async () => {
          await w.resetRound();
          const a = await w.book('9', { coc: COC });
          const b = await w.book('10', { patient: other, coc: COC });
          return { a, b, money: await captureMoneyTotals(db) };
        },
        first: ({ a }) =>
          sideOf(
            stats,
            w.core.reschedule(w.tuDoi(a.maLichHen, '10')),
            rescheduleSide,
          ),
        second: ({ b }) =>
          sideOf(
            stats,
            w.core.reschedule(w.tuDoi(b.maLichHen, '9', other.accountId)),
            rescheduleSide,
          ),
        check: async ({ a, b }, first, second, tally) => {
          expect([first, second]).toEqual([
            { ok: false, code: BOOKING_ERROR_CODES.SLOT_BOOKED },
            { ok: false, code: BOOKING_ERROR_CODES.SLOT_BOOKED },
          ]);
          tally.add('cả hai KHUNG_GIO_DA_DAT');
          expect((await w.rowOf(a.lichHenId)).trangThai).toBe('DaXacNhan');
          expect((await w.rowOf(b.lichHenId)).trangThai).toBe('DaXacNhan');
          expect(await w.countRows('lich_hen')).toBe(2);
        },
        settleOptions: ({ money }) => covered(money),
      });
    },
    TIMEOUT,
  );
});

describe('TDL-19 [đề xuất] thứ tự khoá khung giờ theo SỐ dưới đua thật (bắt đột biến "so id bằng chuỗi", sống sót ở TDL-03 vì thứ tự nhất quán không tạo chu trình)', () => {
  it(
    `${String(PAIR_ROUNDS)} vòng hoán vị 9 và 10: MỖI giao dịch khoá khung giờ 9 TRƯỚC khung giờ 10 (so BẰNG số, không so chuỗi "10" < "9"); 0 lần thử lại`,
    async () => {
      const w = await raceWorld(db, fx);
      const afternoon = await fx.doctor.shiftWithSlots(w.doctor.profile, {
        ngay: '2026-11-10',
        ca: 'CaChieu',
      });
      expect(afternoon.slotIds.slice(0, 2)).toEqual(['9', '10']);
      const other = await w.newPatient();
      const stats = new RaceStats();
      const watch = watchSlotLocks(db);
      await raceX2<{ a: LichHen; b: LichHen; money: MoneyTotals }>({
        tag: 'TDL-19',
        name: 'thứ tự khoá 9 rồi 10',
        db,
        logs,
        stats,
        setup: async () => {
          await w.resetRound();
          watch.clear();
          const a = await w.book('9', { coc: COC });
          const b = await w.book('10', { patient: other, coc: COC });
          return { a, b, money: await captureMoneyTotals(db) };
        },
        first: ({ a }) =>
          sideOf(
            stats,
            w.core.reschedule(w.tuDoi(a.maLichHen, '10')),
            rescheduleSide,
          ),
        second: ({ b }) =>
          sideOf(
            stats,
            w.core.reschedule(w.tuDoi(b.maLichHen, '9', other.accountId)),
            rescheduleSide,
          ),
        check: async (_context, first, second, tally) => {
          expect([first.code, second.code]).toEqual([
            BOOKING_ERROR_CODES.SLOT_BOOKED,
            BOOKING_ERROR_CODES.SLOT_BOOKED,
          ]);
          const order = slotLockOrder(watch.locks);
          expect(order.checked, 'số giao dịch đã khoá hai khung giờ').toBe(2);
          expect(order.violations, 'giao dịch khoá sai thứ tự').toEqual([]);
          tally.add('9 trước 10 ở cả hai giao dịch');
        },
        settleOptions: ({ money }) => covered(money),
      });
    },
    TIMEOUT,
  );
});

describe('TDL-11 đổi × create của CHÍNH Bệnh nhân, ở bác sĩ khác, vào giờ CHỒNG khung giờ mới', () => {
  it(
    `${String(PAIR_ROUNDS)} vòng: đúng MỘT thắng; bên thua LICH_HEN_TRUNG_THOI_GIAN (cùng khoá benh_nhan nên tuần tự, chồng giờ kiểm LẠI sau); KHÔNG BAO GIỜ hai lịch hoạt động của Bệnh nhân chồng giờ; 0 lần thử lại`,
    async () => {
      const w = await raceWorld(db, fx);
      const doctorB = await secondDoctorOf(fx, w.branch);
      // Cọc > 0 để `create` ra ChoThanhToan (giữ khung giờ, không ghi giao dịch thanh toán 0đ): INV-10 vẫn đo được phần của riêng đổi lịch
      await fx.depositService(doctorB.doctor.profile.dichVuKhamId, '50000.00');
      const stats = new RaceStats();
      await raceX2<{ a: LichHen; money: MoneyTotals }>({
        tag: 'TDL-11',
        name: 'đổi × create chồng giờ',
        db,
        logs,
        stats,
        setup: async () => {
          await w.resetRound();
          const a = await w.book(0, { coc: COC });
          return { a, money: await captureMoneyTotals(db) };
        },
        // Đổi ô 0 (08:00) sang ô 2 (09:00) của bác sĩ A; create ô 2 (09:00) của bác sĩ B: hai lịch cùng giờ của CÙNG Bệnh nhân
        first: ({ a }) =>
          sideOf(
            stats,
            w.core.reschedule(w.tuDoi(a.maLichHen, 2)),
            rescheduleSide,
          ),
        second: () =>
          sideOf(
            stats,
            w.create.create(w.self.accountId, {
              khungGioId: doctorB.slotIds[2]!,
              hoSoNguoiThanId: null,
              lyDoKham: null,
            }),
          ),
        check: async ({ a }, rescheduled, created, tally) => {
          expect([rescheduled.ok, created.ok].filter(Boolean)).toHaveLength(1);
          expect((rescheduled.ok ? created : rescheduled).code).toBe(
            BOOKING_ERROR_CODES.OVERLAPPING_APPOINTMENT,
          );
          tally.add(rescheduled.ok ? 'đổi thắng' : 'create thắng');
          expect(await overlappingPairs(w.db)).toBe(0);
          expect((await w.rowOf(a.lichHenId)).trangThai).toBe(
            rescheduled.ok ? 'DaDoiLich' : 'DaXacNhan',
          );
          expect(
            await w.countRows('lich_hen', "trang_thai = 'ChoThanhToan'"),
          ).toBe(rescheduled.ok ? 0 : 1);
        },
        settleOptions: ({ money }) => covered(money),
      });
    },
    TIMEOUT,
  );
});

describe('TDL-22 [đề xuất] đổi × create của người KHÁC vào CHÍNH khung giờ đích', () => {
  it(
    `${String(PAIR_ROUNDS)} vòng: đúng MỘT thắng; đổi thắng ⇒ create KHUNG_GIO_DA_DAT, khung giờ DaDat; create thắng ⇒ đổi KHUNG_GIO_DANG_GIU, khung giờ DangGiuCho đúng một lịch ChoThanhToan; không hai lịch giữ một khung giờ; 0 lần thử lại`,
    async () => {
      const w = await raceWorld(db, fx);
      const other = await w.newPatient();
      await fx.depositService(w.doctor.profile.dichVuKhamId, '50000.00');
      const stats = new RaceStats();
      await raceX2<{ a: LichHen; money: MoneyTotals }>({
        tag: 'TDL-22',
        name: 'đổi × create cùng khung giờ đích',
        db,
        logs,
        stats,
        setup: async () => {
          await w.resetRound();
          const a = await w.book(0, { coc: COC });
          return { a, money: await captureMoneyTotals(db) };
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
            w.create.create(other.accountId, {
              khungGioId: w.slot(4),
              hoSoNguoiThanId: null,
              lyDoKham: null,
            }),
          ),
        check: async ({ a }, rescheduled, created, tally) => {
          expect([rescheduled.ok, created.ok].filter(Boolean)).toHaveLength(1);
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
        settleOptions: ({ money }) => covered(money),
      });
    },
    TIMEOUT,
  );
});

/** Số cặp lịch HOẠT ĐỘNG của cùng một Bệnh nhân có cùng giờ bắt đầu (hai khung giờ cùng giờ ở hai bác sĩ khác nhau): phải bằng 0. */
async function overlappingPairs(source: DataSource): Promise<number> {
  const rows: { n: number | string }[] = await source.query(
    `SELECT COUNT(*) AS n
       FROM lich_hen a JOIN lich_hen b ON b.benh_nhan_id = a.benh_nhan_id AND b.lich_hen_id > a.lich_hen_id AND b.thoi_gian = a.thoi_gian
      WHERE a.trang_thai IN ('ChoThanhToan', 'DaXacNhan', 'DaTiepDon') AND b.trang_thai IN ('ChoThanhToan', 'DaXacNhan', 'DaTiepDon')`,
  );
  return Number(rows[0]?.n);
}
