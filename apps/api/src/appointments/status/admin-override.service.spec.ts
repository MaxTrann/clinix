import 'reflect-metadata';
import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import {
  TRANG_THAI_LICH_HEN,
  type TrangThaiLichHen,
} from '../../admin/entities/enums.js';
import type { SystemConfigService } from '../../admin/system-config/system-config.service.js';
import type { AuditService } from '../../audit/audit.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import type { AppointmentCancellationService } from '../cancel/appointment-cancellation.service.js';
import type { CancelInput, CancelOutcome } from '../cancel/cancel.types.js';
import type {
  AppointmentTransitionService,
  CheckInInput,
  CheckInOutcome,
  MarkNoShowInput,
  MarkNoShowOutcome,
  RestoreConfirmedInput,
  RestoreConfirmedOutcome,
} from '../state/appointment-transition.service.js';
import type { OnChanged } from '../state/on-changed.js';
import { CONFIG } from '../testing/status-unit-helpers.js';
import { AdminOverrideService } from './admin-override.service.js';

// Task B14 — OVR-06 (thứ tự lỗi, phạm vi, đường chỉ-từ-chối), OVR-07 (ánh xạ kết quả của lõi sang lỗi API), phần đơn vị của OVR-04 (nội dung audit) và CT-17 (phạm vi) (PLAN booking 5.7, 7.5, 7.37 `[đề xuất]`; TRACKING 3.31
// B14-C, B14-E): AdminOverrideService với phụ thuộc GIẢ, `runReadOnly` và `withBookingTransaction` giả (không DB). Ca có DB (khoá thật, audit thật, hoàn tác thật, đồng thời): `admin-override.int-spec.ts`,
// `admin-override.concurrency.int-spec.ts` và e2e `booking-admin-override.e2e-spec.ts`.
const hoisted = vi.hoisted(() => ({
  rows: [] as unknown[],
  events: [] as string[],
}));
vi.mock('../../common/transaction/read-only-tx.js', () => ({
  runReadOnly: vi.fn(
    (_db: unknown, work: (manager: unknown) => Promise<unknown>) => {
      hoisted.events.push('read-only');
      return work({ query: () => Promise.resolve(hoisted.rows) });
    },
  ),
}));
// Vỏ giao dịch giả: chạy thân đúng MỘT lần và ghi vết; việc thử lại 1213 và 1205 là của `withBookingTransaction` (BTX), phần hook trong lần chạy lại ở CNL của `cancel`
vi.mock('../locking/booking-transaction.js', () => ({
  withBookingTransaction: vi.fn(
    async (
      _db: unknown,
      work: (manager: unknown) => Promise<unknown>,
      options: { label: string },
    ) => {
      hoisted.events.push(`begin:${options.label}`);
      try {
        const result = await work(hoisted);
        hoisted.events.push('commit');
        return result;
      } catch (error) {
        hoisted.events.push('rollback');
        throw error;
      }
    },
  ),
}));

const CODE = 'CLX-20261110-AAA01';
const ACCOUNT = '6';
const BRANCH = '2';
const OTHER_BRANCH = '3';
// 08:05:30.700 giờ Việt Nam: sau `toSecond` là 08:05:30.000
const SYSTEM_TIME = new Date('2026-11-10T08:05:30.700+07:00');
const NOW = new Date('2026-11-10T08:05:30.000+07:00');
const LY_DO = 'Bệnh nhân đã có mặt tại quầy';

const TOAN: AdminScope = { kind: 'ToanHeThong' };
const CHI_NHANH: AdminScope = { kind: 'ChiNhanh', chiNhanhId: BRANCH };
const NGOAI: AdminScope = { kind: 'ChiNhanh', chiNhanhId: OTHER_BRANCH };

const keysRow = (overrides: Record<string, unknown> = {}) => ({
  lichHenId: '9001',
  maLichHen: CODE,
  khungGioId: '55',
  benhNhanId: '77',
  chiNhanhId: BRANCH,
  trangThai: 'DaXacNhan',
  ...overrides,
});

function setup() {
  const configs = {
    get: vi.fn(() => {
      hoisted.events.push('config.get');
      return Promise.resolve(CONFIG as typeof CONFIG | null);
    }),
  };
  const checkIn = vi.fn(
    (_em: EntityManager, _input: CheckInInput): Promise<CheckInOutcome> =>
      Promise.resolve({ kind: 'CheckedIn' }),
  );
  const markNoShow = vi.fn(
    (_em: EntityManager, _input: MarkNoShowInput): Promise<MarkNoShowOutcome> =>
      Promise.resolve({ kind: 'NoShowed', soLanNoShow: 1, khoaDatLich: false }),
  );
  const restoreConfirmed = vi.fn(
    (
      _em: EntityManager,
      _input: RestoreConfirmedInput,
    ): Promise<RestoreConfirmedOutcome> =>
      Promise.resolve({ kind: 'Restored' }),
  );
  const cancel = vi.fn((_input: CancelInput): Promise<CancelOutcome> =>
    Promise.resolve({ kind: 'Cancelled', maLichHen: CODE, hoanCoc: null }),
  );
  const record = vi.fn((_em: EntityManager, _entry: unknown) => {
    hoisted.events.push('audit.record');
    return Promise.resolve();
  });
  const service = new AdminOverrideService(
    {} as unknown as DataSource,
    configs as unknown as SystemConfigService,
    {
      checkIn,
      markNoShow,
      restoreConfirmed,
    } as unknown as AppointmentTransitionService,
    { cancel } as unknown as AppointmentCancellationService,
    new BranchAccessPolicy(),
    { record } as unknown as AuditService,
  );
  return {
    configs,
    checkIn,
    markNoShow,
    restoreConfirmed,
    cancel,
    record,
    service,
  };
}

let s: ReturnType<typeof setup>;
beforeEach(() => {
  s = setup();
  hoisted.rows = [keysRow()];
  hoisted.events.length = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(SYSTEM_TIME);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const run = (
  trangThai: TrangThaiLichHen,
  scope: AdminScope = TOAN,
  lyDo = LY_DO,
) => s.service.override(scope, ACCOUNT, CODE, { trangThai, lyDo });
const errorOf = (promise: Promise<unknown>) =>
  promise.then(
    () => {
      throw new Error('lẽ ra phải ném lỗi');
    },
    (caught: unknown) => caught as AppException,
  );
const noCore = () => {
  expect(s.cancel).not.toHaveBeenCalled();
  expect(s.checkIn).not.toHaveBeenCalled();
  expect(s.markNoShow).not.toHaveBeenCalled();
  expect(s.restoreConfirmed).not.toHaveBeenCalled();
  expect(s.record).not.toHaveBeenCalled();
};
// Đối số thứ `index` của lần gọi ĐẦU của một hàm giả (không dùng `?.` rồi truy cập tiếp: chưa gọi là lỗi của ca, không phải `undefined` lặng lẽ)
const firstCall = <T>(
  calls: readonly (readonly unknown[])[],
  index: number,
): T => {
  const call = calls[0];
  if (call === undefined) throw new Error('hàm giả chưa được gọi');
  return call[index] as T;
};
const bodyOf = (error: AppException) =>
  error.getResponse() as { maLoi: string; chiTiet?: unknown };

describe('OVR-06, CT-17 phạm vi: 404 cùng thân, TRƯỚC mọi kiểm tra trạng thái, chưa xin khoá nào', () => {
  it.each(TRANG_THAI_LICH_HEN)(
    'lịch không tồn tại, đích %s: 404 KHONG_TIM_THAY; chưa đọc cấu hình, chưa mở giao dịch, chưa gọi lõi',
    async (trangThai) => {
      hoisted.rows = [];
      const error = await errorOf(run(trangThai));
      expect(error.getStatus()).toBe(404);
      expect(bodyOf(error).maLoi).toBe('KHONG_TIM_THAY');
      expect(s.configs.get).not.toHaveBeenCalled();
      expect(hoisted.events).toEqual(['read-only']);
      noCore();
    },
  );

  it.each(TRANG_THAI_LICH_HEN)(
    'Quản trị viên Chi nhánh ngoài phạm vi, đích %s (kể cả đích mà ma trận từ chối và HoanThanh): vẫn 404, KHÔNG 409 hay 403 (không lộ trạng thái lịch của chi nhánh khác)',
    async (trangThai) => {
      hoisted.rows = [keysRow({ trangThai: 'HoanThanh' })];
      const error = await errorOf(run(trangThai, NGOAI));
      expect(error.getStatus()).toBe(404);
      expect(bodyOf(error).maLoi).toBe('KHONG_TIM_THAY');
      expect(hoisted.events).toEqual(['read-only']);
      noCore();
    },
  );

  it('Toàn hệ thống: mọi chi nhánh (lịch ở chi nhánh 9 vẫn qua); Chi nhánh: đúng chi nhánh của mình', async () => {
    hoisted.rows = [keysRow({ chiNhanhId: '9' })];
    await expect(run('DaTiepDon', TOAN)).resolves.toBeDefined();
    hoisted.rows = [keysRow()];
    await expect(run('DaTiepDon', CHI_NHANH)).resolves.toBeDefined();
  });

  it('canAct truyền cho lõi theo BranchAccessPolicy: Chi nhánh chỉ đúng chi nhánh của mình, Toàn hệ thống mọi chi nhánh (kiểm lại DƯỚI khoá ở lõi, 5.3 quy tắc 2)', async () => {
    await run('DaTiepDon', CHI_NHANH);
    const narrow = firstCall<Extract<CheckInInput, { actor: 'QuanTriVien' }>>(
      s.checkIn.mock.calls,
      1,
    );
    expect(narrow.canAct({ chiNhanhId: BRANCH })).toBe(true);
    expect(narrow.canAct({ chiNhanhId: OTHER_BRANCH })).toBe(false);
    s.checkIn.mockClear();
    await run('DaTiepDon', TOAN);
    const wide = firstCall<Extract<CheckInInput, { actor: 'QuanTriVien' }>>(
      s.checkIn.mock.calls,
      1,
    );
    expect(wide.canAct({ chiNhanhId: OTHER_BRANCH })).toBe(true);
  });
});

describe('OVR-06 đường chỉ-từ-chối: HoanThanh, ChoThanhToan, DaDoiLich không bao giờ chạm lõi, giao dịch hay cấu hình', () => {
  it.each(TRANG_THAI_LICH_HEN)(
    'đích HoanThanh, nguồn %s: 409 CHI_BAC_SI_HOAN_THANH (MT-03: kể cả Quản trị viên, mọi nguồn)',
    async (nguon) => {
      hoisted.rows = [keysRow({ trangThai: nguon })];
      const error = await errorOf(run('HoanThanh'));
      expect(error.getStatus()).toBe(409);
      expect(bodyOf(error).maLoi).toBe('CHI_BAC_SI_HOAN_THANH');
      expect(hoisted.events).toEqual(['read-only']);
      expect(s.configs.get).not.toHaveBeenCalled();
      noCore();
    },
  );

  it.each(['ChoThanhToan', 'DaDoiLich'] as const)(
    'đích %s, mọi nguồn: 409 CHUYEN_TRANG_THAI_KHONG_HOP_LE kèm { tuTrangThai, denTrangThai } (CT-16)',
    async (to) => {
      for (const nguon of TRANG_THAI_LICH_HEN) {
        hoisted.rows = [keysRow({ trangThai: nguon })];
        const error = await errorOf(run(to));
        expect(error.getStatus()).toBe(409);
        expect(bodyOf(error)).toMatchObject({
          maLoi: 'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
          chiTiet: { tuTrangThai: nguon, denTrangThai: to },
        });
      }
      noCore();
    },
  );
});

describe('OVR-06 rẽ theo đích: đúng MỘT lõi, đúng actor, hook audit có mặt; kết quả 200 đúng hình dạng', () => {
  it('DaHuy: AppointmentCancellationService (reason QtvOverride, actor kèm phạm vi, lyDo), KHÔNG đọc cấu hình, không tự mở giao dịch; trả hoanCoc của lõi', async () => {
    const hoanCoc = { tyLe: 100, soTien: '100000.00' };
    s.cancel.mockResolvedValueOnce({
      kind: 'Cancelled',
      maLichHen: CODE,
      hoanCoc,
    });
    await expect(run('DaHuy', CHI_NHANH)).resolves.toStrictEqual({
      maLichHen: CODE,
      trangThai: 'DaHuy',
      hoanCoc,
    });
    expect(s.cancel).toHaveBeenCalledTimes(1);
    expect(s.cancel.mock.calls[0]?.[0]).toMatchObject({
      maLichHen: CODE,
      actor: { kind: 'QuanTriVien', accountId: ACCOUNT, scope: CHI_NHANH },
      reason: 'QtvOverride',
      lyDo: LY_DO,
      onChanged: expect.any(Function) as unknown,
    });
    expect(s.configs.get).not.toHaveBeenCalled();
    expect(hoisted.events).toEqual(['read-only']);
    expect(s.markNoShow).not.toHaveBeenCalled();
  });

  it('VangMat: markNoShow (actor QuanTriVien) với MỘT mốc `now` đã cắt mili giây và cấu hình đọc NGOÀI giao dịch', async () => {
    await expect(run('VangMat')).resolves.toStrictEqual({
      maLichHen: CODE,
      trangThai: 'VangMat',
    });
    expect(hoisted.events).toEqual([
      'read-only',
      'config.get',
      'begin:admin-override-no-show',
      'commit',
    ]);
    const input = s.markNoShow.mock.calls[0]?.[1] as MarkNoShowInput;
    expect(input).toMatchObject({
      lichHenId: '9001',
      actor: 'QuanTriVien',
      config: CONFIG,
    });
    expect(input.now.getTime()).toBe(NOW.getTime());
    expect((input as { onChanged?: unknown }).onChanged).toBeTypeOf('function');
  });

  it('VangMat khi chưa có cấu hình: truyền config null cho lõi (lõi trả ConfigMissing ⇒ 409 HE_THONG_CHUA_CAU_HINH)', async () => {
    s.configs.get.mockResolvedValueOnce(null);
    s.markNoShow.mockResolvedValueOnce({ kind: 'ConfigMissing' });
    const error = await errorOf(run('VangMat'));
    expect(
      firstCall<MarkNoShowInput>(s.markNoShow.mock.calls, 1).config,
    ).toBeNull();
    expect(error.getStatus()).toBe(409);
    expect(bodyOf(error).maLoi).toBe('HE_THONG_CHUA_CAU_HINH');
  });

  it('DaTiepDon: checkIn (actor QuanTriVien), KHÔNG đọc cấu hình (config null: không bị cửa sổ, CT-21), một mốc `now` đã cắt mili giây', async () => {
    await expect(run('DaTiepDon')).resolves.toStrictEqual({
      maLichHen: CODE,
      trangThai: 'DaTiepDon',
    });
    expect(hoisted.events).toEqual([
      'read-only',
      'begin:admin-override-check-in',
      'commit',
    ]);
    const input = s.checkIn.mock.calls[0]?.[1] as CheckInInput;
    expect(input).toMatchObject({
      lichHenId: '9001',
      actor: 'QuanTriVien',
      config: null,
    });
    expect(input.now.getTime()).toBe(NOW.getTime());
    expect(s.configs.get).not.toHaveBeenCalled();
  });

  it('DaXacNhan: restoreConfirmed (actor QuanTriVien), không đọc cấu hình', async () => {
    await expect(run('DaXacNhan')).resolves.toStrictEqual({
      maLichHen: CODE,
      trangThai: 'DaXacNhan',
    });
    expect(hoisted.events).toEqual([
      'read-only',
      'begin:admin-override-restore',
      'commit',
    ]);
    expect(s.restoreConfirmed.mock.calls[0]?.[1]).toMatchObject({
      lichHenId: '9001',
      actor: 'QuanTriVien',
    });
    expect(s.configs.get).not.toHaveBeenCalled();
  });

  it('lyDo và tài khoản đi vào lõi nguyên văn; lõi nhận lichHenId từ lần đọc thường theo MÃ (không từ client)', async () => {
    hoisted.rows = [keysRow({ lichHenId: '424242', maLichHen: 'CLX-X' })];
    await run('DaTiepDon');
    expect(s.checkIn.mock.calls[0]?.[1].lichHenId).toBe('424242');
  });
});

describe('OVR-04 (đơn vị) hook audit: nội dung dòng nhật ký, chi nhánh của LỊCH, trạng thái nguồn do LÕI báo', () => {
  const hookOf = (to: TrangThaiLichHen): OnChanged => {
    const call = {
      DaHuy: () => s.cancel.mock.calls[0]?.[0],
      VangMat: () => s.markNoShow.mock.calls[0]?.[1],
      DaTiepDon: () => s.checkIn.mock.calls[0]?.[1],
      DaXacNhan: () => s.restoreConfirmed.mock.calls[0]?.[1],
    }[to as 'DaHuy' | 'VangMat' | 'DaTiepDon' | 'DaXacNhan'];
    return (call() as unknown as { onChanged: OnChanged }).onChanged;
  };

  it.each([
    ['DaHuy', 'VangMat'],
    ['VangMat', 'DaTiepDon'],
    ['DaTiepDon', 'VangMat'],
    ['DaXacNhan', 'DaTiepDon'],
  ] as const)(
    'đích %s: audit.record(em của lõi, { actorId, branchId của LỊCH, OverrideLichHen, lich_hen, targetId, ThanhCong, truoc từ lõi, sau là đích, ly_do })',
    async (to, from) => {
      // Lịch ở chi nhánh 9, người thực hiện là Quản trị viên TOÀN HỆ THỐNG (không có chi nhánh): branchId phải là 9
      hoisted.rows = [keysRow({ chiNhanhId: '9', lichHenId: '9001' })];
      await run(to, TOAN);
      const em = { marker: 1 } as unknown as EntityManager;
      await hookOf(to)(em, { from });
      expect(s.record).toHaveBeenCalledTimes(1);
      expect(s.record).toHaveBeenCalledWith(em, {
        actorId: ACCOUNT,
        branchId: '9',
        action: 'OverrideLichHen',
        targetType: 'lich_hen',
        targetId: '9001',
        result: 'ThanhCong',
        changes: {
          truoc: { trang_thai: from },
          sau: { trang_thai: to },
          ly_do: LY_DO,
        },
      });
    },
  );

  it('audit ném: hook ném tiếp nguyên lỗi (lõi sẽ ném tiếp để vỏ hoàn tác), không bị nuốt', async () => {
    await run('DaXacNhan');
    const boom = new Error('AUDIT_WRITE_FAILED');
    s.record.mockRejectedValueOnce(boom);
    await expect(
      hookOf('DaXacNhan')({} as EntityManager, { from: 'VangMat' }),
    ).rejects.toBe(boom);
  });
});

describe('OVR-07 kết quả không thành công của lõi đổi sang lỗi API Ở MỘT CHỖ (sau khi giao dịch đã đóng)', () => {
  const expectError = async (
    promise: Promise<unknown>,
    status: number,
    maLoi: string,
    chiTiet?: unknown,
  ) => {
    const error = await errorOf(promise);
    expect(error.getStatus()).toBe(status);
    expect(bodyOf(error).maLoi).toBe(maLoi);
    if (chiTiet !== undefined) expect(bodyOf(error).chiTiet).toEqual(chiTiet);
  };

  it.each([
    ['NotFound', { kind: 'NotFound' }, 404, 'KHONG_TIM_THAY', undefined],
    [
      'AlreadyCancelled',
      { kind: 'AlreadyCancelled' },
      409,
      'LICH_HEN_KHONG_CHO_HUY',
      { trangThai: 'DaHuy' },
    ],
    [
      'NotCancellable (HoanThanh)',
      { kind: 'NotCancellable', trangThai: 'HoanThanh' },
      409,
      'LICH_HEN_KHONG_CHO_HUY',
      { trangThai: 'HoanThanh' },
    ],
  ] as const)(
    'DaHuy, lõi trả %s ⇒ %i %s (MỘT mã LICH_HEN_KHONG_CHO_HUY cho mọi người gọi huỷ, B10-G)',
    async (_name, outcome, status, maLoi, chiTiet) => {
      s.cancel.mockResolvedValueOnce(outcome as CancelOutcome);
      await expectError(run('DaHuy'), status, maLoi, chiTiet);
    },
  );

  it.each([
    ['VangMat', 'markNoShow'],
    ['DaTiepDon', 'checkIn'],
    ['DaXacNhan', 'restoreConfirmed'],
  ] as const)(
    'đích %s (lõi %s): NotFound ⇒ 404 KHONG_TIM_THAY; InvalidState ⇒ 409 CHUYEN_TRANG_THAI_KHONG_HOP_LE kèm { tuTrangThai: trạng thái lõi báo, denTrangThai: đích }',
    async (to, core) => {
      const coreMock = s[core] as unknown as {
        mockResolvedValueOnce: (v: unknown) => void;
      };
      coreMock.mockResolvedValueOnce({ kind: 'NotFound' });
      await expectError(run(to), 404, 'KHONG_TIM_THAY');
      coreMock.mockResolvedValueOnce({
        kind: 'InvalidState',
        trangThai: 'HoanThanh',
      });
      await expectError(run(to), 409, 'CHUYEN_TRANG_THAI_KHONG_HOP_LE', {
        tuTrangThai: 'HoanThanh',
        denTrangThai: to,
      });
    },
  );

  it('kết quả không thành công KHÔNG ghi audit từ vỏ này (audit chỉ do hook của lõi khi lõi thật sự đổi)', async () => {
    s.checkIn.mockResolvedValueOnce({
      kind: 'InvalidState',
      trangThai: 'DaHuy',
    });
    await errorOf(run('DaTiepDon'));
    expect(s.record).not.toHaveBeenCalled();
  });

  it('lỗi hệ thống của lõi (Error thường, 503 hết lượt thử lại) nổi nguyên, không thành kết quả nghiệp vụ', async () => {
    const boom = new Error('dữ liệu lệch');
    s.restoreConfirmed.mockRejectedValueOnce(boom);
    await expect(run('DaXacNhan')).rejects.toBe(boom);
    expect(hoisted.events.at(-1)).toBe('rollback');
    const busy = new AppException(503, 'HE_THONG_DANG_BAN');
    s.cancel.mockRejectedValueOnce(busy);
    await expect(run('DaHuy')).rejects.toBe(busy);
  });
});
