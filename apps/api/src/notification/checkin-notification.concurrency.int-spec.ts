import { runRounds } from '../appointments/testing/concurrency-harness.js';
import {
  reportRounds,
  retryStats,
  valuesOf,
  winnerTally,
} from '../appointments/testing/concurrency-report.js';
import { createRealNotifierStack } from '../appointments/testing/notification-world.js';
import { notificationRows } from '../appointments/testing/payment-doctor-fakes.js';
import {
  db,
  logs,
  racePair,
  useStatusWorldHooks,
  world,
} from '../appointments/testing/status-int-kit.js';
import {
  checkInInput,
  runCheckIn,
} from '../appointments/testing/status-world.js';
import { NotificationCenterRepository } from './center/notification-center.repository.js';
import { NotificationCenterService } from './center/notification-center.service.js';
import { assertNotificationInvariants } from './testing/notification-invariants.js';

// notification X2 — CTB-06: hai lần tiếp đón CÙNG lúc CÙNG một lịch trên MySQL 8.4 thật (PLAN notification 5.8, 7; chạy MỘT mình), với `BookingNotifier` THẬT. Hai cặp: Lễ tân bấm đúp
// (LeTan × LeTan) và Lễ tân đua thu tiền mặt tại quầy (LeTan × ThanhToan, lõi `checkIn` mà payment gọi). IVN-01…IVN-05 sau mỗi vòng; 1213, 1205 và 503 đếm qua `reportRounds`.
// DỰ ĐOÁN (ghi TRƯỚC khi đo): cả hai bên khoá `lich_hen` theo khoá chính trước mọi lần ghi; bên sau chờ rồi thấy `DaTiepDon` ⇒ `InvalidState`, không tới `notify` ⇒ đúng MỘT thông báo, 0 lần 1213.
useStatusWorldHooks();
const ROUNDS = 40;
const center = () =>
  new NotificationCenterService(db, new NotificationCenterRepository());
const unreadOf = async (taiKhoanId: string) =>
  (await center().unreadCount(taiKhoanId)).soChuaDoc;

describe('CTB-06 hai lần tiếp đón cùng lúc cùng lịch: đúng MỘT thông báo LichHenDaTiepDon', () => {
  it.each([
    ['Lễ tân bấm đúp', 'LeTan', 'LeTan'],
    ['Lễ tân đua thu tiền mặt tại quầy', 'LeTan', 'ThanhToan'],
  ] as const)(
    `%s, ${String(ROUNDS)} vòng: một bên CheckedIn, bên kia InvalidState (không lỗi, không 500); lịch DaTiepDon; đúng MỘT thông báo cho Bác sĩ phụ trách; IVN sau mỗi vòng`,
    async (name, roleA, roleB) => {
      const w = await world();
      const lich = await w.booked('DaXacNhan', 0);
      const stack = createRealNotifierStack(db);
      const tally = winnerTally();
      await runRounds({
        rounds: ROUNDS,
        setup: async () => {
          // Đưa lịch về DaXacNhan và xoá thông báo của vòng trước (dữ liệu dựng, không qua lõi)
          await db.query('DELETE FROM email_thong_bao');
          await db.query('DELETE FROM thong_bao');
          await db.query(
            "UPDATE lich_hen SET trang_thai = 'DaXacNhan', thoi_diem_tiep_don = NULL WHERE lich_hen_id = ?",
            [lich.lichHenId],
          );
        },
        race: (_context, round) =>
          racePair(
            round,
            () =>
              runCheckIn(
                db,
                stack.transition,
                checkInInput(w, lich.lichHenId, roleA),
              ),
            () =>
              runCheckIn(
                db,
                stack.transition,
                checkInInput(w, lich.lichHenId, roleB),
              ),
          ),
        check: async (_context, results) => {
          const outcomes = valuesOf(results);
          const kinds = outcomes.map((o) => o.kind).sort();
          expect(kinds).toEqual(['CheckedIn', 'InvalidState']);
          expect(await notificationRows(db)).toEqual([
            {
              taiKhoanId: w.doctor.account.taiKhoanId,
              lichHenId: lich.lichHenId,
              loai: 'LichHenDaTiepDon',
            },
          ]);
          const [row] = (await db.query(
            'SELECT trang_thai AS trangThai FROM lich_hen WHERE lich_hen_id = ?',
            [lich.lichHenId],
          )) as { trangThai: string }[];
          expect(row?.trangThai).toBe('DaTiepDon');
          await assertNotificationInvariants(db, unreadOf);
          tally.add(
            outcomes[0]!.kind === 'CheckedIn' ? 'bên thứ nhất' : 'bên thứ hai',
          );
        },
      });
      // `console.info` của `reportRounds` không hiện khi chạy int: in thêm số đo ra stderr để ghi TRACKING
      const { retries, exhausted } = retryStats(logs);
      process.stderr.write(
        `[X2-CTB-06] ${name}: ${String(ROUNDS)} vòng; bên thắng ${JSON.stringify(tally.winners)}; thử lại ${JSON.stringify(retries)}; 503 ${String(exhausted)}
`,
      );
      reportRounds('X2-CTB-06', name, ROUNDS, tally.winners, logs);
    },
    300_000,
  );
});
