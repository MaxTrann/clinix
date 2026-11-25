import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import type { AuditEntry } from '../../audit/audit-entry.js';
import { AuditError } from '../../audit/audit-error.js';
import type { AuditService } from '../../audit/audit.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { AdminScope } from '../../rbac/admin-scope.js';
import type { ReceptionScopeService } from '../../rbac/reception-scope.service.js';
import type {
  AppointmentEvent,
  AppointmentNotifier,
} from '../ports/appointment-notifier.port.js';
import {
  mysqlError,
  ScriptedEntityManager,
} from '../testing/scripted-entity-manager.js';
import { RescheduleRequestRejectService } from './reschedule-request-reject.service.js';
import type { RescheduleRequestHandlingRow } from './reschedule-request-handle.types.js';
import type { RescheduleRequestRepository } from './reschedule-request.repository.js';

// reschedule B9 — `RescheduleRequestRejectService` với repository, Audit, thông báo và giao dịch GIẢ có kịch bản, đồng hồ giả: XDL-08 (đơn vị: CHỈ khoá tầng 6c), XDL-10 (quyết định dưới khoá), XDL-46 (một câu khoá),
// XDL-47 (Audit từng khoá), NDL-30 (sự kiện thông báo), XDL-50 (thân chạy hai lần), HDL-10 (cùng em), M10 đến M13, M18, M22. Không DB: khoá, Audit và thông báo thật ở `reschedule-request-reject.service.int-spec.ts`.
const ACCOUNT = '77';
const BRANCH = '3';
const REQUEST_ID = '9007199254740993';
const NOTE = 'Bác sĩ không còn khung giờ phù hợp trong tuần đó';
const T0 = new Date('2026-11-02T01:00:00.789Z');
const T0_SECOND = new Date('2026-11-02T01:00:00.000Z');

const ROW: RescheduleRequestHandlingRow = {
  yeuCauId: REQUEST_ID,
  trangThai: 'ChoDuyet',
  lichHenId: '31',
  maLichHen: 'CLX-20261110-AAA01',
  benhNhanId: '41',
  chiNhanhId: '8',
  khungGioMongMuonId: '61',
  thoiGianMongMuon: new Date('2026-11-20T01:30:00.000Z'),
};

type LockedRow = {
  yeuCauId: string;
  lichHenId: string;
  khungGioMongMuonId: string;
  trangThai: string;
};
const lockedOf = (overrides: Partial<LockedRow> = {}): LockedRow => ({
  yeuCauId: REQUEST_ID,
  lichHenId: ROW.lichHenId,
  khungGioMongMuonId: ROW.khungGioMongMuonId,
  trangThai: 'ChoDuyet',
  ...overrides,
});

function setup(
  options: {
    row?: RescheduleRequestHandlingRow | null;
    /** Câu trả của `FOR UPDATE` yêu cầu theo từng lần chạy thân: hàng, hay `null` (không có hàng) */
    locks?: (LockedRow | null)[];
    scope?: unknown;
  } = {},
) {
  const row = options.row === undefined ? ROW : options.row;
  const calls: string[] = [];
  const locks = [...(options.locks ?? [lockedOf()])];
  // Một `EntityManager` GIẢ cho MỖI lần chạy thân: ghi mọi câu SQL, trả hàng khoá theo kịch bản, trả `value` cho câu đọc timeout của `withBookingTransaction`
  const transactions: ScriptedEntityManager[] = [];
  const makeTx = () => {
    const tx = new ScriptedEntityManager((sql) => {
      if (/innodb_lock_wait_timeout AS value/.test(sql))
        return [{ value: '50' }];
      if (/FOR UPDATE/.test(sql)) {
        const next = locks.length > 1 ? locks.shift() : locks[0];
        return next === null || next === undefined ? [] : [next];
      }
      return {};
    });
    transactions.push(tx);
    return tx;
  };
  const transaction = vi.fn(
    (_isolation: string, work: (em: EntityManager) => Promise<unknown>) =>
      work(makeTx().em),
  );
  const db = {
    manager: { id: 'em-doc-thuong' },
    transaction,
  } as unknown as DataSource;
  const findForHandling = vi.fn(
    (_em: EntityManager, _chiNhanhId: string | undefined, _id: string) =>
      Promise.resolve(row),
  );
  const markRejected = vi.fn(
    (_em: EntityManager, _mark: Record<string, unknown>) => {
      calls.push('markRejected');
      return Promise.resolve();
    },
  );
  const record = vi.fn((_em: EntityManager, _entry: AuditEntry) => {
    calls.push('audit');
    return Promise.resolve();
  });
  const notify = vi.fn((_em: EntityManager, _event: AppointmentEvent) => {
    calls.push('notify');
    return Promise.resolve();
  });
  const scope =
    options.scope === undefined
      ? { kind: 'ChiNhanh', chiNhanhId: BRANCH }
      : options.scope;
  const resolve = vi.fn(() =>
    scope instanceof Error ? Promise.reject(scope) : Promise.resolve(scope),
  );
  const service = new RescheduleRequestRejectService(
    db,
    { resolve } as unknown as ReceptionScopeService,
    { findForHandling, markRejected } as unknown as RescheduleRequestRepository,
    { record } as unknown as AuditService,
    { notify } as unknown as AppointmentNotifier,
  );
  const asReception = (
    rawId: string = REQUEST_ID,
    input: { ghiChu: string } = { ghiChu: NOTE },
  ) => service.rejectAsReception(ACCOUNT, rawId, input);
  const asAdmin = (adminScope: AdminScope, rawId: string = REQUEST_ID) =>
    service.rejectAsAdmin(adminScope, ACCOUNT, rawId, { ghiChu: NOTE });
  return {
    service,
    transaction,
    transactions,
    resolve,
    findForHandling,
    markRejected,
    record,
    notify,
    calls,
    asReception,
    asAdmin,
  };
}

async function failureOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof AppException)) throw error;
    return {
      status: error.getStatus(),
      body: error.getResponse() as { maLoi: string },
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

describe('XDL-08 từ chối: giao dịch RIÊNG, chỉ khoá tầng 6c, đúng thứ tự ghi', () => {
  it('thành công: 200 đúng hai khoá, thoiGianMayChu lấy SAU giao dịch (M18); thứ tự khoá, UPDATE, Audit, thông báo', async () => {
    const { asReception, calls, notify } = setup();
    // Đồng hồ giả nhích 2,5 giây ở bước CUỐI của giao dịch (thông báo): `thoiGianMayChu` phải phản ánh giờ SAU giao dịch
    notify.mockImplementationOnce(() => {
      calls.push('notify');
      vi.setSystemTime(new Date(T0.getTime() + 2500));
      return Promise.resolve();
    });
    const result = await asReception();
    expect(result).toStrictEqual({
      yeuCau: { trangThai: 'TuChoi' },
      thoiGianMayChu: '2026-11-02T01:00:03.289Z',
    });
    expect(calls).toEqual(['markRejected', 'audit', 'notify']);
  });

  it('XDL-46 / M10 đúng MỘT câu khoá: FOR UPDATE bảng yêu cầu theo khoá chính; không khoá khung giờ, lịch, bác sĩ, bệnh nhân (không FOR SHARE nào)', async () => {
    const { asReception, transactions, transaction } = setup();
    await asReception();
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0]?.[0]).toBe('READ COMMITTED');
    const sqls = (transactions[0]?.queries ?? []).map((q) => q.sql);
    const locking = sqls.filter((sql) => /FOR\s+(UPDATE|SHARE)/i.test(sql));
    expect(locking).toHaveLength(1);
    expect(locking[0]).toMatch(/FROM yeu_cau_doi_lich_ngoai_chinh_sach\b/);
    expect(locking[0]).toMatch(
      /WHERE yeu_cau_doi_lich_ngoai_chinh_sach_id = \?/,
    );
    const lockQuery = transactions[0]?.queries.find((q) =>
      /FOR UPDATE/.test(q.sql),
    );
    expect(lockQuery?.params).toStrictEqual([REQUEST_ID]);
    for (const table of ['khung_gio', 'lich_hen', 'bac_si', 'benh_nhan'])
      expect(sqls.join('\n')).not.toMatch(new RegExp(`FROM ${table}\\b`));
  });

  it('HDL-10 UPDATE, Audit và thông báo cùng nhận ĐÚNG em của giao dịch (không phải em đọc thường)', async () => {
    const { asReception, markRejected, record, notify, transactions } = setup();
    await asReception();
    const txEm = transactions[0]?.em;
    expect(markRejected.mock.calls[0]?.[0]).toBe(txEm);
    expect(record.mock.calls[0]?.[0]).toBe(txEm);
    expect(notify.mock.calls[0]?.[0]).toBe(txEm);
  });

  it('markRejected nhận id yêu cầu, ghi chú nguyên, NGƯỜI XỬ LÝ là tài khoản từ chối, thời điểm là MỘT mốc cắt giây', async () => {
    const { asReception, markRejected } = setup();
    await asReception();
    expect(markRejected.mock.calls[0]?.[1]).toStrictEqual({
      yeuCauId: REQUEST_ID,
      ghiChu: NOTE,
      nguoiXuLyId: ACCOUNT,
      thoiDiemXuLy: T0_SECOND,
    });
  });
});

describe('XDL-47 Audit và NDL-30 thông báo của từ chối', () => {
  it('Audit: targetId là id YÊU CẦU, branchId là chi nhánh của LỊCH (khác chi nhánh Lễ tân), actorId là người từ chối, KHÔNG có khoá ma_lich_hen_moi (kể cả null)', async () => {
    const { asReception, record } = setup();
    await asReception();
    expect(record).toHaveBeenCalledTimes(1);
    const entry = record.mock.calls[0]?.[1];
    expect(entry).toStrictEqual({
      actorId: ACCOUNT,
      branchId: '8',
      action: 'XuLyDoiLichNgoaiChinhSach',
      targetType: 'yeu_cau_doi_lich_ngoai_chinh_sach',
      targetId: REQUEST_ID,
      result: 'ThanhCong',
      changes: {
        truoc: { trang_thai: 'ChoDuyet' },
        sau: { trang_thai: 'TuChoi' },
        ghi_chu: NOTE,
        ma_lich_hen_cu: 'CLX-20261110-AAA01',
      },
    });
    expect(Object.keys(entry?.changes ?? {})).not.toContain('ma_lich_hen_moi');
  });

  it('Quản trị viên Toàn hệ thống: Audit VẪN có branchId là chi nhánh của lịch và actorId là người từ chối', async () => {
    const { asAdmin, record } = setup();
    await asAdmin({ kind: 'ToanHeThong' });
    expect(record.mock.calls[0]?.[1]).toMatchObject({
      actorId: ACCOUNT,
      branchId: '8',
      targetId: REQUEST_ID,
    });
  });

  it('thông báo YeuCauDoiLichBiTuChoi: người nhận là tài khoản ĐẶT (không phải người từ chối), lịch CŨ, ghi chú nguyên, giờ MONG MUỐN GỐC; không mã lịch mới, không giờ mới', async () => {
    const { asReception, notify } = setup();
    await asReception();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]?.[1]).toStrictEqual({
      loaiSuKien: 'YeuCauDoiLichBiTuChoi',
      lichHenId: '31',
      taiKhoanId: '41',
      yeuCau: {
        yeuCauId: REQUEST_ID,
        ghiChu: NOTE,
        thoiGianMongMuon: ROW.thoiGianMongMuon,
      },
    });
    expect(notify.mock.calls[0]?.[1].taiKhoanId).not.toBe(ACCOUNT);
  });
});

describe('XDL-10 quyết định ChoDuyet DƯỚI khoá (không cổng sớm), phạm vi TRƯỚC', () => {
  it.each(['DaDuyet', 'TuChoi'])(
    'yêu cầu đã %s dưới khoá ⇒ 409 YEU_CAU_DA_XU_LY; commit RỖNG (không UPDATE, Audit, thông báo)',
    async (trangThai) => {
      const { asReception, markRejected, record, notify } = setup({
        locks: [lockedOf({ trangThai })],
      });
      const failure = await failureOf(asReception());
      expect(failure.status).toBe(409);
      expect(failure.body.maLoi).toBe('YEU_CAU_DA_XU_LY');
      expect(markRejected).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
    },
  );

  it('M22 quyết định theo hàng ĐÃ KHOÁ chứ không theo lần đọc thường: đọc thường thấy DaDuyet nhưng dưới khoá còn ChoDuyet ⇒ vẫn từ chối được (không có cổng sớm để che)', async () => {
    const { asReception, markRejected } = setup({
      row: { ...ROW, trangThai: 'DaDuyet' },
      locks: [lockedOf()],
    });
    await expect(asReception()).resolves.toMatchObject({
      yeuCau: { trangThai: 'TuChoi' },
    });
    expect(markRejected).toHaveBeenCalledTimes(1);
  });

  it('đọc thường thấy ChoDuyet nhưng người khác đã xử lý trước khi khoá ⇒ 409 (thua cuộc đua)', async () => {
    const { asReception, markRejected } = setup({
      locks: [lockedOf({ trangThai: 'TuChoi' })],
    });
    expect((await failureOf(asReception())).body.maLoi).toBe(
      'YEU_CAU_DA_XU_LY',
    );
    expect(markRejected).not.toHaveBeenCalled();
  });

  it.each([
    ['hàng đã biến mất', null],
    ['lệch lịch gốc', lockedOf({ lichHenId: '999' })],
  ])(
    'dưới khoá: %s ⇒ 404 YEU_CAU_DOI_LICH_KHONG_TON_TAI, không ghi gì',
    async (_case, locked) => {
      const { asReception, markRejected, record, notify } = setup({
        locks: [locked],
      });
      expect((await failureOf(asReception())).body.maLoi).toBe(
        'YEU_CAU_DOI_LICH_KHONG_TON_TAI',
      );
      expect(markRejected).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
      expect(notify).not.toHaveBeenCalled();
    },
  );

  it('id sai dạng hoặc không có hàng trong phạm vi ⇒ 404 và KHÔNG mở giao dịch nào', async () => {
    const malformed = setup();
    expect((await failureOf(malformed.asReception('abc'))).status).toBe(404);
    expect(malformed.transaction).not.toHaveBeenCalled();
    expect(malformed.findForHandling).not.toHaveBeenCalled();
    const absent = setup({ row: null });
    expect((await failureOf(absent.asReception())).status).toBe(404);
    expect(absent.transaction).not.toHaveBeenCalled();
  });

  it('phạm vi ĐỨNG TRƯỚC: Lễ tân bị khoá ⇒ 403 trước mọi thứ (kể cả id sai dạng); Quản trị viên hỏng phạm vi ⇒ 403; Chi nhánh ⇒ đọc theo chi nhánh được gán; Toàn hệ thống ⇒ không lọc', async () => {
    const locked = setup({ scope: new AppException(403, 'KHONG_DU_QUYEN') });
    expect((await failureOf(locked.asReception('abc'))).status).toBe(403);
    expect(locked.findForHandling).not.toHaveBeenCalled();

    const broken = setup();
    expect(
      (
        await failureOf(
          broken.asAdmin({ kind: 'ChiNhanh' } as unknown as AdminScope),
        )
      ).status,
    ).toBe(403);
    expect(broken.transaction).not.toHaveBeenCalled();

    const branch = setup();
    await branch.asAdmin({ kind: 'ChiNhanh', chiNhanhId: '9' });
    expect(branch.findForHandling.mock.calls[0]?.[1]).toBe('9');
    const global = setup();
    await global.asAdmin({ kind: 'ToanHeThong' });
    expect(global.findForHandling.mock.calls[0]?.[1]).toBeUndefined();
  });
});

describe('XDL-14 lỗi Audit hay thông báo nổi ra để giao dịch hoàn tác trọn', () => {
  it('M11 AuditError NỔI (không try/catch): từ chối lỗi cùng AuditError, thông báo KHÔNG được gửi', async () => {
    const { asReception, record, notify } = setup();
    const failure = new AuditError('AUDIT_WRITE_FAILED');
    record.mockRejectedValueOnce(failure);
    await expect(asReception()).rejects.toBe(failure);
    expect(notify).not.toHaveBeenCalled();
  });

  it('M12 lỗi thông báo NỔI cùng lỗi gốc (Audit đã ghi trong giao dịch sẽ hoàn tác)', async () => {
    const { asReception, notify } = setup();
    const failure = new Error('ghi thông báo lỗi');
    notify.mockRejectedValueOnce(failure);
    await expect(asReception()).rejects.toBe(failure);
  });

  it('markRejected lỗi (0 hàng) NỔI, Audit và thông báo không chạy', async () => {
    const { asReception, markRejected, record, notify } = setup();
    const failure = new Error('yêu cầu không còn ChoDuyet');
    markRejected.mockRejectedValueOnce(failure);
    await expect(asReception()).rejects.toBe(failure);
    expect(record).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('XDL-50 thân giao dịch chạy HAI lần (1213) cho cùng kết quả, không giữ trạng thái', () => {
  it('lần một gặp deadlock ở Audit ⇒ thân chạy lại từ đầu: hai lần khoá, markRejected và Audit nhận CÙNG đối số (mốc xử lý không đổi dù đồng hồ nhích), thông báo chỉ gửi ở lần thành công', async () => {
    const { asReception, markRejected, record, notify, transactions } = setup();
    record.mockImplementationOnce(() => {
      vi.setSystemTime(new Date(T0.getTime() + 5000));
      return Promise.reject(mysqlError(1213));
    });
    await expect(asReception()).resolves.toMatchObject({
      yeuCau: { trangThai: 'TuChoi' },
    });
    expect(transactions).toHaveLength(2);
    expect(markRejected).toHaveBeenCalledTimes(2);
    expect(markRejected.mock.calls[1]?.[1]).toStrictEqual(
      markRejected.mock.calls[0]?.[1],
    );
    expect(markRejected.mock.calls[1]?.[1]).toMatchObject({
      thoiDiemXuLy: T0_SECOND,
    });
    expect(record.mock.calls[1]?.[1]).toStrictEqual(record.mock.calls[0]?.[1]);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
