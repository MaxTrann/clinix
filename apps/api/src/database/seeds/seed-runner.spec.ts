import type { DataSource } from 'typeorm';
import { seedTransaction } from './seed-runner.js';

// SD-01/04: regression cho kiểu expression BIGINT và cleanup trong mọi nhánh lỗi.
function setup(acquired: number | string | null = '1') {
  const runner = {
    manager: {},
    isTransactionActive: false,
    connect: vi.fn().mockResolvedValue(undefined),
    query: vi
      .fn()
      .mockResolvedValueOnce([{ acquired }])
      .mockResolvedValueOnce([{ released: '1' }]),
    startTransaction: vi.fn(async () => {
      runner.isTransactionActive = true;
    }),
    commitTransaction: vi.fn(async () => {
      runner.isTransactionActive = false;
    }),
    rollbackTransaction: vi.fn(async () => {
      runner.isTransactionActive = false;
    }),
    release: vi.fn().mockResolvedValue(undefined),
  };
  const db = {
    options: { database: 'sample_test' },
    createQueryRunner: () => runner,
  } as unknown as DataSource;
  return { db, runner };
}

describe('C5 SD-01/04 — lifecycle named lock/transaction', () => {
  it.each([1, '1'])(
    'SD-01 kết quả khóa %s được coi là thành công, unlock sau commit',
    async (value) => {
      const { db, runner } = setup(value);
      expect(await seedTransaction(db, async () => 42)).toBe(42);
      expect(runner.commitTransaction).toHaveBeenCalledOnce();
      expect(runner.query.mock.invocationCallOrder[1]!).toBeGreaterThan(
        runner.commitTransaction.mock.invocationCallOrder[0]!,
      );
      expect(runner.release).toHaveBeenCalledOnce();
    },
  );
  it.each([0, '0', null])(
    'SD-01 timeout/error khóa %s không mở transaction/callback',
    async (value) => {
      const { db, runner } = setup(value);
      const work = vi.fn();
      await expect(seedTransaction(db, work)).rejects.toThrow(
        'SEED_LOCK_UNAVAILABLE',
      );
      expect(work).not.toHaveBeenCalled();
      expect(runner.startTransaction).not.toHaveBeenCalled();
      expect(runner.query).toHaveBeenCalledOnce();
      expect(runner.release).toHaveBeenCalledOnce();
    },
  );
  it('SD-04 callback lỗi rollback trước unlock và release', async () => {
    const { db, runner } = setup();
    await expect(
      seedTransaction(db, async () => {
        throw new Error('test failure');
      }),
    ).rejects.toThrow('test failure');
    expect(runner.rollbackTransaction).toHaveBeenCalledOnce();
    expect(runner.commitTransaction).not.toHaveBeenCalled();
    expect(runner.query.mock.invocationCallOrder[1]!).toBeGreaterThan(
      runner.rollbackTransaction.mock.invocationCallOrder[0]!,
    );
    expect(runner.release).toHaveBeenCalledOnce();
  });
  it('SD-04 lỗi mở transaction vẫn nhả named lock', async () => {
    const { db, runner } = setup();
    runner.startTransaction.mockRejectedValueOnce(new Error('test failure'));
    await expect(seedTransaction(db, vi.fn())).rejects.toThrow('test failure');
    expect(runner.query).toHaveBeenCalledTimes(2);
    expect(runner.release).toHaveBeenCalledOnce();
  });
  it('SD-04 unlock lỗi vẫn release QueryRunner và không báo thành công', async () => {
    const { db, runner } = setup();
    runner.query
      .mockReset()
      .mockResolvedValueOnce([{ acquired: '1' }])
      .mockResolvedValueOnce([{ released: null }]);
    await expect(seedTransaction(db, async () => undefined)).rejects.toThrow(
      'SEED_LOCK_RELEASE_FAILED',
    );
    expect(runner.release).toHaveBeenCalledOnce();
  });
});
