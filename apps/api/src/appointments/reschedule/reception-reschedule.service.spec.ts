import type { EntityManager } from 'typeorm';
import { vi } from 'vitest';
import type { AuditEntry } from '../../audit/audit-entry.js';
import { AuditError } from '../../audit/audit-error.js';
import type { AuditService } from '../../audit/audit.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import {
  BOOKING_ERROR_CODES,
  BOOKING_ERRORS,
  type BookingErrorCode,
} from '../appointments.constants.js';
import { assertRescheduledContract } from '../testing/patient-reschedule-contract.js';
import type { AppointmentRescheduleService } from './appointment-reschedule.service.js';
import { ReceptionRescheduleService } from './reception-reschedule.service.js';
import type {
  RescheduleAfterWrite,
  RescheduleInput,
  RescheduleOutcome,
  RescheduleWritten,
} from './reschedule.types.js';

// Task reschedule B7 — `ReceptionRescheduleService` với lõi B4, phạm vi và Audit GIẢ có kịch bản, đồng hồ giả: DLO-19 (B4 gọi đúng một lần với `actor` `DoiHo`, chi nhánh từ `ReceptionScopeService`; `afterWrite` ghi
// Audit đúng từng trường, không giữ trạng thái; `thoiGianMayChu` sau B4), DLO-08 (phần đơn vị: `AuditError` NỔI, không bị nuốt), DLO-18 (vét cạn `RescheduleOutcome`), QDL-02 (phạm vi 403 TRƯỚC mọi thứ). Không DB: lõi,
// Audit và thông báo thật ở `reception-reschedule.service.int-spec.ts`. Mã DLO-08, 18, 19 là PLAN (08) và `[đề xuất]` (18, 19; TRACKING reschedule 1.11).
const ACCOUNT = '77';
const BRANCH = '3';
const CODE = 'CLX-20261110-AAA01';
const NEW_CODE = 'CLX-20261110-AAA02';
const SLOT = '9007199254740993';
const REASON = 'Bệnh nhân gọi điện xin dời sang buổi chiều vì trùng lịch làm';
const T0 = new Date('2026-11-02T01:00:00.000Z');

const RESCHEDULED: RescheduleOutcome = {
  kind: 'Rescheduled',
  maLichHenCu: CODE,
  maLichHenMoi: NEW_CODE,
  thoiGianMoi: new Date('2026-11-10T02:30:00.000Z'),
};
// `chiNhanhId` KHÁC chi nhánh của Lễ tân (BRANCH) để ca "branchId là chi nhánh của LỊCH" không tương đương với "chi nhánh của Lễ tân"
const WRITTEN: RescheduleWritten = {
  lichHenCuId: '9007199254740991',
  lichHenMoiId: '9007199254740992',
  maLichHenCu: CODE,
  maLichHenMoi: NEW_CODE,
  khungGioCuId: '11',
  khungGioMoiId: SLOT,
  chiNhanhId: '8',
  thoiGianCu: new Date('2026-11-09T01:00:00.000Z'),
  thoiGianMoi: new Date('2026-11-10T02:30:00.000Z'),
};
const EM = { id: 'em-cua-giao-dich' } as unknown as EntityManager;

type Scripted = (RescheduleOutcome | Error)[];

function setup(
  script: Scripted = [RESCHEDULED],
  scope: unknown = { kind: 'ChiNhanh', chiNhanhId: BRANCH },
) {
  const reschedule = vi.fn((_input: RescheduleInput) =>
    Promise.resolve<RescheduleOutcome>(RESCHEDULED),
  );
  reschedule.mockReset();
  for (const step of script)
    if (step instanceof Error) reschedule.mockRejectedValueOnce(step);
    else reschedule.mockResolvedValueOnce(step);
  const resolve = vi.fn(() =>
    scope instanceof Error ? Promise.reject(scope) : Promise.resolve(scope),
  );
  const record = vi.fn((_em: EntityManager, _entry: AuditEntry) =>
    Promise.resolve(),
  );
  const service = new ReceptionRescheduleService(
    { resolve } as unknown as ReceptionScopeService,
    { reschedule } as unknown as AppointmentRescheduleService,
    { record } as unknown as AuditService,
  );
  const run = (lyDo: string = REASON) =>
    service.reschedule(ACCOUNT, CODE, { khungGioId: SLOT, lyDo });
  /** `afterWrite` mà dịch vụ đưa cho lõi B4 trong lần gọi `index` */
  const afterWriteOf = (index = 0): RescheduleAfterWrite => {
    const input = reschedule.mock.calls[index]?.[0] as RescheduleInput;
    if (!('afterWrite' in input)) throw new Error('thiếu afterWrite');
    return input.afterWrite;
  };
  return { service, reschedule, resolve, record, run, afterWriteOf };
}

async function failureOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof AppException)) throw error;
    return {
      status: error.getStatus(),
      body: error.getResponse() as {
        maLoi: string;
        thongBao: string;
        chiTiet?: unknown;
      },
    };
  }
  throw new Error('lẽ ra phải ném AppException');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('DLO-19 POST: gọi B4 đúng một lần với actor DoiHo, chi nhánh từ phạm vi, lý do nguyên', () => {
  it('201 DaDoi: đúng bốn khoá cấp 1, lichHenMoi trạng thái DaXacNhan; B4 nhận maLichHen, khungGioMoiId, actor { via DoiHo, chiNhanhId của Lễ tân }, lyDo nguyên và afterWrite', async () => {
    const { run, reschedule, resolve } = setup();
    const result = await run();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(ACCOUNT);
    expect(reschedule).toHaveBeenCalledTimes(1);
    const input = reschedule.mock.calls[0]?.[0];
    expect(Object.keys(input ?? {}).sort()).toEqual([
      'actor',
      'afterWrite',
      'khungGioMoiId',
      'lyDo',
      'maLichHen',
    ]);
    expect(input).toMatchObject({
      maLichHen: CODE,
      khungGioMoiId: SLOT,
      actor: { via: 'DoiHo', chiNhanhId: BRANCH },
      lyDo: REASON,
    });
    expect(result).toEqual({
      ketQua: 'DaDoi',
      lichHenMoi: {
        maLichHen: NEW_CODE,
        thoiGian: '2026-11-10T02:30:00.000Z',
        trangThai: 'DaXacNhan',
      },
      lichHenCu: { maLichHen: CODE },
      thoiGianMayChu: '2026-11-02T01:00:00.000Z',
    });
    assertRescheduledContract(JSON.parse(JSON.stringify(result)));
  });

  it('chi nhánh CHỈ từ ReceptionScopeService: đổi giá trị trả về thì actor đổi theo (không có chỗ nào khác cấp chi nhánh)', async () => {
    const { run, reschedule } = setup([RESCHEDULED], {
      kind: 'ChiNhanh',
      chiNhanhId: '4242',
    });
    await run();
    expect(reschedule.mock.calls[0]?.[0].actor).toEqual({
      via: 'DoiHo',
      chiNhanhId: '4242',
    });
  });

  it('thoiGianMayChu lấy SAU khi B4 trả (đồng hồ giả tiến 2,5 giây trong B4)', async () => {
    const { run, reschedule } = setup();
    reschedule.mockReset();
    reschedule.mockImplementationOnce(() => {
      vi.setSystemTime(new Date(T0.getTime() + 2500));
      return Promise.resolve(RESCHEDULED);
    });
    expect((await run()).thoiGianMayChu).toBe('2026-11-02T01:00:02.500Z');
  });
});

describe('DLO-19 afterWrite: Audit DoiLichHo đúng từng trường, không giữ trạng thái', () => {
  const EXPECTED: AuditEntry = {
    actorId: ACCOUNT,
    branchId: '8',
    action: 'DoiLichHo',
    targetType: 'lich_hen',
    targetId: '9007199254740991',
    result: 'ThanhCong',
    changes: {
      truoc: {
        ma_lich_hen: CODE,
        thoi_gian: '2026-11-09T01:00:00.000Z',
      },
      sau: {
        ma_lich_hen: NEW_CODE,
        thoi_gian: '2026-11-10T02:30:00.000Z',
      },
      ly_do: REASON,
    },
  };

  it('ghi bằng CHÍNH em của giao dịch: actorId là Lễ tân, targetId là lịch CŨ, branchId là chi nhánh của LỊCH (không phải của Lễ tân), mã lịch CÔNG KHAI, giờ toISOString, ly_do nguyên', async () => {
    const { run, record, afterWriteOf } = setup();
    await run();
    await afterWriteOf()(EM, WRITTEN);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0]?.[0]).toBe(EM);
    expect(record.mock.calls[0]?.[1]).toEqual(EXPECTED);
  });

  it('KHÔNG có id nội bộ của lịch MỚI, tên, SĐT, email trong entry; chỉ đúng ba khoá ở changes', async () => {
    const { run, record, afterWriteOf } = setup();
    await run();
    await afterWriteOf()(EM, WRITTEN);
    const entry = record.mock.calls[0]?.[1];
    expect(Object.keys(entry?.changes ?? {}).sort()).toEqual([
      'ly_do',
      'sau',
      'truoc',
    ]);
    expect(JSON.stringify(entry)).not.toContain(WRITTEN.lichHenMoiId);
  });

  it('chạy afterWrite hai lần (thân giao dịch chạy lại sau 1213 hay 1205) cho CÙNG entry: không giữ trạng thái giữa các lần', async () => {
    const { run, record, afterWriteOf } = setup();
    await run();
    const afterWrite = afterWriteOf();
    await afterWrite(EM, WRITTEN);
    await afterWrite(EM, WRITTEN);
    expect(record).toHaveBeenCalledTimes(2);
    expect(record.mock.calls[1]?.[1]).toEqual(record.mock.calls[0]?.[1]);
  });

  it('DLO-08 (đơn vị) AuditError NỔI nguyên instance, không bị nuốt, không đổi sang lỗi khác: lõi B4 sẽ hoàn tác trọn', async () => {
    const { run, record, afterWriteOf } = setup();
    const failure = new AuditError('AUDIT_WRITE_FAILED');
    record.mockRejectedValueOnce(failure);
    await run();
    await expect(afterWriteOf()(EM, WRITTEN)).rejects.toBe(failure);
    // và lỗi không thành 201 giả: lỗi từ lõi (B4 ném khi afterWrite ném) đi nguyên ra ngoài
    const second = setup([failure]);
    await expect(second.run()).rejects.toBe(failure);
  });
});

describe('QDL-02 phạm vi: không hợp lệ ⇒ 403 TRƯỚC khi gọi lõi', () => {
  it.each([
    ['ToanHeThong (Quản trị viên lọt vào)', { kind: 'ToanHeThong' }],
    ['thiếu chiNhanhId', { kind: 'ChiNhanh' }],
    ['chiNhanhId là số', { kind: 'ChiNhanh', chiNhanhId: 3 }],
  ])(
    'phạm vi %s ⇒ 403 KHONG_DU_QUYEN, B4 KHÔNG được gọi',
    async (_name, scope) => {
      const { run, reschedule } = setup([RESCHEDULED], scope);
      const failure = await failureOf(run());
      expect(failure.status).toBe(403);
      expect(failure.body.maLoi).toBe('KHONG_DU_QUYEN');
      expect(reschedule).not.toHaveBeenCalled();
    },
  );

  it('ReceptionScopeService ném (tài khoản khoá hay không còn hoạt động) ⇒ lỗi đi nguyên, B4 KHÔNG được gọi', async () => {
    const forbidden = new AppException(403, 'KHONG_DU_QUYEN');
    const { run, reschedule } = setup([RESCHEDULED], forbidden);
    await expect(run()).rejects.toBe(forbidden);
    expect(reschedule).not.toHaveBeenCalled();
  });
});

describe('DLO-18 vét cạn RescheduleOutcome (một ánh xạ duy nhất, không bảng thứ hai)', () => {
  const rejected = (failure: object) =>
    setup([{ kind: 'Rejected', failure } as RescheduleOutcome]);

  it('Rejected NotFound ⇒ 404 KHONG_TIM_THAY; ProfileInactive ⇒ 409 HO_SO_NGUOI_THAN_DA_NGUNG; SlotNotFound ⇒ 404 KHUNG_GIO_KHONG_TON_TAI', async () => {
    const cases: [object, number, string][] = [
      [{ kind: 'NotFound' }, 404, 'KHONG_TIM_THAY'],
      [{ kind: 'ProfileInactive' }, 409, 'HO_SO_NGUOI_THAN_DA_NGUNG'],
      [{ kind: 'SlotNotFound' }, 404, 'KHUNG_GIO_KHONG_TON_TAI'],
    ];
    for (const [failure, status, maLoi] of cases) {
      const result = await failureOf(rejected(failure).run());
      expect(result.status).toBe(status);
      expect(result.body.maLoi).toBe(maLoi);
    }
  });

  it.each(Object.values(BOOKING_ERROR_CODES))(
    'Rule %s ⇒ HTTP của BOOKING_ERRORS, maLoi đúng, chiTiet nguyên',
    async (code: BookingErrorCode) => {
      const chiTiet = { trangThai: 'DaDoiLich' };
      const failure = await failureOf(
        rejected({ kind: 'Rule', code, chiTiet }).run(),
      );
      expect(failure.status).toBe(BOOKING_ERRORS[code].status);
      expect(failure.body.maLoi).toBe(code);
      expect(failure.body.chiTiet).toEqual(chiTiet);
    },
  );

  it('lịch DaDoiLich với Lễ tân ⇒ 409 LICH_HEN_KHONG_CHO_DOI kèm chiTiet.trangThai DaDoiLich (nhân sự thấy được, KHÔNG 404)', async () => {
    const failure = await failureOf(
      rejected({
        kind: 'Rule',
        code: BOOKING_ERROR_CODES.NOT_RESCHEDULABLE,
        chiTiet: { trangThai: 'DaDoiLich' },
      }).run(),
    );
    expect(failure.status).toBe(409);
    expect(failure.body.maLoi).toBe('LICH_HEN_KHONG_CHO_DOI');
    expect(failure.body.chiTiet).toEqual({ trangThai: 'DaDoiLich' });
  });

  it.each(['RequestNotFound', 'RequestHandled'])(
    '%s (chỉ có ở đường duyệt) và OverQuota (chỉ TuDoi) KHÔNG thể xảy ra ở đổi hộ ⇒ ném Error thường, không phải AppException, không đoán sang 404 hay 409',
    async (kind) => {
      const promise = rejected({ kind }).run();
      await expect(promise).rejects.toThrow(Error);
      await expect(promise).rejects.not.toBeInstanceOf(AppException);
    },
  );

  it('OverQuota ⇒ Error thường (không bao giờ 201 hay mã nghiệp vụ)', async () => {
    const { run } = setup([{ kind: 'OverQuota', soLanDaDoi: 2, toiDa: 2 }]);
    const promise = run();
    await expect(promise).rejects.toThrow(Error);
    await expect(promise).rejects.not.toBeInstanceOf(AppException);
  });

  it('lỗi mà B4 NÉM (409 HE_THONG_CHUA_CAU_HINH, 503 HE_THONG_DANG_BAN, lỗi hệ thống) đi nguyên, không nuốt, không dịch lại', async () => {
    for (const thrown of [
      new AppException(409, 'HE_THONG_CHUA_CAU_HINH'),
      new AppException(503, 'HE_THONG_DANG_BAN'),
      new Error('hỏng'),
    ])
      await expect(setup([thrown]).run()).rejects.toBe(thrown);
  });
});
