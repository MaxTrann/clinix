import type { DataSource, EntityManager } from 'typeorm';
import { QueryFailedError } from 'typeorm';
import { vi } from 'vitest';
import {
  UNVERIFIED_CLEANUP_BATCH_SIZE,
  UNVERIFIED_CLEANUP_CRON,
  UNVERIFIED_CLEANUP_JOB_NAME,
  UNVERIFIED_CLEANUP_MAX_BATCHES,
} from '../auth.constants.js';
import type { TaiKhoanRepository } from '../repositories/tai-khoan.repository.js';
import {
  captureLogsByLevel,
  allLines,
  type LogsByLevel,
} from '../testing/log-levels.js';
import {
  UnverifiedPatientCleanupJob,
  type CleanupSummary,
} from './unverified-patient-cleanup.job.js';
import type { UnverifiedPatientCleaner } from './unverified-patient-cleaner.js';

// Task A7 — logic của job (không DB): lô, giao dịch từng tài khoản, lỗi từng tài khoản, chống chạy chồng, log, lịch. Mã CJ-Unn / CJ-Snn là [đề xuất]
// (plan chưa có mã riêng cho job; DK-33…DK-38 phủ ở unverified-patient-cleanup.job.int-spec.ts trên MySQL thật).
const NOW = new Date('2026-11-02T01:00:00.789Z'); // có mili giây: đồng hồ phải cắt xuống giây trước khi trừ 24 giờ
const CUTOFF = new Date('2026-11-01T01:00:00.000Z');
const SECRET_EMAIL = 'bi.mat.cua.nguoi.dung@example.com';

const range = (from: number, count: number): string[] =>
  Array.from({ length: count }, (_, i) => String(from + i));

/** Lỗi MySQL do TypeORM bọc, mang thông điệp có email (đúng thứ driver thật làm: thông điệp lỗi chứa dữ liệu người dùng). */
const mysqlError = (driverError: Record<string, unknown>): QueryFailedError =>
  new QueryFailedError(
    'DELETE FROM tai_khoan WHERE email = ?',
    [SECRET_EMAIL],
    Object.assign(new Error(`lỗi với ${SECRET_EMAIL}`), driverError),
  );

function fixture() {
  const manager = { tag: 'manager' } as unknown as EntityManager;
  const em = { tag: 'transaction-em' } as unknown as EntityManager;
  const transaction = vi.fn(
    (_level: string, work: (e: EntityManager) => Promise<boolean>) => work(em),
  );
  const db = { manager, transaction } as unknown as DataSource;
  const find = vi.fn<TaiKhoanRepository['findExpiredUnverifiedPatientIds']>();
  const purge = vi.fn<UnverifiedPatientCleaner['purgeIfExpired']>();
  purge.mockResolvedValue(true);
  const job = new UnverifiedPatientCleanupJob(
    db,
    { findExpiredUnverifiedPatientIds: find } as unknown as TaiKhoanRepository,
    { purgeIfExpired: purge } as unknown as UnverifiedPatientCleaner,
  );
  return { manager, em, transaction, find, purge, job };
}

const ZERO: CleanupSummary = {
  deleted: 0,
  skipped: 0,
  failed: 0,
  more: false,
};

let logs: LogsByLevel;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  logs = captureLogsByLevel();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('chọn ứng viên theo lô', () => {
  it('(CJ-U01) cutoff = đồng hồ ứng dụng cắt xuống giây − 24 giờ, cursor bắt đầu từ 0, lô 100', async () => {
    const f = fixture();
    f.find.mockResolvedValue([]);

    await f.job.run();

    expect(f.find).toHaveBeenCalledTimes(1);
    expect(f.find).toHaveBeenCalledWith(f.manager, CUTOFF, '0', 100);
  });

  it('(CJ-U02) lô đầy thì quét tiếp từ mã cuối của lô trước, lô thiếu thì dừng; mọi ứng viên được xử lý đúng một lần', async () => {
    const f = fixture();
    f.find
      .mockResolvedValueOnce(range(1, 100))
      .mockResolvedValueOnce(range(101, 100))
      .mockResolvedValueOnce(range(201, 9));

    const summary = await f.job.run();

    expect(f.find.mock.calls.map((call) => call[2])).toEqual([
      '0',
      '100',
      '200',
    ]);
    expect(f.purge).toHaveBeenCalledTimes(209);
    expect(summary).toEqual({ ...ZERO, deleted: 209 });
  });

  it('(CJ-U03) trần 10 lô mỗi lượt: lô đầy mãi thì dừng đúng sau 10 lô và báo còn ứng viên', async () => {
    const f = fixture();
    // Lô đầy mãi, nhưng chặn cứng ở lần gọi thứ 11: nếu mã bỏ trần thì lần 11 trả rỗng để vòng lặp kết thúc và test ĐỎ sạch (đột biến M08 từng
    // làm vòng lặp chạy cả triệu lô và sập worker vì hết bộ nhớ)
    f.find.mockImplementation((_em, _cutoff, afterId) =>
      Promise.resolve(
        f.find.mock.calls.length > 10 ? [] : range(Number(afterId) + 1, 100),
      ),
    );

    const summary = await f.job.run();

    expect(f.find).toHaveBeenCalledTimes(10);
    expect(f.find.mock.calls.map((call) => call[2])).toEqual(
      Array.from({ length: 10 }, (_, i) => String(i * 100)),
    );
    expect(summary).toEqual({ ...ZERO, deleted: 1000, more: true });
    expect(logs.log).toEqual([expect.stringContaining('còn ứng viên chờ')]);
  });

  it('(CJ-U12) hằng số theo kế hoạch đã duyệt: lô 100, tối đa 10 lô, phút 15 mỗi giờ, tên job', () => {
    expect(UNVERIFIED_CLEANUP_BATCH_SIZE).toBe(100);
    expect(UNVERIFIED_CLEANUP_MAX_BATCHES).toBe(10);
    expect(UNVERIFIED_CLEANUP_CRON).toBe('0 15 * * * *');
    expect(UNVERIFIED_CLEANUP_JOB_NAME).toBe('unverified-patient-cleanup');
  });
});

describe('xoá từng tài khoản', () => {
  it('(CJ-U04) MỖI tài khoản một giao dịch READ COMMITTED riêng; purgeIfExpired nhận EntityManager của giao dịch đó', async () => {
    const f = fixture();
    f.find.mockResolvedValue(['7', '8', '9']);

    await f.job.run();

    expect(f.transaction.mock.calls.map((call) => call[0])).toEqual([
      'READ COMMITTED',
      'READ COMMITTED',
      'READ COMMITTED',
    ]);
    expect(f.purge.mock.calls).toEqual([
      [f.em, '7'],
      [f.em, '8'],
      [f.em, '9'],
    ]);
  });

  it('(CJ-U05) đếm đúng đã xoá (true), bỏ qua (false) và lỗi (ném); một tài khoản lỗi KHÔNG dừng lượt', async () => {
    const f = fixture();
    f.find.mockResolvedValue(['1', '2', '3', '4']);
    f.purge
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('hỏng'))
      .mockResolvedValueOnce(true);

    const summary = await f.job.run();

    expect(summary).toEqual({ ...ZERO, deleted: 2, skipped: 1, failed: 1 });
    expect(f.purge).toHaveBeenCalledTimes(4); // tài khoản thứ 4 vẫn được xử lý sau lỗi ở tài khoản thứ 3
    expect(logs.log).toEqual([
      expect.stringContaining('đã xoá 2, bỏ qua 1, lỗi 1'),
    ]);
  });

  it.each([
    ['errno 1213', { errno: 1213 }, 'deadlock (MySQL 1213)'],
    ['code ER_LOCK_DEADLOCK', { code: 'ER_LOCK_DEADLOCK' }, 'MySQL 1213'],
    ['errno 1205', { errno: 1205 }, 'hết thời gian chờ khoá (MySQL 1205)'],
    [
      'code ER_LOCK_WAIT_TIMEOUT',
      { code: 'ER_LOCK_WAIT_TIMEOUT' },
      'MySQL 1205',
    ],
  ])(
    '(CJ-U06) %s: chỉ cảnh báo (không ERROR), ghi mã tài khoản và mã lỗi, bỏ qua tài khoản đó và làm tiếp',
    async (_label, driverError, expected) => {
      const f = fixture();
      f.find.mockResolvedValue(['1', '2', '3']);
      f.purge
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(mysqlError(driverError))
        .mockResolvedValueOnce(true);

      const summary = await f.job.run();

      expect(summary).toEqual({ ...ZERO, deleted: 2, failed: 1 });
      expect(logs.error).toEqual([]);
      expect(logs.warn).toEqual([
        expect.stringContaining('Không dọn được tài khoản 2'),
      ]);
      expect(logs.warn[0]).toContain(expected);
      expect(logs.warn[0]).toContain('lượt sau thử lại');
      expect(allLines(logs).join('\n')).not.toContain(SECRET_EMAIL);
    },
  );

  it('(CJ-U07) khoá ngoại (1451) và lỗi lạ là ERROR: chỉ mã tài khoản và loại lỗi, KHÔNG có message (message có email)', async () => {
    const f = fixture();
    f.find.mockResolvedValue(['1', '2', '3']);
    f.purge
      .mockRejectedValueOnce(mysqlError({ errno: 1451 }))
      .mockRejectedValueOnce(mysqlError({ errno: 1064 }))
      .mockRejectedValueOnce(new Error(`lạ: ${SECRET_EMAIL}`));

    const summary = await f.job.run();

    expect(summary).toEqual({ ...ZERO, failed: 3 });
    expect(logs.warn).toEqual([]);
    expect(logs.error).toHaveLength(3);
    expect(logs.error[0]).toBe(
      'Không dọn được tài khoản 1: khoá ngoại chặn xoá (MySQL 1451)',
    );
    expect(logs.error[1]).toBe('Không dọn được tài khoản 2: QueryFailedError');
    expect(logs.error[2]).toBe('Không dọn được tài khoản 3: Error');
    expect(allLines(logs).join('\n')).not.toContain(SECRET_EMAIL);
  });

  it('(CJ-U13) lỗi không phải Error (chuỗi, số) cũng không làm sập job', async () => {
    const f = fixture();
    f.find.mockResolvedValue(['1']);
    f.purge.mockRejectedValueOnce(`chuỗi có ${SECRET_EMAIL}`);

    const summary = await f.job.run();

    expect(summary).toEqual({ ...ZERO, failed: 1 });
    expect(logs.error).toEqual(['Không dọn được tài khoản 1: lỗi không rõ']);
  });
});

describe('lỗi đọc danh sách ứng viên', () => {
  it('(CJ-U08) lỗi ở lô đầu: run() không ném, chỉ ERROR kèm loại lỗi (không message), không ghi dòng "không có gì để dọn", lượt sau chạy lại được', async () => {
    const f = fixture();
    f.find
      .mockRejectedValueOnce(mysqlError({ errno: 2002 }))
      .mockResolvedValueOnce([]);

    await expect(f.job.run()).resolves.toEqual(ZERO);

    expect(logs.error).toEqual([
      'Dọn tài khoản chưa xác minh: không đọc được danh sách ứng viên (QueryFailedError)',
    ]);
    expect(logs.debug).toEqual([]);
    expect(allLines(logs).join('\n')).not.toContain(SECRET_EMAIL);

    await f.job.run(); // cờ chạy chồng đã được trả lại dù lượt trước lỗi
    expect(f.find).toHaveBeenCalledTimes(2);
    expect(logs.debug).toHaveLength(1);
  });

  it('(CJ-U14) lỗi ở lô thứ hai: kết quả của lô đầu vẫn được trả và ghi vào tóm tắt', async () => {
    const f = fixture();
    f.find
      .mockResolvedValueOnce(range(1, 100))
      .mockRejectedValueOnce(new Error(SECRET_EMAIL));

    const summary = await f.job.run();

    expect(summary).toEqual({ ...ZERO, deleted: 100 });
    expect(logs.log).toEqual([expect.stringContaining('đã xoá 100')]);
    expect(logs.error).toHaveLength(1);
    expect(allLines(logs).join('\n')).not.toContain(SECRET_EMAIL);
  });
});

describe('chống chạy chồng trong cùng tiến trình', () => {
  it('(CJ-U09) lượt thứ hai khi lượt đầu còn chạy bị bỏ qua (không đụng DB, trả undefined, cảnh báo); xong rồi thì chạy lại được', async () => {
    const f = fixture();
    let release: (ids: string[]) => void = () => undefined;
    f.find.mockImplementationOnce(
      () =>
        new Promise<string[]>((resolve) => {
          release = resolve;
        }),
    );
    f.find.mockResolvedValue([]);

    const first = f.job.run();
    await Promise.resolve(); // để lượt đầu chạm tới lệnh đọc đang bị giữ
    await expect(f.job.run()).resolves.toBeUndefined();

    expect(f.find).toHaveBeenCalledTimes(1);
    expect(logs.warn).toEqual([expect.stringContaining('bỏ qua lượt này')]);

    release(['5']);
    await expect(first).resolves.toEqual({ ...ZERO, deleted: 1 });

    await expect(f.job.run()).resolves.toEqual(ZERO);
    expect(f.find).toHaveBeenCalledTimes(2); // lượt đầu một lần, lượt bị bỏ qua không lần nào, lượt thứ ba một lần
  });
});

describe('log', () => {
  it('(CJ-U10) lượt không có gì để xoá: đúng một dòng ở mức debug, không có log/warn/error', async () => {
    const f = fixture();
    f.find.mockResolvedValue([]);

    await f.job.run();

    expect(logs.debug).toEqual([
      'Dọn tài khoản chưa xác minh: không có tài khoản nào quá 24 giờ',
    ]);
    expect(logs.log).toEqual([]);
    expect(logs.warn).toEqual([]);
    expect(logs.error).toEqual([]);
  });

  it('(CJ-U11) lượt có việc: đúng một dòng tóm tắt ở mức log, không nhắc "chờ lượt sau" khi đã hết ứng viên', async () => {
    const f = fixture();
    f.find.mockResolvedValue(['1', '2']);
    f.purge.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await f.job.run();

    expect(logs.log).toEqual([
      'Dọn tài khoản Bệnh nhân chưa xác minh quá 24 giờ: đã xoá 1, bỏ qua 1, lỗi 0',
    ]);
    expect(logs.debug).toEqual([]);
  });
});

// Lịch: `@Cron` lưu cấu hình thành metadata trên hàm; `disabled` được tính LÚC NẠP MODULE từ NODE_ENV nên phải nạp lại module cho từng giá trị.
describe('lịch chạy', () => {
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
    const fresh = await import('./unverified-patient-cleanup.job.js');
    const run: unknown = Reflect.get(
      fresh.UnverifiedPatientCleanupJob.prototype,
      'run',
    );
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
    [undefined, false], // `process.env.NODE_ENV` chưa đặt (chạy dev không qua .env): validateEnv coi là development nên job phải BẬT
    ['test', true],
  ])(
    '(CJ-S01) NODE_ENV=%s: job tắt = %s (BẬT ở development, staging, production, chưa đặt; TẮT ở test)',
    async (nodeEnv, disabled) => {
      const options = await cronOptionsUnder(nodeEnv);
      expect(options.disabled).toBe(disabled);
    },
  );

  it('(CJ-S02) đăng ký đúng tên và đúng biểu thức: mỗi giờ vào giây 0 phút 15 (cron 6 trường)', async () => {
    const options = await cronOptionsUnder('production');
    expect(options.name).toBe('unverified-patient-cleanup');
    expect(options.cronTime).toBe('0 15 * * * *');
  });
});
