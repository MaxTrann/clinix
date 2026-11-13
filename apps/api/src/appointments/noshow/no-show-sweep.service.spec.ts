import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import type { CauHinhHeThong } from '../../admin/entities/cau-hinh-he-thong.entity.js';
import type { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import {
  allLines,
  captureLogsByLevel,
  type LogsByLevel,
} from '../../auth/testing/log-levels.js';
import {
  BOOKING_JOB_BATCH_SIZE,
  BOOKING_JOB_MAX_BATCHES,
  bookingException,
  BOOKING_ERROR_CODES,
} from '../appointments.constants.js';
import type {
  AppointmentTransitionService,
  MarkNoShowOutcome,
} from '../state/appointment-transition.service.js';
import {
  mysqlError,
  ScriptedEntityManager,
} from '../testing/scripted-entity-manager.js';
import {
  emptyNoShowSummary,
  NoShowSweepService,
  type NoShowSummary,
} from './no-show-sweep.service.js';

// Task B13 — NSJ-01, NSJ-02, NSJ-03 (PLAN booking 7.35 `[đề xuất]`; TRACKING 3.29 B13-C, B13-E, B13-H) và phần đơn vị của VM-12, VM-13: logic của MỘT LƯỢT (không DB): lô, con trỏ, trần lô, một mốc `now`, cấu hình đọc một lần,
// mỗi lịch một giao dịch THẬT của `withBookingTransaction` (thử lại 1213, hết lượt thành `Busy`) trên `DataSource` và `markNoShow` giả (hợp đồng của `markNoShow` do NSH-01…NSH-08 của B12 kiểm; SQL thật, thứ tự và
// dữ liệu thật do no-show.job.int-spec.ts kiểm trên MySQL thật: VM-01…VM-15).
const NOW = new Date('2026-11-10T12:00:00+07:00');
const SECRET_EMAIL = 'bi.mat.cua.nguoi.dung@example.com';
const CONFIG = {
  checkInTruocPhut: 30,
  checkInSauPhut: 15,
  nguongNoShow: 3,
} as CauHinhHeThong;
const NO_SHOWED: MarkNoShowOutcome = {
  kind: 'NoShowed',
  soLanNoShow: 1,
  khoaDatLich: false,
};

/** `count` id liên tiếp từ `from` (chuỗi số, như `CAST … AS CHAR`) */
const ids = (from: number, count: number): string[] =>
  Array.from({ length: count }, (_, i) => String(from + i));

const isCountSql = (sql: string): boolean => sql.startsWith('SELECT COUNT(*)');

function fixture(unattended = 0) {
  // Mỗi lô của `batches` được trả một lần cho câu chọn ứng viên; hết lô thì rỗng. Câu đếm trả `unattended`.
  const batches: string[][] = [];
  const query = vi
    .fn<(sql: string, params: unknown[]) => Promise<unknown>>()
    .mockImplementation((sql) => {
      if (isCountSql(sql)) return Promise.resolve([{ n: unattended }]);
      return Promise.resolve(
        (batches.shift() ?? []).map((id) => ({ lichHenId: id })),
      );
    });
  // Mỗi `db.transaction` dựng một `em` MỚI (như một kết nối riêng); chỉ trả lời hai câu của vỏ giao dịch (đọc và đặt timeout chờ khoá)
  const txs: ScriptedEntityManager[] = [];
  const transaction = vi.fn(
    (_isolation: string, work: (em: EntityManager) => Promise<unknown>) => {
      const tx = new ScriptedEntityManager((sql) =>
        sql.includes('@@session.innodb_lock_wait_timeout')
          ? [{ value: '50' }]
          : [],
      );
      txs.push(tx);
      return work(tx.em);
    },
  );
  const db = { manager: { query }, transaction } as unknown as DataSource;
  const markNoShow = vi
    .fn<AppointmentTransitionService['markNoShow']>()
    .mockResolvedValue(NO_SHOWED);
  const get = vi.fn<SystemConfigService['get']>().mockResolvedValue(CONFIG);
  const service = new NoShowSweepService(
    db,
    { markNoShow } as unknown as AppointmentTransitionService,
    { get } as unknown as SystemConfigService,
  );
  return { batches, query, transaction, txs, markNoShow, get, service };
}

const ZERO: NoShowSummary = emptyNoShowSummary();

let logs: LogsByLevel;

beforeEach(() => {
  logs = captureLogsByLevel();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const candidateCalls = (f: ReturnType<typeof fixture>) =>
  f.query.mock.calls.filter(([sql]) => !isCountSql(sql));

describe('NSJ-01 lô, con trỏ id và trần số lô (VM-13 mức đơn vị)', () => {
  it('hằng lô và trần đúng như PLAN 5.5 và Q23: 100 và 10', () => {
    expect(BOOKING_JOB_BATCH_SIZE).toBe(100);
    expect(BOOKING_JOB_MAX_BATCHES).toBe(10);
  });

  it('lô đầu không có con trỏ; lô sau lấy con trỏ = id cuối của lô trước; lô thiếu thì dừng, more = false; mỗi ứng viên đúng một markNoShow theo thứ tự', async () => {
    const f = fixture();
    f.batches.push(ids(1, 100), ids(101, 37));
    const summary = await f.service.sweep(NOW);

    expect(summary).toEqual({ ...ZERO, noShowed: 137 });
    expect(candidateCalls(f)).toHaveLength(2);
    expect(candidateCalls(f)[0]?.[1]).toEqual([NOW, NOW, 100]);
    expect(candidateCalls(f)[1]?.[1]).toEqual([NOW, NOW, '100', 100]);
    expect(f.markNoShow.mock.calls.map(([, input]) => input.lichHenId)).toEqual(
      ids(1, 137),
    );
  });

  it('đúng 10 lô ĐẦY: dừng ở trần, more = true, đúng 10 câu chọn và 1000 lần markNoShow, không lặp vô hạn', async () => {
    const f = fixture();
    for (let b = 0; b < BOOKING_JOB_MAX_BATCHES + 2; b++)
      f.batches.push(ids(1 + b * 100, 100));
    const summary = await f.service.sweep(NOW);
    expect(summary).toEqual({ ...ZERO, noShowed: 1000, more: true });
    expect(candidateCalls(f)).toHaveLength(10);
    expect(f.markNoShow).toHaveBeenCalledTimes(1000);
  });

  it('lô đầu rỗng: một câu chọn, không giao dịch, không markNoShow, tóm tắt toàn 0 (chỉ có số ca không có khoảng từ câu đếm)', async () => {
    const f = fixture(4);
    await expect(f.service.sweep(NOW)).resolves.toEqual({
      ...ZERO,
      unattended: 4,
    });
    expect(candidateCalls(f)).toHaveLength(1);
    expect(f.transaction).not.toHaveBeenCalled();
    expect(f.markNoShow).not.toHaveBeenCalled();
  });

  it('đúng 100 ứng viên rồi lô rỗng: hai câu chọn, more = false', async () => {
    const f = fixture();
    f.batches.push(ids(1, 100));
    const summary = await f.service.sweep(NOW);
    expect(summary).toEqual({ ...ZERO, noShowed: 100 });
    expect(candidateCalls(f)).toHaveLength(2);
  });

  it('câu đếm ca không có khoảng chạy MỘT lần mỗi lượt, sau vòng lô, với cùng mốc now', async () => {
    const f = fixture(9);
    f.batches.push(ids(1, 3));
    const summary = await f.service.sweep(NOW);
    expect(summary.unattended).toBe(9);
    const counts = f.query.mock.calls.filter(([sql]) => isCountSql(sql));
    expect(counts).toHaveLength(1);
    expect(counts[0]?.[1]).toEqual([NOW]);
    expect(f.query.mock.calls.at(-1)?.[0]).toMatch(/^SELECT COUNT\(\*\)/);
  });
});

describe('NSJ-02 MỘT mốc now và cấu hình đọc MỘT lần ngoài giao dịch (VM-12 mức đơn vị)', () => {
  it('now có mili giây được cắt xuống giây và dùng cho câu chọn, câu đếm, mọi markNoShow và mọi isDue', async () => {
    const f = fixture();
    f.batches.push(ids(1, 100), ids(101, 2));
    await f.service.sweep(new Date('2026-11-10T12:00:00.789+07:00'));
    for (const [, params] of f.query.mock.calls) expect(params[0]).toEqual(NOW);
    for (const [, input] of f.markNoShow.mock.calls)
      expect(input.now).toEqual(NOW);
  });

  it('isDue của lịch kiểm đúng lịch đó và đúng mốc đó bằng câu đọc thường trên em của GIAO DỊCH', async () => {
    const f = fixture();
    f.batches.push(['41']);
    f.markNoShow.mockImplementation(async (em, input) => {
      if (input.actor !== 'HeThong') throw new Error('actor sai');
      await input.isDue(em);
      return NO_SHOWED;
    });
    await f.service.sweep(new Date('2026-11-10T12:00:00.500+07:00'));
    const queries = f.txs[0]?.queries ?? [];
    const due = queries.find(({ sql }) => sql.includes('lh.lich_hen_id = ?'));
    expect(due?.params).toEqual(['41', NOW, NOW]);
  });

  it('cấu hình đọc đúng MỘT lần cho cả lượt (kể cả nhiều lô), và chính đối tượng đó đi vào markNoShow với actor HeThong', async () => {
    const f = fixture();
    f.batches.push(ids(1, 100), ids(101, 50));
    await f.service.sweep(NOW);
    expect(f.get).toHaveBeenCalledTimes(1);
    for (const [, input] of f.markNoShow.mock.calls) {
      expect(input.actor).toBe('HeThong');
      expect(input.config).toBe(CONFIG);
    }
  });

  it('thân giao dịch chạy lại sau 1213 KHÔNG đọc lại cấu hình và vẫn dùng cùng mốc', async () => {
    const f = fixture();
    f.batches.push(['7']);
    f.markNoShow
      .mockRejectedValueOnce(mysqlError(1213))
      .mockResolvedValueOnce(NO_SHOWED);
    const summary = await f.service.sweep(NOW);
    expect(summary.noShowed).toBe(1);
    expect(f.markNoShow).toHaveBeenCalledTimes(2);
    expect(f.get).toHaveBeenCalledTimes(1);
    expect(f.markNoShow.mock.calls[1]?.[1].now).toEqual(NOW);
  });

  it('chưa có cấu hình: bỏ lượt NGAY, configMissing, không câu chọn, không câu đếm, không giao dịch, không markNoShow', async () => {
    const f = fixture(5);
    f.batches.push(ids(1, 10));
    f.get.mockResolvedValue(null);
    await expect(f.service.sweep(NOW)).resolves.toEqual({
      ...ZERO,
      configMissing: true,
    });
    expect(f.query).not.toHaveBeenCalled();
    expect(f.transaction).not.toHaveBeenCalled();
    expect(f.markNoShow).not.toHaveBeenCalled();
  });
});

describe('NSJ-03 mỗi lịch MỘT giao dịch riêng, kết quả có kiểu, lỗi một lịch không dừng lượt (VM-13, HG-06 mức đơn vị)', () => {
  it('N lịch ⇒ N giao dịch READ COMMITTED, mỗi lần một em khác nhau và markNoShow nhận đúng em của giao dịch đó', async () => {
    const f = fixture();
    f.batches.push(ids(1, 5));
    await f.service.sweep(NOW);
    expect(f.transaction).toHaveBeenCalledTimes(5);
    for (const [isolation] of f.transaction.mock.calls)
      expect(isolation).toBe('READ COMMITTED');
    expect(new Set(f.txs).size).toBe(5);
    f.markNoShow.mock.calls.forEach(([em], i) => {
      expect(em).toBe(f.txs[i]?.em);
    });
  });

  it('đếm đủ các kết quả: NoShowed, không còn DaXacNhan (InvalidState và NotFound), NotDue, bận (hết lượt thử lại), lỗi khác, ConfigMissing thấy được; cả 8 lịch đều được xử lý', async () => {
    const f = fixture();
    f.batches.push(ids(1, 8));
    f.markNoShow
      .mockResolvedValueOnce(NO_SHOWED)
      .mockResolvedValueOnce({ kind: 'InvalidState', trangThai: 'DaTiepDon' })
      .mockResolvedValueOnce({ kind: 'NotFound' })
      .mockResolvedValueOnce({ kind: 'NotDue' })
      .mockRejectedValueOnce(bookingException(BOOKING_ERROR_CODES.SYSTEM_BUSY))
      .mockRejectedValueOnce(new RangeError('dữ liệu lệch'))
      .mockResolvedValueOnce({ kind: 'ConfigMissing' })
      .mockResolvedValueOnce({
        kind: 'NoShowed',
        soLanNoShow: 3,
        khoaDatLich: true,
      });
    const summary = await f.service.sweep(NOW);
    expect(summary).toEqual({
      ...ZERO,
      noShowed: 2,
      notConfirmed: 2,
      notDue: 1,
      failedBusy: 1,
      failedError: 2,
    });
    expect(f.markNoShow).toHaveBeenCalledTimes(8);
    expect(logs.error).toEqual([
      'Không đánh Vắng mặt được lịch 6: Error (RangeError)',
      'Không đánh Vắng mặt được lịch 7: Error (ConfigMissing)',
    ]);
  });

  it('tranh chấp khoá: 1213 hai lần rồi thành công ⇒ vẫn NoShowed (vỏ chạy lại thân); 1213 ba lần ⇒ Failed Busy sau đúng 3 lần chạy, lịch khác vẫn được xử lý', async () => {
    const f = fixture();
    f.batches.push(['1', '2']);
    f.markNoShow
      .mockRejectedValueOnce(mysqlError(1213))
      .mockRejectedValueOnce(mysqlError(1213))
      .mockResolvedValueOnce(NO_SHOWED) // lịch 1: lần chạy thứ 3 thành công
      .mockRejectedValueOnce(mysqlError(1213))
      .mockRejectedValueOnce(mysqlError(1205))
      .mockRejectedValueOnce(mysqlError(1213)) // lịch 2: hết lượt
      .mockResolvedValue(NO_SHOWED);
    const summary = await f.service.sweep(NOW);
    expect(summary).toEqual({ ...ZERO, noShowed: 1, failedBusy: 1 });
    expect(f.markNoShow).toHaveBeenCalledTimes(6);
    expect(logs.warn.filter((l) => l.startsWith('Không đánh'))).toEqual([
      'Không đánh Vắng mặt được lịch 2: Busy (AppException); giao dịch đã hoàn tác, lượt sau thử lại',
    ]);
  });

  it('lịch lỗi không chặn lịch sau trong cùng lô, và lô sau vẫn được đọc từ con trỏ (id cuối của lô trước, kể cả khi lịch cuối lỗi)', async () => {
    const f = fixture();
    f.batches.push(ids(1, 100), ids(101, 1));
    f.markNoShow.mockRejectedValue(new Error('hỏng'));
    const summary = await f.service.sweep(NOW);
    expect(summary).toEqual({ ...ZERO, failedError: 101 });
    expect(candidateCalls(f)).toHaveLength(2);
    expect(candidateCalls(f)[1]?.[1]).toEqual([NOW, NOW, '100', 100]);
  });

  it('một lịch lỗi giữa lượt không làm hoàn tác lịch khác: mỗi giao dịch đóng riêng (lịch 2 lỗi, lịch 1 và 3 vẫn NoShowed)', async () => {
    const f = fixture();
    f.batches.push(ids(1, 3));
    f.markNoShow
      .mockResolvedValueOnce(NO_SHOWED)
      .mockRejectedValueOnce(new TypeError('hỏng'))
      .mockResolvedValueOnce(NO_SHOWED);
    const summary = await f.service.sweep(NOW);
    expect(summary).toEqual({ ...ZERO, noShowed: 2, failedError: 1 });
    expect(f.transaction).toHaveBeenCalledTimes(3);
  });

  it('log từng lịch lỗi chỉ có mã lịch, lý do và TÊN lớp lỗi: lỗi mang email không lọt vào dòng log nào', async () => {
    const f = fixture();
    f.batches.push(ids(41, 2));
    const lockTimeout = () =>
      Object.assign(new Error(`khoá ${SECRET_EMAIL}`), {
        errno: 1205,
        code: 'ER_LOCK_WAIT_TIMEOUT',
      });
    f.markNoShow
      .mockRejectedValueOnce(new TypeError(`lỗi ${SECRET_EMAIL}`))
      .mockRejectedValueOnce(lockTimeout())
      .mockRejectedValueOnce(lockTimeout())
      .mockRejectedValueOnce(lockTimeout()); // lịch 42: hết lượt thử lại
    await f.service.sweep(NOW);
    expect(allLines(logs).join('\n')).not.toContain('example.com');
    expect(logs.error).toEqual([
      'Không đánh Vắng mặt được lịch 41: Error (TypeError)',
    ]);
    expect(logs.warn.filter((l) => l.startsWith('Không đánh'))).toEqual([
      'Không đánh Vắng mặt được lịch 42: Busy (AppException); giao dịch đã hoàn tác, lượt sau thử lại',
    ]);
  });

  it('câu chọn lô thứ hai ném: sweep ném, nhưng tóm tắt truyền vào vẫn giữ các lịch của lô đầu (để job ghi đủ)', async () => {
    const f = fixture();
    let selects = 0;
    f.query.mockImplementation((sql: string) => {
      if (isCountSql(sql)) return Promise.resolve([{ n: 0 }]);
      selects += 1;
      return selects === 1
        ? Promise.resolve(ids(1, 100).map((id) => ({ lichHenId: id })))
        : Promise.reject(new Error('mất kết nối'));
    });
    const summary = emptyNoShowSummary();
    await expect(f.service.sweep(NOW, summary)).rejects.toThrow('mất kết nối');
    expect(summary).toEqual({ ...ZERO, noShowed: 100 });
  });
});
