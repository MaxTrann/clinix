import { vi } from 'vitest';
import { allLines, captureLogsByLevel } from '../../auth/testing/log-levels.js';
import { MailSendError } from '../../mail/mail-send.error.js';
import { AppointmentReminderJob } from './appointment-reminder.job.js';
import {
  reminderFailureText,
  ReminderDataError,
  type AppointmentReminderService,
  type ReminderSummary,
} from './appointment-reminder.service.js';

// notification B3 — vỏ job nhắc lịch, phần ĐƠN VỊ (nếp OBX-09 của `EmailOutboxJob`): NLH-22 (một mốc `now` cắt xuống giây, chỉ nhận `now` khi là `Date`, `run` không bao giờ ném, chống chạy chồng),
// BTB-01 (log chỉ số lượng và loại lỗi). `sweep` giả; nghiệp vụ thật ở appointment-reminder.int-spec.ts. Phần "tắt ở NODE_ENV=test" kiểm trên AppModule thật ở test/notification-reminder.e2e-spec.ts.
const NOW = new Date('2026-11-09T08:00:00.789+07:00');
const SECRET = 'bi.mat@example.test';

function fixture(
  sweep: (now: Date, summary: ReminderSummary) => Promise<void> = () =>
    Promise.resolve(),
) {
  const fn = vi.fn(sweep);
  const job = new AppointmentReminderJob({
    sweep: fn,
  } as unknown as AppointmentReminderService);
  return { job, sweep: fn, logs: captureLogsByLevel() };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NLH-22 run: một mốc now và tổng kết', () => {
  it('truyền `now` đã cắt mili giây; không đối số thì lấy đồng hồ; đối số lạ của thư viện cron không thành mốc rác', async () => {
    const { job, sweep } = fixture();
    await job.run(NOW);
    expect(sweep.mock.calls[0]?.[0]).toEqual(
      new Date('2026-11-09T08:00:00.000+07:00'),
    );
    await job.run();
    await job.run({ onComplete: 1 } as unknown as Date);
    for (const call of sweep.mock.calls.slice(1)) {
      expect(call[0]).toBeInstanceOf(Date);
      expect(Number.isNaN(call[0].getTime())).toBe(false);
    }
  });

  it('log tổng kết CHỈ có số lượng; lượt rỗng không ghi mức log', async () => {
    const { job, logs } = fixture((_now, s) => {
      s.created = 4;
      s.sent = 2;
      s.failed = 1;
      s.lostClaim = 1;
      s.dropped = 1;
      s.more = true;
      return Promise.resolve();
    });
    await expect(job.run(NOW)).resolves.toMatchObject({ created: 4, sent: 2 });
    expect(logs.log).toEqual([
      'Nhắc lịch: tạo 4, gửi 2, lỗi 1, bên khác nhận trước 1, bỏ vì lịch đổi 1; còn mốc chờ lượt sau',
    ]);
    const empty = fixture();
    await empty.job.run(NOW);
    expect(empty.logs.log).toEqual([]);
  });
});

describe('NLH-22, BTB-01 run KHÔNG BAO GIỜ ném; log không có dữ liệu cá nhân', () => {
  it('lỗi hệ thống có địa chỉ trong message: nuốt, ERROR chỉ có TÊN lớp lỗi', async () => {
    const { job, logs } = fixture(() =>
      Promise.reject(new TypeError(`không gửi được tới ${SECRET}`)),
    );
    await expect(job.run(NOW)).resolves.toMatchObject({ sent: 0 });
    expect(logs.error).toEqual([
      'Nhắc lịch: lượt bị dừng vì lỗi hệ thống (TypeError)',
    ]);
    expect(allLines(logs).join('\n')).not.toContain(SECRET);
  });

  it('lỗi không phải Error: vẫn không ném, ghi UNKNOWN', async () => {
    const { job, logs } = fixture(() => Promise.reject(SECRET));
    await expect(job.run(NOW)).resolves.toBeDefined();
    expect(logs.error).toEqual([
      'Nhắc lịch: lượt bị dừng vì lỗi hệ thống (UNKNOWN)',
    ]);
  });

  it('reminderFailureText: loại lỗi gửi thư, lý do dữ liệu, tên lớp; không bao giờ message', () => {
    expect(reminderFailureText(new MailSendError('TIMEOUT'))).toBe('TIMEOUT');
    expect(reminderFailureText(new ReminderDataError())).toBe('THIEU_LICH_HEN');
    expect(reminderFailureText(new RangeError(SECRET))).toBe('RangeError');
    expect(reminderFailureText(SECRET)).toBe('UNKNOWN');
  });
});

describe('NLH-22 chống chạy chồng trong cùng tiến trình', () => {
  it('lượt đang chạy thì lượt sau bị bỏ (undefined); cờ nhả sau khi xong, kể cả khi lỗi', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { job, sweep, logs } = fixture(() => gate);
    const first = job.run(NOW);
    await expect(job.run(NOW)).resolves.toBeUndefined();
    expect(logs.warn).toEqual([
      'Lượt nhắc lịch trước vẫn đang chạy: bỏ qua lượt này',
    ]);
    release();
    await first;
    sweep.mockImplementationOnce(() => Promise.reject(new Error('x')));
    await job.run(NOW);
    await expect(job.run(NOW)).resolves.toBeDefined();
    expect(sweep).toHaveBeenCalledTimes(3);
  });
});
