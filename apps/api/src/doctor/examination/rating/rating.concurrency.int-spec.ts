import { vi } from 'vitest';
import {
  reportRounds,
  retryStats,
  sleep,
  valuesOf,
  winnerTally,
} from '../../../appointments/testing/concurrency-report.js';
import { settle } from '../../../appointments/testing/override-world.js';
import {
  db,
  logs,
  racePair,
  useStatusWorldHooks,
  world,
} from '../../../appointments/testing/status-int-kit.js';
import {
  createGate,
  EXAM_RACE_ROUNDS,
  holdRowLock,
  runExamRounds,
  withRowLock,
} from '../testing/exam-concurrency.js';
import {
  LOCK_LICH_HEN_SQL,
  ratingBody,
  ratingRows,
  ratingService,
  resetRatingRound,
} from '../testing/rating-stack.js';

// doctor-exam B6 — các ca ĐỒNG THỜI của gửi đánh giá trên MySQL 8.4 THẬT (PLAN 5.3, 7.4 DGB-09, DGB-18; 7.8 DHK-06; X1 M3). CHẠY MỘT MÌNH (`--no-file-parallelism` đã là mặc định của cấu hình int; không chạy cùng lúc với ca nặng khác).
// DHK-11 (đánh giá ‖ PUT hồ sơ) ở exam-record/exam-record.concurrency.int-spec.ts (file của B2, nay dùng `RatingService` THẬT). Mỗi vòng: dữ liệu SẠCH, các bên cùng xuất phát, IVK-01…IVK-05 và INV-01…INV-05 sau vòng,
// rồi IN một dòng `[B6-DHK]` (số vòng, bên thắng, số lần thử lại 1213/1205 theo nhãn, số yêu cầu hết lượt 503).
// DỰ ĐOÁN (ghi trước khi chạy, TRACKING 20.2; lệch thì GHI, không sửa dự đoán): DHK-06 (a): đúng một 201 và một 409 `DA_DANH_GIA` mỗi vòng, một dòng, 0 lần thử lại, 0 × 503 (hai bên chỉ tranh UNIQUE: bên thua chờ rồi 1062, không chu trình);
// DHK-06 (b) ba bên: một 201, hai 409, một dòng; 1213 (nếu có) được `withBookingTransaction` thử lại rồi cũng ra 409, không bao giờ lọt hay hết lượt (503); DGB-18 (a): giữ khoá X suốt lời gọi ⇒ 1205 ở cả ba lần chạy ⇒ 503 sau ≈ 9 giây
// (X1b: 9,03 giây), 0 dòng; (b) giữ 4 giây ⇒ đúng MỘT lần thử lại 1205 rồi 201.
useStatusWorldHooks();

const TAG = 'B6-DHK';
const SLOW = 600_000;
const NOW = new Date('2026-11-10T09:00:00+07:00');
const ALREADY_RATED = 'DA_DANH_GIA';
const RETRY_KEY = 'exam-rating MySQL 1205';

async function raceWorld() {
  vi.setSystemTime(NOW);
  const w = await world();
  return { w, service: ratingService(db), patientId: w.patientId };
}

describe('DHK-06 (DGB-09) hai lần gửi đánh giá cùng lịch cùng lúc: một 201, một 409 DA_DANH_GIA; MỘT dòng; không 500 (1062 ánh xạ)', () => {
  it(
    `(a) hai tab, ${String(EXAM_RACE_ROUNDS)} vòng`,
    async () => {
      const t = await raceWorld();
      const tally = winnerTally();
      await runExamRounds(db, {
        setup: async () => {
          await resetRatingRound(db);
          return t.w.booked('HoanThanh', 0);
        },
        race: (lich, round) =>
          racePair(
            round,
            () =>
              settle(
                t.service.submit(
                  t.patientId,
                  lich.maLichHen,
                  ratingBody({ soSao: 4, nhanXet: 'Tab 1' }),
                ),
              ),
            () =>
              settle(
                t.service.submit(
                  t.patientId,
                  lich.maLichHen,
                  ratingBody({ soSao: 2, nhanXet: 'Tab 2' }),
                ),
              ),
          ),
        check: async (lich, results) => {
          const outcomes = valuesOf(results);
          const wins = outcomes.flatMap((o) =>
            o.kind === 'ok' ? [o.value] : [],
          );
          const refused = outcomes.flatMap((o) =>
            o.kind === 'refused' ? [o.maLoi] : [],
          );
          expect(wins).toHaveLength(1);
          expect(refused).toEqual([ALREADY_RATED]);
          const rows = await ratingRows(db, lich.lichHenId);
          expect(rows).toHaveLength(1);
          expect(rows[0]).toMatchObject({
            soSao: wins[0]?.soSao,
            nhanXet: wins[0]?.nhanXet,
          });
          tally.add(wins[0]?.nhanXet === 'Tab 1' ? 'tab1' : 'tab2');
        },
      });
      reportRounds(TAG, 'DHK-06 (a)', EXAM_RACE_ROUNDS, tally.winners, logs);
    },
    SLOW,
  );

  it(
    `(b) [đề xuất] ba lần gửi cùng lúc, ${String(EXAM_RACE_ROUNDS)} vòng: một 201, hai 409; một dòng; 1213 (nếu có) được thử lại, không lọt, không hết lượt`,
    async () => {
      const t = await raceWorld();
      const tally = winnerTally();
      await runExamRounds(db, {
        setup: async () => {
          await resetRatingRound(db);
          return t.w.booked('HoanThanh', 0);
        },
        race: (lich) => {
          const gate = createGate(3);
          return [1, 2, 3].map((n) => async () => {
            await gate.arrive();
            return settle(
              t.service.submit(
                t.patientId,
                lich.maLichHen,
                ratingBody({ soSao: n, nhanXet: `Bên ${String(n)}` }),
              ),
            );
          });
        },
        check: async (lich, results) => {
          const outcomes = valuesOf(results);
          const wins = outcomes.flatMap((o) =>
            o.kind === 'ok' ? [o.value] : [],
          );
          const refused = outcomes.flatMap((o) =>
            o.kind === 'refused' ? [o.maLoi] : [],
          );
          expect(wins).toHaveLength(1);
          expect(refused).toEqual([ALREADY_RATED, ALREADY_RATED]);
          const rows = await ratingRows(db, lich.lichHenId);
          expect(rows).toHaveLength(1);
          expect(rows[0]?.nhanXet).toBe(wins[0]?.nhanXet);
          tally.add(wins[0]?.nhanXet ?? '?');
        },
      });
      // Ba bên cùng xin khoá trên một khoá UNIQUE có thể deadlock 1213: được thử lại (retriesAllowed); hết lượt (503) vẫn phải bằng 0
      reportRounds(TAG, 'DHK-06 (b)', EXAM_RACE_ROUNDS, tally.winners, logs, {
        retriesAllowed: true,
      });
    },
    SLOW,
  );
});

describe('DGB-18 [đề xuất] chờ khoá của INSERT bị chặn bởi trần 3 giây × 3 lần của withBookingTransaction (không chờ 50 giây, không 500)', () => {
  it('(a) giữ khoá X của lich_hen SUỐT lời gọi ⇒ 1205 ở cả ba lần chạy ⇒ 503 HE_THONG_DANG_BAN sau ≈ 9 giây; 0 dòng', async () => {
    const t = await raceWorld();
    const lich = await t.w.booked('HoanThanh', 0);
    const outcome = await withRowLock(
      db,
      { sql: LOCK_LICH_HEN_SQL, params: [lich.lichHenId] },
      async () => {
        const start = performance.now();
        const result = await settle(
          t.service.submit(t.patientId, lich.maLichHen, ratingBody()),
        );
        return { result, ms: performance.now() - start };
      },
    );
    console.info(
      `[${TAG}] DGB-18 (a): ${outcome.ms.toFixed(0)} ms, kết quả ${JSON.stringify(outcome.result)}`,
    );
    expect(outcome.result).toMatchObject({
      kind: 'refused',
      maLoi: 'HE_THONG_DANG_BAN',
    });
    expect(outcome.ms).toBeGreaterThan(8500);
    expect(outcome.ms).toBeLessThan(15_000);
    expect(await ratingRows(db)).toEqual([]);
    const stats = retryStats(logs);
    expect(stats.retries[RETRY_KEY]).toBe(2);
    expect(stats.exhausted).toBe(1);
  }, 60_000);

  it('(b) giữ khoá 4 giây ⇒ lần chạy đầu hết 3 giây (1205), lần chạy thứ hai thành công sau khi nhả: đúng MỘT lần thử lại, rồi 201 và MỘT dòng', async () => {
    const t = await raceWorld();
    const lich = await t.w.booked('HoanThanh', 0);
    const held = await holdRowLock(db, LOCK_LICH_HEN_SQL, [lich.lichHenId]);
    const start = performance.now();
    const pending = settle(
      t.service.submit(t.patientId, lich.maLichHen, ratingBody()),
    );
    await sleep(4000);
    await held.release('rollback');
    const result = await pending;
    const ms = performance.now() - start;
    console.info(`[${TAG}] DGB-18 (b): ${ms.toFixed(0)} ms`);
    expect(result.kind).toBe('ok');
    expect(ms).toBeGreaterThan(3500);
    expect(ms).toBeLessThan(7000);
    expect(await ratingRows(db, lich.lichHenId)).toHaveLength(1);
    expect(retryStats(logs)).toEqual({
      retries: { [RETRY_KEY]: 1 },
      exhausted: 0,
    });
  }, 60_000);
});
