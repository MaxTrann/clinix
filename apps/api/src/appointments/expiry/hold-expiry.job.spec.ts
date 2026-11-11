import type { DataSource } from 'typeorm';
import { vi } from 'vitest';
import {
  allLines,
  captureLogsByLevel,
  type LogsByLevel,
} from '../../auth/testing/log-levels.js';
import {
  BOOKING_JOB_BATCH_SIZE,
  BOOKING_JOB_MAX_BATCHES,
  HOLD_EXPIRY_CRON,
  HOLD_EXPIRY_JOB_NAME,
} from '../appointments.constants.js';
import type {
  AppointmentTransitionService,
  ExpireOutcome,
} from '../state/appointment-transition.service.js';
import { HoldExpiryJob, type HoldExpirySummary } from './hold-expiry.job.js';

// Task B9 — HXJ-01…HXJ-05 và phần ĐƠN VỊ của HG-09 (PLAN booking 7.26, 7.2; TRACKING 3.19.3): logic của job (không DB): lô, con trỏ, một mốc `now`, lỗi từng lịch, chống chạy chồng, log, lịch.
// `expire` giả (hợp đồng của nó do TRX-01…TRX-07 kiểm) và câu chọn ứng viên giả (SQL thật, thứ tự và quy mô do hold-expiry.job.int-spec.ts kiểm trên MySQL thật: HG-01…HG-08, DT-16).
const NOW = new Date('2026-11-02T09:15:00+07:00');
const SECRET_EMAIL = 'bi.mat.cua.nguoi.dung@example.com';

interface Candidate {
  lichHenId: string;
  han: string;
}

/** `count` ứng viên liên tiếp từ id `from`; hạn tăng dần theo phút để con trỏ phải mang CẢ hạn lẫn id */
const candidates = (from: number, count: number): Candidate[] =>
  Array.from({ length: count }, (_, i) => ({
    lichHenId: String(from + i),
    han: `2026-11-02 09:${String(Math.floor((from + i) / 100) % 60).padStart(2, '0')}:00`,
  }));

const EXPIRED: ExpireOutcome = { kind: 'Expired', khungGioId: '1' };

function fixture() {
  const query = vi.fn<(sql: string, params: unknown[]) => Promise<unknown>>();
  query.mockResolvedValue([]);
  const db = { manager: { query } } as unknown as DataSource;
  const expire = vi.fn<AppointmentTransitionService['expire']>();
  expire.mockResolvedValue(EXPIRED);
  const job = new HoldExpiryJob(db, {
    expire,
  } as unknown as AppointmentTransitionService);
  return { query, expire, job };
}

const ZERO: HoldExpirySummary = {
  expired: 0,
  notDue: 0,
  failed: 0,
  more: false,
};

let logs: LogsByLevel;

beforeEach(() => {
  logs = captureLogsByLevel();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('HXJ-01 lô, con trỏ và trần số lô', () => {
  it('hằng lô và trần đúng như PLAN 5.5: 100 và 10', () => {
    expect(BOOKING_JOB_BATCH_SIZE).toBe(100);
    expect(BOOKING_JOB_MAX_BATCHES).toBe(10);
  });

  it('lô đầu không có con trỏ; lô sau lấy con trỏ = hàng cuối của lô trước (cả hạn lẫn id); lô thiếu thì dừng, more = false', async () => {
    const f = fixture();
    const first = candidates(1, 100);
    const second = candidates(101, 37);
    f.query.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const summary = await f.job.run(NOW);

    expect(summary).toEqual({ ...ZERO, expired: 137 });
    expect(f.query).toHaveBeenCalledTimes(2);
    const [sql1, params1] = f.query.mock.calls[0] ?? [];
    const [sql2, params2] = f.query.mock.calls[1] ?? [];
    expect(params1).toEqual([NOW, 100]);
    expect(sql1).not.toContain('(han_thanh_toan, lich_hen_id) >');
    const last = first[99];
    expect(params2).toEqual([NOW, last?.han, last?.lichHenId, 100]);
    expect(sql2).toContain('(han_thanh_toan, lich_hen_id) > (?, ?)');
    for (const sql of [sql1, sql2]) {
      expect(sql).toContain("trang_thai = 'ChoThanhToan'");
      expect(sql).toContain('han_thanh_toan <= ?');
      expect(sql).toContain('ORDER BY han_thanh_toan, lich_hen_id LIMIT ?');
    }
    // mỗi ứng viên đúng một `expire`, theo thứ tự câu chọn
    expect(f.expire.mock.calls.map(([input]) => input.lichHenId)).toEqual(
      [...first, ...second].map((c) => c.lichHenId),
    );
  });

  it('đúng 10 lô ĐẦY: dừng ở trần, more = true, đúng 10 câu chọn và 1000 lần expire, không lặp vô hạn', async () => {
    const f = fixture();
    for (let b = 0; b < BOOKING_JOB_MAX_BATCHES + 2; b++)
      f.query.mockResolvedValueOnce(candidates(1 + b * 100, 100));
    const summary = await f.job.run(NOW);
    expect(summary).toEqual({ ...ZERO, expired: 1000, more: true });
    expect(f.query).toHaveBeenCalledTimes(10);
    expect(f.expire).toHaveBeenCalledTimes(1000);
  });

  it('lô đầu rỗng: một câu chọn, không expire, tóm tắt toàn 0', async () => {
    const f = fixture();
    await expect(f.job.run(NOW)).resolves.toEqual(ZERO);
    expect(f.query).toHaveBeenCalledTimes(1);
    expect(f.expire).not.toHaveBeenCalled();
  });

  it('đúng 100 ứng viên rồi lô rỗng: hai câu chọn, more = false', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce(candidates(1, 100)).mockResolvedValueOnce([]);
    const summary = await f.job.run(NOW);
    expect(summary).toEqual({ ...ZERO, expired: 100 });
    expect(f.query).toHaveBeenCalledTimes(2);
  });
});

describe('HXJ-02 MỘT mốc now cho cả lượt', () => {
  it('now có mili giây được cắt xuống giây và dùng cho câu chọn lẫn mọi expire', async () => {
    const f = fixture();
    f.query
      .mockResolvedValueOnce(candidates(1, 100))
      .mockResolvedValueOnce(candidates(101, 2));
    await f.job.run(new Date('2026-11-02T09:15:00.789+07:00'));
    for (const [, params] of f.query.mock.calls)
      expect(params?.[0]).toEqual(NOW);
    for (const [input] of f.expire.mock.calls) expect(input.now).toEqual(NOW);
  });

  it('run() không tham số lấy đồng hồ ứng dụng (cắt giây), MỘT lần cho cả lượt dù đồng hồ chạy tiếp giữa các lô', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-02T09:15:00.250+07:00'));
    const f = fixture();
    f.query.mockResolvedValueOnce(candidates(1, 100));
    f.expire.mockImplementation(() => {
      vi.setSystemTime(new Date('2026-11-02T09:20:00+07:00')); // đồng hồ nhảy 5 phút giữa lượt
      return Promise.resolve(EXPIRED);
    });
    f.query.mockResolvedValueOnce(candidates(101, 1));
    await f.job.run();
    for (const [, params] of f.query.mock.calls)
      expect(params?.[0]).toEqual(NOW);
    for (const [input] of f.expire.mock.calls) expect(input.now).toEqual(NOW);
  });

  it('đối số lạ không phải Date (bộ lập lịch cron truyền `onComplete`) bị bỏ qua: lấy đồng hồ, không ra mốc rác', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const f = fixture();
    await f.job.run((() => undefined) as unknown as Date);
    const now = f.query.mock.calls[0]?.[1]?.[0];
    expect(now).toEqual(NOW);
  });
});

describe('HXJ-03 lỗi từng lịch không dừng lượt, run không bao giờ ném (HG-06, mức đơn vị)', () => {
  it('đếm Expired, NotDue, Failed (Busy, Error) và expire ném: cả 6 lịch đều được xử lý', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce(candidates(1, 6));
    f.expire
      .mockResolvedValueOnce(EXPIRED)
      .mockResolvedValueOnce({ kind: 'NotDue', reason: 'NotPending' })
      .mockResolvedValueOnce({
        kind: 'Failed',
        reason: 'Busy',
        errorName: 'AppException',
      })
      .mockResolvedValueOnce(EXPIRED)
      .mockResolvedValueOnce({
        kind: 'Failed',
        reason: 'Error',
        errorName: 'Error',
      })
      .mockRejectedValueOnce(new Error('vi phạm hợp đồng: expire ném'));
    const summary = await f.job.run(NOW);
    expect(summary).toEqual({ expired: 2, notDue: 1, failed: 3, more: false });
    expect(f.expire).toHaveBeenCalledTimes(6);
  });

  it('lịch lỗi không chặn lịch sau trong cùng lô, và lô sau vẫn được đọc (con trỏ đi qua lịch lỗi)', async () => {
    const f = fixture();
    f.query
      .mockResolvedValueOnce(candidates(1, 100))
      .mockResolvedValueOnce(candidates(101, 1));
    f.expire.mockResolvedValue({
      kind: 'Failed',
      reason: 'Error',
      errorName: 'Error',
    });
    const summary = await f.job.run(NOW);
    expect(summary).toEqual({ ...ZERO, failed: 101 });
    expect(f.query).toHaveBeenCalledTimes(2);
  });

  it('câu chọn ứng viên ném (DB sập): run vẫn trả tóm tắt, không ném, ghi ERROR chỉ có tên lớp lỗi', async () => {
    const f = fixture();
    f.query.mockRejectedValue(new TypeError(`không đọc được ${SECRET_EMAIL}`));
    await expect(f.job.run(NOW)).resolves.toEqual(ZERO);
    expect(logs.error).toEqual([
      'Hết hạn giữ chỗ: không đọc được danh sách ứng viên (TypeError)',
    ]);
    expect(logs.debug).toEqual([]);
  });

  it('câu chọn lô thứ hai ném: các lịch của lô đầu vẫn được tính trong tóm tắt', async () => {
    const f = fixture();
    f.query
      .mockResolvedValueOnce(candidates(1, 100))
      .mockRejectedValueOnce(new Error('mất kết nối'));
    await expect(f.job.run(NOW)).resolves.toEqual({ ...ZERO, expired: 100 });
  });
});

describe('HXJ-04 chống chạy chồng trong cùng tiến trình', () => {
  it('lượt hai khi lượt đầu còn chạy: trả undefined, không đụng DB, ghi cảnh báo; xong lượt đầu thì lượt ba chạy được', async () => {
    const f = fixture();
    let release: (rows: Candidate[]) => void = () => undefined;
    f.query.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve as (rows: Candidate[]) => void;
        }),
    );
    const first = f.job.run(NOW);
    await expect(f.job.run(NOW)).resolves.toBeUndefined();
    expect(f.query).toHaveBeenCalledTimes(1);
    expect(logs.warn).toEqual([
      'Lượt hết hạn giữ chỗ trước vẫn đang chạy: bỏ qua lượt này',
    ]);

    release(candidates(1, 3));
    await expect(first).resolves.toEqual({ ...ZERO, expired: 3 });

    await expect(f.job.run(NOW)).resolves.toEqual(ZERO);
    expect(f.query).toHaveBeenCalledTimes(2);
  });

  it('cờ trả về false cả khi lượt đầu ném (câu chọn lỗi): lượt sau vẫn chạy', async () => {
    const f = fixture();
    f.query.mockRejectedValueOnce(new Error('lỗi'));
    await f.job.run(NOW);
    f.query.mockResolvedValueOnce(candidates(1, 2));
    await expect(f.job.run(NOW)).resolves.toEqual({ ...ZERO, expired: 2 });
  });
});

describe('HXJ-05 log chỉ có số lượng, mã lịch, lý do và tên lớp lỗi', () => {
  it('lỗi mang email ở expire (ném) và ở câu chọn: không dòng log nào chứa email hay message', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce(candidates(41, 3));
    f.expire
      .mockResolvedValueOnce({
        kind: 'Failed',
        reason: 'Busy',
        errorName: 'AppException',
      })
      .mockResolvedValueOnce({
        kind: 'Failed',
        reason: 'Error',
        errorName: 'RangeError',
      })
      .mockRejectedValueOnce(new TypeError(`lỗi ${SECRET_EMAIL}`));
    await f.job.run(NOW);
    const lines = allLines(logs);
    expect(lines.join('\n')).not.toContain('example.com');
    expect(logs.warn).toEqual([
      'Không hết hạn được lịch 41: Busy (AppException); giao dịch đã hoàn tác, lượt sau thử lại',
    ]);
    expect(logs.error).toEqual([
      'Không hết hạn được lịch 42: Error (RangeError)',
      'Không hết hạn được lịch 43: Error (TypeError)',
    ]);
    expect(logs.log).toEqual(['Hết hạn giữ chỗ: đã huỷ 0, bỏ qua 0, lỗi 3']);
  });

  it('tóm tắt: có lịch thì một dòng log số lượng (kèm "còn ứng viên" khi hết trần), lượt rỗng chỉ ghi debug', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce(candidates(1, 2));
    f.expire
      .mockResolvedValueOnce(EXPIRED)
      .mockResolvedValueOnce({ kind: 'NotDue', reason: 'NotLapsed' });
    await f.job.run(NOW);
    expect(logs.log).toEqual(['Hết hạn giữ chỗ: đã huỷ 1, bỏ qua 1, lỗi 0']);

    logs = captureLogsByLevel();
    const g = fixture();
    await g.job.run(NOW);
    expect(logs.log).toEqual([]);
    expect(logs.debug).toEqual(['Hết hạn giữ chỗ: không có lịch nào quá hạn']);

    logs = captureLogsByLevel();
    const h = fixture();
    for (let b = 0; b < BOOKING_JOB_MAX_BATCHES; b++)
      h.query.mockResolvedValueOnce(candidates(1 + b * 100, 100));
    await h.job.run(NOW);
    expect(logs.log[0]).toContain('; còn ứng viên chờ lượt sau');
  });
});

// Lịch: `@Cron` lưu cấu hình thành metadata trên hàm; `disabled` được tính LÚC NẠP MODULE từ NODE_ENV nên phải nạp lại module cho từng giá trị (nếp A7).
describe('HG-09 lịch chạy: tắt ở NODE_ENV=test (phần đơn vị)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function cronOptionsUnder(nodeEnv: string | undefined): Promise<{
    name: string;
    cronTime: string;
    disabled: boolean;
  }> {
    vi.stubEnv('NODE_ENV', nodeEnv);
    vi.resetModules();
    const fresh = await import('./hold-expiry.job.js');
    const run: unknown = Reflect.get(fresh.HoldExpiryJob.prototype, 'run');
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
    [undefined, false], // NODE_ENV chưa đặt (chạy dev không qua .env): job phải BẬT
    ['test', true],
  ])('NODE_ENV=%s: job tắt = %s', async (nodeEnv, disabled) => {
    const options = await cronOptionsUnder(nodeEnv);
    expect(options.disabled).toBe(disabled);
  });

  it('đăng ký đúng tên và đúng biểu thức (mỗi phút vào giây 20, cron 6 trường)', async () => {
    const options = await cronOptionsUnder('production');
    expect(options.name).toBe(HOLD_EXPIRY_JOB_NAME);
    expect(options.cronTime).toBe(HOLD_EXPIRY_CRON);
    expect(HOLD_EXPIRY_CRON).toBe('20 * * * * *');
  });

  it('run(now) gọi được trực tiếp từ test khi cron tắt', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const f = fixture();
    await expect(f.job.run(NOW)).resolves.toEqual(ZERO);
  });
});
