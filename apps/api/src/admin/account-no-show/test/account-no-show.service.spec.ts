import type { EntityManager } from 'typeorm';
import { validateAuditEntry } from '../../../audit/audit-validation.js';
import type { AuditEntry } from '../../../audit/audit-entry.js';
import type { AuditService } from '../../../audit/audit.service.js';
import type { LoaiTaiKhoan } from '../../../auth/entities/enums.js';
import {
  AppException,
  type ErrorBody,
} from '../../../common/errors/app.exception.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { accountVisibility } from '../../accounts/account-visibility.js';
import { findSecretLeaks } from '../../accounts/testing/secret-leak.js';
import {
  accountNotPatient,
  accountStateNotAllowed,
} from '../account-no-show.errors.js';
import type {
  AccountNoShowRepository,
  NoShowCounter,
} from '../account-no-show.repository.js';
import { AccountNoShowService } from '../account-no-show.service.js';

const system: AdminScope = { kind: 'ToanHeThong' };
const branch: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '7' };
const ACTOR = '3';
const TARGET = '10';
const manager = { tag: 'manager-giao-dich' } as unknown as EntityManager;

async function failure(work: Promise<unknown>): Promise<AppException> {
  const error = await work.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AppException);
  return error as AppException;
}

describe('AccountNoShowService — thứ tự kiểm, giao dịch, audit (repository và audit giả)', () => {
  const calls: string[] = [];
  const repository = {
    transaction: vi.fn(),
    findVisibleKind: vi.fn(),
    lockCounter: vi.fn(),
    clearFlag: vi.fn(),
  };
  const audit = { record: vi.fn() };
  const policy = new BranchAccessPolicy();
  const service = new AccountNoShowService(
    repository as unknown as AccountNoShowRepository,
    policy,
    audit as unknown as AuditService,
  );

  const setup = (
    kind: LoaiTaiKhoan | null,
    counter: NoShowCounter | null = { khoa: true, soLan: 3 },
  ) => {
    repository.findVisibleKind.mockImplementation(() => {
      calls.push('doc');
      return Promise.resolve(kind);
    });
    repository.lockCounter.mockImplementation(() => {
      calls.push('khoa');
      return Promise.resolve(counter);
    });
    repository.clearFlag.mockImplementation(() => {
      calls.push('tat-co');
      return Promise.resolve(true);
    });
    audit.record.mockImplementation(() => {
      calls.push('audit');
      return Promise.resolve();
    });
  };

  beforeEach(() => {
    calls.length = 0;
    for (const mock of [
      repository.transaction,
      repository.findVisibleKind,
      repository.lockCounter,
      repository.clearFlag,
      audit.record,
    ])
      mock.mockReset();
    // Giao dịch giả: chạy `work` với một manager duy nhất để so "cùng manager".
    repository.transaction.mockImplementation(
      (work: (m: EntityManager) => Promise<unknown>) => work(manager),
    );
  });

  describe('TKB19-01 (TK-32, TK-33, PQ-13) — thứ tự kiểm 404 → 403 → 400', () => {
    it('không thấy đích (không tồn tại hoặc ngoài tầm nhìn): 404 KHONG_TIM_THAY với cả hai phạm vi, KHÔNG khoá, KHÔNG ghi', async () => {
      for (const scope of [system, branch]) {
        calls.length = 0;
        setup(null);
        const error = await failure(service.unlock(scope, ACTOR, TARGET));
        expect(error.getStatus()).toBe(404);
        expect(error.getResponse()).toMatchObject({ maLoi: 'KHONG_TIM_THAY' });
        expect(calls).toEqual(['doc']);
      }
    });

    it('Chi nhánh + đích KHÔNG thấy được ⇒ 404 (không phải 403): bước tầm nhìn đứng TRƯỚC bước quyền', async () => {
      setup(null);
      const error = await failure(service.unlock(branch, ACTOR, TARGET));
      expect(error.getStatus()).toBe(404);
    });

    it.each(['BenhNhan', 'BacSi', 'LeTan'] as const)(
      'Chi nhánh + đích %s THẤY được ⇒ 403 KHONG_DU_QUYEN (không phải 400), không khoá, không ghi',
      async (kind) => {
        setup(kind);
        const error = await failure(service.unlock(branch, ACTOR, TARGET));
        expect(error.getStatus()).toBe(403);
        expect(error.getResponse()).toMatchObject({ maLoi: 'KHONG_DU_QUYEN' });
        expect(calls).toEqual(['doc']);
      },
    );

    it.each(['BacSi', 'LeTan', 'QuanTriVien'] as const)(
      'Toàn hệ thống + đích %s ⇒ 400 DU_LIEU_KHONG_HOP_LE (không phải Bệnh nhân), không khoá, không ghi',
      async (kind) => {
        setup(kind);
        const error = await failure(service.unlock(system, ACTOR, TARGET));
        expect(error.getStatus()).toBe(400);
        expect(error.getResponse()).toEqual(accountNotPatient().getResponse());
        expect(calls).toEqual(['doc']);
      },
    );

    it('repository nhận ĐÚNG điều kiện tầm nhìn của người gọi (hàm dùng chung của B17), manager của giao dịch và id', async () => {
      for (const scope of [system, branch]) {
        setup('BenhNhan');
        repository.findVisibleKind.mockClear();
        await service.unlock(scope, ACTOR, TARGET).catch(() => undefined);
        expect(repository.findVisibleKind).toHaveBeenCalledWith(
          manager,
          accountVisibility(policy, scope),
          TARGET,
        );
      }
    });
  });

  describe('TKB19-02 (TK-30, TK-31, TK-25) — nhánh thành công và nhánh "không có gì để mở khoá"', () => {
    it('thành công: đọc → khoá → tắt cờ → audit đúng thứ tự, cùng MỘT manager; phản hồi đúng ba khoá', async () => {
      setup('BenhNhan', { khoa: true, soLan: 3 });
      const result = await service.unlock(system, ACTOR, TARGET);
      expect(calls).toEqual(['doc', 'khoa', 'tat-co', 'audit']);
      expect(repository.lockCounter).toHaveBeenCalledWith(manager, TARGET);
      expect(repository.clearFlag).toHaveBeenCalledWith(manager, TARGET);
      expect(audit.record.mock.calls[0]![0]).toBe(manager);
      expect(result).toEqual({
        taiKhoanId: TARGET,
        khoaDatLichDoNoShow: false,
        soLanNoShow: 3,
      });
      expect(Object.keys(result)).toHaveLength(3);
    });

    it('entry audit đúng hình dạng PLAN 5.10: người thực hiện từ phiên, chi nhánh NULL, số lần lấy từ dòng đã khoá', async () => {
      setup('BenhNhan', { khoa: true, soLan: 7 });
      await service.unlock(system, ACTOR, TARGET);
      expect(audit.record).toHaveBeenCalledTimes(1);
      expect(audit.record.mock.calls[0]![1]).toEqual({
        actorId: ACTOR,
        branchId: null,
        action: 'MoKhoaNoShow',
        targetType: 'benh_nhan',
        targetId: TARGET,
        result: 'ThanhCong',
        changes: {
          truoc: { khoa_dat_lich_do_no_show: true },
          sau: { khoa_dat_lich_do_no_show: false },
          so_lan_no_show: 7,
        },
      });
    });

    it('số lần no-show 0 vẫn mở khoá được và được ghi và trả nguyên là 0 (không đổi)', async () => {
      setup('BenhNhan', { khoa: true, soLan: 0 });
      const result = await service.unlock(system, ACTOR, TARGET);
      expect(result.soLanNoShow).toBe(0);
      expect(audit.record.mock.calls[0]![1]).toMatchObject({
        changes: { so_lan_no_show: 0 },
      });
    });

    it('cờ đang tắt ⇒ 409 TRANG_THAI_KHONG_PHU_HOP: không tắt cờ, không audit', async () => {
      setup('BenhNhan', { khoa: false, soLan: 3 });
      const error = await failure(service.unlock(system, ACTOR, TARGET));
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({
        maLoi: 'TRANG_THAI_KHONG_PHU_HOP',
      });
      expect(calls).toEqual(['doc', 'khoa']);
    });

    it('Bệnh nhân chưa có dòng benh_nhan (chưa xác minh) ⇒ 409 TRANG_THAI_KHONG_PHU_HOP: không tắt cờ, không audit', async () => {
      setup('BenhNhan', null);
      const error = await failure(service.unlock(system, ACTOR, TARGET));
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({
        maLoi: 'TRANG_THAI_KHONG_PHU_HOP',
      });
      expect(calls).toEqual(['doc', 'khoa']);
    });

    it('tắt cờ không ảnh hưởng đúng 1 hàng ⇒ ném Error thường (hệ thống, rollback), KHÔNG audit', async () => {
      setup('BenhNhan');
      repository.clearFlag.mockResolvedValue(false);
      const error: unknown = await service.unlock(system, ACTOR, TARGET).then(
        () => undefined,
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(AppException);
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('lỗi ghi audit lan ra NGUYÊN VĂN (không bị nuốt) để giao dịch hoàn tác cả bước tắt cờ', async () => {
      setup('BenhNhan');
      const boom = new Error('audit hỏng');
      audit.record.mockRejectedValue(boom);
      await expect(service.unlock(system, ACTOR, TARGET)).rejects.toBe(boom);
    });
  });

  describe('TKB19-03 (TK-25, SE-A15) — entry audit qua validator THẬT và sạch bí mật', () => {
    it('entry của service qua validateAuditEntry không ném, và không có khoá hay giá trị giống bí mật', async () => {
      setup('BenhNhan', { khoa: true, soLan: 3 });
      await service.unlock(system, ACTOR, TARGET);
      const entry = audit.record.mock.calls[0]![1] as AuditEntry;
      expect(() => validateAuditEntry(entry)).not.toThrow();
      expect(findSecretLeaks(entry)).toEqual([]);
    });
  });

  describe('TKB19-05 (TK-31, TK-32) — thân lỗi', () => {
    it('409: đúng mã và chữ PLAN 5.9, không loi, không chiTiet', () => {
      const error = accountStateNotAllowed();
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toEqual({
        maLoi: 'TRANG_THAI_KHONG_PHU_HOP',
        thongBao:
          'Trạng thái hiện tại của tài khoản không cho phép thao tác này.',
      } satisfies ErrorBody);
    });

    it('400: DU_LIEU_KHONG_HOP_LE kèm đúng một loi[{truong: id, ma}]', () => {
      const error = accountNotPatient();
      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toEqual({
        maLoi: 'DU_LIEU_KHONG_HOP_LE',
        thongBao: 'Dữ liệu không hợp lệ.',
        loi: [{ truong: 'id', ma: 'TAI_KHOAN_KHONG_PHAI_BENH_NHAN' }],
      } satisfies ErrorBody);
    });
  });
});
