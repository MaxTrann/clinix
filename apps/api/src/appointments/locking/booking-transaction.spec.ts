import { HttpException, Logger } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { AppException } from '../../common/errors/app.exception.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import {
  BOOKING_TX_ISOLATION,
  BOOKING_TX_MAX_RETRIES,
  withBookingTransaction,
} from './booking-transaction.js';

// Task P1 — BTX-01…BTX-09 (PLAN booking 7.17; TRACKING 3.3 P1-E): `withBookingTransaction` với DataSource GIẢ và lỗi lập trình sẵn. Ca MySQL thật
// (READ COMMITTED bằng hành vi, 1213 thật) là BTX-10, BTX-11 ở booking-transaction.int-spec.ts.
class FakeDb {
  readonly levels: string[] = [];
  readonly managers: EntityManager[] = [];
  rollbacks = 0;
  /** Lỗi ném ra SAU khi `work` đã trả (tức lúc COMMIT), mỗi lần mở giao dịch lấy một phần tử */
  readonly commitFailures: unknown[] = [];

  async transaction<T>(
    level: string,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    this.levels.push(level);
    const manager = { run: this.levels.length } as unknown as EntityManager;
    this.managers.push(manager);
    let result: T;
    try {
      result = await work(manager);
    } catch (error) {
      this.rollbacks += 1;
      throw error;
    }
    const failure = this.commitFailures.shift();
    if (failure !== undefined) {
      this.rollbacks += 1;
      throw failure;
    }
    return result;
  }
}

const mysqlError = (errno: number) =>
  Object.assign(new Error('Deadlock found when trying to get lock'), {
    errno,
    code: errno === 1213 ? 'ER_LOCK_DEADLOCK' : 'ER_LOCK_WAIT_TIMEOUT',
  });

function setup() {
  const db = new FakeDb();
  const warn = vi.fn<(message: string) => void>();
  const run = <T>(work: (manager: EntityManager) => Promise<T>) =>
    withBookingTransaction(db as unknown as DataSource, work, {
      label: 'test-flow',
      logger: { warn },
    });
  return { db, warn, run };
}

describe('BTX-01 chạy thành công', () => {
  it('mở đúng MỘT giao dịch READ COMMITTED tường minh, work chạy một lần, trả đúng giá trị, không rollback', async () => {
    const { db, warn, run } = setup();
    const work = vi.fn().mockResolvedValue({ kind: 'ok', value: 7 });
    await expect(run(work)).resolves.toEqual({ kind: 'ok', value: 7 });
    expect(db.levels).toEqual(['READ COMMITTED']);
    expect(work).toHaveBeenCalledTimes(1);
    expect(work).toHaveBeenCalledWith(db.managers[0]);
    expect(db.rollbacks).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it('hằng Q42 TẠM: READ COMMITTED và 2 lần thử lại (tổng 3 lần chạy)', () => {
    expect(BOOKING_TX_ISOLATION).toBe('READ COMMITTED');
    expect(BOOKING_TX_MAX_RETRIES).toBe(2);
  });
});

describe.each([
  ['BTX-02', 1213],
  ['BTX-03', 1205],
])('%s work ném %i một lần rồi thành công', (_id, errno) => {
  it('thử lại: work chạy 2 lần, mỗi lần với EntityManager MỚI, lần đầu bị rollback, trả giá trị lần hai, ghi một cảnh báo', async () => {
    const { db, warn, run } = setup();
    const seen: EntityManager[] = [];
    let calls = 0;
    const result = await run((manager) => {
      seen.push(manager);
      calls += 1;
      if (calls === 1) throw mysqlError(errno);
      return Promise.resolve(`lần ${String(calls)}`);
    });
    expect(result).toBe('lần 2');
    expect(db.levels).toEqual(['READ COMMITTED', 'READ COMMITTED']);
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
    expect(db.rollbacks).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('BTX-04 hết lượt thử lại', () => {
  it.each([1213, 1205])(
    'lỗi %i cả ba lần ⇒ đúng 3 lần chạy rồi AppException 503 HE_THONG_DANG_BAN, không gắn cause, 3 rollback',
    async (errno) => {
      const { db, warn, run } = setup();
      const work = vi.fn().mockRejectedValue(mysqlError(errno));
      const error = await run(work).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AppException);
      const exception = error as AppException;
      expect(exception.getStatus()).toBe(503);
      expect(exception.maLoi).toBe(BOOKING_ERROR_CODES.SYSTEM_BUSY);
      expect(exception.cause).toBeUndefined();
      expect(work).toHaveBeenCalledTimes(3);
      expect(db.levels).toHaveLength(3);
      expect(db.rollbacks).toBe(3);
      expect(warn).toHaveBeenCalledTimes(3);
    },
  );

  it('lỗi 1213 rồi 1205 rồi 1213 (xen kẽ) vẫn tính chung một lượt thử lại', async () => {
    const { run } = setup();
    const errors = [1213, 1205, 1213];
    const work = vi.fn().mockImplementation(() => {
      throw mysqlError(errors.shift() ?? 1213);
    });
    await expect(run(work)).rejects.toMatchObject({
      maLoi: 'HE_THONG_DANG_BAN',
    });
    expect(work).toHaveBeenCalledTimes(3);
  });
});

describe('BTX-05 lỗi khác không thử lại', () => {
  const unique = Object.assign(new Error('Duplicate entry'), {
    errno: 1062,
    code: 'ER_DUP_ENTRY',
  });
  const foreignKey = Object.assign(new Error('FK'), {
    errno: 1451,
    code: 'ER_ROW_IS_REFERENCED_2',
  });

  it.each([
    ['1062 trùng khoá', unique],
    ['1451 khoá ngoại', foreignKey],
    ['AppException nghiệp vụ', new AppException(409, 'KHUNG_GIO_DA_DAT')],
    ['HttpException', new HttpException('x', 400)],
    ['Error thường', new Error('lỗi lập trình')],
  ])(
    '%s: work đúng 1 lần, rollback, ném lại NGUYÊN lỗi (cùng đối tượng), không cảnh báo',
    async (_name, failure) => {
      const { db, warn, run } = setup();
      const work = vi.fn().mockRejectedValue(failure);
      await expect(run(work)).rejects.toBe(failure);
      expect(work).toHaveBeenCalledTimes(1);
      expect(db.rollbacks).toBe(1);
      expect(warn).not.toHaveBeenCalled();
    },
  );
});

describe('BTX-06 lỗi LÚC COMMIT không bao giờ thử lại', () => {
  it.each([1213, 1205])(
    '%i ném SAU khi work đã trả ⇒ work đúng 1 lần, lỗi đi nguyên ra ngoài',
    async (errno) => {
      const { db, warn, run } = setup();
      const failure = mysqlError(errno);
      db.commitFailures.push(failure);
      const work = vi.fn().mockResolvedValue('đã làm xong');
      await expect(run(work)).rejects.toBe(failure);
      expect(work).toHaveBeenCalledTimes(1);
      expect(db.levels).toHaveLength(1);
      expect(warn).not.toHaveBeenCalled();
    },
  );
});

describe('BTX-07 kết quả "từ chối" có kiểu vẫn commit', () => {
  it('work trả kết quả từ chối (không phải lỗi) ⇒ không rollback, hàm trả nguyên kết quả', async () => {
    const { db, run } = setup();
    const refused = { kind: 'refused', reason: 'KHUNG_GIO_DA_DAT' } as const;
    await expect(run(() => Promise.resolve(refused))).resolves.toBe(refused);
    expect(db.rollbacks).toBe(0);
    expect(db.levels).toHaveLength(1);
  });
});

describe('BTX-08 cảnh báo mỗi lần thử lại', () => {
  it('có label, số lần và errno; KHÔNG chứa thông điệp hay tham số của lỗi gốc; lần cuối ghi "hết lượt"', async () => {
    const { warn, run } = setup();
    const leaky = Object.assign(
      new Error("Deadlock; params: ['nguoi.dung@example.com', 'bi-mat-123']"),
      { errno: 1213, sql: "UPDATE benh_nhan SET so_dien_thoai = '0900000000'" },
    );
    await run(() => Promise.reject(leaky)).catch(() => undefined);
    const messages = warn.mock.calls.map(([message]) => message);
    expect(messages).toHaveLength(3);
    expect(messages[0]).toContain('test-flow');
    expect(messages[0]).toContain('1213');
    expect(messages[0]).toContain('1/3');
    expect(messages[0]).toContain('thử lại');
    expect(messages[2]).toContain('3/3');
    expect(messages[2]).toContain('hết lượt');
    for (const message of messages) {
      expect(message).not.toContain('nguoi.dung');
      expect(message).not.toContain('bi-mat');
      expect(message).not.toContain('benh_nhan');
      expect(message).not.toContain('0900000000');
    }
  });

  it('không truyền logger thì dùng Logger của Nest (không ném lỗi)', async () => {
    const spy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const db = new FakeDb();
    let calls = 0;
    const result = await withBookingTransaction(
      db as unknown as DataSource,
      () => {
        calls += 1;
        if (calls === 1) throw mysqlError(1213);
        return Promise.resolve('xong');
      },
      { label: 'mặc-định' },
    );
    expect(result).toBe('xong');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('BTX-09 lỗi bọc kiểu TypeORM', () => {
  it.each([
    ['driverError.errno 1213', { driverError: { errno: 1213 } }],
    ['driverError.errno 1205', { driverError: { errno: 1205 } }],
    [
      'driverError.code ER_LOCK_DEADLOCK',
      { driverError: { code: 'ER_LOCK_DEADLOCK' } },
    ],
    [
      'driverError.code ER_LOCK_WAIT_TIMEOUT',
      { driverError: { code: 'ER_LOCK_WAIT_TIMEOUT' } },
    ],
  ])('%s vẫn được nhận ra và thử lại', async (_name, shape) => {
    const { run } = setup();
    let calls = 0;
    const result = await run(() => {
      calls += 1;
      if (calls === 1)
        throw Object.assign(new Error('QueryFailedError'), shape);
      return Promise.resolve('xong');
    });
    expect(result).toBe('xong');
    expect(calls).toBe(2);
  });

  it('lỗi có errno khác (1062 bọc trong driverError) không bị nhầm là tranh chấp', async () => {
    const { run } = setup();
    const failure = Object.assign(new Error('QueryFailedError'), {
      driverError: { errno: 1062 },
    });
    await expect(run(() => Promise.reject(failure))).rejects.toBe(failure);
  });
});
