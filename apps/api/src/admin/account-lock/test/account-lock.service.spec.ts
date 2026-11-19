import type { EntityManager } from 'typeorm';
import { AppException } from '../../../common/errors/app.exception.js';
import type { AuditEntry } from '../../../audit/audit-entry.js';
import type { AuditService } from '../../../audit/audit.service.js';
import type { SessionService } from '../../../auth/session/session.service.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { BranchAccessPolicy } from '../../../rbac/branch-access.policy.js';
import { AccountLockService } from '../account-lock.service.js';
import type { AccountLockRepository } from '../account-lock.repository.js';
import type {
  DoctorDependents,
  LockTarget,
  SystemAdminState,
} from '../account-lock.types.js';

const ACTOR = '999';
const system: AdminScope = { kind: 'ToanHeThong' };
const branch7: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '7' };
const manager = { marker: 'manager-giả' } as unknown as EntityManager;

const target = (overrides: Partial<LockTarget> = {}): LockTarget => ({
  taiKhoanId: '10',
  loaiTaiKhoan: 'LeTan',
  trangThai: 'DangHoatDong',
  phamViQuanTri: null,
  chiNhanhId: '7',
  ...overrides,
});
const sysTarget = (overrides: Partial<LockTarget> = {}) =>
  target({
    loaiTaiKhoan: 'QuanTriVien',
    phamViQuanTri: 'ToanHeThong',
    chiNhanhId: null,
    ...overrides,
  });

const dependents: DoctorDependents = {
  lichHen: {
    tong: 2,
    muc: [
      {
        lichHenId: '1',
        maLichHen: 'LH-1',
        thoiGian: '2026-11-25 08:00:00',
        trangThai: 'DaXacNhan',
      },
    ],
  },
  caLamViec: {
    tong: 1,
    muc: [
      { lichLamViecId: '5', chiNhanhId: '7', ngay: '2026-11-25', ca: 'CaSang' },
    ],
  },
};

// Lỗi deadlock giả có dạng mà `isDeadlockError` nhận ra (chỉ đọc errno và code).
const deadlock = () =>
  Object.assign(new Error('deadlock giả'), {
    errno: 1213,
    code: 'ER_LOCK_DEADLOCK',
  });

async function failure(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => undefined,
    (reason: unknown) => reason,
  );
}

describe('AccountLockService — giao dịch, thứ tự gọi, thử lại (repository, SessionService, AuditService giả)', () => {
  const calls: string[] = [];
  const repository = {
    preRead: vi.fn(),
    listSystemAdminIds: vi.fn(),
    transaction: vi.fn(),
    lockAccounts: vi.fn(),
    readTarget: vi.fn(),
    setLocked: vi.fn(),
    setUnlocked: vi.fn(),
    readDependents: vi.fn(),
  };
  const sessions = { revokeAll: vi.fn() };
  const audit = { record: vi.fn() };
  const service = new AccountLockService(
    repository as unknown as AccountLockRepository,
    new BranchAccessPolicy(),
    sessions as unknown as SessionService,
    audit as unknown as AuditService,
  );

  // Mọi hàm ghi nhật ký gọi vào `calls` để kiểm THỨ TỰ.
  const track = (
    name: string,
    mock: ReturnType<typeof vi.fn>,
    value: unknown,
  ) =>
    mock.mockImplementation(() => {
      calls.push(name);
      return Promise.resolve(value);
    });

  function arrange(
    options: {
      pre?: LockTarget | null;
      locked?: LockTarget | null;
      peers?: SystemAdminState[];
    } = {},
  ) {
    const pre = options.pre === undefined ? target() : options.pre;
    const locked = options.locked === undefined ? pre : options.locked;
    track('preRead', repository.preRead, pre);
    track('listSystemAdminIds', repository.listSystemAdminIds, ['20', '10']);
    track('lockAccounts', repository.lockAccounts, options.peers ?? []);
    track('readTarget', repository.readTarget, locked);
    track('setLocked', repository.setLocked, true);
    track('setUnlocked', repository.setUnlocked, true);
    track('revokeAll', sessions.revokeAll, 3);
    track('audit', audit.record, undefined);
    track('readDependents', repository.readDependents, dependents);
    repository.transaction.mockImplementation(
      (work: (m: EntityManager) => Promise<unknown>) => {
        calls.push('transaction');
        return work(manager);
      },
    );
  }

  beforeEach(() => {
    calls.length = 0;
    for (const mock of [
      ...Object.values(repository),
      ...Object.values(sessions),
      ...Object.values(audit),
    ])
      mock.mockReset();
    vi.useFakeTimers();
    // 17:30 UTC ngày 19/11 là 00:30 ngày 20/11 giờ Việt Nam: bắt lỗi dùng ngày UTC thay giờ VN.
    vi.setSystemTime(new Date('2026-11-19T17:30:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  const entryOf = (): AuditEntry =>
    (audit.record.mock.calls[0] as [EntityManager, AuditEntry])[1];
  const noWrites = () => {
    expect(repository.setLocked).not.toHaveBeenCalled();
    expect(repository.setUnlocked).not.toHaveBeenCalled();
    expect(sessions.revokeAll).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(repository.readDependents).not.toHaveBeenCalled();
  };

  describe('TKB18-03 (TK-10, 24, 25) — khoá', () => {
    it('thứ tự: đọc thường → giao dịch → khoá đích → ghi → thu hồi phiên → audit; không có việc phụ thuộc với Lễ tân', async () => {
      arrange({ pre: target({ loaiTaiKhoan: 'LeTan' }) });
      const response = await service.lock(branch7, ACTOR, '10');
      expect(calls).toEqual([
        'preRead',
        'transaction',
        'readTarget',
        'setLocked',
        'revokeAll',
        'audit',
      ]);
      expect(response).toEqual({
        taiKhoanId: '10',
        loaiTaiKhoan: 'LeTan',
        trangThai: 'NgungHoatDong',
        soPhienThuHoi: 3,
      });
      expect(Object.keys(response)).not.toContain('phuThuoc');
      // Khoá MỘT hàng (lock = true) và mọi ghi dùng đúng `manager` của giao dịch.
      expect(repository.readTarget).toHaveBeenCalledWith(
        manager,
        expect.anything(),
        '10',
        true,
      );
      expect(repository.setLocked).toHaveBeenCalledWith(manager, '10');
      expect(sessions.revokeAll).toHaveBeenCalledWith('10', { manager });
      expect(audit.record.mock.calls[0]![0]).toBe(manager);
      expect(repository.lockAccounts).not.toHaveBeenCalled();
    });

    it('audit KhoaTaiKhoan: đối tượng, chi nhánh theo loại, hai trạng thái và số phiên thật; không trường nào khác', async () => {
      arrange({ pre: target({ loaiTaiKhoan: 'BacSi', chiNhanhId: '7' }) });
      await service.lock(system, ACTOR, '10');
      expect(entryOf()).toEqual({
        actorId: ACTOR,
        branchId: '7',
        action: 'KhoaTaiKhoan',
        targetType: 'tai_khoan',
        targetId: '10',
        result: 'ThanhCong',
        changes: {
          truoc: { trang_thai: 'DangHoatDong' },
          sau: { trang_thai: 'NgungHoatDong' },
          phien_thu_hoi: 3,
        },
      });
    });

    it('branchId của audit: Bác sĩ và Lễ tân có chi nhánh; Bệnh nhân và Quản trị viên là null', async () => {
      const branchOf = async (who: LockTarget) => {
        calls.length = 0;
        audit.record.mockClear();
        arrange({
          pre: who,
          peers: [{ taiKhoanId: '20', trangThai: 'DangHoatDong' }],
        });
        await service.lock(system, ACTOR, who.taiKhoanId);
        return entryOf().branchId;
      };
      expect(
        await branchOf(target({ loaiTaiKhoan: 'LeTan', chiNhanhId: '7' })),
      ).toBe('7');
      expect(
        await branchOf(target({ loaiTaiKhoan: 'BacSi', chiNhanhId: '8' })),
      ).toBe('8');
      expect(
        await branchOf(target({ loaiTaiKhoan: 'BenhNhan', chiNhanhId: null })),
      ).toBeNull();
      expect(
        await branchOf(
          target({
            loaiTaiKhoan: 'QuanTriVien',
            phamViQuanTri: 'ChiNhanh',
            chiNhanhId: '9',
          }),
        ),
      ).toBeNull();
    });

    it('Bác sĩ: việc phụ thuộc đọc SAU audit, với ngày hôm nay theo giờ Việt Nam; phản hồi mang đúng danh sách', async () => {
      arrange({ pre: target({ loaiTaiKhoan: 'BacSi' }) });
      const response = await service.lock(system, ACTOR, '10');
      expect(calls.slice(-2)).toEqual(['audit', 'readDependents']);
      expect(repository.readDependents).toHaveBeenCalledWith(
        manager,
        '10',
        '2026-11-20',
      );
      expect(response).toEqual({
        taiKhoanId: '10',
        loaiTaiKhoan: 'BacSi',
        trangThai: 'NgungHoatDong',
        soPhienThuHoi: 3,
        phuThuoc: dependents,
      });
    });

    it('Lễ tân, Bệnh nhân, Quản trị viên: KHÔNG đọc việc phụ thuộc', async () => {
      for (const who of [
        target({ loaiTaiKhoan: 'LeTan' }),
        target({ loaiTaiKhoan: 'BenhNhan', chiNhanhId: null }),
        target({
          loaiTaiKhoan: 'QuanTriVien',
          phamViQuanTri: 'ChiNhanh',
          chiNhanhId: '9',
        }),
      ]) {
        arrange({ pre: who });
        await service.lock(system, ACTOR, who.taiKhoanId);
      }
      expect(repository.readDependents).not.toHaveBeenCalled();
    });

    it('đích Toàn hệ thống: khoá CẢ TẬP trước khi đọc đích (không khoá hàng đơn), tập gồm cả đích, và quyết định A5 theo tập đã khoá', async () => {
      arrange({
        pre: sysTarget(),
        peers: [
          { taiKhoanId: '10', trangThai: 'DangHoatDong' },
          { taiKhoanId: '20', trangThai: 'DangHoatDong' },
        ],
      });
      await service.lock(system, ACTOR, '10');
      expect(calls.slice(0, 5)).toEqual([
        'preRead',
        'listSystemAdminIds',
        'transaction',
        'lockAccounts',
        'readTarget',
      ]);
      expect(repository.lockAccounts).toHaveBeenCalledWith(manager, [
        '20',
        '10',
      ]);
      expect(repository.readTarget).toHaveBeenCalledWith(
        manager,
        expect.anything(),
        '10',
        false,
      );
    });

    it('tập đã khoá không còn ai khác hoạt động ⇒ A5 và KHÔNG ghi gì', async () => {
      arrange({
        pre: sysTarget(),
        peers: [
          { taiKhoanId: '10', trangThai: 'DangHoatDong' },
          { taiKhoanId: '20', trangThai: 'NgungHoatDong' },
        ],
      });
      const error = await failure(service.lock(system, ACTOR, '10'));
      expect((error as AppException).maLoi).toBe(
        'CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG',
      );
      noWrites();
    });

    it('mọi lỗi nghiệp vụ KHÔNG gọi ghi, thu hồi phiên, audit hay việc phụ thuộc', async () => {
      const cases: [string, () => Promise<unknown>, string][] = [
        [
          '404 không tồn tại / ngoài tầm nhìn (đọc thường)',
          () => {
            arrange({ pre: null });
            return service.lock(branch7, ACTOR, '10');
          },
          'KHONG_TIM_THAY',
        ],
        [
          '404 biến mất giữa hai bước (đọc dưới khoá)',
          () => {
            arrange({ pre: target(), locked: null });
            return service.lock(branch7, ACTOR, '10');
          },
          'KHONG_TIM_THAY',
        ],
        [
          '403 Chi nhánh với Bệnh nhân',
          () => {
            arrange({
              pre: target({ loaiTaiKhoan: 'BenhNhan', chiNhanhId: null }),
            });
            return service.lock(branch7, ACTOR, '10');
          },
          'KHONG_DU_QUYEN',
        ],
        [
          'tự khoá',
          () => {
            arrange({
              pre: sysTarget({ taiKhoanId: ACTOR }),
              peers: [
                { taiKhoanId: ACTOR, trangThai: 'DangHoatDong' },
                { taiKhoanId: '20', trangThai: 'DangHoatDong' },
              ],
            });
            return service.lock(system, ACTOR, ACTOR);
          },
          'TU_KHOA_TAI_KHOAN',
        ],
        [
          'chờ kích hoạt',
          () => {
            arrange({ pre: target({ trangThai: 'ChoKichHoat' }) });
            return service.lock(system, ACTOR, '10');
          },
          'TAI_KHOAN_CHO_KICH_HOAT',
        ],
        [
          'đã ngưng',
          () => {
            arrange({ pre: target({ trangThai: 'NgungHoatDong' }) });
            return service.lock(system, ACTOR, '10');
          },
          'TRANG_THAI_KHONG_PHU_HOP',
        ],
      ];
      for (const [label, run, code] of cases) {
        const error = await failure(run());
        expect((error as AppException).maLoi, label).toBe(code);
        noWrites();
      }
    });

    it('lỗi từ thu hồi phiên, audit hay việc phụ thuộc lan ra NGUYÊN VẸN (không nuốt) và không thử lại', async () => {
      const boom = new Error('lỗi giả');
      for (const [name, mock] of [
        ['revokeAll', sessions.revokeAll],
        ['audit', audit.record],
        ['readDependents', repository.readDependents],
      ] as const) {
        arrange({ pre: target({ loaiTaiKhoan: 'BacSi' }) });
        repository.transaction.mockClear();
        mock.mockImplementation(() => Promise.reject(boom));
        const error = await failure(service.lock(system, ACTOR, '10'));
        expect(error, name).toBe(boom);
        expect(repository.transaction, name).toHaveBeenCalledTimes(1);
      }
    });

    it('ghi trạng thái không đổi hàng nào (không thể xảy ra khi đã khoá) ⇒ lỗi hệ thống, không phải AppException, và dừng trước thu hồi phiên', async () => {
      arrange();
      repository.setLocked.mockResolvedValue(false);
      const error = await failure(service.lock(system, ACTOR, '10'));
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(AppException);
      expect(sessions.revokeAll).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('truy vấn phạm vi gửi cho repository tính từ scope của người gọi, không từ client', async () => {
      arrange({ pre: target() });
      await service.lock(branch7, ACTOR, '10');
      const visibility = repository.preRead.mock.calls[0]![0] as {
        parameters: Record<string, unknown>;
      };
      expect(visibility.parameters.accountBranchId).toBe('7');
      calls.length = 0;
      arrange({ pre: target() });
      await service.lock(system, ACTOR, '10');
      const open = repository.preRead.mock.calls[1]![0] as { sql: string };
      expect(open.sql).toBe('1 = 1');
    });
  });

  describe('TKB18-03 (TK-11, 25) — mở khoá', () => {
    it('không thu hồi phiên, ghi mở khoá và audit MoKhoaTaiKhoan với phien_thu_hoi = 0', async () => {
      arrange({
        pre: target({ trangThai: 'NgungHoatDong', loaiTaiKhoan: 'BacSi' }),
      });
      const response = await service.unlock(system, ACTOR, '10');
      expect(calls).toEqual([
        'preRead',
        'transaction',
        'readTarget',
        'setUnlocked',
        'audit',
      ]);
      expect(sessions.revokeAll).not.toHaveBeenCalled();
      expect(repository.setUnlocked).toHaveBeenCalledWith(manager, '10');
      expect(response).toEqual({
        taiKhoanId: '10',
        loaiTaiKhoan: 'BacSi',
        trangThai: 'DangHoatDong',
      });
      expect(entryOf()).toEqual({
        actorId: ACTOR,
        branchId: '7',
        action: 'MoKhoaTaiKhoan',
        targetType: 'tai_khoan',
        targetId: '10',
        result: 'ThanhCong',
        changes: {
          truoc: { trang_thai: 'NgungHoatDong' },
          sau: { trang_thai: 'DangHoatDong' },
          phien_thu_hoi: 0,
        },
      });
    });

    it('mở khoá không đọc việc phụ thuộc kể cả với Bác sĩ', async () => {
      arrange({
        pre: target({ trangThai: 'NgungHoatDong', loaiTaiKhoan: 'BacSi' }),
      });
      await service.unlock(system, ACTOR, '10');
      expect(repository.readDependents).not.toHaveBeenCalled();
    });

    it('lỗi nghiệp vụ không ghi gì: đã hoạt động, chờ kích hoạt, Chi nhánh với Bệnh nhân', async () => {
      for (const [who, scope, code] of [
        [
          target({ trangThai: 'DangHoatDong' }),
          system,
          'TRANG_THAI_KHONG_PHU_HOP',
        ],
        [
          target({ trangThai: 'ChoKichHoat' }),
          system,
          'TAI_KHOAN_CHO_KICH_HOAT',
        ],
        [
          target({
            loaiTaiKhoan: 'BenhNhan',
            chiNhanhId: null,
            trangThai: 'NgungHoatDong',
          }),
          branch7,
          'KHONG_DU_QUYEN',
        ],
      ] as const) {
        arrange({ pre: who });
        const error = await failure(service.unlock(scope, ACTOR, '10'));
        expect((error as AppException).maLoi).toBe(code);
        noWrites();
      }
    });

    it('ghi không đổi hàng nào ⇒ lỗi hệ thống, không audit', async () => {
      arrange({ pre: target({ trangThai: 'NgungHoatDong' }) });
      repository.setUnlocked.mockResolvedValue(false);
      const error = await failure(service.unlock(system, ACTOR, '10'));
      expect(error).not.toBeInstanceOf(AppException);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('TKB18-07 — thử lại giao dịch (deadlock 1213, đích đổi loại giữa hai bước)', () => {
    it('deadlock ở lần đầu ⇒ làm lại từ đầu và thành công; mỗi lần đều đọc thường lại', async () => {
      arrange();
      let first = true;
      repository.transaction.mockImplementation(
        (work: (m: EntityManager) => Promise<unknown>) => {
          calls.push('transaction');
          if (first) {
            first = false;
            return Promise.reject(deadlock());
          }
          return work(manager);
        },
      );
      const response = await service.lock(system, ACTOR, '10');
      expect(response.soPhienThuHoi).toBe(3);
      expect(repository.transaction).toHaveBeenCalledTimes(2);
      expect(repository.preRead).toHaveBeenCalledTimes(2);
      // Lần bị hoàn tác không chạy thân nên không có ghi nào của nó; lần thứ hai ghi đúng một lần.
      expect(repository.setLocked).toHaveBeenCalledTimes(1);
      expect(sessions.revokeAll).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledTimes(1);
    });

    it('deadlock liên tục ⇒ đúng 3 lần rồi ném tiếp LỖI GỐC (không đổi thành mã nghiệp vụ)', async () => {
      arrange();
      const boom = deadlock();
      repository.transaction.mockImplementation(() => Promise.reject(boom));
      const error = await failure(service.lock(system, ACTOR, '10'));
      expect(error).toBe(boom);
      expect(repository.transaction).toHaveBeenCalledTimes(3);
    });

    it('lỗi khác (kể cả trùng khoá 1062 và lỗi nghiệp vụ AppException) KHÔNG thử lại', async () => {
      arrange();
      const duplicate = Object.assign(new Error('trùng giả'), {
        errno: 1062,
        code: 'ER_DUP_ENTRY',
      });
      repository.transaction.mockImplementation(() =>
        Promise.reject(duplicate),
      );
      expect(await failure(service.lock(system, ACTOR, '10'))).toBe(duplicate);
      expect(repository.transaction).toHaveBeenCalledTimes(1);

      repository.transaction.mockClear();
      arrange({ pre: target({ trangThai: 'ChoKichHoat' }) });
      const business = await failure(service.lock(system, ACTOR, '10'));
      expect((business as AppException).maLoi).toBe('TAI_KHOAN_CHO_KICH_HOAT');
      expect(repository.transaction).toHaveBeenCalledTimes(1);
    });

    it('đích đổi từ không-phải sang là Toàn hệ thống giữa hai bước ⇒ làm lại với tập khoá đúng', async () => {
      arrange();
      let reads = 0;
      repository.preRead.mockImplementation(() => {
        reads += 1;
        return Promise.resolve(reads === 1 ? target() : sysTarget());
      });
      repository.readTarget.mockImplementation(() =>
        Promise.resolve(sysTarget()),
      );
      repository.lockAccounts.mockResolvedValue([
        { taiKhoanId: '10', trangThai: 'DangHoatDong' },
        { taiKhoanId: '20', trangThai: 'DangHoatDong' },
      ]);
      const response = await service.lock(system, ACTOR, '10');
      expect(response.loaiTaiKhoan).toBe('QuanTriVien');
      expect(repository.preRead).toHaveBeenCalledTimes(2);
      expect(repository.lockAccounts).toHaveBeenCalledTimes(1);
    });

    it('đích LUÔN lệch loại ⇒ hết 3 lượt thì ném lỗi hệ thống (không phải AppException), không ghi gì', async () => {
      arrange({ pre: target(), locked: sysTarget() });
      const error = await failure(service.lock(system, ACTOR, '10'));
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(AppException);
      expect(repository.preRead).toHaveBeenCalledTimes(3);
      noWrites();
    });
  });
});
