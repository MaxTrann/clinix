import type { DataSource } from 'typeorm';
import { BookingFixtures } from '../../../appointments/testing/booking-fixtures.js';
import { useIntegrationHooks } from '../../../auth/testing/int-hooks.js';
import { EXAM_RACE_ROUNDS, runExamRounds } from './exam-concurrency.js';
import { examWorld } from './exam-world.js';

// doctor-exam P3 (#393) — hỗ trợ cho DHK-* (không có mã riêng trong PLAN): `runExamRounds` thật sự chạy IVK-01…IVK-05 SAU MỖI VÒNG (PLAN 7.8) và gọi tên vòng làm vỡ bất biến.
// P3 không tự chạy đua; ca đồng thời thật (DHK-01…DHK-11) là việc của B1 trở đi, dùng hàm này.
let db: DataSource;
let fx: BookingFixtures;
useIntegrationHooks((d) => {
  db = d;
  fx = new BookingFixtures(d);
});

const noRace = () => [() => Promise.resolve('xong')];

describe('runExamRounds', () => {
  it('mặc định chạy EXAM_RACE_ROUNDS (40) vòng, mỗi vòng dựng dữ liệu mới, chạy đua, kiểm của ca rồi mới đến bộ bất biến', async () => {
    expect(EXAM_RACE_ROUNDS).toBe(40);
    const w = await examWorld(db, fx);
    await w.exam.rating((await w.completed(0)).lichHenId);
    const order: string[] = [];
    const rounds = await runExamRounds(db, {
      setup: (round) => {
        order.push(`setup ${String(round)}`);
        return Promise.resolve(round);
      },
      race: noRace,
      check: (context) => {
        order.push(`check ${String(context)}`);
      },
    });
    expect(rounds).toHaveLength(EXAM_RACE_ROUNDS);
    expect(order.slice(0, 4)).toEqual([
      'setup 1',
      'check 1',
      'setup 2',
      'check 2',
    ]);
    expect(order).toHaveLength(2 * EXAM_RACE_ROUNDS);
  });

  it('một bất biến vỡ ở vòng 2 (đánh giá trên lịch DaXacNhan) ⇒ lỗi bắt đầu bằng "Vòng 2/3", nêu IVK-02, và các vòng sau không chạy', async () => {
    const w = await examWorld(db, fx);
    await w.exam.rating((await w.completed(0)).lichHenId);
    const wrong = await w.confirmed(1);
    let setups = 0;
    const run = runExamRounds(db, {
      rounds: 3,
      setup: () => {
        setups += 1;
        return Promise.resolve(setups);
      },
      race: noRace,
      check: async (round) => {
        if (round === 2) await w.exam.rating(wrong.lichHenId);
      },
    });
    await expect(run).rejects.toThrow(/^Vòng 2\/3: .*IVK-02/s);
    expect(setups).toBe(2);
  });

  it('lỗi của chính `check` của ca cũng nêu số vòng và đứng TRƯỚC bộ bất biến', async () => {
    const run = runExamRounds(db, {
      rounds: 2,
      setup: () => Promise.resolve(0),
      race: noRace,
      check: (_context, _results, round) => {
        if (round === 1) throw new Error('ca tự kiểm sai');
      },
    });
    await expect(run).rejects.toThrow(/^Vòng 1\/2: ca tự kiểm sai$/);
  });
});
