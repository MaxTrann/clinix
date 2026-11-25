import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import type { AuditEntry } from '../../audit/audit-entry.js';
import { AuditError } from '../../audit/audit-error.js';
import type { AuditService } from '../../audit/audit.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import type { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import { BOOKING_ERROR_CODES } from '../appointments.constants.js';
import type { AppointmentRescheduleService } from './appointment-reschedule.service.js';
import { RescheduleRequestApproveService } from './reschedule-request-approve.service.js';
import type { RescheduleRequestHandlingRow } from './reschedule-request-handle.types.js';
import type { RescheduleRequestRepository } from './reschedule-request.repository.js';
import type {
  RescheduleAfterWrite,
  RescheduleInput,
  RescheduleOutcome,
  RescheduleWritten,
} from './reschedule.types.js';

// reschedule B9 — `RescheduleRequestApproveService` với lõi B4, repository, phạm vi và Audit GIẢ có kịch bản, đồng hồ giả: HDL-34 (B4 gọi đúng MỘT lần với `actor` `DuyetYeuCau`, khung giờ đích, `afterWrite`), XDL-50
// (`afterWrite` chạy hai lần cho cùng kết quả), HDL-10 (UPDATE và Audit cùng `em` của giao dịch), M6, M7 (`AuditError` NỔI), M18 (giờ máy chủ sau B4), M20, M21 (phạm vi TRƯỚC trạng thái). Không DB: lõi, repository,
// Audit và thông báo thật ở `reschedule-request-approve.service.int-spec.ts`. Mã HDL-34, XDL-50 là `[đề xuất]` (TRACKING reschedule 1.13).
const ACCOUNT = '77';
const BRANCH = '3';
const OLD_CODE = 'CLX-20261110-AAA01';
const NEW_CODE = 'CLX-20261110-AAA02';
const REQUEST_ID = '9007199254740993';
const WANTED_SLOT = '61';
const OTHER_SLOT = '9007199254740995';
const NOTE = 'Đã xếp sang khung giờ chiều cùng bác sĩ';
const T0 = new Date('2026-11-02T01:00:00.789Z');
const T0_SECOND = new Date('2026-11-02T01:00:00.000Z');

const ROW: RescheduleRequestHandlingRow = {
  yeuCauId: REQUEST_ID,
  trangThai: 'ChoDuyet',
  lichHenId: '31',
  maLichHen: OLD_CODE,
  benhNhanId: '41',
  chiNhanhId: '8',
  khungGioMongMuonId: WANTED_SLOT,
  thoiGianMongMuon: new Date('2026-11-20T01:30:00.000Z'),
};
const RESCHEDULED: RescheduleOutcome = {
  kind: 'Rescheduled',
  maLichHenCu: OLD_CODE,
  maLichHenMoi: NEW_CODE,
  thoiGianMoi: new Date('2026-11-20T01:30:00.000Z'),
};
// `chiNhanhId` KHÁC chi nhánh của Lễ tân (BRANCH) để ca "branchId là chi nhánh của LỊCH" không tương đương với "chi nhánh của người duyệt"
const WRITTEN: RescheduleWritten = {
  lichHenCuId: '31',
  lichHenMoiId: '9007199254740992',
  maLichHenCu: OLD_CODE,
  maLichHenMoi: NEW_CODE,
  khungGioCuId: '11',
  khungGioMoiId: WANTED_SLOT,
  chiNhanhId: '8',
  thoiGianCu: new Date('2026-11-09T01:00:00.000Z'),
  thoiGianMoi: new Date('2026-11-20T01:30:00.000Z'),
};
const DB_MANAGER = { id: 'em-doc-thuong' } as unknown as EntityManager;
const TX_EM = { id: 'em-cua-giao-dich' } as unknown as EntityManager;

type Step = RescheduleOutcome | Error | 'AFTER_WRITE';

function setup(
  options: {
    row?: RescheduleRequestHandlingRow | null;
    script?: Step[];
    scope?: unknown;
  } = {},
) {
  const row = options.row === undefined ? ROW : options.row;
  const calls: string[] = [];
  const findForHandling = vi.fn(
    (_em: EntityManager, _chiNhanhId: string | undefined, _id: string) =>
      Promise.resolve(row),
  );
  const markApproved = vi.fn(
    (_em: EntityManager, _mark: Record<string, unknown>) => {
      calls.push('markApproved');
      return Promise.resolve();
    },
  );
  const record = vi.fn((_em: EntityManager, _entry: AuditEntry) => {
    calls.push('audit');
    return Promise.resolve();
  });
  const reschedule = vi.fn((input: RescheduleInput) => {
    const step = (options.script ?? [RESCHEDULED])[0];
    if (step instanceof Error) return Promise.reject(step);
    if (step === 'AFTER_WRITE')
      return runAfterWrite(input).then(() => RESCHEDULED);
    return Promise.resolve(step ?? RESCHEDULED);
  });
  const runAfterWrite = async (input: RescheduleInput) => {
    if (!('afterWrite' in input)) throw new Error('thiếu afterWrite');
    await input.afterWrite(TX_EM, WRITTEN);
  };
  const scope =
    options.scope === undefined
      ? { kind: 'ChiNhanh', chiNhanhId: BRANCH }
      : options.scope;
  const resolve = vi.fn(() =>
    scope instanceof Error ? Promise.reject(scope) : Promise.resolve(scope),
  );
  const service = new RescheduleRequestApproveService(
    { manager: DB_MANAGER } as unknown as DataSource,
    { resolve } as unknown as ReceptionScopeService,
    { findForHandling, markApproved } as unknown as RescheduleRequestRepository,
    { reschedule } as unknown as AppointmentRescheduleService,
    { record } as unknown as AuditService,
  );
  const asReception = (
    input: { ghiChu: string; khungGioId?: string } = { ghiChu: NOTE },
    rawId: string = REQUEST_ID,
  ) => service.approveAsReception(ACCOUNT, rawId, input);
  const asAdmin = (
    adminScope: AdminScope,
    input: { ghiChu: string; khungGioId?: string } = { ghiChu: NOTE },
    rawId: string = REQUEST_ID,
  ) => service.approveAsAdmin(adminScope, ACCOUNT, rawId, input);
  /** `afterWrite` mà dịch vụ đưa cho lõi B4 trong lần gọi `index` */
  const afterWriteOf = (index = 0): RescheduleAfterWrite => {
    const input = reschedule.mock.calls[index]?.[0] as RescheduleInput;
    if (!('afterWrite' in input)) throw new Error('thiếu afterWrite');
    return input.afterWrite;
  };
  return {
    service,
    reschedule,
    resolve,
    findForHandling,
    markApproved,
    record,
    calls,
    asReception,
    asAdmin,
    afterWriteOf,
  };
}

async function failureOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof AppException)) throw error;
    return {
      status: error.getStatus(),
      body: error.getResponse() as { maLoi: string; chiTiet?: unknown },
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

describe('HDL-34 duyệt: gọi B4 đúng một lần với actor DuyetYeuCau, khung giờ đích, afterWrite', () => {
  it('Lễ tân, không khungGioId: B4 nhận maLichHen của lịch gốc, khung giờ MONG MUỐN, actor { DuyetYeuCau, chi nhánh của Lễ tân }, yeuCauId, ghiChu nguyên, afterWrite; đúng sáu khoá', async () => {
    const { asReception, reschedule, resolve, findForHandling } = setup();
    const result = await asReception();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(ACCOUNT);
    expect(findForHandling).toHaveBeenCalledTimes(1);
    expect(findForHandling.mock.calls[0]).toStrictEqual([
      DB_MANAGER,
      BRANCH,
      REQUEST_ID,
    ]);
    expect(reschedule).toHaveBeenCalledTimes(1);
    const input = reschedule.mock.calls[0]?.[0];
    expect(Object.keys(input ?? {}).sort()).toEqual([
      'actor',
      'afterWrite',
      'ghiChu',
      'khungGioMoiId',
      'maLichHen',
      'yeuCauId',
    ]);
    expect(input).toMatchObject({
      maLichHen: OLD_CODE,
      khungGioMoiId: WANTED_SLOT,
      actor: { via: 'DuyetYeuCau', chiNhanhId: BRANCH },
      yeuCauId: REQUEST_ID,
      ghiChu: NOTE,
    });
    expect(result).toStrictEqual({
      yeuCau: { trangThai: 'DaDuyet' },
      lichHenMoi: {
        maLichHen: NEW_CODE,
        thoiGian: '2026-11-20T01:30:00.000Z',
        trangThai: 'DaXacNhan',
      },
      thoiGianMayChu: '2026-11-02T01:00:00.789Z',
    });
  });

  it('M15 có khungGioId thay thế: B4 nhận khung giờ THAY THẾ (id lớn hơn 2^53 giữ nguyên), không phải khung giờ mong muốn', async () => {
    const { asReception, reschedule } = setup();
    await asReception({ ghiChu: NOTE, khungGioId: OTHER_SLOT });
    expect(reschedule.mock.calls[0]?.[0].khungGioMoiId).toBe(OTHER_SLOT);
  });

  it('chi nhánh CHỈ từ ReceptionScopeService: đổi giá trị trả về thì actor và phạm vi đọc đổi theo (M4)', async () => {
    const { asReception, reschedule, findForHandling } = setup({
      scope: { kind: 'ChiNhanh', chiNhanhId: '4242' },
    });
    await asReception();
    expect(reschedule.mock.calls[0]?.[0].actor).toStrictEqual({
      via: 'DuyetYeuCau',
      chiNhanhId: '4242',
    });
    expect(findForHandling.mock.calls[0]?.[1]).toBe('4242');
  });

  it('M5 Quản trị viên Chi nhánh ⇒ chi nhánh được gán (không null); Toàn hệ thống ⇒ null và đọc KHÔNG lọc chi nhánh', async () => {
    const branchAdmin = setup();
    await branchAdmin.asAdmin({ kind: 'ChiNhanh', chiNhanhId: '9' });
    expect(branchAdmin.reschedule.mock.calls[0]?.[0].actor).toStrictEqual({
      via: 'DuyetYeuCau',
      chiNhanhId: '9',
    });
    expect(branchAdmin.findForHandling.mock.calls[0]?.[1]).toBe('9');
    expect(branchAdmin.resolve).not.toHaveBeenCalled();

    const global = setup();
    await global.asAdmin({ kind: 'ToanHeThong' });
    expect(global.reschedule.mock.calls[0]?.[0].actor).toStrictEqual({
      via: 'DuyetYeuCau',
      chiNhanhId: null,
    });
    expect(global.findForHandling.mock.calls[0]?.[1]).toBeUndefined();
  });

  it('phạm vi ĐỨNG TRƯỚC mọi thứ: Lễ tân bị khoá (403) ⇒ không đọc yêu cầu, không gọi B4, kể cả khi id sai dạng', async () => {
    const forbidden = new AppException(403, 'KHONG_DU_QUYEN');
    const { asReception, findForHandling, reschedule } = setup({
      scope: forbidden,
    });
    expect(await failureOf(asReception({ ghiChu: NOTE }, 'abc'))).toStrictEqual(
      {
        status: 403,
        body: expect.objectContaining({ maLoi: 'KHONG_DU_QUYEN' }) as unknown,
      },
    );
    expect(findForHandling).not.toHaveBeenCalled();
    expect(reschedule).not.toHaveBeenCalled();
  });

  it('phạm vi Quản trị viên hỏng ⇒ 403, không mở ra Toàn hệ thống', async () => {
    const { asAdmin, findForHandling, reschedule } = setup();
    const broken = { kind: 'ChiNhanh' } as unknown as AdminScope;
    expect((await failureOf(asAdmin(broken))).status).toBe(403);
    expect(findForHandling).not.toHaveBeenCalled();
    expect(reschedule).not.toHaveBeenCalled();
  });
});

describe('M21 phạm vi TRƯỚC trạng thái, cổng sớm YEU_CAU_DA_XU_LY', () => {
  it('id sai dạng ⇒ 404 YEU_CAU_DOI_LICH_KHONG_TON_TAI, không đọc DB, không gọi B4', async () => {
    const { asReception, findForHandling, reschedule } = setup();
    const failure = await failureOf(asReception({ ghiChu: NOTE }, 'abc'));
    expect(failure).toStrictEqual({
      status: 404,
      body: expect.objectContaining({
        maLoi: 'YEU_CAU_DOI_LICH_KHONG_TON_TAI',
      }) as unknown,
    });
    expect(findForHandling).not.toHaveBeenCalled();
    expect(reschedule).not.toHaveBeenCalled();
  });

  it('không có hàng (không tồn tại hay ngoài phạm vi) ⇒ 404, KHÔNG 409 dù yêu cầu có thể đã xử lý ở chi nhánh khác', async () => {
    const { asReception, reschedule } = setup({ row: null });
    expect((await failureOf(asReception())).body.maLoi).toBe(
      'YEU_CAU_DOI_LICH_KHONG_TON_TAI',
    );
    expect(reschedule).not.toHaveBeenCalled();
  });

  it.each(['DaDuyet', 'TuChoi'] as const)(
    'yêu cầu trong phạm vi nhưng đã %s ⇒ 409 YEU_CAU_DA_XU_LY từ cổng sớm, không gọi B4 (không bị che bằng lỗi cấu hình hay khung giờ)',
    async (trangThai) => {
      const { asReception, reschedule, markApproved } = setup({
        row: { ...ROW, trangThai },
      });
      const failure = await failureOf(asReception());
      expect(failure.status).toBe(409);
      expect(failure.body.maLoi).toBe('YEU_CAU_DA_XU_LY');
      expect(reschedule).not.toHaveBeenCalled();
      expect(markApproved).not.toHaveBeenCalled();
    },
  );
});

describe('HDL-34 kết quả của B4 ánh xạ đúng và KHÔNG ghi yêu cầu khi B4 từ chối', () => {
  it.each([
    [
      'RequestHandled (thua cuộc đua dưới khoá 6c)',
      { kind: 'RequestHandled' },
      409,
      'YEU_CAU_DA_XU_LY',
    ],
    [
      'RequestNotFound',
      { kind: 'RequestNotFound' },
      404,
      'YEU_CAU_DOI_LICH_KHONG_TON_TAI',
    ],
    ['NotFound', { kind: 'NotFound' }, 404, 'YEU_CAU_DOI_LICH_KHONG_TON_TAI'],
    [
      'khung giờ đã bị chiếm',
      { kind: 'Rule', code: BOOKING_ERROR_CODES.SLOT_BOOKED },
      409,
      'KHUNG_GIO_DA_DAT',
    ],
    [
      'quá giờ',
      { kind: 'Rule', code: BOOKING_ERROR_CODES.RESCHEDULE_TOO_LATE },
      409,
      'LICH_HEN_DA_QUA_GIO',
    ],
    [
      'hồ sơ người thân đã ngừng',
      { kind: 'ProfileInactive' },
      409,
      'HO_SO_NGUOI_THAN_DA_NGUNG',
    ],
    [
      'khung giờ không tồn tại',
      { kind: 'SlotNotFound' },
      404,
      'KHUNG_GIO_KHONG_TON_TAI',
    ],
  ] as const)(
    'Rejected %s ⇒ %i %s; afterWrite không chạy nên yêu cầu và Audit không bị đụng',
    async (_name, failure, status, maLoi) => {
      const { asReception, markApproved, record } = setup({
        script: [{ kind: 'Rejected', failure } as RescheduleOutcome],
      });
      const thrown = await failureOf(asReception());
      expect(thrown.status).toBe(status);
      expect(thrown.body.maLoi).toBe(maLoi);
      expect(markApproved).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
    },
  );

  it('Rejected kèm chiTiet của B4: chiTiet đi nguyên (trạng thái lịch gốc)', async () => {
    const { asReception } = setup({
      script: [
        {
          kind: 'Rejected',
          failure: {
            kind: 'Rule',
            code: BOOKING_ERROR_CODES.NOT_RESCHEDULABLE,
            chiTiet: { trangThai: 'DaDoiLich' },
          },
        },
      ],
    });
    expect((await failureOf(asReception())).body.chiTiet).toStrictEqual({
      trangThai: 'DaDoiLich',
    });
  });

  it('OverQuota (chỉ TuDoi mới có) ⇒ Error thường (500), KHÔNG AppException, không đoán sang 404', async () => {
    const { asReception } = setup({
      script: [{ kind: 'OverQuota', soLanDaDoi: 2, toiDa: 2 }],
    });
    const error = await asReception().then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppException);
  });

  it('lỗi B4 NÉM (409 HE_THONG_CHUA_CAU_HINH, 503 HE_THONG_DANG_BAN) đi nguyên, không bị nuốt hay đổi', async () => {
    for (const [status, maLoi] of [
      [409, 'HE_THONG_CHUA_CAU_HINH'],
      [503, 'HE_THONG_DANG_BAN'],
    ] as const) {
      const thrown = new AppException(status, maLoi);
      const { asReception } = setup({ script: [thrown] });
      await expect(asReception()).rejects.toBe(thrown);
    }
  });
});

describe('XDL-06 afterWrite: UPDATE yêu cầu rồi Audit, cùng em của giao dịch, đúng từng trường', () => {
  const EXPECTED: AuditEntry = {
    actorId: ACCOUNT,
    branchId: '8',
    action: 'XuLyDoiLichNgoaiChinhSach',
    targetType: 'yeu_cau_doi_lich_ngoai_chinh_sach',
    targetId: REQUEST_ID,
    result: 'ThanhCong',
    changes: {
      truoc: { trang_thai: 'ChoDuyet' },
      sau: { trang_thai: 'DaDuyet' },
      ghi_chu: NOTE,
      ma_lich_hen_cu: OLD_CODE,
      ma_lich_hen_moi: NEW_CODE,
    },
  };

  it('thứ tự: markApproved TRƯỚC Audit; HDL-10 cả hai nhận ĐÚNG em của giao dịch (không phải em đọc thường)', async () => {
    const { asReception, markApproved, record, calls } = setup({
      script: ['AFTER_WRITE'],
    });
    await asReception();
    expect(calls).toEqual(['markApproved', 'audit']);
    expect(markApproved.mock.calls[0]?.[0]).toBe(TX_EM);
    expect(record.mock.calls[0]?.[0]).toBe(TX_EM);
    expect(markApproved.mock.calls[0]?.[0]).not.toBe(DB_MANAGER);
  });

  it('markApproved nhận id yêu cầu, ghi chú nguyên, NGƯỜI XỬ LÝ là tài khoản duyệt, thời điểm là MỘT mốc cắt giây', async () => {
    const { asReception, markApproved } = setup({ script: ['AFTER_WRITE'] });
    await asReception();
    expect(markApproved.mock.calls[0]?.[1]).toStrictEqual({
      yeuCauId: REQUEST_ID,
      ghiChu: NOTE,
      nguoiXuLyId: ACCOUNT,
      thoiDiemXuLy: T0_SECOND,
    });
  });

  it('Audit đúng từng khoá: targetId là id YÊU CẦU, branchId là chi nhánh của LỊCH (không phải của Lễ tân), mã lịch CÔNG KHAI, có ma_lich_hen_moi', async () => {
    const { asReception, record } = setup({ script: ['AFTER_WRITE'] });
    await asReception();
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0]?.[1]).toStrictEqual(EXPECTED);
  });

  it('Quản trị viên Toàn hệ thống: branchId VẪN là chi nhánh của lịch (không null), actorId là người duyệt', async () => {
    const { asAdmin, record } = setup({ script: ['AFTER_WRITE'] });
    await asAdmin({ kind: 'ToanHeThong' });
    expect(record.mock.calls[0]?.[1]).toStrictEqual(EXPECTED);
  });

  it('khungGioId thay thế: ghi chú và Audit KHÔNG đổi (khung giờ thật suy ra từ lịch mới); khung giờ mong muốn của yêu cầu giữ nguyên (không có phương thức nào đổi nó)', async () => {
    const { asReception, record, markApproved } = setup({
      script: ['AFTER_WRITE'],
    });
    await asReception({ ghiChu: NOTE, khungGioId: OTHER_SLOT });
    expect(record.mock.calls[0]?.[1]).toStrictEqual(EXPECTED);
    expect(Object.keys(markApproved.mock.calls[0]?.[1] ?? {}).sort()).toEqual([
      'ghiChu',
      'nguoiXuLyId',
      'thoiDiemXuLy',
      'yeuCauId',
    ]);
  });

  it('M7 AuditError NỔI (không try/catch): afterWrite từ chối đúng lỗi đó để B4 hoàn tác trọn; markApproved lỗi cũng nổi và Audit không chạy', async () => {
    const { afterWriteOf, asReception, record, markApproved } = setup();
    await asReception();
    const failure = new AuditError('AUDIT_WRITE_FAILED');
    record.mockRejectedValueOnce(failure);
    await expect(afterWriteOf()(TX_EM, WRITTEN)).rejects.toBe(failure);

    const broken = new Error('yêu cầu không còn ChoDuyet');
    markApproved.mockRejectedValueOnce(broken);
    record.mockClear();
    await expect(afterWriteOf()(TX_EM, WRITTEN)).rejects.toBe(broken);
    expect(record).not.toHaveBeenCalled();
  });

  it('XDL-50 afterWrite chạy HAI lần (mô phỏng 1213 chạy lại thân) cho cùng đối số ⇒ cùng lời gọi, không giữ trạng thái; mốc xử lý KHÔNG đổi dù đồng hồ nhích', async () => {
    const { afterWriteOf, asReception, markApproved, record } = setup();
    await asReception();
    const afterWrite = afterWriteOf();
    await afterWrite(TX_EM, WRITTEN);
    vi.setSystemTime(new Date(T0.getTime() + 5000));
    await afterWrite(TX_EM, WRITTEN);
    expect(markApproved).toHaveBeenCalledTimes(2);
    expect(markApproved.mock.calls[1]).toStrictEqual(
      markApproved.mock.calls[0],
    );
    expect(record.mock.calls[1]).toStrictEqual(record.mock.calls[0]);
    expect(markApproved.mock.calls[1]?.[1]).toMatchObject({
      thoiDiemXuLy: T0_SECOND,
    });
  });
});

describe('M9 / M18 duyệt không gửi thông báo nào, giờ máy chủ lấy SAU B4', () => {
  it('M9 dịch vụ không có cổng thông báo: chỉ B4 gửi YeuCauDoiLichDaDuyet (hàm tạo không nhận notifier)', () => {
    const { service } = setup();
    expect(Object.keys(service).sort()).toEqual([
      'audit',
      'core',
      'db',
      'receptionScopes',
      'requests',
    ]);
  });

  it('thoiGianMayChu lấy SAU khi B4 trả (đồng hồ giả tiến 2,5 giây trong B4)', async () => {
    const { asReception, reschedule } = setup();
    reschedule.mockImplementationOnce(() => {
      vi.setSystemTime(new Date(T0.getTime() + 2500));
      return Promise.resolve(RESCHEDULED);
    });
    expect((await asReception()).thoiGianMayChu).toBe(
      '2026-11-02T01:00:03.289Z',
    );
  });
});
