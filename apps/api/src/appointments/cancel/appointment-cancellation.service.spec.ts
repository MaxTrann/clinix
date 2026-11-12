import 'reflect-metadata';
import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import { captureLogsByLevel } from '../../auth/testing/log-levels.js';
import { AppException } from '../../common/errors/app.exception.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import {
  BOOKING_ERROR_CODES,
  BOOKING_NOTIFICATION_EVENTS,
  LEAVE_CANCEL_REASON,
  PATIENT_CANCEL_REASON,
} from '../appointments.constants.js';
import type {
  AppointmentTransitionService,
  CancelWriteInput,
  CancelWriteOutcome,
} from '../state/appointment-transition.service.js';
import type { LockedAppointment } from '../state/cancel-appointment.query.js';
import { createFakePorts } from '../testing/fake-ports.js';
import { AppointmentCancellationService } from './appointment-cancellation.service.js';
import type { CancelInput } from './cancel.types.js';

// Task B10 — AppointmentCancellationService với DataSource GIẢ, `AppointmentTransitionService.cancel` GIẢ và bản Fake của các cổng (không DB): phần ĐIỀU PHỐI (một mốc `now`, thứ tự "giao dịch rồi cổng",
// cổng chỉ khi đúng điều kiện, lỗi cổng không đổi kết quả, thân chạy lại, hoàn tác trọn). Phần khoá và ghi thật trên MySQL: appointment-cancellation.service.int-spec.ts (CNL-03…CNL-10, HL-*, DT-*).
// Mã CNL-07…CNL-10 có cả phần đơn vị (ở đây) lẫn phần tích hợp; HL-10, HL-11, HL-12 (mức đơn vị) cũng ở đây. Mã CNL-nn là `[đề xuất]` (PLAN 7.29; TRACKING 3.23 B10-I).
const CODE = 'CLX-20261110-AAA01';
const THOI_GIAN = new Date('2026-11-10T08:00:00+07:00');
// 09:00:00.900 ngày 09/11: còn đúng 23 giờ tới giờ hẹn sau khi cắt mili giây (mốc 24 giờ chưa tới, mốc 2 giờ áp dụng: 50%)
const SYSTEM_TIME = new Date('2026-11-09T09:00:00.900+07:00');
const NOW = new Date('2026-11-09T09:00:00.000+07:00');
const TIERS = [
  { so_gio_truoc_toi_thieu: 24, ty_le_hoan: 100 },
  { so_gio_truoc_toi_thieu: 2, ty_le_hoan: 50 },
  { so_gio_truoc_toi_thieu: 0, ty_le_hoan: 0 },
];
const HALF = { tyLe: 50, soTien: '50000.00' };

const patientInput: CancelInput = {
  maLichHen: CODE,
  actor: { kind: 'BenhNhan', accountId: '77' },
  reason: 'BenhNhanHuy',
};
const leTanInput = (chiNhanhId: string): CancelInput => ({
  maLichHen: CODE,
  actor: { kind: 'LeTan', accountId: '5', chiNhanhId },
  reason: 'LeTanHuy',
  lyDo: 'Bệnh nhân gọi điện',
});
const qtvInput: CancelInput = {
  maLichHen: CODE,
  actor: {
    kind: 'QuanTriVien',
    accountId: '6',
    scope: { kind: 'ToanHeThong' },
  },
  reason: 'QtvOverride',
  lyDo: 'Sửa sai nghiệp vụ',
};
const leaveInput: CancelInput = {
  maLichHen: CODE,
  actor: { kind: 'HeThong' },
  reason: 'BacSiNghiPhep',
};

const mysqlError = (errno: number) =>
  Object.assign(new Error('lỗi MySQL giả'), {
    errno,
    code: errno === 1213 ? 'ER_LOCK_DEADLOCK' : 'ER_LOCK_WAIT_TIMEOUT',
  });

const keysRow = (overrides: Record<string, unknown> = {}) => ({
  lichHenId: '9001',
  maLichHen: CODE,
  khungGioId: '55',
  benhNhanId: '77',
  chiNhanhId: '2',
  trangThai: 'DaXacNhan',
  ...overrides,
});

const lockedRow = (
  overrides: Partial<LockedAppointment> = {},
): LockedAppointment => ({
  benhNhanId: '77',
  chiNhanhId: '2',
  trangThai: 'DaXacNhan',
  thoiGian: THOI_GIAN,
  chinhSachHoan: TIERS,
  ...overrides,
});

/** DataSource giả: ghi thứ tự `begin` → mốc của cổng → `commit` hay `rollback`; chỉ trả lời các câu mà thân của dịch vụ gửi. */
class FakeDb {
  runs = 0;
  readonly events: string[] = [];
  keys: unknown[] = [keysRow()];
  readonly managers: EntityManager[] = [];

  async transaction<T>(
    _level: string,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    this.runs += 1;
    this.events.push('begin');
    const manager = {
      query: (sql: string) => {
        if (sql.startsWith('SELECT @@session'))
          return Promise.resolve([{ value: '50' }]);
        if (sql.startsWith('SET SESSION')) return Promise.resolve([]);
        if (sql.includes('FROM lich_hen WHERE ma_lich_hen'))
          return Promise.resolve(this.keys);
        return Promise.reject(new Error(`câu lạ: ${sql}`));
      },
    } as unknown as EntityManager;
    this.managers.push(manager);
    try {
      const result = await work(manager);
      this.events.push('commit');
      return result;
    } catch (error) {
      this.events.push('rollback');
      throw error;
    }
  }
}

type TransitionResult = CancelWriteOutcome;

function setup() {
  const db = new FakeDb();
  const ports = createFakePorts();
  ports.paymentSummary.paid({ '9001': '100000.00' });
  let result: TransitionResult = { kind: 'Cancelled', before: lockedRow() };
  const cancel = vi.fn(
    (
      _em: EntityManager,
      _input: CancelWriteInput,
    ): Promise<TransitionResult> => {
      db.events.push('transition.cancel');
      return Promise.resolve(result);
    },
  );
  ports.notifier.notifyCall.onCall(() => {
    db.events.push('notify');
  });
  ports.refund.refundCall.onCall(() => {
    db.events.push('refund');
  });
  ports.waitlist.onSlotReleasedCall.onCall(() => {
    db.events.push('waitlist');
  });
  const service = new AppointmentCancellationService(
    db as unknown as DataSource,
    { cancel } as unknown as AppointmentTransitionService,
    new BranchAccessPolicy(),
    ports.paymentSummary,
    ports.refund,
    ports.waitlist,
    ports.notifier,
  );
  return {
    db,
    ports,
    cancel,
    service,
    /** Kết quả mà `AppointmentTransitionService.cancel` giả trả từ giờ */
    transitionReturns: (next: TransitionResult) => {
      result = next;
    },
  };
}

let s: ReturnType<typeof setup>;
beforeEach(() => {
  s = setup();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(SYSTEM_TIME);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const noPortCalls = () => {
  expect(s.ports.refund.refundCall.count).toBe(0);
  expect(s.ports.waitlist.onSlotReleasedCall.count).toBe(0);
};

describe('HL-10, CNL-07 (đơn vị) cổng gọi SAU commit, đúng một lần, đúng số theo bậc', () => {
  it('Bệnh nhân huỷ lịch DaXacNhan đã thu 100.000, còn 23 giờ (mốc 2 giờ ⇒ 50%): giao dịch ghi và thông báo TRƯỚC commit; refund rồi waitlist SAU commit', async () => {
    await expect(s.service.cancel(patientInput)).resolves.toStrictEqual({
      kind: 'Cancelled',
      maLichHen: CODE,
      hoanCoc: HALF,
    });
    expect(s.db.events).toEqual([
      'begin',
      'transition.cancel',
      'notify',
      'commit',
      'refund',
      'waitlist',
    ]);
    expect(s.ports.refund.refundCall.calls).toEqual([
      [{ lichHenId: '9001', soTien: '50000.00', lyDo: PATIENT_CANCEL_REASON }],
    ]);
    expect(s.ports.waitlist.releasedSlotIds).toEqual(['55']);
  });

  it('chỉ MỘT mốc `now` cho cả lượt, đã cắt mili giây: thoi_diem_huy của lần ghi và bậc hoàn dùng cùng giá trị (09:00:00 chứ không 09:00:00.900)', async () => {
    await s.service.cancel(patientInput);
    expect(s.cancel).toHaveBeenCalledTimes(1);
    expect(s.cancel.mock.calls[0]?.[1].now.getTime()).toBe(NOW.getTime());
  });

  it('lịch của Lễ tân: hoàn theo BẬC (như Bệnh nhân); QTV và hệ thống nghỉ phép: hoàn 100% (Q17)', async () => {
    for (const [input, expected] of [
      [leTanInput('2'), HALF],
      [qtvInput, { tyLe: 100, soTien: '100000.00' }],
      [leaveInput, { tyLe: 100, soTien: '100000.00' }],
    ] as const) {
      s = setup();
      const outcome = await s.service.cancel(input);
      expect(outcome).toMatchObject({ kind: 'Cancelled', hoanCoc: expected });
      expect(s.ports.refund.refundCall.calls[0]?.[0]).toMatchObject({
        soTien: expected.soTien,
      });
    }
  });

  it('HL-14 (mức đơn vị): HeThong + BacSiNghiPhep ⇒ hoàn 100% và KHÔNG mời danh sách chờ; ly_do_huy là chữ hằng, đi vào cả lần ghi lẫn lời gọi hoàn', async () => {
    await s.service.cancel(leaveInput);
    expect(s.ports.refund.refundCall.calls[0]?.[0]).toEqual({
      lichHenId: '9001',
      soTien: '100000.00',
      lyDo: LEAVE_CANCEL_REASON,
    });
    expect(s.cancel.mock.calls[0]?.[1].lyDo).toBe(LEAVE_CANCEL_REASON);
    expect(s.ports.waitlist.onSlotReleasedCall.count).toBe(0);
  });

  it('KHÔNG gọi RefundPort khi số hoàn bằng 0: chưa thu đồng nào (cọc 0đ), hoặc thu rồi mà ngoài mọi bậc (còn 1 giờ ⇒ 0%)', async () => {
    s.ports.paymentSummary.paid({}, '0.00');
    await expect(s.service.cancel(patientInput)).resolves.toMatchObject({
      kind: 'Cancelled',
      hoanCoc: null,
    });
    expect(s.ports.refund.refundCall.count).toBe(0);

    s = setup();
    vi.setSystemTime(new Date(THOI_GIAN.getTime() - 3_600_000));
    await expect(s.service.cancel(patientInput)).resolves.toMatchObject({
      kind: 'Cancelled',
      hoanCoc: { tyLe: 0, soTien: '0.00' },
    });
    expect(s.ports.refund.refundCall.count).toBe(0);
    // hoanCoc `null` (chưa thu) khác `{ tyLe: 0 }` (thu mà không hoàn): lịch cọc 0đ KHÔNG đọc snapshot nên snapshot hỏng cũng huỷ được
    s = setup();
    s.ports.paymentSummary.paid({}, '0.00');
    s.transitionReturns({
      kind: 'Cancelled',
      before: lockedRow({ chinhSachHoan: 'hỏng' }),
    });
    await expect(s.service.cancel(patientInput)).resolves.toMatchObject({
      kind: 'Cancelled',
      hoanCoc: null,
    });
  });

  it('refund gọi MỘT lần và KHÔNG gọi lại khi giao dịch chạy lại (kết quả như chạy một lần)', async () => {
    // lần chạy 1 ném 1213 SAU khi đã ghi và thông báo; lần 2 thành công
    s.ports.notifier.notifyCall.throwsOnce(mysqlError(1213));
    await s.service.cancel(patientInput);
    expect(s.db.runs).toBe(2);
    expect(s.db.events).toEqual([
      'begin',
      'transition.cancel',
      'notify',
      'rollback',
      'begin',
      'transition.cancel',
      'notify',
      'commit',
      'refund',
      'waitlist',
    ]);
    expect(s.ports.refund.refundCall.count).toBe(1);
    expect(s.ports.waitlist.onSlotReleasedCall.count).toBe(1);
  });
});

describe('HL-11 (mức đơn vị) lỗi hoàn KHÔNG hoàn tác việc huỷ; log an toàn', () => {
  it.each([
    [
      'cổng ném lỗi',
      (p: ReturnType<typeof setup>) =>
        p.ports.refund.refundCall.throwsOnce(
          new TypeError('SỐ-TIỀN-BÍ-MẬT 50000.00 CLX-20261110-AAA01'),
        ),
    ],
    [
      'cổng trả Failed',
      (p: ReturnType<typeof setup>) => p.ports.refund.result('Failed'),
    ],
  ])(
    '%s: vẫn Cancelled, vẫn mời danh sách chờ, log error không có message, mã lịch hay số tiền',
    async (_name, arrange) => {
      arrange(s);
      const logs = captureLogsByLevel();
      await expect(s.service.cancel(patientInput)).resolves.toMatchObject({
        kind: 'Cancelled',
        hoanCoc: HALF,
      });
      expect(s.db.events).toContain('commit');
      expect(s.db.events).not.toContain('rollback');
      expect(s.ports.waitlist.onSlotReleasedCall.count).toBe(1);
      expect(logs.error).toHaveLength(1);
      const line = logs.error[0] ?? '';
      expect(line).toContain('9001');
      expect(line).not.toContain('SỐ-TIỀN-BÍ-MẬT');
      expect(line).not.toContain(CODE);
      expect(line).not.toContain('50000');
    },
  );

  it('cổng ném: log có TÊN lớp lỗi (không phải thông điệp)', async () => {
    s.ports.refund.refundCall.throwsOnce(new RangeError('x'));
    const logs = captureLogsByLevel();
    await s.service.cancel(patientInput);
    expect(logs.error[0]).toContain('RangeError');
  });
});

describe('HL-12 (mức đơn vị) WaitlistPort: giờ tương lai gọi một lần; giờ đã qua và BacSiNghiPhep không gọi', () => {
  it('giờ hẹn > now ⇒ gọi MỘT lần với khung giờ của lịch', async () => {
    await s.service.cancel(patientInput);
    expect(s.ports.waitlist.releasedSlotIds).toEqual(['55']);
  });

  it.each([
    ['đúng giờ hẹn (<= now, nửa mở như Q5 và expire)', 0],
    ['đã qua giờ hẹn 1 giờ', -3_600_000],
  ])('%s ⇒ KHÔNG gọi', async (_name, remainingMs) => {
    vi.setSystemTime(new Date(THOI_GIAN.getTime() - remainingMs));
    const outcome = await s.service.cancel(patientInput);
    expect(outcome.kind).toBe('Cancelled');
    expect(s.ports.waitlist.onSlotReleasedCall.count).toBe(0);
  });

  it('còn 1 giây tới giờ hẹn ⇒ vẫn gọi (> now)', async () => {
    vi.setSystemTime(new Date(THOI_GIAN.getTime() - 1_000));
    await s.service.cancel(patientInput);
    expect(s.ports.waitlist.onSlotReleasedCall.count).toBe(1);
  });

  it('cổng ném ⇒ chỉ ghi log (id khung giờ và tên lớp lỗi), kết quả vẫn Cancelled', async () => {
    s.ports.waitlist.onSlotReleasedCall.throwsOnce(new Error('SECRET'));
    const logs = captureLogsByLevel();
    await expect(s.service.cancel(patientInput)).resolves.toMatchObject({
      kind: 'Cancelled',
    });
    expect(logs.error).toHaveLength(1);
    expect(logs.error[0]).toContain('55');
    expect(logs.error[0]).not.toContain('SECRET');
  });

  it('lỗi hoàn KHÔNG chặn mời danh sách chờ (mỗi cổng bọc try/catch riêng)', async () => {
    s.ports.refund.refundCall.throwsOnce(new Error('hoàn lỗi'));
    captureLogsByLevel();
    await s.service.cancel(patientInput);
    expect(s.ports.waitlist.onSlotReleasedCall.count).toBe(1);
  });
});

describe('CNL-06 (mức đơn vị) NotFound và các kết quả từ chối: không ghi, không thông báo, không cổng', () => {
  it('không có lịch theo mã ⇒ NotFound, chưa gọi bước ghi', async () => {
    s.db.keys = [];
    await expect(s.service.cancel(patientInput)).resolves.toStrictEqual({
      kind: 'NotFound',
    });
    expect(s.cancel).not.toHaveBeenCalled();
    expect(s.ports.notifier.notifyCall.count).toBe(0);
    noPortCalls();
  });

  it.each([
    [
      'Bệnh nhân khác',
      {
        ...patientInput,
        actor: { kind: 'BenhNhan', accountId: '78' },
      } as CancelInput,
      {},
    ],
    ['Lễ tân chi nhánh khác', leTanInput('3'), {}],
    [
      'Bệnh nhân với lịch DaDoiLich (quyết định (j))',
      patientInput,
      { trangThai: 'DaDoiLich' },
    ],
  ])(
    '%s ⇒ NotFound ở lần đọc thường, TRƯỚC mọi bước ghi',
    async (_name, input, override) => {
      s.db.keys = [keysRow(override)];
      await expect(s.service.cancel(input)).resolves.toStrictEqual({
        kind: 'NotFound',
      });
      expect(s.cancel).not.toHaveBeenCalled();
      noPortCalls();
    },
  );

  it('Lễ tân, Quản trị viên, hệ thống vẫn qua được lịch DaDoiLich ở lần đọc thường (rồi ma trận từ chối ở bước ghi ⇒ NotCancellable)', async () => {
    s.db.keys = [keysRow({ trangThai: 'DaDoiLich' })];
    s.transitionReturns({ kind: 'NotCancellable', trangThai: 'DaDoiLich' });
    for (const input of [leTanInput('2'), qtvInput, leaveInput])
      await expect(s.service.cancel(input)).resolves.toStrictEqual({
        kind: 'NotCancellable',
        trangThai: 'DaDoiLich',
      });
    expect(s.cancel).toHaveBeenCalledTimes(3);
    noPortCalls();
  });

  it.each([
    [{ kind: 'NotFound' }],
    [{ kind: 'AlreadyCancelled' }],
    [{ kind: 'NotCancellable', trangThai: 'DaTiepDon' }],
  ] as const)(
    'bước ghi trả %j ⇒ trả nguyên, commit không ghi gì, KHÔNG thông báo, KHÔNG gọi cổng nào (hai lần huỷ đồng thời chỉ hoàn tiền và mời chờ một lần)',
    async (written) => {
      s.transitionReturns(written);
      await expect(s.service.cancel(patientInput)).resolves.toStrictEqual(
        written,
      );
      expect(s.ports.notifier.notifyCall.count).toBe(0);
      expect(s.ports.paymentSummary.amountPaidCall.count).toBe(0);
      noPortCalls();
    },
  );

  it('bước ghi nhận: lichHenId và khungGioId từ lần đọc thường, actor.kind, ly_do_huy đã chuẩn hoá; canAct kiểm LẠI sở hữu dưới khoá', async () => {
    await s.service.cancel({ ...patientInput, lyDo: '  Bận  ' } as CancelInput);
    const input = s.cancel.mock.calls[0]?.[1];
    expect(input).toMatchObject({
      lichHenId: '9001',
      khungGioId: '55',
      actor: 'BenhNhan',
      lyDo: 'Bận',
    });
    expect(input?.canAct(lockedRow())).toBe(true);
    expect(input?.canAct(lockedRow({ benhNhanId: '78' }))).toBe(false);
    expect(input?.canAct(lockedRow({ trangThai: 'DaDoiLich' }))).toBe(false);
  });

  it('bước ghi và thông báo dùng CÙNG manager của giao dịch', async () => {
    await s.service.cancel(patientInput);
    const manager = s.db.managers[0];
    expect(s.cancel.mock.calls[0]?.[0]).toBe(manager);
    expect(s.ports.notifier.notifyCall.calls[0]?.[0]).toBe(manager);
    expect(s.ports.paymentSummary.amountPaidCall.calls[0]?.[0]).toBe(manager);
  });
});

describe('CNL-09 (mức đơn vị) thông báo ghi TRONG giao dịch, đúng sự kiện và dữ liệu huỷ', () => {
  it('LichHenDaHuy cho TÀI KHOẢN ĐẶT (benh_nhan_id của lịch, kể cả khi Lễ tân hay hệ thống huỷ), kèm reason và hoanCoc đã tính', async () => {
    for (const [input, reason, hoanCoc] of [
      [patientInput, 'BenhNhanHuy', HALF],
      [leTanInput('2'), 'LeTanHuy', HALF],
      [qtvInput, 'QtvOverride', { tyLe: 100, soTien: '100000.00' }],
      [leaveInput, 'BacSiNghiPhep', { tyLe: 100, soTien: '100000.00' }],
    ] as const) {
      s = setup();
      await s.service.cancel(input);
      expect(s.ports.notifier.events).toEqual([
        {
          loaiSuKien: BOOKING_NOTIFICATION_EVENTS.CANCELLED,
          lichHenId: '9001',
          taiKhoanId: '77',
          huy: { reason, hoanCoc },
        },
      ]);
    }
  });

  it('chưa thu đồng nào ⇒ huy.hoanCoc là null', async () => {
    s.ports.paymentSummary.paid({}, '0.00');
    await s.service.cancel(patientInput);
    expect(s.ports.notifier.events[0]?.huy).toEqual({
      reason: 'BenhNhanHuy',
      hoanCoc: null,
    });
  });
});

describe('CNL-08 (mức đơn vị) thân chạy lại khi 1213 hay 1205: không giữ trạng thái, hết lượt ⇒ 503', () => {
  it('1213 ở bước ghi lần 1 rồi thành công: hai lần chạy dùng CÙNG `now`, cùng tham số; cổng đúng một lần', async () => {
    s.cancel.mockRejectedValueOnce(mysqlError(1213));
    await expect(s.service.cancel(patientInput)).resolves.toMatchObject({
      kind: 'Cancelled',
    });
    expect(s.db.runs).toBe(2);
    expect(s.cancel).toHaveBeenCalledTimes(2);
    const [first, second] = s.cancel.mock.calls;
    expect(first?.[1].now.getTime()).toBe(second?.[1].now.getTime());
    expect({ ...first?.[1], canAct: undefined }).toEqual({
      ...second?.[1],
      canAct: undefined,
    });
    expect(s.ports.refund.refundCall.count).toBe(1);
    expect(s.ports.waitlist.onSlotReleasedCall.count).toBe(1);
  });

  it.each([1213, 1205])(
    'hết lượt thử lại (%i ba lần) ⇒ NÉM 503 HE_THONG_DANG_BAN (không phải kết quả nghiệp vụ); không thông báo, không cổng',
    async (errno) => {
      s.cancel.mockRejectedValue(mysqlError(errno));
      const error = await s.service
        .cancel(patientInput)
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus()).toBe(503);
      expect((error as AppException).maLoi).toBe(
        BOOKING_ERROR_CODES.SYSTEM_BUSY,
      );
      expect(s.db.runs).toBe(3);
      expect(s.ports.notifier.notifyCall.count).toBe(0);
      noPortCalls();
    },
  );
});

describe('CNL-10, HL-16 (mức đơn vị) lỗi SAU lần ghi: ném, hoàn tác trọn, không cổng', () => {
  it.each([
    [
      'thông báo lỗi',
      (x: typeof s) =>
        x.ports.notifier.notifyCall.throwsOnce(new Error('thông báo hỏng')),
    ],
    [
      'cổng đọc tiền đã thu lỗi',
      (x: typeof s) =>
        x.ports.paymentSummary.amountPaidCall.throwsOnce(new Error('ví hỏng')),
    ],
    [
      'snapshot hỏng khi đã thu > 0',
      (x: typeof s) =>
        x.transitionReturns({
          kind: 'Cancelled',
          before: lockedRow({ chinhSachHoan: { sai: 1 } }),
        }),
    ],
    [
      'bước ghi báo dữ liệu lệch',
      (x: typeof s) =>
        x.cancel.mockRejectedValueOnce(new Error('khung giờ lệch')),
    ],
  ])(
    '%s ⇒ dịch vụ NÉM Error (không thành kết quả nghiệp vụ), giao dịch rollback, 0 lần gọi RefundPort và WaitlistPort',
    async (_name, arrange) => {
      arrange(s);
      await expect(s.service.cancel(patientInput)).rejects.toThrow(Error);
      expect(s.db.events.at(-1)).toBe('rollback');
      expect(s.db.events).not.toContain('commit');
      noPortCalls();
    },
  );

  it('lý do thiếu của Lễ tân hay Quản trị viên là lỗi lập trình: ném RangeError TRƯỚC khi mở giao dịch (không có begin)', async () => {
    const bad = { ...leTanInput('2'), lyDo: '  ' } as CancelInput;
    await expect(s.service.cancel(bad)).rejects.toThrow(RangeError);
    expect(s.db.runs).toBe(0);
  });
});
