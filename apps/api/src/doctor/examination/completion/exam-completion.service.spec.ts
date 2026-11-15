import { Logger } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import type { TrangThaiLichHen } from '../../../admin/entities/enums.js';
import type {
  AppointmentTransitionService,
  CompleteOutcome,
} from '../../../appointments/state/appointment-transition.service.js';
import {
  mysqlError,
  ScriptedEntityManager,
} from '../../../appointments/testing/scripted-entity-manager.js';
import { AppException } from '../../../common/errors/app.exception.js';
import type { ExamNotifier } from '../notifications/exam-notifier.js';
import { completionResult } from './exam-completion.failure.js';
import { READ_OWNED_APPOINTMENT_SQL } from './exam-completion.repository.js';
import { ExamCompletionService } from './exam-completion.service.js';

// doctor-exam B1 — ExamCompletionService, tầng ĐƠN VỊ (không DB): đọc thường, thứ tự gọi, ánh xạ lỗi, `now`, thử lại, lỗi thông báo (PLAN 5.3, 5.4; HTK-01, HTK-04, HTK-05, HTK-08).
// `DataSource` giả chỉ có `query` (đọc thường) và `transaction` (chạy thân với một `EntityManager` giả); `withBookingTransaction` là mã THẬT. Phần MySQL thật (khoá, hoàn tác, UNIQUE):
// exam-completion.int-spec.ts và exam-completion.concurrency.int-spec.ts.
const CODE = 'CLX-20261110-7K3QD';
const DOCTOR = '41';
const OWNED = { lichHenId: '900', maLichHen: CODE, benhNhanId: '55' };
const NOT_FOUND_BODY = {
  maLoi: 'KHONG_TIM_THAY',
  thongBao: 'Không tìm thấy dữ liệu.',
};

interface Options {
  owned?: typeof OWNED | null;
  /** Kết quả lần lượt của `complete` (lần cuối lặp lại); phần tử là `Error` thì ném */
  outcomes?: (CompleteOutcome | Error)[];
  notifyFails?: Error;
}

function setup(options: Options = {}) {
  const em = new ScriptedEntityManager((sql) =>
    /@@session/.test(sql) ? [{ value: '50' }] : [],
  );
  const query = vi.fn((..._args: unknown[]) =>
    Promise.resolve(options.owned === null ? [] : [options.owned ?? OWNED]),
  );
  const transaction = vi.fn(
    (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
      work(em.em),
  );
  const outcomes = options.outcomes ?? [{ kind: 'Completed' }];
  let call = 0;
  const complete = vi.fn((..._args: unknown[]) => {
    const next = outcomes[Math.min(call++, outcomes.length - 1)];
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  const notifyCompleted = vi.fn((..._args: unknown[]) =>
    options.notifyFails === undefined
      ? Promise.resolve({ kind: 'Inserted' as const, thongBaoId: '1' })
      : Promise.reject(options.notifyFails),
  );
  const service = new ExamCompletionService(
    { query, transaction } as unknown as DataSource,
    { complete } as unknown as AppointmentTransitionService,
    { notifyCompleted } as unknown as ExamNotifier,
  );
  return { service, em, query, transaction, complete, notifyCompleted };
}

/** Lỗi mà lời hứa ném ra (thành công thì làm test đỏ). */
async function rejection(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => {
      throw new Error('phải bị từ chối');
    },
    (error: unknown) => error,
  );
}

beforeEach(() => {
  // Chỉ để log cảnh báo thử lại của `withBookingTransaction` không làm bẩn đầu ra
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('HTK-01 luồng thành công', () => {
  it('Completed ⇒ `{ maLichHen, trangThai: HoanThanh }` (mã lấy từ DB); `complete` nhận đúng { lichHenId, bacSiId } từ token; MỘT thông báo cho TÀI KHOẢN ĐẶT bằng ĐÚNG `em` của giao dịch', async () => {
    const t = setup();
    await expect(t.service.complete(DOCTOR, CODE)).resolves.toEqual({
      maLichHen: CODE,
      trangThai: 'HoanThanh',
    });
    expect(t.complete).toHaveBeenCalledTimes(1);
    expect(t.complete.mock.calls[0]).toEqual([
      t.em.em,
      { lichHenId: '900', bacSiId: DOCTOR },
    ]);
    expect(t.notifyCompleted).toHaveBeenCalledTimes(1);
    const [em, input] = t.notifyCompleted.mock.calls[0] as [
      EntityManager,
      Record<string, unknown>,
    ];
    expect(em).toBe(t.em.em);
    expect(input).toMatchObject({
      lichHenId: '900',
      taiKhoanId: '55',
      maLichHen: CODE,
    });
  });

  it('H1: `complete` chạy TRƯỚC `notifyCompleted` (khoá X trên lich_hen trước mọi ghi bảng có khoá ngoại tới nó)', async () => {
    const t = setup();
    await t.service.complete(DOCTOR, CODE);
    expect(t.complete.mock.invocationCallOrder[0]).toBeLessThan(
      t.notifyCompleted.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('giao dịch là READ COMMITTED (qua withBookingTransaction), mở ĐÚNG MỘT lần', async () => {
    const t = setup();
    await t.service.complete(DOCTOR, CODE);
    expect(t.transaction).toHaveBeenCalledTimes(1);
    expect(t.transaction.mock.calls[0]?.[0]).toBe('READ COMMITTED');
  });

  it('TDK-01: mốc `now` của thông báo là giây tròn theo giờ VN (toSecond), kể cả khi đồng hồ ở :59.999', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T09:00:59.999+07:00'));
    const t = setup();
    await t.service.complete(DOCTOR, CODE);
    const input = t.notifyCompleted.mock.calls[0]?.[1] as { now: Date };
    expect(input.now.getMilliseconds()).toBe(0);
    expect(input.now.getTime()).toBe(
      new Date('2026-11-10T09:00:59.000+07:00').getTime(),
    );
  });
});

describe('HTK-05 đọc thường và sở hữu', () => {
  it('đọc thường nhận đúng [maLichHen, bacSiId] của token (bác sĩ nằm TRONG điều kiện câu đọc)', async () => {
    const t = setup();
    await t.service.complete(DOCTOR, CODE);
    expect(t.query).toHaveBeenCalledTimes(1);
    expect(t.query.mock.calls[0]).toEqual([
      READ_OWNED_APPOINTMENT_SQL,
      [CODE, DOCTOR],
    ]);
    expect(READ_OWNED_APPOINTMENT_SQL).toMatch(
      /WHERE ma_lich_hen = \? AND bac_si_id = \?/,
    );
    expect(READ_OWNED_APPOINTMENT_SQL).not.toMatch(/FOR\s+(UPDATE|SHARE)/i);
  });

  it('không có lịch của bác sĩ này (của bác sĩ khác hay không tồn tại) ⇒ 404 KHONG_TIM_THAY và KHÔNG mở giao dịch, không gọi complete hay thông báo', async () => {
    const t = setup({ owned: null });
    const error = await rejection(t.service.complete(DOCTOR, CODE));
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(404);
    expect((error as AppException).getResponse()).toMatchObject(NOT_FOUND_BODY);
    expect(t.transaction).not.toHaveBeenCalled();
    expect(t.complete).not.toHaveBeenCalled();
    expect(t.notifyCompleted).not.toHaveBeenCalled();
  });

  it('`complete` trả NotAssigned (nhánh phòng thủ: bac_si_id bất biến nên không tới được qua DB) ⇒ 404 CÙNG thân với nhánh đọc thường; không thông báo', async () => {
    const t = setup({ outcomes: [{ kind: 'NotAssigned' }] });
    const error = await rejection(t.service.complete(DOCTOR, CODE));
    const notFound = (await rejection(
      setup({ owned: null }).service.complete(DOCTOR, CODE),
    )) as AppException;
    expect((error as AppException).getStatus()).toBe(404);
    expect((error as AppException).getResponse()).toEqual(
      notFound.getResponse(),
    );
    expect(t.notifyCompleted).not.toHaveBeenCalled();
  });
});

const OTHER_STATES: TrangThaiLichHen[] = [
  'ChoThanhToan',
  'DaXacNhan',
  'DaHuy',
  'VangMat',
  'DaDoiLich',
  'HoanThanh',
];

describe('HTK-04 InvalidState ⇒ 409 CHUYEN_TRANG_THAI_KHONG_HOP_LE', () => {
  it.each(OTHER_STATES)(
    'lịch đang %s (kể cả HoanThanh = bấm lần hai): 409 kèm { tuTrangThai, denTrangThai: HoanThanh }; KHÔNG ghi thông báo',
    async (trangThai) => {
      const t = setup({ outcomes: [{ kind: 'InvalidState', trangThai }] });
      const error = await rejection(t.service.complete(DOCTOR, CODE));
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus()).toBe(409);
      expect((error as AppException).getResponse()).toMatchObject({
        maLoi: 'CHUYEN_TRANG_THAI_KHONG_HOP_LE',
        chiTiet: { tuTrangThai: trangThai, denTrangThai: 'HoanThanh' },
      });
      expect(t.notifyCompleted).not.toHaveBeenCalled();
    },
  );

  it('completionResult: ba kết quả có kiểu ⇒ đúng ba kết cục (kết quả, 404, 409); thân 409 chỉ có tuTrangThai và denTrangThai', () => {
    expect(completionResult({ kind: 'Completed' }, CODE)).toEqual({
      maLichHen: CODE,
      trangThai: 'HoanThanh',
    });
    expect(() => completionResult({ kind: 'NotAssigned' }, CODE)).toThrow(
      AppException,
    );
    try {
      completionResult({ kind: 'InvalidState', trangThai: 'DaXacNhan' }, CODE);
      throw new Error('phải ném');
    } catch (error) {
      const body = (error as AppException).getResponse() as {
        chiTiet: Record<string, unknown>;
      };
      expect(Object.keys(body.chiTiet).sort()).toEqual([
        'denTrangThai',
        'tuTrangThai',
      ]);
    }
  });
});

describe('HTK-07, HTK-08 thân giao dịch', () => {
  it('HTK-07: thông báo ném lỗi KHÔNG phải tranh chấp ⇒ lỗi đi nguyên ra ngoài, KHÔNG thử lại (giao dịch mở đúng một lần: db.transaction hoàn tác cả hoàn thành)', async () => {
    const failure = new Error('INSERT thong_bao hỏng');
    const t = setup({ notifyFails: failure });
    await expect(t.service.complete(DOCTOR, CODE)).rejects.toBe(failure);
    expect(t.transaction).toHaveBeenCalledTimes(1);
  });

  it('HTK-08: 1213 ở lần chạy đầu ⇒ thân chạy lại từ đầu với `em` mới; kết quả đúng; thông báo chỉ ghi ở lần chạy thành công', async () => {
    const t = setup({
      outcomes: [mysqlError(1213), { kind: 'Completed' }],
    });
    await expect(t.service.complete(DOCTOR, CODE)).resolves.toEqual({
      maLichHen: CODE,
      trangThai: 'HoanThanh',
    });
    expect(t.transaction).toHaveBeenCalledTimes(2);
    expect(t.complete).toHaveBeenCalledTimes(2);
    expect(t.notifyCompleted).toHaveBeenCalledTimes(1);
  });

  it('hết lượt thử lại (1213 liên tục) ⇒ 503 HE_THONG_DANG_BAN, không bao giờ 500; không thông báo', async () => {
    const t = setup({ outcomes: [mysqlError(1213)] });
    const error = await rejection(t.service.complete(DOCTOR, CODE));
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).getStatus()).toBe(503);
    expect((error as AppException).getResponse()).toMatchObject({
      maLoi: 'HE_THONG_DANG_BAN',
    });
    expect(t.transaction).toHaveBeenCalledTimes(3);
    expect(t.notifyCompleted).not.toHaveBeenCalled();
  });
});
