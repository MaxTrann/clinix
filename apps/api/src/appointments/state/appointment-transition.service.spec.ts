import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import {
  captureLogsByLevel,
  type LogsByLevel,
} from '../../auth/testing/log-levels.js';
import {
  BOOKING_ERROR_CODES,
  HOLD_EXPIRED_CANCEL_REASON,
} from '../appointments.constants.js';
import { SlotHoldService } from '../slots/slot-hold.service.js';
import {
  FakeAppointmentNotifier,
  FakeWaitlistPort,
} from '../testing/fake-ports.js';
import { canTransition } from './appointment-state.matrix.js';
import {
  AppointmentTransitionService,
  type ExpireOutcome,
} from './appointment-transition.service.js';

// Task B9 — TRX-01…TRX-07 (PLAN booking 7.26; TRACKING 3.19.3): `AppointmentTransitionService.expire` với DataSource GIẢ và lỗi lập trình sẵn (không DB). Ca MySQL thật (thứ tự khoá bằng
// câu SQL thật, INV-01…INV-05) là TRX-08, TRX-09 ở appointment-transition.service.int-spec.ts. Đồng hồ là tham số `now` (không giả đồng hồ).
const NOW = new Date('2026-11-02T09:15:00+07:00');
const LICH_HEN_ID = '41';
const KHUNG_GIO_ID = '7';

interface Script {
  keys: unknown[];
  slot: unknown[];
  holder: unknown[];
  cancel: { affectedRows: number };
  release: { affectedRows: number };
}

const slotRow = (ngayGio: string) => ({
  khungGioId: KHUNG_GIO_ID,
  lichLamViecId: '3',
  ngayGio,
  trangThai: 'DangGiuCho',
  giuChoDen: '2026-11-02 09:15:00',
});

// Kịch bản mặc định: lịch `ChoThanhToan` có hạn đúng bằng `NOW` (biên nửa mở: hết hạn), khung giờ `DangGiuCho` cùng hạn, giờ hẹn 10/11 (tương lai)
const defaultScript = (): Script => ({
  keys: [{ khungGioId: KHUNG_GIO_ID }],
  slot: [slotRow('2026-11-10 08:00:00')],
  holder: [{ trangThai: 'ChoThanhToan', hanThanhToan: '2026-11-02 09:15:00' }],
  cancel: { affectedRows: 1 },
  release: { affectedRows: 1 },
});

const mysqlError = (errno: number) =>
  Object.assign(new Error('lỗi MySQL giả'), {
    errno,
    code: errno === 1213 ? 'ER_LOCK_DEADLOCK' : 'ER_LOCK_WAIT_TIMEOUT',
  });

class FakeDb {
  runs = 0;
  rollbacks = 0;
  /** Thứ tự: `begin`, `q <đầu câu SQL>`, `commit`, `rollback`; test thêm mốc của cổng */
  readonly events: string[] = [];
  readonly queries: { sql: string; params: unknown[] }[] = [];
  /** Lỗi ném SAU khi thân đã trả (lúc COMMIT) */
  commitFailure: unknown = undefined;
  /** Bơm lỗi cho một câu của lần chạy thứ `run`: trả lỗi cần ném hoặc `undefined` */
  failQuery: (run: number, sql: string) => unknown = () => undefined;

  constructor(readonly script: Script) {}

  private respond(sql: string): unknown {
    if (sql.startsWith('SELECT @@session')) return [{ value: '50' }];
    if (sql.startsWith('SET SESSION')) return [];
    if (sql.includes('FROM khung_gio') && sql.includes('FOR UPDATE'))
      return this.script.slot;
    if (sql.includes('FROM lich_hen') && sql.includes('FOR UPDATE'))
      return this.script.holder;
    if (sql.includes('FROM lich_hen')) return this.script.keys;
    if (sql.startsWith('UPDATE lich_hen')) return this.script.cancel;
    if (sql.startsWith('UPDATE khung_gio')) return this.script.release;
    throw new Error(`câu lạ: ${sql}`);
  }

  async transaction<T>(
    _level: string,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    this.runs += 1;
    const run = this.runs;
    this.events.push('begin');
    const manager = {
      query: (sql: string, params: unknown[] = []) => {
        this.queries.push({ sql, params });
        this.events.push(`q ${sql.slice(0, 24).replace(/\s+/g, ' ')}`);
        const failure = this.failQuery(run, sql);
        if (failure !== undefined) return Promise.reject(failure as Error);
        return Promise.resolve(this.respond(sql));
      },
    } as unknown as EntityManager;
    let result: T;
    try {
      result = await work(manager);
    } catch (error) {
      this.rollbacks += 1;
      this.events.push('rollback');
      throw error;
    }
    if (this.commitFailure !== undefined) {
      this.rollbacks += 1;
      this.events.push('rollback');
      throw this.commitFailure;
    }
    this.events.push('commit');
    return result;
  }

  /** Các câu `UPDATE` đã gửi (kể cả ở lần chạy bị hoàn tác) */
  get updates(): string[] {
    return this.queries
      .map((q) => q.sql)
      .filter((sql) => sql.startsWith('UPDATE'));
  }
}

function setup(script: Script = defaultScript()) {
  const db = new FakeDb(script);
  const waitlist = new FakeWaitlistPort();
  waitlist.onSlotReleasedCall.onCall(() => {
    db.events.push('onSlotReleased');
  });
  const service = new AppointmentTransitionService(
    db as unknown as DataSource,
    new SlotHoldService(),
    waitlist,
    new FakeAppointmentNotifier(),
  );
  const expire = (now: Date = NOW): Promise<ExpireOutcome> =>
    service.expire({ lichHenId: LICH_HEN_ID, now });
  return { db, waitlist, service, expire };
}

let logs: LogsByLevel;

beforeEach(() => {
  logs = captureLogsByLevel();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TRX-01 khuôn: ô ma trận của expire, chữ lý do huỷ, mốc cắt giây', () => {
  it('ma trận có ô HeThong ChoThanhToan sang DaHuy (expire không gọi canTransition lúc chạy: ô là hằng)', () => {
    expect(
      canTransition({
        actor: 'HeThong',
        from: 'ChoThanhToan',
        to: 'DaHuy',
      }),
    ).toEqual({ ok: true });
  });

  it('lịch hết hạn đúng biên (hạn = now): Expired; UPDATE ghi `thoi_diem_huy` = mốc đã cắt xuống giây và CHỮ lý do `Hết thời gian giữ chỗ` (ghim chữ cho D2, 2.4 b19)', async () => {
    const { db, expire } = setup();
    const withMillis = new Date('2026-11-02T09:15:00.789+07:00');
    await expect(expire(withMillis)).resolves.toEqual({
      kind: 'Expired',
      khungGioId: KHUNG_GIO_ID,
    });
    expect(HOLD_EXPIRED_CANCEL_REASON).toBe('Hết thời gian giữ chỗ');
    const cancel = db.queries.find((q) => q.sql.startsWith('UPDATE lich_hen'));
    expect(cancel?.params).toEqual([NOW, 'Hết thời gian giữ chỗ', LICH_HEN_ID]);
    // khung giờ thả có điều kiện đúng hạn đã đọc dưới khoá: `DangGiuCho` và `giu_cho_den` = 09:15:00
    const release = db.queries.find((q) =>
      q.sql.startsWith('UPDATE khung_gio'),
    );
    expect(release?.params).toEqual([KHUNG_GIO_ID, 'DangGiuCho', NOW]);
  });
});

describe('TRX-02 thử lại 1213: cổng chỉ gọi MỘT lần, SAU commit', () => {
  it('1213 ở lần chạy đầu rồi thành công: Expired, lần đầu bị hoàn tác không gọi cổng, cổng gọi đúng một lần với khung giờ đó', async () => {
    const { db, waitlist, expire } = setup();
    db.failQuery = (run, sql) =>
      run === 1 && sql.includes('FROM khung_gio')
        ? mysqlError(1213)
        : undefined;
    await expect(expire()).resolves.toEqual({
      kind: 'Expired',
      khungGioId: KHUNG_GIO_ID,
    });
    expect(db.runs).toBe(2);
    expect(db.rollbacks).toBe(1);
    expect(waitlist.releasedSlotIds).toEqual([KHUNG_GIO_ID]);
  });

  it('thứ tự: cổng được gọi SAU `commit` (không nằm trong thân giao dịch)', async () => {
    const { db, expire } = setup();
    await expire();
    const commit = db.events.indexOf('commit');
    const port = db.events.indexOf('onSlotReleased');
    expect(commit).toBeGreaterThan(-1);
    expect(port).toBeGreaterThan(commit);
    expect(db.events.filter((e) => e === 'onSlotReleased')).toHaveLength(1);
  });
});

describe('TRX-03 hết lượt thử lại ⇒ Failed (không ném, không gọi cổng)', () => {
  it.each([1213, 1205])(
    'MySQL %i ở cả ba lần chạy: Failed Busy (503 HE_THONG_DANG_BAN đã được bắt), cổng không gọi, 3 lần hoàn tác',
    async (errno) => {
      const { db, waitlist, expire } = setup();
      db.failQuery = (_run, sql) =>
        sql.includes('FROM khung_gio') ? mysqlError(errno) : undefined;
      await expect(expire()).resolves.toEqual({
        kind: 'Failed',
        reason: 'Busy',
        errorName: 'AppException',
      });
      expect(db.runs).toBe(3);
      expect(db.rollbacks).toBe(3);
      expect(waitlist.onSlotReleasedCall.count).toBe(0);
      // mã lỗi giả định cho kiểm tra: lỗi đã bắt đúng là 503 của booking
      expect(BOOKING_ERROR_CODES.SYSTEM_BUSY).toBe('HE_THONG_DANG_BAN');
    },
  );

  it('lỗi tranh chấp thô lọt ra lúc COMMIT (không thử lại sau commit): Failed Busy, cổng không gọi', async () => {
    const { db, waitlist, expire } = setup();
    db.commitFailure = mysqlError(1213);
    await expect(expire()).resolves.toMatchObject({
      kind: 'Failed',
      reason: 'Busy',
    });
    expect(db.runs).toBe(1);
    expect(waitlist.onSlotReleasedCall.count).toBe(0);
  });

  it('AppException khác (không phải HE_THONG_DANG_BAN) là Error, không phải Busy', async () => {
    const { db, expire } = setup();
    db.failQuery = (_run, sql) =>
      sql.includes('FROM khung_gio')
        ? new AppException(409, 'MA_LOI_KHAC')
        : undefined;
    await expect(expire()).resolves.toEqual({
      kind: 'Failed',
      reason: 'Error',
      errorName: 'AppException',
    });
  });
});

describe('TRX-04 cổng WaitlistPort lỗi sau commit: lịch vẫn hết hạn', () => {
  it('cổng ném (thông điệp có email): vẫn Expired, một dòng ERROR chỉ có khungGioId và tên lớp lỗi', async () => {
    const { db, waitlist, expire } = setup();
    waitlist.onSlotReleasedCall.throwsOnce(
      new TypeError('không gửi được cho nguoi.dung@example.com'),
    );
    await expect(expire()).resolves.toEqual({
      kind: 'Expired',
      khungGioId: KHUNG_GIO_ID,
    });
    expect(db.events).toContain('commit');
    expect(logs.error).toHaveLength(1);
    expect(logs.error[0]).toContain(KHUNG_GIO_ID);
    expect(logs.error[0]).toContain('TypeError');
    expect(logs.error[0]).not.toContain('example.com');
    // không thử lại cổng
    expect(waitlist.onSlotReleasedCall.count).toBe(1);
  });
});

describe('TRX-05 biên khung giờ đã qua: không báo danh sách chờ (HG-08, mức đơn vị)', () => {
  it.each([
    ['2026-11-02 09:14:59', false], // giờ hẹn trước now
    ['2026-11-02 09:15:00', false], // đúng bằng now: đã qua (Q5)
    ['2026-11-02 09:15:01', true], // sau now 1 giây: còn ở tương lai
  ])(
    'giờ hẹn %s: báo = %s, khung giờ vẫn được thả',
    async (ngayGio, notified) => {
      const script = defaultScript();
      script.slot = [slotRow(ngayGio)];
      const { db, waitlist, expire } = setup(script);
      await expect(expire()).resolves.toEqual({
        kind: 'Expired',
        khungGioId: KHUNG_GIO_ID,
      });
      expect(db.updates).toHaveLength(2); // lịch `DaHuy` và khung giờ `ConTrong` đều ghi
      expect(waitlist.releasedSlotIds).toEqual(notified ? [KHUNG_GIO_ID] : []);
    },
  );
});

describe('TRX-06 ánh xạ NotDue: không ghi gì, không báo cổng', () => {
  it.each<[string, Partial<Script>, string]>([
    ['không có hàng lich_hen', { keys: [] }, 'NotFound'],
    [
      'đã thanh toán giữa chừng (DaXacNhan)',
      { holder: [{ trangThai: 'DaXacNhan', hanThanhToan: null }] },
      'NotPending',
    ],
    [
      'đã huỷ giữa chừng (DaHuy)',
      { holder: [{ trangThai: 'DaHuy', hanThanhToan: null }] },
      'NotPending',
    ],
    ['lịch biến mất giữa lúc đọc và lúc khoá', { holder: [] }, 'NotPending'],
    [
      'còn ChoThanhToan nhưng hạn sau now 1 giây',
      {
        holder: [
          { trangThai: 'ChoThanhToan', hanThanhToan: '2026-11-02 09:15:01' },
        ],
      },
      'NotLapsed',
    ],
    [
      'ChoThanhToan không có hạn (dữ liệu hỏng): không huỷ thứ không có hạn',
      { holder: [{ trangThai: 'ChoThanhToan', hanThanhToan: null }] },
      'NotLapsed',
    ],
  ])('%s', async (_name, override, reason) => {
    const { db, waitlist, expire } = setup({ ...defaultScript(), ...override });
    await expect(expire()).resolves.toEqual({ kind: 'NotDue', reason });
    expect(db.updates).toEqual([]);
    expect(db.events).toContain('commit');
    expect(waitlist.onSlotReleasedCall.count).toBe(0);
  });

  it('`UPDATE lich_hen` ảnh hưởng 0 hàng (lịch đổi ngay trước câu UPDATE): NotPending, khung giờ KHÔNG bị thả', async () => {
    const script = defaultScript();
    script.cancel = { affectedRows: 0 };
    const { db, waitlist, expire } = setup(script);
    await expect(expire()).resolves.toEqual({
      kind: 'NotDue',
      reason: 'NotPending',
    });
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0]).toMatch(/^UPDATE lich_hen/);
    expect(waitlist.onSlotReleasedCall.count).toBe(0);
  });
});

describe('TRX-07 dữ liệu lệch ⇒ Failed Error và hoàn tác (nhánh phòng thủ của B6b)', () => {
  it('khung giờ của lịch không tồn tại (lockSlot rỗng): Failed Error, không ghi gì', async () => {
    const script = defaultScript();
    script.slot = [];
    const { db, waitlist, expire } = setup(script);
    await expect(expire()).resolves.toEqual({
      kind: 'Failed',
      reason: 'Error',
      errorName: 'Error',
    });
    expect(db.updates).toEqual([]);
    expect(db.rollbacks).toBe(1);
    expect(db.events).not.toContain('commit');
    expect(waitlist.onSlotReleasedCall.count).toBe(0);
  });

  it('khung giờ không còn DangGiuCho đúng hạn (release ra 0 hàng) SAU khi lịch đã huỷ: Failed Error, hoàn tác cả hai, cổng không gọi', async () => {
    const script = defaultScript();
    script.release = { affectedRows: 0 };
    const { db, waitlist, expire } = setup(script);
    await expect(expire()).resolves.toEqual({
      kind: 'Failed',
      reason: 'Error',
      errorName: 'Error',
    });
    expect(db.updates).toHaveLength(2); // đã gửi cả hai câu UPDATE …
    expect(db.rollbacks).toBe(1); // … nhưng hoàn tác cả hai, không commit nửa chừng
    expect(db.events).not.toContain('commit');
    expect(waitlist.onSlotReleasedCall.count).toBe(0);
  });

  it('lỗi lạ trong thân (không phải tranh chấp): Failed Error kèm tên lớp lỗi, không ném', async () => {
    const { db, expire } = setup();
    db.failQuery = (_run, sql) =>
      sql.includes('FROM lich_hen') && !sql.includes('FOR UPDATE')
        ? new RangeError('lỗi giả có dữ liệu cá nhân nguoi.dung@example.com')
        : undefined;
    const outcome = await expire();
    expect(outcome).toEqual({
      kind: 'Failed',
      reason: 'Error',
      errorName: 'RangeError',
    });
    expect(JSON.stringify(outcome)).not.toContain('example.com');
  });
});
