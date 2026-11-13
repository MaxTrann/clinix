import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import {
  allLines,
  captureLogsByLevel,
  type LogsByLevel,
} from '../../auth/testing/log-levels.js';
import {
  listSourceFiles,
  readSource,
  stripComments,
} from '../../doctor/testing/architecture-scan.js';
import { NO_SHOW_CRON, NO_SHOW_JOB_NAME } from '../appointments.constants.js';
import { NoShowJob } from './no-show.job.js';
import {
  emptyNoShowSummary,
  type NoShowSummary,
  type NoShowSweepService,
} from './no-show-sweep.service.js';

// Task B13 — NSJ-04, NSJ-05, NSJ-06 và phần ĐƠN VỊ của VM-16 (PLAN booking 7.35 `[đề xuất]`, 7.6; TRACKING 3.29 B13-C, B13-G, B13-H): lớp `@Cron` mỏng (không DB): một mốc `now`, chống chạy chồng, `run` không ném,
// log chỉ số lượng, cảnh báo ca không có khoảng chỉ khi số đổi, lịch tắt ở NODE_ENV=test. `NoShowSweepService.sweep` giả (lô, giao dịch từng lịch: no-show-sweep.service.spec.ts; dữ liệu thật: no-show.job.int-spec.ts).
const NOW = new Date('2026-11-10T12:00:00+07:00');
const SECRET_EMAIL = 'bi.mat.cua.nguoi.dung@example.com';

type SweepFn = NoShowSweepService['sweep'];

function fixture() {
  const sweep = vi.fn<SweepFn>((_now, summary) =>
    Promise.resolve(summary ?? emptyNoShowSummary()),
  );
  const job = new NoShowJob({ sweep } as unknown as NoShowSweepService);
  return { sweep, job };
}

/** `sweep` giả điền `fill` vào tóm tắt job truyền vào (đúng cách `NoShowSweepService` cộng dồn) */
const fills =
  (fill: Partial<NoShowSummary>): SweepFn =>
  (_now, summary) => {
    const target = summary ?? emptyNoShowSummary();
    Object.assign(target, fill);
    return Promise.resolve(target);
  };

const ZERO = emptyNoShowSummary();

let logs: LogsByLevel;

beforeEach(() => {
  logs = captureLogsByLevel();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('NSJ-04 một mốc now, run không bao giờ ném, chống chạy chồng', () => {
  it('now có mili giây được cắt xuống giây; tóm tắt trả về chính là đối tượng truyền cho sweep', async () => {
    const f = fixture();
    f.sweep.mockImplementation(fills({ noShowed: 2 }));
    const summary = await f.job.run(new Date('2026-11-10T12:00:00.789+07:00'));
    expect(f.sweep).toHaveBeenCalledTimes(1);
    expect(f.sweep.mock.calls[0]?.[0]).toEqual(NOW);
    expect(f.sweep.mock.calls[0]?.[1]).toBe(summary);
    expect(summary).toEqual({ ...ZERO, noShowed: 2 });
  });

  it('run() không tham số lấy đồng hồ ứng dụng, cắt giây', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T12:00:00.250+07:00'));
    const f = fixture();
    await f.job.run();
    expect(f.sweep.mock.calls[0]?.[0]).toEqual(NOW);
  });

  it('đối số lạ không phải Date (bộ lập lịch cron truyền `onComplete`) bị bỏ qua: lấy đồng hồ, không ra mốc rác', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    const f = fixture();
    await f.job.run((() => undefined) as unknown as Date);
    expect(f.sweep.mock.calls[0]?.[0]).toEqual(NOW);
  });

  it('sweep ném (DB sập): run vẫn trả tóm tắt, không ném, ghi ERROR chỉ có tên lớp lỗi; phần đã đánh trước đó vẫn nằm trong tóm tắt; lượt sau vẫn chạy', async () => {
    const f = fixture();
    f.sweep.mockImplementationOnce((_now, summary) => {
      if (summary) summary.noShowed = 100;
      return Promise.reject(new TypeError(`không đọc được ${SECRET_EMAIL}`));
    });
    await expect(f.job.run(NOW)).resolves.toEqual({ ...ZERO, noShowed: 100 });
    expect(logs.error).toEqual([
      'Tự Vắng mặt: lượt bị dừng vì lỗi đọc dữ liệu (TypeError)',
    ]);
    expect(allLines(logs).join('\n')).not.toContain('example.com');
    await expect(f.job.run(NOW)).resolves.toEqual(ZERO);
    expect(f.sweep).toHaveBeenCalledTimes(2);
  });

  it('lượt hai khi lượt đầu còn chạy: trả undefined, không gọi sweep, ghi cảnh báo; xong lượt đầu thì lượt ba chạy được', async () => {
    const f = fixture();
    let release: () => void = () => undefined;
    f.sweep.mockImplementationOnce(
      (_now, summary) =>
        new Promise((resolve) => {
          release = () => {
            resolve(summary ?? emptyNoShowSummary());
          };
        }),
    );
    const first = f.job.run(NOW);
    await expect(f.job.run(NOW)).resolves.toBeUndefined();
    expect(f.sweep).toHaveBeenCalledTimes(1);
    expect(logs.warn).toEqual([
      'Lượt tự Vắng mặt trước vẫn đang chạy: bỏ qua lượt này',
    ]);

    release();
    await expect(first).resolves.toEqual(ZERO);
    await expect(f.job.run(NOW)).resolves.toEqual(ZERO);
    expect(f.sweep).toHaveBeenCalledTimes(2);
  });
});

describe('NSJ-05 log chỉ có số lượng và tên lớp lỗi; cảnh báo ca không có khoảng là MỘT con số và chỉ khi đổi (VM-11, VM-12)', () => {
  it('có việc: đúng MỘT dòng log tổng kết (kèm "còn ứng viên" khi hết trần); không việc: chỉ debug', async () => {
    const f = fixture();
    f.sweep.mockImplementationOnce(
      fills({
        noShowed: 5,
        notConfirmed: 2,
        notDue: 1,
        failedBusy: 1,
        failedError: 2,
      }),
    );
    await f.job.run(NOW);
    expect(logs.log).toEqual([
      'Tự Vắng mặt: đã đánh 5, không còn DaXacNhan 2, chưa đến hạn 1, lỗi 3 (bận 1, khác 2)',
    ]);

    logs = captureLogsByLevel();
    const g = fixture();
    await g.job.run(NOW);
    expect(logs.log).toEqual([]);
    expect(logs.debug).toEqual(['Tự Vắng mặt: không có lịch nào đến hạn']);

    logs = captureLogsByLevel();
    const h = fixture();
    h.sweep.mockImplementationOnce(fills({ noShowed: 1000, more: true }));
    await h.job.run(NOW);
    expect(logs.log[0]).toContain('; còn ứng viên chờ lượt sau');
  });

  it('thiếu cấu hình: MỘT cảnh báo, không dòng tổng kết, không debug (VM-12)', async () => {
    const f = fixture();
    f.sweep.mockImplementationOnce(fills({ configMissing: true }));
    await f.job.run(NOW);
    expect(logs.warn).toEqual([
      'Tự Vắng mặt: chưa có cấu hình hệ thống, bỏ lượt (không đoán ngưỡng no-show)',
    ]);
    expect(logs.log).toEqual([]);
    expect(logs.debug).toEqual([]);
  });

  it('ca không có khoảng: cảnh báo MỘT con số cho cả lượt, CHỈ khi số khác lượt trước (0 → 5 ghi, 5 → 5 không, 5 → 7 ghi, 7 → 0 không, 0 → 3 ghi)', async () => {
    const f = fixture();
    const warnings: string[][] = [];
    for (const unattended of [0, 5, 5, 7, 0, 3]) {
      logs = captureLogsByLevel();
      f.sweep.mockImplementationOnce(fills({ unattended }));
      await f.job.run(NOW);
      warnings.push(logs.warn);
    }
    const line = (n: number) =>
      `Tự Vắng mặt: ${String(n)} lịch DaXacNhan đã quá giờ hẹn nhưng ca không có giờ kết thúc (ca tối hay chi nhánh không có khoảng nhận khám): không tự đánh, cần Lễ tân hay Quản trị viên xử lý`;
    expect(warnings).toEqual([[], [line(5)], [], [line(7)], [], [line(3)]]);
  });

  it('lượt dừng giữa chừng (sweep ném) không cập nhật số ca không có khoảng và không cảnh báo số đó', async () => {
    const f = fixture();
    f.sweep.mockImplementationOnce(fills({ unattended: 5 }));
    await f.job.run(NOW);
    expect(logs.warn).toHaveLength(1);

    logs = captureLogsByLevel();
    f.sweep.mockImplementationOnce((_now, summary) => {
      if (summary) summary.unattended = 0; // giá trị mặc định chưa đếm
      return Promise.reject(new Error('hỏng'));
    });
    await f.job.run(NOW);
    expect(logs.warn).toEqual([]); // không coi 0 là "số đã đổi"

    logs = captureLogsByLevel();
    f.sweep.mockImplementationOnce(fills({ unattended: 5 }));
    await f.job.run(NOW);
    expect(logs.warn).toEqual([]); // vẫn là 5 như lượt hoàn tất gần nhất
  });
});

// NSJ-06 (VM-08 phần kiến trúc): job chỉ chọn ứng viên và gọi `markNoShow`; không giải phóng khung giờ, không `WaitlistPort`, không thông báo riêng, không `UPDATE` bảng nào (AR-06 phủ phía SQL; đây phủ
// phía tên lớp và cổng). Quét mã nguồn của `noshow/` (bỏ test, bỏ comment).
const NOSHOW_DIR = fileURLToPath(new URL('.', import.meta.url));
const FORBIDDEN_IN_NOSHOW: readonly { name: string; pattern: RegExp }[] = [
  { name: 'WaitlistPort', pattern: /\bWAITLIST_PORT\b|\bWaitlistPort\b/ },
  { name: 'SlotHoldService', pattern: /\bSlotHoldService\b/ },
  {
    name: 'AppointmentNotifier',
    pattern: /\bAPPOINTMENT_NOTIFIER\b|\bAppointmentNotifier\b/,
  },
  {
    name: 'UPDATE bảng',
    pattern: /\bUPDATE\s+`?(lich_hen|khung_gio|benh_nhan)`?(?!\w)/i,
  },
  { name: 'ghi trực tiếp', pattern: /\b(INSERT\s+INTO|DELETE\s+FROM)\b/i },
];

const violationsIn = (path: string, source: string): string[] =>
  FORBIDDEN_IN_NOSHOW.filter(({ pattern }) =>
    pattern.test(stripComments(source)),
  ).map(({ name }) => `${path}: ${name}`);

describe('NSJ-06 noshow/ không giải phóng khung giờ, không WaitlistPort, không thông báo riêng, không ghi bảng nào (VM-08)', () => {
  it('mã nguồn thật của noshow/ sạch', () => {
    const files = listSourceFiles(NOSHOW_DIR);
    expect(files.length).toBeGreaterThanOrEqual(3);
    const violations = files.flatMap((file) =>
      violationsIn(file, readSource(file)),
    );
    expect(violations).toEqual([]);
  });

  it('bộ quét THẤY lỗi thật (đột biến): mỗi mẫu cấm bị bắt; chữ trong comment và tên giống nhau không bị bắt nhầm', () => {
    const bad = [
      'constructor(private readonly waitlist: WaitlistPort) {}',
      'import { SlotHoldService } from "../slots/slot-hold.service.js";',
      '@Inject(APPOINTMENT_NOTIFIER) private readonly notifier',
      'em.query("UPDATE lich_hen SET trang_thai = ?")',
      'em.query("UPDATE `benh_nhan` SET so_lan_no_show = 0")',
      'em.query("UPDATE khung_gio SET trang_thai = ?")',
      'em.query("DELETE FROM thong_bao")',
    ];
    for (const source of bad)
      expect(violationsIn('mau.ts', source), source).not.toEqual([]);
    const fine = [
      '// không gọi WaitlistPort, không SlotHoldService, không UPDATE lich_hen',
      '/** không AppointmentNotifier */ const a = 1;',
      'em.query("SELECT 1 FROM lich_hen_cu")',
      'const updateLichHen = 1;',
    ];
    for (const source of fine)
      expect(violationsIn('mau.ts', source), source).toEqual([]);
  });
});

// Lịch: `@Cron` lưu cấu hình thành metadata trên hàm; `disabled` được tính LÚC NẠP MODULE từ NODE_ENV nên phải nạp lại module cho từng giá trị (nếp A7, HG-09 của B9).
describe('VM-16 lịch chạy: tắt ở NODE_ENV=test (phần đơn vị)', () => {
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
    const fresh = await import('./no-show.job.js');
    const run: unknown = Reflect.get(fresh.NoShowJob.prototype, 'run');
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

  it('đăng ký đúng tên và đúng biểu thức (mỗi 5 phút vào giây 40, cron 6 trường)', async () => {
    const options = await cronOptionsUnder('production');
    expect(options.name).toBe(NO_SHOW_JOB_NAME);
    expect(options.name).toBe('booking-no-show');
    expect(options.cronTime).toBe(NO_SHOW_CRON);
    expect(NO_SHOW_CRON).toBe('40 */5 * * * *');
  });

  it('run(now) gọi được trực tiếp từ test khi cron tắt', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const f = fixture();
    await expect(f.job.run(NOW)).resolves.toEqual(ZERO);
  });
});
