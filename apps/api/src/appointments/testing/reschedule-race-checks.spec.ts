import { describe, expect, it, vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import {
  BUSY_CODE,
  OK_SIDE,
  PAIR_ROUNDS,
  RaceStats,
  cancelSide,
  finishX2,
  pairLags,
  pickDistinct,
  rescheduleSide,
  seededRandom,
  sideOf,
  slotLockOrder,
  totalRetries,
} from './reschedule-race-checks.js';

// Kiểm ĐƠN VỊ phần thuần của bộ ca đồng thời X2 (reschedule X2; không DB): hạt giống lặp lại được (TDL-17 tái hiện được), kịch bản độ lệch cố định (không "chỉnh cho đẹp"), thứ tự khoá theo SỐ (TDL-19, đột biến "so id bằng
// chuỗi"), ánh xạ kết quả sang `Side` và các khẳng định cuối ca của `finishX2`.

describe('seededRandom và pickDistinct (TDL-17 tái hiện được)', () => {
  it('cùng hạt giống ⇒ cùng dãy; khác hạt giống ⇒ khác dãy; giá trị trong [0, 1)', () => {
    const take = (seed: number) => {
      const next = seededRandom(seed);
      return Array.from({ length: 20 }, () => next());
    };
    expect(take(20_261_125)).toEqual(take(20_261_125));
    expect(take(20_261_125)).not.toEqual(take(20_261_126));
    for (const value of take(7)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('pickDistinct: đủ số phần tử, KHÁC nhau, lặp lại được; xin nhiều hơn số có thì trả hết', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    const picked = pickDistinct(seededRandom(1), items, 4);
    expect(picked).toHaveLength(4);
    expect(new Set(picked).size).toBe(4);
    expect(pickDistinct(seededRandom(1), items, 4)).toEqual(picked);
    expect(pickDistinct(seededRandom(1), items, 10)).toHaveLength(6);
    expect(items).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
});

describe('pairLags: kịch bản độ lệch CỐ ĐỊNH (40 vòng xen kẽ + 16 vòng quét)', () => {
  it('vòng xen kẽ: vòng lẻ bên thứ hai chậm 4 ms, vòng chẵn bên thứ nhất chậm 4 ms', () => {
    expect(pairLags(1, PAIR_ROUNDS)).toEqual([0, 4]);
    expect(pairLags(2, PAIR_ROUNDS)).toEqual([4, 0]);
    expect(pairLags(40, PAIR_ROUNDS)).toEqual([4, 0]);
  });

  it('vòng quét: mỗi độ lệch 0, 1, 2, 3, 5, 8, 12, 20 ms hai vòng (bên thứ nhất rồi bên thứ hai)', () => {
    const sweep = Array.from({ length: 16 }, (_, i) =>
      pairLags(41 + i, PAIR_ROUNDS),
    );
    expect(sweep).toEqual([
      [0, 0],
      [0, 0],
      [1, 0],
      [0, 1],
      [2, 0],
      [0, 2],
      [3, 0],
      [0, 3],
      [5, 0],
      [0, 5],
      [8, 0],
      [0, 8],
      [12, 0],
      [0, 12],
      [20, 0],
      [0, 20],
    ]);
  });

  it('100 vòng: 84 xen kẽ rồi 16 vòng quét (cùng dãy độ lệch)', () => {
    expect(pairLags(84, 100)).toEqual([4, 0]);
    expect(pairLags(85, 100)).toEqual([0, 0]);
    expect(pairLags(100, 100)).toEqual([0, 20]);
  });
});

describe('slotLockOrder: thứ tự khoá khung giờ theo SỐ (TDL-19)', () => {
  it('9 rồi 10 là đúng; 10 rồi 9 là sai (so chuỗi "10" < "9" sẽ khoá 10 trước)', () => {
    const ok = slotLockOrder([
      { tx: 1, slotId: '9' },
      { tx: 1, slotId: '10' },
      { tx: 2, slotId: '9' },
      { tx: 2, slotId: '10' },
    ]);
    expect(ok).toEqual({ checked: 2, violations: [] });
    const bad = slotLockOrder([
      { tx: 1, slotId: '10' },
      { tx: 1, slotId: '9' },
      { tx: 2, slotId: '9' },
      { tx: 2, slotId: '10' },
    ]);
    expect(bad.checked).toBe(2);
    expect(bad.violations).toEqual([{ tx: 1, order: ['10', '9'] }]);
  });

  it('bỏ lần xin lại hàng đã giữ; giao dịch chỉ khoá một khung giờ thì không tính; id lớn hơn 2^53 so bằng BigInt', () => {
    expect(
      slotLockOrder([
        { tx: 1, slotId: '9' },
        { tx: 1, slotId: '9' },
        { tx: 1, slotId: '10' },
        { tx: 1, slotId: '9' },
        { tx: 2, slotId: '5' },
      ]),
    ).toEqual({ checked: 1, violations: [] });
    expect(
      slotLockOrder([
        { tx: 1, slotId: '9007199254740993' },
        { tx: 1, slotId: '9007199254740994' },
      ]).violations,
    ).toEqual([]);
  });
});

describe('Side: ánh xạ kết quả', () => {
  it('rescheduleSide và cancelSide', () => {
    expect(
      rescheduleSide({
        kind: 'Rescheduled',
        maLichHenCu: 'A',
        maLichHenMoi: 'B',
        thoiGianMoi: new Date(0),
      }),
    ).toEqual(OK_SIDE);
    expect(
      rescheduleSide({
        kind: 'Rejected',
        failure: { kind: 'Rule', code: 'KHUNG_GIO_DA_DAT' },
      }),
    ).toEqual({ ok: false, code: 'KHUNG_GIO_DA_DAT' });
    expect(
      rescheduleSide({ kind: 'Rejected', failure: { kind: 'NotFound' } }),
    ).toEqual({ ok: false, code: 'NotFound' });
    expect(
      cancelSide({ kind: 'Cancelled', maLichHen: 'A', hoanCoc: null }),
    ).toEqual(OK_SIDE);
    expect(
      cancelSide({ kind: 'NotCancellable', trangThai: 'DaTiepDon' }),
    ).toEqual({
      ok: false,
      code: 'NotCancellable:DaTiepDon',
    });
    expect(cancelSide({ kind: 'AlreadyCancelled' })).toEqual({
      ok: false,
      code: 'AlreadyCancelled',
    });
  });

  it('sideOf: lỗi nghiệp vụ, 503, 1213, 1205 được ĐẾM và đổi thành Side; lỗi khác ném lại', async () => {
    const stats = new RaceStats();
    expect(await sideOf(stats, Promise.resolve(1))).toEqual(OK_SIDE);
    expect(
      await sideOf(
        stats,
        Promise.reject(new AppException(409, 'KHUNG_GIO_DA_DAT')),
      ),
    ).toEqual({ ok: false, code: 'KHUNG_GIO_DA_DAT' });
    expect(
      await sideOf(stats, Promise.reject(new AppException(503, BUSY_CODE))),
    ).toEqual({ ok: false, code: BUSY_CODE });
    expect(
      await sideOf(
        stats,
        Promise.reject(Object.assign(new Error('x'), { errno: 1213 })),
      ),
    ).toEqual({ ok: false, code: 'MYSQL_1213' });
    expect(
      await sideOf(
        stats,
        Promise.reject(Object.assign(new Error('x'), { errno: 1205 })),
      ),
    ).toEqual({ ok: false, code: 'MYSQL_1205' });
    expect(stats).toMatchObject({
      busy503: 1,
      surfaced1213: 1,
      surfaced1205: 1,
    });
    await expect(
      sideOf(stats, Promise.reject(new Error('lỗi lạ'))),
    ).rejects.toThrow('lỗi lạ');
  });
});

describe('finishX2 và totalRetries', () => {
  const retryLine =
    'reschedule-appointment: MySQL 1213 ở lần chạy 1/3, thử lại';
  const exhaustedLine =
    'reschedule-appointment: MySQL 1213 ở lần chạy 3/3, hết lượt thử lại';

  it('totalRetries cộng các lần thử lại, không tính dòng hết lượt', () => {
    expect(totalRetries([retryLine, retryLine, exhaustedLine, 'khác'])).toBe(2);
  });

  it('đạt khi mọi vòng qua settle, 0 lần 503, 0 lần 1213 và 1205 nổi, 0 thử lại', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const stats = new RaceStats();
    stats.settled = 3;
    expect(() => finishX2('T', 'ca', 3, { a: 3 }, [], stats)).not.toThrow();
    expect(info).toHaveBeenCalledTimes(2);
    info.mockRestore();
  });

  type Breakage = {
    name: string;
    mutate: (stats: RaceStats) => void;
    logLines: string[];
  };
  const breakages: Breakage[] = [
    {
      name: 'thiếu vòng qua settle',
      mutate: (s) => {
        s.settled = 2;
      },
      logLines: [],
    },
    {
      name: 'có 503',
      mutate: (s) => {
        s.busy503 = 1;
      },
      logLines: [],
    },
    {
      name: 'có 1213 nổi',
      mutate: (s) => {
        s.surfaced1213 = 1;
      },
      logLines: [],
    },
    {
      name: 'có 1205 nổi',
      mutate: (s) => {
        s.surfaced1205 = 1;
      },
      logLines: [],
    },
    { name: 'có thử lại', mutate: () => undefined, logLines: [retryLine] },
    {
      name: 'có hết lượt (503) trong log',
      mutate: () => undefined,
      logLines: [exhaustedLine],
    },
  ];
  it.each(breakages)('đỏ khi $name', ({ mutate, logLines }) => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const stats = new RaceStats();
    stats.settled = 3;
    mutate(stats);
    expect(() => finishX2('T', 'ca', 3, {}, logLines, stats)).toThrow();
    info.mockRestore();
  });

  it('cho phép 1213 nổi (surfacedAllowed) và thử lại (retriesAllowed) khi ca khai báo', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const stats = new RaceStats();
    stats.settled = 3;
    stats.surfaced1213 = 3;
    expect(() =>
      finishX2('T', 'ca', 3, {}, [retryLine], stats, {
        surfacedAllowed: true,
        retriesAllowed: true,
      }),
    ).not.toThrow();
    info.mockRestore();
  });
});
