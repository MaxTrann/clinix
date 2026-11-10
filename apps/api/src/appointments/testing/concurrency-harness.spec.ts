import { runConcurrently as adminRunConcurrently } from '../../admin/testing/test-helpers.js';
import {
  createGate as doctorCreateGate,
  runConcurrently as doctorRunConcurrently,
} from '../../doctor/testing/concurrency-harness.js';
import { bookingException } from '../appointments.constants.js';
import {
  createGate,
  runConcurrently,
  runRounds,
  summarize,
  tallyOutcomes,
} from './concurrency-harness.js';

// Task P2 — BHT-03 (PLAN booking 7.19; TRACKING 3.6 P2-G): `runRounds` và `tallyOutcomes`. Không DB. (`holdRowLock`: BHT-04 ở concurrency-harness.int-spec.ts.)
describe('BHT-03 runRounds', () => {
  it('chạy đủ N vòng; mỗi vòng setup MỚI rồi chạy đua THẬT (cổng chỉ mở khi cả ba bên cùng tới) rồi check; trả kết quả mọi vòng', async () => {
    const setups: number[] = [];
    const checks: [number, number, number][] = [];
    const all = await runRounds({
      rounds: 4,
      setup: (round) => {
        setups.push(round);
        return Promise.resolve({ round, gate: createGate(3) });
      },
      race: ({ gate, round }) =>
        [1, 2, 3].map((id) => async () => {
          // nếu chạy tuần tự thì bên đầu chờ mãi ở cổng và test hết giờ
          await gate.arrive();
          return round * 10 + id;
        }),
      check: ({ round }, results, checkRound) => {
        checks.push([round, checkRound, results.length]);
      },
    });
    expect(setups).toEqual([1, 2, 3, 4]);
    expect(checks).toEqual([
      [1, 1, 3],
      [2, 2, 3],
      [3, 3, 3],
      [4, 4, 3],
    ]);
    expect(all).toHaveLength(4);
    expect(summarize(all[2]!).values).toEqual([31, 32, 33]);
  });

  it('lỗi của một việc chạy đua KHÔNG dừng vòng: check nhận cả giá trị lẫn lỗi', async () => {
    const seen: { ok: number; failed: number }[] = [];
    await runRounds({
      rounds: 2,
      setup: () => Promise.resolve(undefined),
      race: () => [
        () => Promise.resolve('tốt'),
        () => Promise.reject(new Error('hỏng')),
      ],
      check: (_context, results) => {
        seen.push({
          ok: results.filter((r) => r.status === 'fulfilled').length,
          failed: results.filter((r) => r.status === 'rejected').length,
        });
      },
    });
    expect(seen).toEqual([
      { ok: 1, failed: 1 },
      { ok: 1, failed: 1 },
    ]);
  });

  it('lỗi ở check nêu SỐ VÒNG, giữ lỗi gốc ở cause và dừng ngay (các vòng sau không chạy)', async () => {
    const setups: number[] = [];
    const original = new Error('bất biến vỡ');
    const failure = await runRounds({
      rounds: 5,
      setup: (round) => {
        setups.push(round);
        return Promise.resolve(undefined);
      },
      race: () => [() => Promise.resolve(1)],
      check: (_context, _results, round) => {
        if (round === 3) throw original;
      },
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe('Vòng 3/5: bất biến vỡ');
    expect((failure as Error).cause).toBe(original);
    expect(setups).toEqual([1, 2, 3]);
  });

  it('lỗi ở setup cũng nêu số vòng', async () => {
    await expect(
      runRounds({
        rounds: 2,
        setup: (round) =>
          round === 2
            ? Promise.reject(new Error('dựng hỏng'))
            : Promise.resolve(undefined),
        race: () => [],
        check: () => undefined,
      }),
    ).rejects.toThrow('Vòng 2/2: dựng hỏng');
  });

  it('0 vòng ⇒ không làm gì; re-export đúng là hàm của doctor và admin (không chép)', async () => {
    await expect(
      runRounds({
        rounds: 0,
        setup: () => Promise.reject(new Error('không được gọi')),
        race: () => [],
        check: () => undefined,
      }),
    ).resolves.toEqual([]);
    expect(runConcurrently).toBe(doctorRunConcurrently);
    expect(runConcurrently).toBe(adminRunConcurrently);
    expect(createGate).toBe(doctorCreateGate);
  });
});

describe('BHT-03 tallyOutcomes', () => {
  const rejected = (reason: unknown): PromiseRejectedResult => ({
    status: 'rejected',
    reason,
  });
  const fulfilled = (value: unknown): PromiseFulfilledResult<unknown> => ({
    status: 'fulfilled',
    value,
  });

  it('đếm thành công, theo maLoi, 1213 (lỗi thô, bọc QueryFailedError, theo code), 1205 và lỗi lạ', () => {
    const tally = tallyOutcomes([
      fulfilled({ kind: 'Created' }),
      fulfilled({ kind: 'Refused' }), // kết quả "từ chối" có kiểu là GIÁ TRỊ, không phải lỗi
      rejected(bookingException('KHUNG_GIO_DA_DAT')),
      rejected(bookingException('KHUNG_GIO_DA_DAT')),
      rejected(bookingException('HE_THONG_DANG_BAN')),
      rejected({ errno: 1213 }),
      rejected({ driverError: { errno: 1213 } }),
      rejected({ code: 'ER_LOCK_DEADLOCK' }),
      rejected({ driverError: { errno: 1205 } }),
      rejected(new Error('lạ')),
      rejected('chuỗi lạ'),
    ]);
    expect(tally).toMatchObject({
      total: 11,
      ok: 2,
      byCode: { KHUNG_GIO_DA_DAT: 2, HE_THONG_DANG_BAN: 1 },
      deadlocks: 3,
      lockTimeouts: 1,
    });
    expect(tally.other).toHaveLength(2);
  });

  it('danh sách rỗng ⇒ mọi số bằng 0; không có lỗi lạ ⇒ other rỗng ("không 500")', () => {
    expect(tallyOutcomes([])).toEqual({
      total: 0,
      ok: 0,
      byCode: {},
      deadlocks: 0,
      lockTimeouts: 0,
      other: [],
    });
    expect(
      tallyOutcomes([
        fulfilled(1),
        rejected(bookingException('KHUNG_GIO_DA_DAT')),
      ]).other,
    ).toEqual([]);
  });

  it('gộp được kết quả của nhiều vòng (runRounds ⇒ flat) để tính tỉ lệ', async () => {
    const all = await runRounds({
      rounds: 3,
      setup: () => Promise.resolve(undefined),
      race: () => [
        () => Promise.resolve('thắng'),
        () => Promise.reject(bookingException('KHUNG_GIO_DA_DAT')),
      ],
      check: () => undefined,
    });
    const tally = tallyOutcomes(all.flat());
    expect(tally.total).toBe(6);
    expect(tally.ok).toBe(3);
    expect(tally.byCode).toEqual({ KHUNG_GIO_DA_DAT: 3 });
  });
});
