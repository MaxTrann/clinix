import { BOOKING_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import { runRounds } from '../testing/concurrency-harness.js';
import {
  reportRounds,
  valuesOf,
  winnerTally,
} from '../testing/concurrency-report.js';
import {
  createOutbox,
  insertQueuedEmail,
  readOutbox,
} from '../testing/notification-world.js';
import {
  db,
  logs,
  racePair,
  useStatusWorldHooks,
  world,
} from '../testing/status-int-kit.js';
import {
  emptyEmailOutboxSummary,
  type EmailOutboxSummary,
} from './email-outbox.service.js';

// Task B15 — OBX-07: hai bản API cùng quét MỘT hộp thư đi, MỘT MÌNH (PLAN booking 5.12, 7.43; TRACKING 3.37 B15-H, B15-L). `FakeMailService` RIÊNG cho mỗi bản để biết bên nào gửi thư nào.
//
// DỰ ĐOÁN (ghi TRƯỚC khi đo): cả hai bản chọn cùng tập 8 thư (câu chọn không khoá), rồi tranh NHẬN VIỆC bằng `UPDATE … WHERE so_lan_thu = <số đã đọc>`: đúng MỘT bên có `affectedRows` = 1 mỗi thư, bên kia đếm `lostClaim` và bỏ qua.
// Nên mỗi vòng: tổng 8 thư gửi, KHÔNG thư nào gửi hai lần (cặp người nhận và tiêu đề duy nhất), cả 8 dòng `DaGui` với `so_lan_thu` 1; `lostClaim` > 0 ở ít nhất một vòng (chứng tỏ hai bên THỰC SỰ tranh nhau);
// không deadlock 1213 hay hết giờ chờ 1205 (mỗi câu ghi là MỘT hàng theo khoá chính, tự xác nhận, nên không có giao dịch nào giữ khoá chờ khoá khác). Nếu số đo LỆCH thì GHI vào TRACKING, không sửa dự đoán ở đây.
useStatusWorldHooks();
const ROUNDS = 40;
const NOW = new Date('2026-11-02T08:30:00+07:00');

const sweepOf = async (
  api: ReturnType<typeof createOutbox>,
): Promise<EmailOutboxSummary> => {
  const summary = emptyEmailOutboxSummary();
  await api.service.sweep(NOW, summary);
  return summary;
};

describe('OBX-07 hai worker cùng lúc (hai bản API): mỗi thư gửi đúng MỘT lần', () => {
  it(`${String(ROUNDS)} vòng × 8 thư: tổng 8 thư gửi, không thư nào hai lần, cả 8 dòng DaGui so_lan_thu 1; có tranh nhận việc thật; không 1213 hay 1205`, async () => {
    const w = await world();
    const lich = await w.booked('DaXacNhan', 0);
    const tally = winnerTally();
    let lostClaims = 0;
    await runRounds({
      rounds: ROUNDS,
      setup: async () => {
        await db.query('DELETE FROM email_thong_bao');
        await db.query('DELETE FROM thong_bao');
        for (const taiKhoanId of [w.patientId, w.secondPatientId])
          for (const loai of Object.values(BOOKING_NOTIFICATION_EVENTS))
            await insertQueuedEmail(db, {
              taiKhoanId,
              lichHenId: lich.lichHenId,
              loai,
            });
        return { a: createOutbox(db), b: createOutbox(db) };
      },
      race: ({ a, b }, round) =>
        racePair(
          round,
          () => sweepOf(a),
          () => sweepOf(b),
        ),
      check: async ({ a, b }, results) => {
        const [summaryA, summaryB] = valuesOf(results);
        expect(summaryA!.sent + summaryB!.sent).toBe(8);
        const keys = [...a.mail.sent, ...b.mail.sent].map(
          (message) => `${message.to} | ${message.subject}`,
        );
        expect(new Set(keys).size, 'có thư gửi hai lần').toBe(8);
        expect(a.mail.attempts.length + b.mail.attempts.length).toBe(8);
        const rows = await readOutbox(db);
        expect(rows).toHaveLength(8);
        for (const row of rows) {
          expect(row.trangThai).toBe('DaGui');
          expect(row.soLanThu).toBe(1);
        }
        lostClaims += summaryA!.lostClaim + summaryB!.lostClaim;
        tally.add(
          a.mail.sent.length === b.mail.sent.length
            ? 'chia đều'
            : a.mail.sent.length > b.mail.sent.length
              ? 'A nhiều hơn'
              : 'B nhiều hơn',
        );
      },
    });
    console.info(
      `[B15-OBX-07] tổng lần "bên khác nhận trước" (lostClaim) qua ${String(ROUNDS)} vòng: ${String(lostClaims)}`,
    );
    expect(
      lostClaims,
      'hai bên không hề tranh nhau: ca không đo được gì',
    ).toBeGreaterThan(0);
    reportRounds('B15-OBX-07', 'OBX-07', ROUNDS, tally.winners, logs);
  }, 180_000);
});
