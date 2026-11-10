import { AppException } from '../../common/errors/app.exception.js';
import { todayVN, nowVN } from '../../common/time/time.js';
import type { AuditService } from '../../audit/audit.service.js';
import { BranchAccessPolicy } from '../../rbac/branch-access.policy.js';
import type {
  ShiftRemovalRepository,
  ShiftToRemove,
} from './shift-removal.repository.js';
import { ShiftRemovalService } from './shift-removal.service.js';

// Doctor B4 — nhánh khó tái hiện bằng dữ liệu thật: khoá ngoại 1451 của bảng khác (M2) và thử lại khi deadlock.
const shift: ShiftToRemove = {
  lichLamViecId: '7',
  bacSiId: '5',
  chiNhanhId: '1',
  ngay: todayVN(nowVN()),
  ca: 'CaSang',
};

function build(
  overrides: Partial<Record<keyof ShiftRemovalRepository, unknown>> = {},
) {
  const record = vi.fn();
  const repository = {
    manager: {},
    transaction: (work: (em: object) => Promise<void>) => work({}),
    findShift: async () => shift,
    lockDoctor: async () => '1',
    lockSlots: async () => [{ khungGioId: '70', trangThai: 'ConTrong' }],
    findReferencingAppointments: async () => ({ tong: 0, maLichHen: [] }),
    deleteShiftWithSlots: async () => undefined,
    ...overrides,
  } as unknown as ShiftRemovalRepository;
  const service = new ShiftRemovalService(
    repository,
    new BranchAccessPolicy(),
    { record } as unknown as AuditService,
  );
  return { service, record };
}
const SYSTEM = { kind: 'ToanHeThong' } as const;
const driverError = (errno: number) =>
  Object.assign(new Error('mysql'), { driverError: { errno } });

describe('ShiftRemovalService', () => {
  it('PC-22 khoá ngoại 1451 từ bảng khác (đổi lịch ngoài chính sách, danh sách chờ) ⇒ 409 CA_DANG_CO_LICH_HEN, không ghi nhật ký', async () => {
    const { service, record } = build({
      deleteShiftWithSlots: async () => {
        throw driverError(1451);
      },
    });
    const error = await service.remove(SYSTEM, '9', '7').catch((e) => e);
    expect(error).toBeInstanceOf(AppException);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({
      maLoi: 'CA_DANG_CO_LICH_HEN',
      chiTiet: { maLichHen: [] },
    });
    expect(record).not.toHaveBeenCalled();
  });

  it('lỗi MySQL khác 1451 không bị nuốt thành 409 (vẫn là lỗi hệ thống)', async () => {
    const { service } = build({
      deleteShiftWithSlots: async () => {
        throw driverError(1146);
      },
    });
    await expect(service.remove(SYSTEM, '9', '7')).rejects.toMatchObject({
      driverError: { errno: 1146 },
    });
  });

  it('deadlock 1213 chạy lại giao dịch rồi thành công (tối đa 2 lần chạy lại)', async () => {
    let calls = 0;
    const { service, record } = build({
      lockDoctor: async () => {
        calls += 1;
        if (calls <= 2) throw driverError(1213);
        return '1';
      },
    });
    await service.remove(SYSTEM, '9', '7');
    expect(calls).toBe(3);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('deadlock liên tục: bỏ cuộc sau 2 lần chạy lại và ném lỗi gốc, không vòng lặp vô hạn', async () => {
    let calls = 0;
    const { service } = build({
      lockDoctor: async () => {
        calls += 1;
        throw driverError(1213);
      },
    });
    await expect(service.remove(SYSTEM, '9', '7')).rejects.toMatchObject({
      driverError: { errno: 1213 },
    });
    expect(calls).toBe(3);
  });

  it('ca bị Admin khác gỡ trong lúc chờ khoá bác sĩ ⇒ 404 KHONG_TIM_THAY', async () => {
    let reads = 0;
    const { service, record } = build({
      findShift: async () => (reads++ === 0 ? shift : null),
    });
    const error = await service.remove(SYSTEM, '9', '7').catch((e) => e);
    expect(error.getStatus()).toBe(404);
    expect(error.getResponse()).toMatchObject({ maLoi: 'KHONG_TIM_THAY' });
    expect(record).not.toHaveBeenCalled();
  });

  it('QH-02 Admin Chi nhánh khác chi nhánh của ca ⇒ 404, không khoá gì', async () => {
    const lockDoctor = vi.fn();
    const { service } = build({ lockDoctor });
    const error = await service
      .remove({ kind: 'ChiNhanh', chiNhanhId: '2' }, '9', '7')
      .catch((e) => e);
    expect(error.getStatus()).toBe(404);
    expect(lockDoctor).not.toHaveBeenCalled();
  });

  it('PC-24 nhật ký ghi đúng: chi nhánh HIỆN TẠI của bác sĩ, nội dung danh sách trắng', async () => {
    const { service, record } = build({ lockDoctor: async () => '3' });
    await service.remove(SYSTEM, '9', '7');
    expect(record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: '9',
        branchId: '3',
        action: 'GoLichLamViec',
        targetType: 'lich_lam_viec',
        targetId: '7',
        changes: {
          bac_si_id: '5',
          ngay: shift.ngay,
          ca: 'CaSang',
          so_khung_gio: 1,
        },
      }),
    );
  });
});
