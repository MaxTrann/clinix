import { Logger } from '@nestjs/common';
import { vi } from 'vitest';
import {
  LEAVE_SWEEPER_BATCH_SIZE,
  LEAVE_SWEEPER_CRON,
  LEAVE_SWEEPER_JOB_NAME,
  LEAVE_SWEEPER_MAX_BATCHES,
} from './admin-leave.constants.js';
import type {
  AdminLeaveRepository,
  ApprovedLeaveRow,
} from './admin-leave.repository.js';
import type {
  ApprovedLeave,
  CancellationSummary,
  LeaveCancellationRunner,
} from './leave-cancellation.runner.js';
import { LeaveCancellationSweeper } from './leave-cancellation.sweeper.job.js';

// Doctor B16 — sweeper ở mức ĐƠN VỊ với repository và runner giả: PD-12 (lô, trần lô, con trỏ, lỗi một yêu cầu không dừng lượt, chống chạy chồng, log chỉ có số đếm), BD-05 (job tắt ở NODE_ENV=test).
// Phần MySQL thật + booking thật (PD-11, PD-12 truy vấn, PD-13, DH-07, DH-11, IV-05): leave-cancellation.sweeper.int-spec.ts.

const NOW = new Date('2026-11-02T01:00:00.000Z'); // 08:00 ngày 02/11/2026 giờ VN
const EMPTY: CancellationSummary = {
  hoanTat: true,
  daHuy: 0,
  daHuyTruocDo: 0,
  khongHuyDuoc: [],
};

const rowOf = (id: number): ApprovedLeaveRow => ({
  yeuCauNghiPhepId: String(id),
  bacSiId: '7',
  tuNgay: '2026-11-10',
  denNgay: '2026-11-10',
  ca: null,
});

/** Repository giả có `total` yêu cầu, trả theo con trỏ như SQL thật (id tăng dần, `id > after`, tối đa `limit`). */
function fakeRepository(total: number) {
  const calls: { today: string; after: string | null; limit: number }[] = [];
  const repository = {
    manager: () => ({}),
    findApprovedActive: async (
      _em: unknown,
      input: { today: string; after: string | null; limit: number },
    ) => {
      calls.push(input);
      const after = Number(input.after ?? 0);
      const rows: ApprovedLeaveRow[] = [];
      for (let id = after + 1; id <= total && rows.length < input.limit; id++)
        rows.push(rowOf(id));
      return rows;
    },
  };
  return { repository, calls };
}

function build(
  total: number,
  run: (leave: ApprovedLeave, now: Date) => Promise<CancellationSummary>,
) {
  const { repository, calls } = fakeRepository(total);
  const runner = { run: vi.fn(run) };
  const sweeper = new LeaveCancellationSweeper(
    { manager: {} } as never,
    repository as unknown as AdminLeaveRepository,
    runner as unknown as LeaveCancellationRunner,
  );
  return { sweeper, runner, calls };
}

describe('LeaveCancellationSweeper (repository và runner giả)', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('BD-05 @Cron đúng tên và biểu thức, và TẮT ở NODE_ENV=test', () => {
    expect(process.env.NODE_ENV).toBe('test');
    const run: unknown = Reflect.get(LeaveCancellationSweeper.prototype, 'run');
    const options = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      run as object,
    ) as { name: string; cronTime: string; disabled: boolean };
    expect(options).toMatchObject({
      name: LEAVE_SWEEPER_JOB_NAME,
      cronTime: LEAVE_SWEEPER_CRON,
      disabled: true,
    });
  });

  it('PD-12 mỗi yêu cầu chạy MỘT lần với đúng khoảng nghỉ và MỘT mốc now cho cả lượt; "hôm nay" theo giờ VN', async () => {
    const { sweeper, runner, calls } = build(3, async () => EMPTY);
    const summary = await sweeper.run(NOW);
    expect(runner.run).toHaveBeenCalledTimes(3);
    for (const [leave, now] of runner.run.mock.calls) {
      expect(leave).toEqual({
        bacSiId: '7',
        tuNgay: '2026-11-10',
        denNgay: '2026-11-10',
        ca: null,
      });
      expect(now).toEqual(NOW);
    }
    expect(calls[0]?.today).toBe('2026-11-02');
    expect(summary).toEqual({
      requests: 3,
      daHuy: 0,
      daHuyTruocDo: 0,
      khongHuyDuoc: 0,
      chuaHoanTat: 0,
      more: false,
    });
  });

  it('PD-12 mốc 17:30 UTC đã sang ngày hôm sau theo giờ VN: today là ngày VN, không phải ngày UTC', async () => {
    const { sweeper, calls } = build(0, async () => EMPTY);
    await sweeper.run(new Date('2026-11-02T17:30:00.000Z'));
    expect(calls[0]?.today).toBe('2026-11-03');
  });

  it('PD-12 cộng dồn số đếm của mọi yêu cầu và đếm yêu cầu chưa hoàn tất', async () => {
    const { sweeper } = build(3, async (leave) =>
      leave.bacSiId === '7'
        ? {
            hoanTat: true,
            daHuy: 2,
            daHuyTruocDo: 1,
            khongHuyDuoc: [{ maLichHen: 'X', trangThai: 'DaTiepDon' }],
          }
        : EMPTY,
    );
    const summary = await sweeper.run(NOW);
    expect(summary).toMatchObject({
      requests: 3,
      daHuy: 6,
      daHuyTruocDo: 3,
      khongHuyDuoc: 3,
    });
  });

  it('PD-12 lô và trần: đúng 5 lô × 50 thì dừng và more = true; con trỏ đi tiếp từ hàng cuối của lô trước', async () => {
    const total = LEAVE_SWEEPER_BATCH_SIZE * LEAVE_SWEEPER_MAX_BATCHES + 10;
    const { sweeper, runner, calls } = build(total, async () => EMPTY);
    const summary = await sweeper.run(NOW);
    expect(calls).toHaveLength(LEAVE_SWEEPER_MAX_BATCHES);
    expect(calls.map((c) => c.after)).toEqual([
      null,
      '50',
      '100',
      '150',
      '200',
    ]);
    expect(runner.run).toHaveBeenCalledTimes(250);
    expect(summary).toMatchObject({ requests: 250, more: true });
  });

  it('PD-12 biên: đúng 250 yêu cầu (vừa trần) thì lô cuối đầy nên vẫn báo more = true; 249 thì more = false', async () => {
    const full = await build(250, async () => EMPTY).sweeper.run(NOW);
    expect(full?.more).toBe(true);
    const under = await build(249, async () => EMPTY).sweeper.run(NOW);
    expect(under).toMatchObject({ requests: 249, more: false });
  });

  it('PD-12 một yêu cầu hoanTat = false hay ném lỗi KHÔNG dừng lượt: các yêu cầu sau vẫn chạy, được đếm là chưa hoàn tất', async () => {
    let n = 0;
    const { sweeper, runner } = build(4, async () => {
      n += 1;
      if (n === 1) return { ...EMPTY, hoanTat: false };
      if (n === 2) throw new Error('vi phạm hợp đồng');
      return EMPTY;
    });
    const summary = await sweeper.run(NOW);
    expect(runner.run).toHaveBeenCalledTimes(4);
    expect(summary).toMatchObject({ requests: 4, chuaHoanTat: 2 });
  });

  it('PD-12 điều kiện dừng: không có yêu cầu nào (qua ngay_ket_thuc hay không DaDuyet) thì không gọi runner', async () => {
    const { sweeper, runner } = build(0, async () => EMPTY);
    expect(await sweeper.run(NOW)).toMatchObject({ requests: 0, more: false });
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('PD-12 repository ném lỗi: run KHÔNG ném (framework sẽ log nguyên lỗi), log chỉ có tên lớp lỗi, cờ running được nhả', async () => {
    const error = vi.spyOn(Logger.prototype, 'error');
    const { sweeper, runner } = build(1, async () => EMPTY);
    const boom = new Error('mật khẩu=hunter2 Nguyễn Văn A');
    (
      sweeper as unknown as { repository: { findApprovedActive: unknown } }
    ).repository.findApprovedActive = async () => {
      throw boom;
    };
    await expect(sweeper.run(NOW)).resolves.toMatchObject({ requests: 0 });
    const message = String(error.mock.calls[0]?.[0]);
    expect(message).toContain('Error');
    expect(message).not.toContain('hunter2');
    expect(message).not.toContain('Nguyễn');
    // Lượt sau chạy được (cờ running đã nhả)
    (
      sweeper as unknown as { repository: { findApprovedActive: unknown } }
    ).repository.findApprovedActive = async () => [];
    await expect(sweeper.run(NOW)).resolves.toBeDefined();
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('PD-12 chống chạy chồng: lượt trước còn chạy thì lượt này bị bỏ qua (undefined) và không gọi runner thêm', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { sweeper, runner } = build(1, async () => {
      await gate;
      return EMPTY;
    });
    const first = sweeper.run(NOW);
    await vi.waitFor(() => expect(runner.run).toHaveBeenCalledTimes(1));
    await expect(sweeper.run(NOW)).resolves.toBeUndefined();
    release();
    await expect(first).resolves.toMatchObject({ requests: 1 });
    expect(runner.run).toHaveBeenCalledTimes(1);
  });

  it('PD-12 bộ lập lịch gọi run kèm đối số lạ (không phải Date): lấy đồng hồ ứng dụng, không dùng đối số lạ làm mốc', async () => {
    const { sweeper, runner } = build(1, async () => EMPTY);
    await sweeper.run(undefined);
    await sweeper.run('not-a-date' as unknown as Date);
    expect(runner.run.mock.calls).toHaveLength(2);
    for (const [, now] of runner.run.mock.calls) {
      expect(now).toBeInstanceOf(Date);
      expect(Number.isNaN(now.getTime())).toBe(false);
    }
  });

  it('PD-12 log chỉ có số đếm: không mã lịch hẹn, tên hay lý do', async () => {
    const log = vi.spyOn(Logger.prototype, 'log');
    const { sweeper } = build(1, async () => ({
      hoanTat: true,
      daHuy: 1,
      daHuyTruocDo: 0,
      khongHuyDuoc: [
        { maLichHen: 'CLX-20261110-ABCDE', trangThai: 'DaTiepDon' },
      ],
    }));
    await sweeper.run(NOW);
    const message = String(log.mock.calls.at(-1)?.[0]);
    expect(message).toContain('1 yêu cầu');
    expect(message).not.toContain('CLX');
  });
});
