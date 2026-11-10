import type { DataSource, EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { runReadOnly } from './read-only-tx.js';

// Test đơn vị của runReadOnly (booking P9: ROT-01…ROT-04). QueryRunner giả ghi lại thứ tự lời gọi nên không cần DB.
// ROT-05, ROT-06 (MySQL thật) ở read-only-tx.int-spec.ts.
const SET_READ_ONLY = 'query: SET TRANSACTION READ ONLY';
const START_REPEATABLE_READ = 'startTransaction: REPEATABLE READ';
// Các lời gọi mở giao dịch chỉ đọc, luôn đứng đầu và theo đúng thứ tự này
const OPEN = [
  'createQueryRunner',
  'connect',
  SET_READ_ONLY,
  START_REPEATABLE_READ,
];

interface FakeDb {
  db: DataSource;
  manager: EntityManager;
  /** Tên các lời gọi theo đúng thứ tự xảy ra */
  calls: string[];
}

/** DataSource giả; `failAt.call` là tên lời gọi sẽ bị từ chối (tên vẫn được ghi vào `calls` trước khi từ chối). */
function fakeDb(failAt?: { call: string; error: Error }): FakeDb {
  const calls: string[] = [];
  const manager = {} as EntityManager;
  const record = (call: string): Promise<void> => {
    calls.push(call);
    return failAt?.call === call
      ? Promise.reject(failAt.error)
      : Promise.resolve();
  };
  const runner = {
    manager,
    connect: () => record('connect'),
    query: (sql: string) => record(`query: ${sql}`),
    startTransaction: (level: string) => record(`startTransaction: ${level}`),
    commitTransaction: () => record('commit'),
    rollbackTransaction: () => record('rollback'),
    release: () => record('release'),
  };
  const db = {
    createQueryRunner: () => {
      calls.push('createQueryRunner');
      return runner;
    },
  } as unknown as DataSource;
  return { db, manager, calls };
}

describe('runReadOnly (booking P9, đơn vị)', () => {
  it('ROT-01: thành công — mở giao dịch chỉ đọc REPEATABLE READ, chạy work, commit, trả kết nối, trả đúng giá trị', async () => {
    const { db, manager, calls } = fakeDb();
    const received: EntityManager[] = [];

    const result = await runReadOnly(db, (m) => {
      calls.push('work');
      received.push(m);
      return Promise.resolve('kết quả của work');
    });

    expect(result).toBe('kết quả của work');
    expect(calls).toEqual([...OPEN, 'work', 'commit', 'release']);
    expect(received).toHaveLength(1);
    expect(received[0]).toBe(manager);
  });

  it('ROT-02: work ném lỗi — rollback (không commit), trả kết nối, ném lại đúng lỗi đó', async () => {
    const { db, calls } = fakeDb();
    const boom = new Error('work hỏng');

    await expect(
      runReadOnly(db, () => {
        calls.push('work');
        return Promise.reject(boom);
      }),
    ).rejects.toBe(boom);

    expect(calls).toEqual([...OPEN, 'work', 'rollback', 'release']);
  });

  it('ROT-03: lỗi ở bước mở giao dịch (SET TRANSACTION, startTransaction) — work không chạy, không commit, vẫn trả kết nối', async () => {
    for (const call of [SET_READ_ONLY, START_REPEATABLE_READ]) {
      const boom = new Error(`hỏng ở ${call}`);
      const { db, calls } = fakeDb({ call, error: boom });
      const work = vi.fn(() => Promise.resolve('không được chạy'));

      await expect(runReadOnly(db, work)).rejects.toBe(boom);

      expect(work, call).not.toHaveBeenCalled();
      expect(calls, call).not.toContain('commit');
      expect(
        calls.filter((c) => c === 'release'),
        call,
      ).toHaveLength(1);
    }
  });

  it('ROT-04: commit ném lỗi — vẫn rollback, trả kết nối, ném lại đúng lỗi của commit', async () => {
    const boom = new Error('commit hỏng');
    const { db, calls } = fakeDb({ call: 'commit', error: boom });

    await expect(
      runReadOnly(db, () => {
        calls.push('work');
        return Promise.resolve(1);
      }),
    ).rejects.toBe(boom);

    expect(calls).toEqual([...OPEN, 'work', 'commit', 'rollback', 'release']);
  });
});
