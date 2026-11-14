import 'reflect-metadata';
import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import type { TrangThaiLichHen } from '../../admin/entities/enums.js';
import type { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import type { AppointmentCancellationService } from '../cancel/appointment-cancellation.service.js';
import type { CancelOutcome } from '../cancel/cancel.types.js';
import type { PaymentSummaryPort } from '../ports/payment.port.js';
import type {
  AppointmentTransitionService,
  CheckInInput,
  CheckInOutcome,
  MarkNoShowInput,
  MarkNoShowOutcome,
} from '../state/appointment-transition.service.js';
import { mysqlError } from '../testing/scripted-entity-manager.js';
import { CONFIG } from '../testing/status-unit-helpers.js';
import { ReceptionStatusService } from './reception-status.service.js';

// Task B12 — RTS-06: ReceptionStatusService với phụ thuộc GIẢ, `DataSource` giả và `runReadOnly` giả (không DB): phạm vi tài khoản trước mọi thứ, rẽ đúng đích, cấu hình và `now` đọc MỘT lần NGOÀI giao dịch (thân chạy
// lại khi 1213 không đọc lại), 404 trước mọi kiểm tra trạng thái, kết quả có kiểu đổi sang lỗi API SAU giao dịch (PLAN booking 5.7; CT-09, CT-10; TRACKING 3.26 B12-E). Chạy thật trên MySQL: `reception-status.int-spec.ts`
// (RTS-xx, CT-xx) và e2e `booking-reception-status.e2e-spec.ts`.
const hoisted = vi.hoisted(() => ({ readOnlyRows: [] as unknown[] }));
vi.mock('../../common/transaction/read-only-tx.js', () => ({
  runReadOnly: vi.fn(
    (_db: unknown, work: (manager: unknown) => Promise<unknown>) =>
      work({ query: () => Promise.resolve(hoisted.readOnlyRows) }),
  ),
}));

const CODE = 'CLX-20261110-AAA01';
const ACCOUNT = '5';
const BRANCH = '2';
const OTHER_BRANCH = '3';
// 08:05:30.700 giờ Việt Nam: sau `toSecond` là 08:05:30.000
const SYSTEM_TIME = new Date('2026-11-10T08:05:30.700+07:00');
const NOW = new Date('2026-11-10T08:05:30.000+07:00');

const keysRow = (overrides: Record<string, unknown> = {}) => ({
  lichHenId: '9001',
  maLichHen: CODE,
  khungGioId: '55',
  benhNhanId: '77',
  chiNhanhId: BRANCH,
  trangThai: 'DaXacNhan',
  ...overrides,
});

/** DataSource giả: ghi thứ tự `begin`, việc của thân và `commit` hay `rollback`; chỉ trả lời các câu mà vỏ giao dịch và thân của dịch vụ gửi. */
class FakeDb {
  runs = 0;
  readonly events: string[] = [];
  keys: unknown[] = [keysRow()];

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

function setup() {
  const db = new FakeDb();
  const scopes = {
    resolve: vi.fn(() =>
      Promise.resolve({ kind: 'ChiNhanh' as const, chiNhanhId: BRANCH }),
    ),
  };
  const configs = {
    get: vi.fn(() => {
      db.events.push('config.get');
      return Promise.resolve(CONFIG as typeof CONFIG | null);
    }),
  };
  const checkIn = vi.fn(
    (_em: EntityManager, _input: CheckInInput): Promise<CheckInOutcome> => {
      db.events.push('checkIn');
      return Promise.resolve({ kind: 'CheckedIn' });
    },
  );
  const markNoShow = vi.fn(
    (
      _em: EntityManager,
      _input: MarkNoShowInput,
    ): Promise<MarkNoShowOutcome> => {
      db.events.push('markNoShow');
      return Promise.resolve({
        kind: 'NoShowed',
        soLanNoShow: 1,
        khoaDatLich: false,
      });
    },
  );
  const cancel = vi.fn((_input: unknown): Promise<CancelOutcome> =>
    Promise.resolve({ kind: 'Cancelled', maLichHen: CODE, hoanCoc: null }),
  );
  const remainingToCollect = vi.fn((_em: EntityManager, _lichHenId: string) =>
    Promise.resolve('0.00'),
  );
  const service = new ReceptionStatusService(
    db as unknown as DataSource,
    scopes as unknown as ReceptionScopeService,
    configs as unknown as SystemConfigService,
    { checkIn, markNoShow } as unknown as AppointmentTransitionService,
    { cancel } as unknown as AppointmentCancellationService,
    { remainingToCollect } as unknown as PaymentSummaryPort,
  );
  return {
    db,
    scopes,
    configs,
    checkIn,
    markNoShow,
    cancel,
    remainingToCollect,
    service,
  };
}

let s: ReturnType<typeof setup>;
beforeEach(() => {
  s = setup();
  hoisted.readOnlyRows = [keysRow()];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(SYSTEM_TIME);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const errorOf = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('lẽ ra phải ném lỗi');
    },
    (caught: unknown) => caught as AppException,
  );
const noWrites = () => {
  expect(s.cancel).not.toHaveBeenCalled();
  expect(s.checkIn).not.toHaveBeenCalled();
  expect(s.markNoShow).not.toHaveBeenCalled();
};

describe('RTS-06 phạm vi tài khoản và rẽ theo đích', () => {
  it('phạm vi giải TRƯỚC mọi thứ: tài khoản không phải Lễ tân hợp lệ ⇒ 403 KHONG_DU_QUYEN, chưa đọc cấu hình, chưa mở giao dịch, chưa gọi dịch vụ nào (QB-10)', async () => {
    for (const trangThai of [
      'DaHuy',
      'DaTiepDon',
      'VangMat',
      'HoanThanh',
    ] as const) {
      s.scopes.resolve.mockResolvedValueOnce({
        kind: 'ToanHeThong',
      } as unknown as { kind: 'ChiNhanh'; chiNhanhId: string });
      const error = await errorOf(
        s.service.change(ACCOUNT, CODE, { trangThai, lyDo: 'x' }),
      );
      expect(error.getStatus()).toBe(403);
    }
    expect(s.configs.get).not.toHaveBeenCalled();
    expect(s.db.runs).toBe(0);
    noWrites();
  });

  it('chi nhánh lấy từ ReceptionScopeService (không từ thân): tài khoản được truyền cho phạm vi', async () => {
    await s.service.change(ACCOUNT, CODE, { trangThai: 'DaTiepDon' });
    expect(s.scopes.resolve).toHaveBeenCalledExactlyOnceWith(ACCOUNT);
  });
});

describe('RTS-06 đích DaHuy: AppointmentCancellationService (reason LeTanHuy), KHÔNG cần cấu hình (CT-10)', () => {
  it('gọi cancel với actor LeTan (tài khoản và chi nhánh từ phạm vi) và lyDo; trả { maLichHen, trangThai: DaHuy, hoanCoc }; không đọc cấu hình, không tự mở giao dịch', async () => {
    const hoanCoc = { tyLe: 50, soTien: '50000.00' };
    s.cancel.mockResolvedValueOnce({
      kind: 'Cancelled',
      maLichHen: CODE,
      hoanCoc,
    });
    await expect(
      s.service.change(ACCOUNT, CODE, {
        trangThai: 'DaHuy',
        lyDo: 'Bệnh nhân gọi điện',
      }),
    ).resolves.toStrictEqual({ maLichHen: CODE, trangThai: 'DaHuy', hoanCoc });
    expect(s.cancel).toHaveBeenCalledExactlyOnceWith({
      maLichHen: CODE,
      actor: { kind: 'LeTan', accountId: ACCOUNT, chiNhanhId: BRANCH },
      reason: 'LeTanHuy',
      lyDo: 'Bệnh nhân gọi điện',
    });
    expect(s.configs.get).not.toHaveBeenCalled();
    expect(s.db.runs).toBe(0);
  });

  it('huỷ bị từ chối ⇒ cancelOutcomeException của B10: NotFound 404; AlreadyCancelled và NotCancellable 409 LICH_HEN_KHONG_CHO_HUY kèm trangThai (cùng mã với Bệnh nhân)', async () => {
    for (const [outcome, status, trangThai] of [
      [{ kind: 'NotFound' }, 404, undefined],
      [{ kind: 'AlreadyCancelled' }, 409, 'DaHuy'],
      [{ kind: 'NotCancellable', trangThai: 'DaTiepDon' }, 409, 'DaTiepDon'],
    ] as const) {
      s.cancel.mockResolvedValueOnce(outcome);
      const error = await errorOf(
        s.service.change(ACCOUNT, CODE, { trangThai: 'DaHuy', lyDo: 'x' }),
      );
      expect(error.getStatus()).toBe(status);
      if (trangThai !== undefined)
        expect(error.getResponse()).toMatchObject({
          maLoi: 'LICH_HEN_KHONG_CHO_HUY',
          chiTiet: { trangThai },
        });
    }
  });

  it('thiếu lyDo (DTO lẽ ra đã chặn bằng 400): RangeError, KHÔNG gọi cancel', async () => {
    await expect(
      s.service.change(ACCOUNT, CODE, { trangThai: 'DaHuy' }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(s.cancel).not.toHaveBeenCalled();
  });

  it('lỗi hệ thống của dịch vụ huỷ (503 hết lượt thử lại, Error dữ liệu hỏng) đi nguyên ra ngoài', async () => {
    const busy = new AppException(503, 'HE_THONG_DANG_BAN');
    s.cancel.mockRejectedValueOnce(busy);
    await expect(
      s.service.change(ACCOUNT, CODE, { trangThai: 'DaHuy', lyDo: 'x' }),
    ).rejects.toBe(busy);
  });
});

describe('RTS-06 đích DaTiepDon: checkIn trong giao dịch riêng, cấu hình và now MỘT lần ngoài giao dịch', () => {
  it('thứ tự: đọc cấu hình, mở giao dịch, checkIn, commit; đầu vào đúng actor LeTan, chi nhánh, mốc đã cắt mili giây và đúng cấu hình', async () => {
    await expect(
      s.service.change(ACCOUNT, CODE, { trangThai: 'DaTiepDon' }),
    ).resolves.toStrictEqual({ maLichHen: CODE, trangThai: 'DaTiepDon' });
    expect(s.db.events).toEqual(['config.get', 'begin', 'checkIn', 'commit']);
    const input = s.checkIn.mock.calls[0]?.[1] as CheckInInput & {
      actor: 'LeTan';
    };
    expect(input).toMatchObject({
      lichHenId: '9001',
      now: NOW,
      config: CONFIG,
      actor: 'LeTan',
      chiNhanhId: BRANCH,
    });
  });

  it('remainingToCollect chuyển cho cổng PaymentSummaryPort với đúng em của giao dịch và đúng lịch', async () => {
    await s.service.change(ACCOUNT, CODE, { trangThai: 'DaTiepDon' });
    const input = s.checkIn.mock.calls[0]?.[1] as CheckInInput & {
      actor: 'LeTan';
    };
    const manager = { id: 'em-khac' } as unknown as EntityManager;
    await expect(input.remainingToCollect(manager)).resolves.toBe('0.00');
    expect(s.remainingToCollect).toHaveBeenCalledExactlyOnceWith(
      manager,
      '9001',
    );
  });

  it('maLichHen trả về lấy từ DB (mã chuẩn của lịch), không phải chuỗi người gọi gửi', async () => {
    s.db.keys = [keysRow({ maLichHen: 'CLX-20261110-ZZZ99' })];
    await expect(
      s.service.change(ACCOUNT, CODE, { trangThai: 'DaTiepDon' }),
    ).resolves.toMatchObject({ maLichHen: 'CLX-20261110-ZZZ99' });
  });

  it('lịch không có, hay ở chi nhánh khác: 404 TRƯỚC khi xin khoá nào (checkIn KHÔNG được gọi), cùng thân KHONG_TIM_THAY (CT-09)', async () => {
    for (const keys of [[], [keysRow({ chiNhanhId: OTHER_BRANCH })]]) {
      s.db.keys = keys;
      const error = await errorOf(
        s.service.change(ACCOUNT, CODE, { trangThai: 'DaTiepDon' }),
      );
      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toMatchObject({ maLoi: 'KHONG_TIM_THAY' });
    }
    expect(s.checkIn).not.toHaveBeenCalled();
  });

  it.each<[string, CheckInOutcome, number, string, unknown]>([
    [
      'NotFound (dưới khoá)',
      { kind: 'NotFound' },
      404,
      'KHONG_TIM_THAY',
      undefined,
    ],
    [
      'InvalidState',
      { kind: 'InvalidState', trangThai: 'DaTiepDon' },
      409,
      'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
      { tuTrangThai: 'DaTiepDon', denTrangThai: 'DaTiepDon' },
    ],
    [
      'ConfigMissing',
      { kind: 'ConfigMissing' },
      409,
      'HE_THONG_CHUA_CAU_HINH',
      undefined,
    ],
    [
      'OwedAmount',
      { kind: 'OwedAmount', conPhaiThu: '50000.00' },
      409,
      'CON_PHAN_CHUA_THANH_TOAN',
      { conPhaiThu: '50000.00' },
    ],
    [
      'OutsideWindow',
      {
        kind: 'OutsideWindow',
        tu: new Date('2026-11-10T00:30:00.000Z'),
        den: new Date('2026-11-10T01:15:00.000Z'),
      },
      409,
      'NGOAI_KHUNG_GIO_TIEP_DON',
      { tu: '2026-11-10T00:30:00.000Z', den: '2026-11-10T01:15:00.000Z' },
    ],
  ])(
    '%s ⇒ ném SAU khi giao dịch đã đóng (commit trước, lỗi sau)',
    async (_ten, outcome, status, maLoi, chiTiet) => {
      s.checkIn.mockResolvedValueOnce(outcome);
      const error = await errorOf(
        s.service.change(ACCOUNT, CODE, { trangThai: 'DaTiepDon' }),
      );
      expect(error.getStatus()).toBe(status);
      expect(error.getResponse()).toMatchObject({ maLoi });
      if (chiTiet !== undefined)
        expect(error.getResponse()).toMatchObject({ chiTiet });
      expect(s.db.events.at(-1)).toBe('commit');
    },
  );

  it('chưa có cấu hình: vẫn gọi checkIn với config null (thứ tự kiểm do ma trận quyết: 404 và "nguồn không hợp lệ" đứng TRƯỚC 409 HE_THONG_CHUA_CAU_HINH)', async () => {
    s.configs.get.mockResolvedValueOnce(null);
    await s.service.change(ACCOUNT, CODE, { trangThai: 'DaTiepDon' });
    expect(s.checkIn.mock.calls[0]?.[1]).toMatchObject({ config: null });
  });
});

describe('RTS-06 đích VangMat: markNoShow trong giao dịch riêng', () => {
  it('thứ tự: đọc cấu hình, mở giao dịch, markNoShow, commit; đầu vào đúng actor LeTan, chi nhánh, mốc và cấu hình; trả hai khoá { maLichHen, trangThai }', async () => {
    await expect(
      s.service.change(ACCOUNT, CODE, { trangThai: 'VangMat' }),
    ).resolves.toStrictEqual({ maLichHen: CODE, trangThai: 'VangMat' });
    expect(s.db.events).toEqual([
      'config.get',
      'begin',
      'markNoShow',
      'commit',
    ]);
    expect(s.markNoShow.mock.calls[0]?.[1]).toMatchObject({
      lichHenId: '9001',
      now: NOW,
      config: CONFIG,
      actor: 'LeTan',
      chiNhanhId: BRANCH,
    });
  });

  it('KHÔNG trả số lần no-show hay cờ khoá (không có trong Figma 489:2)', async () => {
    const result = await s.service.change(ACCOUNT, CODE, {
      trangThai: 'VangMat',
    });
    expect(Object.keys(result).sort()).toEqual(['maLichHen', 'trangThai']);
  });

  it('lịch không có hay ở chi nhánh khác: 404 TRƯỚC khoá, markNoShow KHÔNG được gọi', async () => {
    for (const keys of [[], [keysRow({ chiNhanhId: OTHER_BRANCH })]]) {
      s.db.keys = keys;
      const error = await errorOf(
        s.service.change(ACCOUNT, CODE, { trangThai: 'VangMat' }),
      );
      expect(error.getStatus()).toBe(404);
    }
    expect(s.markNoShow).not.toHaveBeenCalled();
  });

  it.each<[string, MarkNoShowOutcome, number, string]>([
    ['NotFound', { kind: 'NotFound' }, 404, 'KHONG_TIM_THAY'],
    [
      'InvalidState',
      { kind: 'InvalidState', trangThai: 'VangMat' },
      409,
      'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
    ],
    ['NotDue', { kind: 'NotDue' }, 409, 'CHUA_QUA_GIO_HEN'],
    ['ConfigMissing', { kind: 'ConfigMissing' }, 409, 'HE_THONG_CHUA_CAU_HINH'],
  ])('%s ⇒ ném đúng mã', async (_ten, outcome, status, maLoi) => {
    s.markNoShow.mockResolvedValueOnce(outcome);
    const error = await errorOf(
      s.service.change(ACCOUNT, CODE, { trangThai: 'VangMat' }),
    );
    expect(error.getStatus()).toBe(status);
    expect(error.getResponse()).toMatchObject({ maLoi });
  });
});

describe('RTS-06 thân giao dịch chạy lại được (1213, 1205): không đọc lại cấu hình, không đổi mốc now', () => {
  it.each([
    ['checkIn', 'DaTiepDon'],
    ['markNoShow', 'VangMat'],
  ] as const)(
    '%s gặp 1213 ở lần đầu: giao dịch chạy LẠI, cấu hình đọc đúng MỘT lần, mốc now của hai lần giống nhau',
    async (method, trangThai) => {
      s[method].mockRejectedValueOnce(mysqlError(1213));
      await expect(
        s.service.change(ACCOUNT, CODE, { trangThai }),
      ).resolves.toMatchObject({ trangThai });
      expect(s.db.runs).toBe(2);
      expect(s.configs.get).toHaveBeenCalledTimes(1);
      const calls = s[method].mock.calls as [EntityManager, { now: Date }][];
      expect(calls).toHaveLength(2);
      expect(calls[0]?.[1].now.getTime()).toBe(calls[1]?.[1].now.getTime());
      expect(s.db.events.filter((event) => event === 'rollback')).toHaveLength(
        1,
      );
    },
  );

  it('hết lượt thử lại (ba lần liền 1213) ⇒ 503 HE_THONG_DANG_BAN, không ghi gì', async () => {
    s.checkIn.mockRejectedValue(mysqlError(1213));
    const error = await errorOf(
      s.service.change(ACCOUNT, CODE, { trangThai: 'DaTiepDon' }),
    );
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toMatchObject({ maLoi: 'HE_THONG_DANG_BAN' });
    expect(s.db.runs).toBe(3);
    expect(s.db.events.at(-1)).toBe('rollback');
  });

  it('lỗi KHÔNG phải tranh chấp khoá (dữ liệu lệch) đi nguyên ra, không thử lại', async () => {
    const boom = new Error('dữ liệu lệch');
    s.markNoShow.mockRejectedValueOnce(boom);
    await expect(
      s.service.change(ACCOUNT, CODE, { trangThai: 'VangMat' }),
    ).rejects.toBe(boom);
    expect(s.db.runs).toBe(1);
  });
});

describe('RTS-06 đích Lễ tân không làm được (HoanThanh, ChoThanhToan, DaXacNhan, DaDoiLich): chỉ-từ-chối, không khoá, không ghi (MT-03, CT-08)', () => {
  it('HoanThanh ⇒ 409 CHI_BAC_SI_HOAN_THANH với MỌI nguồn (kể cả lịch DaHuy hay HoanThanh)', async () => {
    for (const trangThai of [
      'ChoThanhToan',
      'DaXacNhan',
      'DaTiepDon',
      'HoanThanh',
      'DaHuy',
      'VangMat',
      'DaDoiLich',
    ] as TrangThaiLichHen[]) {
      hoisted.readOnlyRows = [keysRow({ trangThai })];
      const error = await errorOf(
        s.service.change(ACCOUNT, CODE, { trangThai: 'HoanThanh' }),
      );
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({
        maLoi: 'CHI_BAC_SI_HOAN_THANH',
      });
    }
  });

  it.each(['ChoThanhToan', 'DaXacNhan', 'DaDoiLich'] as const)(
    'đích %s ⇒ 409 CHUYEN_TRANG_THAI_KHONG_HOP_LE kèm cặp (nguồn, đích)',
    async (to) => {
      hoisted.readOnlyRows = [keysRow({ trangThai: 'DaXacNhan' })];
      const error = await errorOf(
        s.service.change(ACCOUNT, CODE, { trangThai: to }),
      );
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({
        maLoi: 'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
        chiTiet: { tuTrangThai: 'DaXacNhan', denTrangThai: to },
      });
    },
  );

  it('người ngoài chi nhánh hay mã không có nhận 404 (KHÔNG 409: không lộ trạng thái lịch người khác), với cả bốn đích', async () => {
    for (const trangThai of [
      'HoanThanh',
      'ChoThanhToan',
      'DaXacNhan',
      'DaDoiLich',
    ] as const) {
      for (const rows of [[], [keysRow({ chiNhanhId: OTHER_BRANCH })]]) {
        hoisted.readOnlyRows = rows;
        const error = await errorOf(
          s.service.change(ACCOUNT, CODE, { trangThai }),
        );
        expect(error.getStatus()).toBe(404);
      }
    }
  });

  it('không mở giao dịch ghi, không đọc cấu hình, không gọi dịch vụ ghi nào', async () => {
    await errorOf(s.service.change(ACCOUNT, CODE, { trangThai: 'HoanThanh' }));
    expect(s.db.runs).toBe(0);
    expect(s.configs.get).not.toHaveBeenCalled();
    noWrites();
  });
});
