import type { DataSource } from 'typeorm';
import { useIntegrationHooks } from '../../auth/testing/int-hooks.js';
import { AppException } from '../../common/errors/app.exception.js';
import { BookingFixtures } from '../testing/booking-fixtures.js';
import { createGate, runRounds } from '../testing/concurrency-harness.js';
import {
  reportRounds,
  sleep,
  winnerTally,
} from '../testing/concurrency-report.js';
import {
  receptionRescheduleWorld,
  type ReceptionRescheduleWorld,
} from '../testing/reception-reschedule-world.js';
import type { RescheduledResult } from './patient-reschedule.dto.js';

// reschedule B7 — ĐỒNG THỜI nhẹ của đường đổi hộ (DLO-05 phần "C", DLO-16 `[đề xuất]`; PLAN reschedule 5.4, 7.3) trên MySQL 8.4 THẬT với lõi B4, Audit và thông báo THẬT: (1) hai Lễ tân cùng chi nhánh đổi hộ CÙNG MỘT lịch
// (khoá `benh_nhan` của chủ lịch làm hai lần đổi tuần tự; bên sau thấy `DaDoiLich` ⇒ 409, nhân sự thấy được); (2) hai Lễ tân đổi hai lịch của hai bệnh nhân vào CÙNG MỘT khung giờ (gặp nhau ở khoá `khung_gio`; bên thua
// `KHUNG_GIO_DA_DAT`). Mỗi vòng dựng lại dữ liệu, hai bên cùng xuất phát qua MỘT cổng (`createGate`, bên đầu xen kẽ theo vòng), rồi kiểm kết quả, INV-1…INV-10 và số lần thử lại 1213/1205 (`retryStats` qua
// `reportRounds`, in ở dòng `[B7-…]`). Mọi yêu cầu qua `withBookingTransaction` thật: "không lỗi" là SAU thử lại, nên số thử lại khác 0 là THỨ TỰ KHOÁ SAI. Đếm toàn bộ cặp đồng thời: X2 (TDL-01…TDL-18). CHẠY MỘT MÌNH.
const ROUNDS = 12;

let db: DataSource;
let fx: BookingFixtures;
let logs: string[] = [];
useIntegrationHooks((d, captured) => {
  db = d;
  fx = new BookingFixtures(d);
  logs = captured;
});

/** Xoá hộp thư đi, thông báo, nhật ký và mọi lịch (con trước, vì lịch mới trỏ lịch cũ), đặt mọi khung giờ về `ConTrong`, đặt lại bộ đếm của cổng Fake: dựng lại trạng thái đầu mỗi vòng. */
async function reset(w: ReceptionRescheduleWorld): Promise<void> {
  await db.query('DELETE FROM email_thong_bao');
  await db.query('DELETE FROM thong_bao');
  await db.query('DELETE FROM nhat_ky_hanh_dong');
  await db.query('DELETE FROM lich_hen ORDER BY lich_hen_id DESC');
  await db.query(
    "UPDATE khung_gio SET trang_thai = 'ConTrong', giu_cho_den = NULL",
  );
  w.waitlist.onSlotReleasedCall.reset();
}

/** Hai việc xuất phát CÙNG LÚC; vòng lẻ việc thứ hai chậm 4 ms, vòng chẵn việc thứ nhất chậm 4 ms: xen kẽ ai đi trước để CẢ HAI nhánh thắng đều chạy. */
function pair<T>(
  round: number,
  first: () => Promise<T>,
  second: () => Promise<T>,
) {
  const gate = createGate(2);
  return [
    async (): Promise<T> => {
      await gate.arrive();
      if (round % 2 === 0) await sleep(4);
      return first();
    },
    async (): Promise<T> => {
      await gate.arrive();
      if (round % 2 === 1) await sleep(4);
      return second();
    },
  ] as const;
}

const codeOf = (error: unknown): string | undefined =>
  error instanceof AppException
    ? (error.getResponse() as { maLoi: string }).maLoi
    : undefined;

/** Đúng MỘT bên thành công (201) và MỘT bên bị từ chối bằng lỗi nghiệp vụ `code` (không 500, không 503). */
function expectOneWinOneLoss(
  results: readonly PromiseSettledResult<RescheduledResult>[],
  code: string,
): void {
  const wins = results.filter((r) => r.status === 'fulfilled');
  const losses = results.flatMap((r) =>
    r.status === 'rejected' ? [r.reason as unknown] : [],
  );
  expect(wins).toHaveLength(1);
  expect(losses.map(codeOf)).toEqual([code]);
}

describe('DLO-16 hai Lễ tân cùng chi nhánh đổi hộ CÙNG MỘT lịch (hai tab, hai người)', () => {
  it(`${String(ROUNDS)} vòng: đúng MỘT thắng (201), một thua 409 LICH_HEN_KHONG_CHO_DOI (lịch đã DaDoiLich); một lịch mới, một dòng Audit, một thông báo, một thư; không mời danh sách chờ hai lần; INV-1…INV-10; 0 lần thử lại`, async () => {
    const w = await receptionRescheduleWorld(db, fx);
    const second = await w.secondReceptionist();
    const tally = winnerTally();

    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        await reset(w);
        return w.book(0);
      },
      race: (lich, round) =>
        pair(
          round,
          () => w.reschedule(lich.maLichHen, 2, undefined, w.receptionId),
          () => w.reschedule(lich.maLichHen, 3, undefined, second),
        ),
      check: async (lich, results) => {
        expectOneWinOneLoss(results, 'LICH_HEN_KHONG_CHO_DOI');
        expect(await w.countRows('lich_hen')).toBe(2);
        expect(await w.auditCount()).toBe(1);
        expect(await w.countRows('thong_bao')).toBe(1);
        expect(await w.countRows('email_thong_bao')).toBe(1);
        expect((await w.rowOf(lich.lichHenId)).trangThai).toBe('DaDoiLich');
        await w.expectSettled();
        tally.add('một lịch mới');
      },
    });

    reportRounds(
      'B7-DLO-16',
      'hai Lễ tân, một lịch',
      ROUNDS,
      tally.winners,
      logs,
    );
  });
});

describe('DLO-05 (C) hai Lễ tân đổi hai lịch của hai bệnh nhân vào CÙNG MỘT khung giờ', () => {
  it(`${String(ROUNDS)} vòng: đúng MỘT thắng, một thua 409 KHUNG_GIO_DA_DAT; bên thua không để lại gì (lịch cũ vẫn DaXacNhan, khung giờ cũ vẫn DaDat, không Audit, không thông báo); INV-1…INV-10; 0 lần thử lại`, async () => {
    const w = await receptionRescheduleWorld(db, fx);
    const second = await w.secondReceptionist();
    const other = await fx.admin.patient();
    const tally = winnerTally();

    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        await reset(w);
        return {
          mine: await w.book(0),
          theirs: await w.book(1, { patientId: other.account.taiKhoanId }),
        };
      },
      race: ({ mine, theirs }, round) =>
        pair(
          round,
          () => w.reschedule(mine.maLichHen, 4, undefined, w.receptionId),
          () => w.reschedule(theirs.maLichHen, 4, undefined, second),
        ),
      check: async ({ mine, theirs }, results) => {
        expectOneWinOneLoss(results, 'KHUNG_GIO_DA_DAT');
        expect(await w.auditCount()).toBe(1);
        expect(await w.countRows('thong_bao')).toBe(1);
        const states = [
          (await w.rowOf(mine.lichHenId)).trangThai,
          (await w.rowOf(theirs.lichHenId)).trangThai,
        ].sort();
        expect(states).toEqual(['DaDoiLich', 'DaXacNhan']);
        await w.expectSettled();
        tally.add('một lịch mới');
      },
    });

    reportRounds(
      'B7-DLO-05',
      'hai Lễ tân, một khung giờ',
      ROUNDS,
      tally.winners,
      logs,
    );
  });
});
