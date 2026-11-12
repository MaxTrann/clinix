import type { DataSource } from 'typeorm';
import type {
  CaLamViec,
  TrangThaiLichHen,
} from '../../admin/entities/enums.js';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { LeaveFixtures } from '../testing/leave-fixtures.js';
import {
  recordStatements,
  WRITE_OR_LOCK_SQL,
} from '../testing/statement-recorder.js';
import { AppointmentQueries } from './appointment-queries.js';

// Task B11 — CG-16, CG-17, AFL-04 (phần `countActiveByShifts`) (PLAN booking 7.13, 7.30; TRACKING 3.24.3) trên MySQL 8.4 THẬT: D14, số lịch đang có theo ca cho lưới lịch của `doctor`. Phần ĐƠN VỊ: active-by-shifts.query.spec.ts.
let db: DataSource;
let leave: LeaveFixtures;
useIntegrationHooks((d) => {
  db = d;
  leave = new LeaveFixtures(d, new BookingFixtures(d));
});

const queries = new AppointmentQueries();
const count = (lichLamViecIds: string[]) =>
  queries.countActiveByShifts(db.manager, { lichLamViecIds });

type World = Awaited<ReturnType<LeaveFixtures['world']>>;

/** Mỗi phần tử của `plan` là một lịch ở `trangThai`, giờ lấy lần lượt từ `startHour` (cách nhau 30 phút) trong ca `ca` của ngày 10/11. */
async function fill(
  w: World,
  ca: CaLamViec,
  startHour: number,
  plan: TrangThaiLichHen[],
  doctor = w.doctor,
) {
  for (const [index, trangThai] of plan.entries()) {
    const minutes = startHour * 60 + index * 30;
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    await leave.appointmentAt({
      doctor,
      at: `2026-11-10 ${hh}:${mm}:00`,
      ca,
      trangThai,
      patientId: w.patientId,
    });
  }
}

describe('CG-16 countActiveByShifts: nhiều ca, đủ trạng thái, chỉ đếm ba trạng thái của ACTIVE_APPOINTMENT_STATES', () => {
  it('đếm ChoThanhToan, DaXacNhan, DaTiepDon (kể cả ChoThanhToan đã quá hạn chưa quét) theo từng lichLamViecId; không đếm DaHuy, HoanThanh, VangMat, DaDoiLich; ca khác và bác sĩ khác không lẫn', async () => {
    const w = await leave.world();
    const sang = await leave.shift(w.doctor, '2026-11-10', 'CaSang');
    const chieu = await leave.shift(w.doctor, '2026-11-10', 'CaChieu');
    const otherSang = await leave.shift(w.other, '2026-11-10', 'CaSang');
    await fill(w, 'CaSang', 8, [
      'ChoThanhToan',
      'ChoThanhToan',
      'DaXacNhan',
      'DaTiepDon',
      'DaHuy',
      'DaHuy',
      'HoanThanh',
      'VangMat',
      'DaDoiLich',
    ]);
    await fill(w, 'CaChieu', 13, [
      'DaXacNhan',
      'DaXacNhan',
      'DaXacNhan',
      'DaHuy',
    ]);
    await fill(w, 'CaSang', 8, ['DaTiepDon'], w.other);

    expect(
      await count([
        sang.lichLamViecId,
        chieu.lichLamViecId,
        otherSang.lichLamViecId,
      ]),
    ).toEqual({
      [sang.lichLamViecId]: 4,
      [chieu.lichLamViecId]: 3,
      [otherSang.lichLamViecId]: 1,
    });
    // chỉ hỏi một ca thì chỉ có khoá của ca đó
    expect(await count([chieu.lichLamViecId])).toEqual({
      [chieu.lichLamViecId]: 3,
    });
  });
});

describe('CG-17 countActiveByShifts: id không có lịch và danh sách rỗng', () => {
  it('ca có khung giờ nhưng không có lịch nào ⇒ 0; id không tồn tại ⇒ 0; danh sách rỗng ⇒ {} (không lỗi); id trùng gộp một', async () => {
    const w = await leave.world();
    const empty = await leave.shift(w.doctor, '2026-11-11', 'CaSang');
    await leave.slotAt(empty, '2026-11-11 08:00:00');
    const busy = await leave.shift(w.doctor, '2026-11-10', 'CaSang');
    await fill(w, 'CaSang', 8, ['DaXacNhan']);

    expect(
      await count([
        empty.lichLamViecId,
        '999999999',
        busy.lichLamViecId,
        busy.lichLamViecId,
      ]),
    ).toEqual({
      [empty.lichLamViecId]: 0,
      '999999999': 0,
      [busy.lichLamViecId]: 1,
    });
    expect(await count([])).toEqual({});
  });
});

describe('AFL-04 countActiveByShifts chỉ ĐỌC và chạy đúng MỘT câu GROUP BY bất kể số ca (không N+1)', () => {
  it.each([1, 60])(
    '%s id ca: đúng một câu, không khoá, không ghi',
    async (total) => {
      const w = await leave.world();
      const shift = await leave.shift(w.doctor, '2026-11-10', 'CaSang');
      await fill(w, 'CaSang', 8, ['DaXacNhan', 'ChoThanhToan']);
      const ids = [
        shift.lichLamViecId,
        ...Array.from({ length: total - 1 }, (_, index) =>
          String(1_000_000 + index),
        ),
      ];
      const statements = recordStatements(db);

      const result = await count(ids);

      expect(statements).toHaveLength(1);
      expect(statements[0]).toMatch(/GROUP BY/);
      expect(statements[0]).not.toMatch(WRITE_OR_LOCK_SQL);
      expect(Object.keys(result)).toHaveLength(total);
      expect(result[shift.lichLamViecId]).toBe(2);
    },
  );
});
