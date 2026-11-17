import { Logger } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { vi } from 'vitest';
import {
  mysqlError,
  ScriptedEntityManager,
} from '../../../appointments/testing/scripted-entity-manager.js';
import { AuditError } from '../../../audit/audit-error.js';
import type { AuditService } from '../../../audit/audit.service.js';
import { AppException } from '../../../common/errors/app.exception.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import type { HideRatingDto } from './rating-hide.dto.js';
import {
  HIDE_RATING_SQL,
  LOCK_RATING_SQL,
  RatingHideRepository,
  READ_FOR_HIDE_SQL,
} from './rating-hide.repository.js';
import { HIDE_LABEL, RatingHideService } from './rating-hide.service.js';

// doctor-exam B8 — RatingHideService, tầng ĐƠN VỊ (không DB): thứ tự câu lệnh, phạm vi TRƯỚC khoá và ghi, hai lớp bảo vệ "đã ẩn", nhật ký cùng giao dịch, thử lại (PLAN 5.3, 5.8; KDD-04, KDD-05, KDD-07, KDD-08, KDD-10, TDK-05, KDD-23).
// `DataSource` giả chỉ có `query` (đọc thường) và `transaction` (chạy thân với một `EntityManager` giả); `withBookingTransaction`, `RatingHideRepository` và `BranchAccessPolicy` là mã THẬT; `AuditService` là bản giả
// ghi lại lời gọi. Phần MySQL thật (CHECK, khoá hàng, đua, nhật ký thật): rating-hide.int-spec.ts và rating-hide.concurrency.int-spec.ts.
const ID = '501';
const ACTOR = '3';
const TARGET = { danhGiaId: '501', bacSiId: '31', chiNhanhId: '7' };
const REASON = 'Nội dung quảng cáo, không liên quan đến buổi khám';
const SYSTEM: AdminScope = { kind: 'ToanHeThong' };
const BRANCH_7: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '7' };
const BRANCH_8: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '8' };
const NOT_FOUND_BODY = {
  maLoi: 'KHONG_TIM_THAY',
  thongBao: 'Không tìm thấy dữ liệu.',
};

/** Không đối số ⇒ lý do hợp lệ; truyền `undefined` ⇒ thân KHÔNG có lý do (tham số mặc định sẽ biến `undefined` thành lý do hợp lệ, nên dùng độ dài của danh sách đối số) */
const body = (...args: [lyDo?: string | null]): HideRatingDto => ({
  lyDo: args.length === 0 ? REASON : args[0],
});

interface Options {
  /** Dòng đọc thường; `null` = không có đánh giá; mặc định đánh giá 501 của chi nhánh 7 */
  target?: typeof TARGET | null;
  /** Trả lời của câu `FOR UPDATE`: `bi_an` hiện tại; `null` = không có hàng */
  lock?: { biAn: number } | null;
  /** `affectedRows` của `UPDATE` (mặc định 1) */
  changed?: number;
  /** Lỗi ném ở MỖI lần `FOR UPDATE` đầu tiên, theo thứ tự (số lần = độ dài mảng) */
  lockFails?: Error[];
  /** Lỗi ném bởi nhật ký */
  auditFails?: Error;
}

function setup(options: Options = {}) {
  const fails = [...(options.lockFails ?? [])];
  const em = new ScriptedEntityManager((sql) => {
    if (/@@session/.test(sql)) return [{ value: '50' }];
    if (sql === LOCK_RATING_SQL)
      return options.lock === null ? [] : [options.lock ?? { biAn: 0 }];
    if (sql === HIDE_RATING_SQL) return { affectedRows: options.changed ?? 1 };
    return [];
  });
  em.failQuery = (sql) => (sql === LOCK_RATING_SQL ? fails.shift() : undefined);
  const query = vi.fn((..._args: unknown[]) =>
    Promise.resolve(options.target === null ? [] : [options.target ?? TARGET]),
  );
  const transaction = vi.fn(
    (_isolation: string, work: (manager: EntityManager) => Promise<unknown>) =>
      work(em.em),
  );
  /** Số câu của thân giao dịch ĐÃ chạy lúc `record` được gọi (để kiểm "nhật ký SAU `UPDATE`") */
  const statementsAtAudit: number[] = [];
  const record = vi.fn((..._args: unknown[]) => {
    statementsAtAudit.push(statements().length);
    return options.auditFails === undefined
      ? Promise.resolve()
      : Promise.reject(options.auditFails);
  });
  const service = new RatingHideService(
    { query, transaction } as unknown as DataSource,
    new RatingHideRepository(),
    new BranchAccessPolicy(),
    { record } as unknown as AuditService,
  );
  /** Câu của THÂN giao dịch (bỏ câu đặt phiên) */
  const statements = () =>
    em.queries
      .map(({ sql }) => sql)
      .filter((sql) => !/^\s*SET SESSION|@@session/i.test(sql));
  return {
    service,
    em,
    query,
    transaction,
    record,
    statements,
    statementsAtAudit,
  };
}

/** `AppException` mà lời hứa ném ra (không ném hay lỗi khác thì làm test đỏ). */
async function appException(work: Promise<unknown>): Promise<AppException> {
  const error = await work.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error, 'phải bị từ chối bằng AppException').toBeInstanceOf(
    AppException,
  );
  return error as AppException;
}

let warnings: string[] = [];
beforeEach(() => {
  warnings = [];
  vi.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
    warnings.push(String(message));
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('KDD-04 ẩn thành công: đúng chuỗi câu lệnh, một giao dịch, nhật ký SAU UPDATE', () => {
  it('đọc thường MỘT câu theo id ⇒ MỘT giao dịch (nhãn exam-hide): FOR UPDATE ⇒ UPDATE (lý do, id) ⇒ nhật ký; trả { danhGiaId, biAn: true }', async () => {
    const t = setup();
    const result = await t.service.hide(SYSTEM, ACTOR, ID, body());
    expect(result).toEqual({ danhGiaId: '501', biAn: true });
    expect(t.query).toHaveBeenCalledTimes(1);
    expect(t.query.mock.calls[0]).toEqual([READ_FOR_HIDE_SQL, [ID]]);
    expect(t.transaction).toHaveBeenCalledTimes(1);
    expect(t.transaction.mock.calls[0]?.[0]).toBe('READ COMMITTED');
    expect(t.statements()).toEqual([LOCK_RATING_SQL, HIDE_RATING_SQL]);
    expect(
      t.em.queries
        .filter(({ sql }) => !/SET SESSION|@@session/.test(sql))
        .map(({ params }) => params),
    ).toEqual([[ID], [REASON, ID]]);
    expect(t.record).toHaveBeenCalledTimes(1);
    // `record` được gọi khi cả hai câu (khoá, UPDATE) đã chạy: nhật ký SAU khi đã đổi dữ liệu và CÙNG giao dịch (em của giao dịch)
    expect(t.statementsAtAudit).toEqual([2]);
    expect(t.record.mock.calls[0]?.[0]).toBe(t.em.em);
  });

  it('lý do được chuẩn hoá (trim, CRLF ⇒ LF) rồi MỚI ghi vào UPDATE và nhật ký; cùng một chuỗi ở cả hai', async () => {
    const t = setup();
    await t.service.hide(
      SYSTEM,
      ACTOR,
      ID,
      body(`  Quảng cáo\r\nkhông liên quan đến buổi khám \u0001 `),
    );
    const normalized = 'Quảng cáo\nkhông liên quan đến buổi khám';
    expect(
      t.em.queries.find(({ sql }) => sql === HIDE_RATING_SQL)?.params,
    ).toEqual([normalized, ID]);
    const entry = t.record.mock.calls[0]?.[1] as {
      changes: { ly_do: string };
    };
    expect(entry.changes.ly_do).toBe(normalized);
  });

  it('TDK-05 nhật ký đúng từng khoá: người ẩn = access token, branchId = chi nhánh của LỊCH (kể cả Admin Toàn hệ thống: không null), targetId = id đánh giá, bốn khoá của changes; không nhận xét, không tên', async () => {
    const t = setup();
    await t.service.hide(SYSTEM, ACTOR, ID, body());
    expect(t.record.mock.calls[0]?.[1]).toEqual({
      actorId: ACTOR,
      branchId: '7',
      action: 'AnDanhGia',
      targetType: 'danh_gia_bac_si',
      targetId: '501',
      result: 'ThanhCong',
      changes: {
        truoc: { bi_an: false },
        sau: { bi_an: true },
        ly_do: REASON,
        bac_si_id: '31',
      },
    });
  });

  it('Admin Chi nhánh đúng chi nhánh của lịch cũng ẩn được', async () => {
    const t = setup();
    expect(await t.service.hide(BRANCH_7, ACTOR, ID, body())).toEqual({
      danhGiaId: '501',
      biAn: true,
    });
    expect(t.record).toHaveBeenCalledTimes(1);
  });

  it('chi nhánh của nhật ký lấy từ LỊCH đã đọc, không từ phạm vi của Admin: lịch ở chi nhánh 9, Admin Toàn hệ thống ⇒ branchId "9"', async () => {
    const t = setup({ target: { ...TARGET, chiNhanhId: '9' } });
    await t.service.hide(SYSTEM, ACTOR, ID, body());
    const entry = t.record.mock.calls[0]?.[1] as { branchId: string };
    expect(entry.branchId).toBe('9');
  });
});

describe('KDD-05, KDD-06, KDD-25 lỗi lý do ⇒ 400 TRƯỚC mọi truy cập DB', () => {
  it.each([
    ['vắng', undefined, 'LY_DO_BAT_BUOC'],
    ['null', null, 'LY_DO_BAT_BUOC'],
    ['chỉ khoảng trắng', '   ', 'LY_DO_BAT_BUOC'],
    ['9 đơn vị', 'x'.repeat(9), 'LY_DO_QUA_NGAN'],
    ['256 đơn vị', 'x'.repeat(256), 'LY_DO_QUA_DAI'],
    ['dạng bí mật', 'Bearer abc123xyz', 'NOI_DUNG_KHONG_HOP_LE'],
  ])(
    '%s ⇒ 400 DU_LIEU_KHONG_HOP_LE kèm loi[{ lyDo, %s }]; không đọc DB, không giao dịch, không nhật ký',
    async (_name, raw, ma) => {
      const t = setup();
      const error = await appException(
        t.service.hide(SYSTEM, ACTOR, ID, body(raw)),
      );
      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        loi: [{ truong: 'lyDo', ma }],
      });
      expect(JSON.stringify(error.getResponse())).not.toContain('abc123xyz');
      expect(t.query).not.toHaveBeenCalled();
      expect(t.transaction).not.toHaveBeenCalled();
      expect(t.record).not.toHaveBeenCalled();
    },
  );
});

describe('KDD-08, QHK-06 phạm vi và không có đánh giá ⇒ 404 cùng thân, KHÔNG xin khoá, KHÔNG ghi', () => {
  it('không có đánh giá ⇒ 404 KHONG_TIM_THAY; chỉ MỘT câu đọc thường, không mở giao dịch', async () => {
    const t = setup({ target: null });
    const error = await appException(t.service.hide(SYSTEM, ACTOR, ID, body()));
    expect(error.getStatus()).toBe(404);
    expect(error.getResponse()).toEqual(NOT_FOUND_BODY);
    expect(t.query).toHaveBeenCalledTimes(1);
    expect(t.transaction).not.toHaveBeenCalled();
    expect(t.record).not.toHaveBeenCalled();
  });

  it('Admin Chi nhánh 8 ẩn đánh giá của chi nhánh 7 ⇒ 404 CÙNG thân với "không có"; không mở giao dịch (⇒ không khoá, không UPDATE, không nhật ký)', async () => {
    const t = setup();
    const error = await appException(
      t.service.hide(BRANCH_8, ACTOR, ID, body()),
    );
    expect(error.getStatus()).toBe(404);
    expect(error.getResponse()).toEqual(NOT_FOUND_BODY);
    expect(t.transaction).not.toHaveBeenCalled();
    expect(t.em.queries).toEqual([]);
    expect(t.record).not.toHaveBeenCalled();
  });

  it('phạm vi theo chi nhánh của LỊCH (đọc từ dòng), không theo chi nhánh trong thân hay phạm vi khác: lịch ở chi nhánh 8 thì Admin chi nhánh 7 bị chặn, Admin chi nhánh 8 qua', async () => {
    const at8 = { ...TARGET, chiNhanhId: '8' };
    const blocked = setup({ target: at8 });
    expect(
      (
        await appException(blocked.service.hide(BRANCH_7, ACTOR, ID, body()))
      ).getStatus(),
    ).toBe(404);
    const allowed = setup({ target: at8 });
    await allowed.service.hide(BRANCH_8, ACTOR, ID, body());
    expect(allowed.record).toHaveBeenCalledTimes(1);
  });

  it('không có hàng khi khoá (biến mất giữa đọc thường và khoá) ⇒ 404; không UPDATE, không nhật ký', async () => {
    const t = setup({ lock: null });
    const error = await appException(t.service.hide(SYSTEM, ACTOR, ID, body()));
    expect(error.getStatus()).toBe(404);
    expect(error.getResponse()).toEqual(NOT_FOUND_BODY);
    expect(t.statements()).toEqual([LOCK_RATING_SQL]);
    expect(t.record).not.toHaveBeenCalled();
  });
});

describe('KDD-07 ẩn lần hai ⇒ 409 DANH_GIA_DA_AN, không UPDATE, không nhật ký thứ hai', () => {
  it('lớp bảo vệ THỨ NHẤT: FOR UPDATE thấy bi_an = 1 ⇒ 409; chỉ MỘT câu trong giao dịch (không UPDATE), không nhật ký; thân KHÔNG có chiTiet (không lộ lý do cũ)', async () => {
    const t = setup({ lock: { biAn: 1 } });
    const error = await appException(t.service.hide(SYSTEM, ACTOR, ID, body()));
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toEqual({
      maLoi: 'DANH_GIA_DA_AN',
      thongBao: expect.any(String) as string,
    });
    expect(error.getResponse()).not.toHaveProperty('chiTiet');
    expect(t.statements()).toEqual([LOCK_RATING_SQL]);
    expect(t.record).not.toHaveBeenCalled();
  });

  it('lớp bảo vệ THỨ HAI: FOR UPDATE báo bi_an = 0 mà UPDATE … AND bi_an = 0 trúng 0 hàng ⇒ vẫn 409, KHÔNG nhật ký', async () => {
    const t = setup({ changed: 0 });
    const error = await appException(t.service.hide(SYSTEM, ACTOR, ID, body()));
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ maLoi: 'DANH_GIA_DA_AN' });
    expect(t.statements()).toEqual([LOCK_RATING_SQL, HIDE_RATING_SQL]);
    expect(t.record).not.toHaveBeenCalled();
  });

  it('UPDATE trúng NHIỀU hơn một hàng (câu SQL sai) ⇒ ném lỗi thường để HOÀN TÁC (không phải 409, không nhật ký): không để lọt việc ẩn lan sang hàng khác', async () => {
    const t = setup({ changed: 2 });
    const error: unknown = await t.service.hide(SYSTEM, ACTOR, ID, body()).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppException);
    expect(t.record).not.toHaveBeenCalled();
  });
});

describe('KDD-10 nhật ký lỗi ⇒ hoàn tác (lỗi đi ra, không bị nuốt)', () => {
  it('AuditError ném ra từ nhật ký lan ra ngoài NGUYÊN VẸN (không đổi thành 200, không đổi thành AppException); nhật ký được gọi đúng một lần', async () => {
    const failure = new AuditError('AUDIT_WRITE_FAILED');
    const t = setup({ auditFails: failure });
    const error: unknown = await t.service.hide(SYSTEM, ACTOR, ID, body()).then(
      () => undefined,
      (thrown: unknown) => thrown,
    );
    expect(error).toBe(failure);
    expect(t.record).toHaveBeenCalledTimes(1);
  });
});

describe('thử lại 1213 và 1205 (withBookingTransaction thật)', () => {
  it('1213 ở lần khoá đầu ⇒ chạy lại cả thân, lần hai thành công: ĐÚNG MỘT nhật ký, một cảnh báo mang nhãn exam-hide', async () => {
    const t = setup({ lockFails: [mysqlError(1213)] });
    expect(await t.service.hide(SYSTEM, ACTOR, ID, body())).toEqual({
      danhGiaId: '501',
      biAn: true,
    });
    expect(t.transaction).toHaveBeenCalledTimes(2);
    expect(t.record).toHaveBeenCalledTimes(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(HIDE_LABEL);
    expect(warnings[0]).toContain('1213');
    expect(warnings[0]).not.toContain('quảng cáo');
  });

  it('hết lượt (ba lần 1205) ⇒ 503 HE_THONG_DANG_BAN; không nhật ký, không UPDATE', async () => {
    const t = setup({
      lockFails: [mysqlError(1205), mysqlError(1205), mysqlError(1205)],
    });
    const error = await appException(t.service.hide(SYSTEM, ACTOR, ID, body()));
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toMatchObject({ maLoi: 'HE_THONG_DANG_BAN' });
    expect(t.transaction).toHaveBeenCalledTimes(3);
    expect(t.record).not.toHaveBeenCalled();
    expect(t.em.queries.some(({ sql }) => sql === HIDE_RATING_SQL)).toBe(false);
  });
});
