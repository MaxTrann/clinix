import { vi } from 'vitest';
import { allLines, captureLogsByLevel } from '../../auth/testing/log-levels.js';
import { EmailOutboxJob } from './email-outbox.job.js';
import type {
  EmailOutboxService,
  EmailOutboxSummary,
} from './email-outbox.service.js';
import {
  EMAIL_OUTBOX_CRON,
  EMAIL_OUTBOX_JOB_NAME,
} from './notifications.constants.js';

// Task B15 — job gửi thư, phần ĐƠN VỊ (PLAN booking 5.12, 7.43; TRACKING 3.37 B15-H): OBX-09 (tắt ở NODE_ENV=test, `run` không bao giờ ném, một mốc `now`, chống chạy chồng, log không dữ liệu cá nhân; TB-05, TB-08). `sweep` giả
// (nghiệp vụ gửi thật do email-outbox.int-spec.ts kiểm trên MySQL thật).
const NOW = new Date('2026-11-02T09:15:00.789+07:00');
const SECRET = 'bi.mat@example.test';

function fixture(
  sweep: (now: Date, summary: EmailOutboxSummary) => Promise<void> = () =>
    Promise.resolve(),
) {
  const fn = vi.fn(sweep);
  const job = new EmailOutboxJob({
    sweep: fn,
  } as unknown as EmailOutboxService);
  return { job, sweep: fn, logs: captureLogsByLevel() };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OBX-09 run: một mốc now (cắt xuống giây), kết quả là tổng kết của lượt', () => {
  it('truyền `now` đã cắt mili giây cho sweep; không có đối số thì lấy đồng hồ', async () => {
    const { job, sweep } = fixture();
    await job.run(NOW);
    expect(sweep.mock.calls[0]?.[0]).toEqual(
      new Date('2026-11-02T09:15:00.000+07:00'),
    );
    await job.run();
    expect(sweep.mock.calls[1]?.[0]).toBeInstanceOf(Date);
  });

  it('đối số lạ do thư viện cron truyền vào (không phải Date) KHÔNG thành mốc rác', async () => {
    const { job, sweep } = fixture();
    await job.run({ onComplete: 1 } as unknown as Date);
    const used = sweep.mock.calls[0]?.[0];
    expect(used).toBeInstanceOf(Date);
    expect(Number.isNaN((used as Date).getTime())).toBe(false);
  });

  it('trả đúng tổng kết sweep ghi vào; log tóm tắt chỉ có số lượng', async () => {
    const { job, logs } = fixture((_now, summary) => {
      summary.sent = 3;
      summary.failed = 1;
      summary.lostClaim = 2;
      summary.more = true;
      return Promise.resolve();
    });
    await expect(job.run(NOW)).resolves.toEqual({
      sent: 3,
      failed: 1,
      lostClaim: 2,
      notConfigured: false,
      more: true,
    });
    expect(logs.log).toEqual([
      'Gửi thư: đã gửi 3, lỗi 1, bên khác nhận trước 2; còn thư chờ lượt sau',
    ]);
  });

  it('lượt rỗng chỉ ghi ở mức debug; chưa cấu hình SMTP thì không ghi dòng "không có thư"', async () => {
    const empty = fixture();
    await empty.job.run(NOW);
    expect(empty.logs.log).toEqual([]);
    expect(empty.logs.debug).toHaveLength(1);
    const unconfigured = fixture((_now, summary) => {
      summary.notConfigured = true;
      return Promise.resolve();
    });
    await unconfigured.job.run(NOW);
    expect(unconfigured.logs.debug).toEqual([]);
  });
});

describe('OBX-09 run KHÔNG BAO GIỜ ném và không để lọt dữ liệu cá nhân vào log (H12, TB-05)', () => {
  it('lỗi hệ thống của sweep (DB sập, lỗi lạ có địa chỉ trong message): nuốt, ghi ERROR chỉ có TÊN lớp lỗi', async () => {
    const { job, logs } = fixture(() =>
      Promise.reject(new TypeError(`không gửi được tới ${SECRET}`)),
    );
    await expect(job.run(NOW)).resolves.toMatchObject({ sent: 0 });
    expect(logs.error).toEqual([
      'Gửi thư: lượt bị dừng vì lỗi hệ thống (TypeError)',
    ]);
    expect(allLines(logs).join('\n')).not.toContain(SECRET);
  });

  it('lỗi không phải Error (chuỗi, null): vẫn không ném và ghi tên loại cố định', async () => {
    const { job, logs } = fixture(() => Promise.reject(SECRET));
    await expect(job.run(NOW)).resolves.toBeDefined();
    expect(logs.error).toEqual([
      'Gửi thư: lượt bị dừng vì lỗi hệ thống (UNKNOWN)',
    ]);
  });
});

describe('OBX-09 chống chạy chồng trong cùng tiến trình', () => {
  it('lượt đang chạy thì lượt sau bị bỏ qua (undefined), cờ nhả sau khi xong; lỗi cũng nhả cờ', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { job, sweep, logs } = fixture(() => gate);
    const first = job.run(NOW);
    await expect(job.run(NOW)).resolves.toBeUndefined();
    expect(logs.warn).toEqual([
      'Lượt gửi thư trước vẫn đang chạy: bỏ qua lượt này',
    ]);
    release();
    await first;
    expect(sweep).toHaveBeenCalledTimes(1);
    await expect(job.run(NOW)).resolves.toBeDefined();
    expect(sweep).toHaveBeenCalledTimes(2);

    const failing = fixture(() => Promise.reject(new Error('hỏng')));
    await failing.job.run(NOW);
    await failing.job.run(NOW);
    expect(failing.sweep).toHaveBeenCalledTimes(2);
  });
});

// Lịch: `@Cron` lưu cấu hình thành metadata trên hàm; `disabled` được tính LÚC NẠP MODULE từ NODE_ENV nên phải nạp lại module cho từng giá trị (nếp A7, HG-09).
describe('OBX-09 lịch chạy: TẮT ở NODE_ENV=test, không bao giờ có thư thật trong test (TB-08)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function cronOptionsUnder(nodeEnv: string | undefined) {
    vi.stubEnv('NODE_ENV', nodeEnv);
    vi.resetModules();
    const fresh = await import('./email-outbox.job.js');
    const run: unknown = Reflect.get(fresh.EmailOutboxJob.prototype, 'run');
    return Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', run as object) as {
      name: string;
      cronTime: string;
      disabled: boolean;
    };
  }

  it.each([
    ['development', false],
    ['staging', false],
    ['production', false],
    [undefined, false],
    ['test', true],
  ])('NODE_ENV=%s: job tắt = %s', async (nodeEnv, disabled) => {
    expect((await cronOptionsUnder(nodeEnv)).disabled).toBe(disabled);
  });

  it('đăng ký đúng tên và biểu thức (mỗi phút vào giây 5, cron 6 trường)', async () => {
    const options = await cronOptionsUnder('production');
    expect(options.name).toBe(EMAIL_OUTBOX_JOB_NAME);
    expect(options.cronTime).toBe(EMAIL_OUTBOX_CRON);
    expect(EMAIL_OUTBOX_CRON).toBe('5 * * * * *');
  });
});
