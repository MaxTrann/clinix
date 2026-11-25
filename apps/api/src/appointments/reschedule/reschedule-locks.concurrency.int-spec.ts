import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { withBookingTransaction } from '../locking/booking-transaction.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { firstTableOf, interceptQuery } from '../testing/query-spy.js';
import { lockRescheduleChain } from './reschedule-locks.js';

// reschedule B1 — HDL-14 `[đề xuất]` (PLAN reschedule 3.5 R1, 5.4 quy tắc 2; số đo X1 M1) trên MySQL 8.4 THẬT: hoán vị khung giờ X↔Y bằng HAI kết nối thật dùng `lockRescheduleChain`: A đổi lịch ở khung giờ id 9 sang
// id 10, B đổi lịch của Bệnh nhân khác ở id 10 sang id 9. Cả hai giữ 20 ms SAU câu khoá `khung_gio` đầu tiên (như X1 M1) để chắc chắn gặp nhau. Hai khung giờ luôn khoá theo id tăng dần nên cùng xin 9 trước 10: KHÔNG chu trình.
// Đếm số lần `withBookingTransaction` phải thử lại (mỗi lần thử lại ghi MỘT cảnh báo, chỉ xảy ra với 1213 hoặc 1205): kỳ vọng 0. Đối chứng: bỏ sắp xếp (khoá khung giờ cũ rồi mới) ra 1213 ở mọi vòng (X1 M1: 100/100); đột biến M13
// của B1 chứng minh ca này bắt được điều đó. Chỉ khoá, không ghi gì: mỗi vòng lặp lại được trên cùng dữ liệu.
const ROUNDS = 40;
const HOLD_BETWEEN_LOCKS_MS = 20;

let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('HDL-14 hoán vị X↔Y bằng hai kết nối thật', () => {
  it(`${String(ROUNDS)} vòng: 0 lần thử lại (không 1213, không 1205), cả hai bên luôn khoá được`, async () => {
    const w = await fx.world();
    const afternoon = await fx.doctor.shiftWithSlots(w.doctor.profile, {
      ngay: '2026-11-10',
      ca: 'CaChieu',
    });
    expect(afternoon.slotIds.slice(0, 2)).toEqual(['9', '10']);
    const [x, y] = afternoon.slotIds as [string, string];
    const [secondPatient] = await fx.patients(1);
    const doctor = w.doctor.profile;
    const a = await fx.appointmentIn('DaXacNhan', {
      doctor,
      khungGioId: x,
      patientId: w.patient.account.taiKhoanId,
    });
    const b = await fx.appointmentIn('DaXacNhan', {
      doctor,
      khungGioId: y,
      patientId: secondPatient!.account.taiKhoanId,
    });
    const warnings: string[] = [];
    const logger = {
      warn: (message: unknown) => {
        warnings.push(String(message));
      },
    };

    /** Một bên của vòng: khoá chuỗi đổi lịch từ khung giờ `from` sang `to`, giữ 20 ms sau câu khoá khung giờ đầu tiên */
    const side = (
      lichHenId: string,
      patientId: string,
      from: string,
      to: string,
    ) =>
      withBookingTransaction(
        db,
        async (em) => {
          let pausedOnce = false;
          interceptQuery(em, async (sql, run) => {
            const result = await run();
            if (!pausedOnce && firstTableOf(sql) === 'khung_gio') {
              pausedOnce = true;
              await sleep(HOLD_BETWEEN_LOCKS_MS);
            }
            return result;
          });
          return lockRescheduleChain(em, {
            benhNhanId: patientId,
            hoSoNguoiThanId: null,
            bacSiId: doctor.taiKhoanId,
            lichHenId,
            khungGioCuId: from,
            khungGioMoiId: to,
          });
        },
        { label: 'reschedule-b1-swap', logger },
      );

    for (let round = 1; round <= ROUNDS; round += 1) {
      const [resultA, resultB] = await Promise.all([
        side(a.lichHenId, w.patient.account.taiKhoanId, x, y),
        side(b.lichHenId, secondPatient!.account.taiKhoanId, y, x),
      ]);
      expect(resultA.kind, `vòng ${String(round)} bên A`).toBe('Locked');
      expect(resultB.kind, `vòng ${String(round)} bên B`).toBe('Locked');
    }

    expect(warnings).toEqual([]);
  });
});
