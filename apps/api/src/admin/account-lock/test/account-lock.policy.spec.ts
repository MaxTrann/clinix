import {
  AppException,
  type ErrorBody,
} from '../../../common/errors/app.exception.js';
import type {
  LoaiTaiKhoan,
  TrangThaiTaiKhoan,
} from '../../../auth/entities/enums.js';
import type { AdminScope } from '../../../rbac/admin-scope.js';
import { decideLockAction, isSystemAdmin } from '../account-lock.policy.js';
import type {
  LockAction,
  LockTarget,
  SystemAdminState,
} from '../account-lock.types.js';

const ACTOR = '999';
const TARGET = '10';
const system: AdminScope = { kind: 'ToanHeThong' };
const branch7: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '7' };

const target = (overrides: Partial<LockTarget> = {}): LockTarget => ({
  taiKhoanId: TARGET,
  loaiTaiKhoan: 'BacSi',
  trangThai: 'DangHoatDong',
  phamViQuanTri: null,
  chiNhanhId: '7',
  ...overrides,
});

// Mã của lỗi mà hàm ném; 'OK' nếu không ném. Lỗi không phải AppException làm test hỏng (không có mã).
function outcome(run: () => void): string {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    return (error as AppException).maLoi;
  }
  return 'OK';
}

const decide = (
  action: LockAction,
  scope: AdminScope,
  who: LockTarget,
  options: { actorId?: string; systemAdmins?: SystemAdminState[] } = {},
): string =>
  outcome(() =>
    decideLockAction({
      action,
      scope,
      actorId: options.actorId ?? ACTOR,
      target: who,
      systemAdmins: options.systemAdmins ?? [],
    }),
  );

const KINDS: LoaiTaiKhoan[] = ['BenhNhan', 'BacSi', 'LeTan', 'QuanTriVien'];
const STATES: TrangThaiTaiKhoan[] = [
  'DangHoatDong',
  'NgungHoatDong',
  'ChoKichHoat',
];

// BẢNG KỲ VỌNG VIẾT TAY (không suy từ mã). Hai chiều độc lập nhau:
//  - theo (người gọi × loại đích): 'state' = được làm tiếp, xét trạng thái; còn lại là mã lỗi dừng ngay;
//  - theo (hành động × trạng thái): kết quả khi đã được làm tiếp.
const BY_ROLE: Record<
  'ToanHeThong' | 'ChiNhanh',
  Record<LoaiTaiKhoan, 'state' | 'KHONG_DU_QUYEN' | 'KHONG_TIM_THAY'>
> = {
  ToanHeThong: {
    BenhNhan: 'state',
    BacSi: 'state',
    LeTan: 'state',
    QuanTriVien: 'state',
  },
  ChiNhanh: {
    BenhNhan: 'KHONG_DU_QUYEN',
    BacSi: 'state',
    LeTan: 'state',
    QuanTriVien: 'KHONG_TIM_THAY',
  },
};
const BY_STATE: Record<LockAction, Record<TrangThaiTaiKhoan, string>> = {
  lock: {
    DangHoatDong: 'OK',
    NgungHoatDong: 'TRANG_THAI_KHONG_PHU_HOP',
    ChoKichHoat: 'TAI_KHOAN_CHO_KICH_HOAT',
  },
  unlock: {
    DangHoatDong: 'TRANG_THAI_KHONG_PHU_HOP',
    NgungHoatDong: 'OK',
    ChoKichHoat: 'TAI_KHOAN_CHO_KICH_HOAT',
  },
};

describe('isSystemAdmin', () => {
  it('chỉ Quản trị viên có phạm vi ToanHeThong', () => {
    expect(
      isSystemAdmin({
        loaiTaiKhoan: 'QuanTriVien',
        phamViQuanTri: 'ToanHeThong',
      }),
    ).toBe(true);
    expect(
      isSystemAdmin({ loaiTaiKhoan: 'QuanTriVien', phamViQuanTri: 'ChiNhanh' }),
    ).toBe(false);
    expect(
      isSystemAdmin({ loaiTaiKhoan: 'BacSi', phamViQuanTri: 'ToanHeThong' }),
    ).toBe(false);
    expect(
      isSystemAdmin({ loaiTaiKhoan: 'QuanTriVien', phamViQuanTri: null }),
    ).toBe(false);
  });
});

describe('TKB18-01 (TK-22, A1) — ma trận người gọi × loại đích × hành động × trạng thái', () => {
  const scopes = [
    ['ToanHeThong', system],
    ['ChiNhanh', branch7],
  ] as const;

  for (const [scopeName, scope] of scopes) {
    for (const kind of KINDS) {
      for (const action of ['lock', 'unlock'] as const) {
        for (const status of STATES) {
          const gate = BY_ROLE[scopeName][kind];
          const expected = gate === 'state' ? BY_STATE[action][status] : gate;
          it(`${scopeName} ${action} ${kind} đang ${status} ⇒ ${expected}`, () => {
            // Quản trị viên đích dùng phạm vi ChiNhanh để bước (6) không xen vào; (6) có test riêng ở TKB18-02.
            const who = target({
              loaiTaiKhoan: kind,
              trangThai: status,
              phamViQuanTri: kind === 'QuanTriVien' ? 'ChiNhanh' : null,
              chiNhanhId: kind === 'BacSi' || kind === 'LeTan' ? '7' : null,
            });
            expect(decide(action, scope, who)).toBe(expected);
          });
        }
      }
    }
  }

  it('Chi nhánh với nhân sự của chi nhánh KHÁC (phòng thủ khi truy vấn phạm vi lỗi) ⇒ KHONG_TIM_THAY', () => {
    for (const kind of ['BacSi', 'LeTan'] as const)
      for (const action of ['lock', 'unlock'] as const)
        for (const status of STATES)
          expect(
            decide(
              action,
              branch7,
              target({
                loaiTaiKhoan: kind,
                trangThai: status,
                chiNhanhId: '8',
              }),
            ),
          ).toBe('KHONG_TIM_THAY');
  });

  it('Chi nhánh với nhân sự thiếu hồ sơ con (chiNhanhId null) ⇒ KHONG_TIM_THAY (đóng mặc định)', () => {
    expect(
      decide(
        'lock',
        branch7,
        target({ loaiTaiKhoan: 'LeTan', chiNhanhId: null }),
      ),
    ).toBe('KHONG_TIM_THAY');
  });
});

describe('TKB18-02 (TK-14, 16, 17, 20, 21) — thứ tự kiểm (2b) → (4) → (5) → (6): mã ĐẦU TIÊN thắng', () => {
  const sysAdmin = (overrides: Partial<LockTarget> = {}) =>
    target({
      loaiTaiKhoan: 'QuanTriVien',
      phamViQuanTri: 'ToanHeThong',
      chiNhanhId: null,
      ...overrides,
    });
  const otherActive: SystemAdminState = {
    taiKhoanId: '20',
    trangThai: 'DangHoatDong',
  };
  const targetActive: SystemAdminState = {
    taiKhoanId: TARGET,
    trangThai: 'DangHoatDong',
  };

  it('(2b) trước (4): Chi nhánh tự khoá một Quản trị viên (chính mình) ⇒ KHONG_TIM_THAY, không phải TU_KHOA_TAI_KHOAN', () => {
    expect(
      decide(
        'lock',
        branch7,
        target({
          loaiTaiKhoan: 'QuanTriVien',
          phamViQuanTri: 'ChiNhanh',
          chiNhanhId: '7',
        }),
        {
          actorId: TARGET,
        },
      ),
    ).toBe('KHONG_TIM_THAY');
  });

  it('(2b) trước (5): Chi nhánh với Bệnh nhân đang ChoKichHoat ⇒ KHONG_DU_QUYEN', () => {
    expect(
      decide(
        'lock',
        branch7,
        target({
          loaiTaiKhoan: 'BenhNhan',
          trangThai: 'ChoKichHoat',
          chiNhanhId: null,
        }),
      ),
    ).toBe('KHONG_DU_QUYEN');
  });

  it('(2b) trước (5): Chi nhánh với Bác sĩ chi nhánh khác đang ChoKichHoat ⇒ KHONG_TIM_THAY', () => {
    expect(
      decide(
        'lock',
        branch7,
        target({ chiNhanhId: '8', trangThai: 'ChoKichHoat' }),
      ),
    ).toBe('KHONG_TIM_THAY');
  });

  it('(4) tự khoá: Toàn hệ thống khoá chính mình ⇒ TU_KHOA_TAI_KHOAN', () => {
    expect(
      decide('lock', system, sysAdmin(), {
        actorId: TARGET,
        systemAdmins: [targetActive, otherActive],
      }),
    ).toBe('TU_KHOA_TAI_KHOAN');
  });

  it('(4) trước (5): tự khoá khi đích ChoKichHoat hay NgungHoatDong ⇒ vẫn TU_KHOA_TAI_KHOAN', () => {
    for (const status of ['ChoKichHoat', 'NgungHoatDong'] as const)
      expect(
        decide('lock', system, sysAdmin({ trangThai: status }), {
          actorId: TARGET,
        }),
      ).toBe('TU_KHOA_TAI_KHOAN');
  });

  it('(4) trước (6): tự khoá Toàn hệ thống cuối cùng ⇒ TU_KHOA_TAI_KHOAN, không phải A5', () => {
    expect(
      decide('lock', system, sysAdmin(), {
        actorId: TARGET,
        systemAdmins: [targetActive],
      }),
    ).toBe('TU_KHOA_TAI_KHOAN');
  });

  it('tự khoá chỉ áp cho `lock`: mở khoá chính mình rơi về (5) (M34)', () => {
    expect(
      decide('unlock', system, target({ trangThai: 'DangHoatDong' }), {
        actorId: TARGET,
      }),
    ).toBe('TRANG_THAI_KHONG_PHU_HOP');
    expect(
      decide('unlock', system, target({ trangThai: 'NgungHoatDong' }), {
        actorId: TARGET,
      }),
    ).toBe('OK');
    expect(
      decide('unlock', system, target({ trangThai: 'ChoKichHoat' }), {
        actorId: TARGET,
      }),
    ).toBe('TAI_KHOAN_CHO_KICH_HOAT');
  });

  it('(5) trước (6): Toàn hệ thống đang ChoKichHoat hay NgungHoatDong, không còn ai khác ⇒ mã của (5), không phải A5', () => {
    expect(
      decide('lock', system, sysAdmin({ trangThai: 'ChoKichHoat' }), {
        systemAdmins: [],
      }),
    ).toBe('TAI_KHOAN_CHO_KICH_HOAT');
    expect(
      decide('lock', system, sysAdmin({ trangThai: 'NgungHoatDong' }), {
        systemAdmins: [],
      }),
    ).toBe('TRANG_THAI_KHONG_PHU_HOP');
  });

  describe('(6) Toàn hệ thống cuối cùng (A5, TK-17, TK-18) — tập đã khoá', () => {
    const lockSysAdmin = (systemAdmins: SystemAdminState[]) =>
      decide('lock', system, sysAdmin(), { systemAdmins });

    it('còn một Toàn hệ thống KHÁC đang hoạt động ⇒ được khoá', () => {
      expect(lockSysAdmin([targetActive, otherActive])).toBe('OK');
    });

    it('chỉ còn chính đích đang hoạt động ⇒ CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG', () => {
      expect(lockSysAdmin([targetActive])).toBe(
        'CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG',
      );
    });

    it('tập rỗng ⇒ CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG', () => {
      expect(lockSysAdmin([])).toBe('CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG');
    });

    it('người khác đang NgungHoatDong hay ChoKichHoat KHÔNG được đếm ⇒ A5', () => {
      for (const status of ['NgungHoatDong', 'ChoKichHoat'] as const)
        expect(
          lockSysAdmin([targetActive, { taiKhoanId: '20', trangThai: status }]),
        ).toBe('CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG');
    });

    it('một người đang hoạt động trong nhiều người không hoạt động vẫn đủ', () => {
      expect(
        lockSysAdmin([
          targetActive,
          { taiKhoanId: '20', trangThai: 'NgungHoatDong' },
          { taiKhoanId: '21', trangThai: 'DangHoatDong' },
        ]),
      ).toBe('OK');
    });

    it('mở khoá Toàn hệ thống không bị A5 (bước 6 chỉ áp cho `lock`)', () => {
      expect(
        decide('unlock', system, sysAdmin({ trangThai: 'NgungHoatDong' }), {
          systemAdmins: [],
        }),
      ).toBe('OK');
    });

    it('khoá Quản trị viên Chi nhánh KHÔNG bị A5 dù tập Toàn hệ thống rỗng', () => {
      expect(
        decide(
          'lock',
          system,
          target({
            loaiTaiKhoan: 'QuanTriVien',
            phamViQuanTri: 'ChiNhanh',
            chiNhanhId: '7',
          }),
          {
            systemAdmins: [],
          },
        ),
      ).toBe('OK');
    });
  });
});

describe('mã lỗi mang đúng status và thân (đối chiếu với PLAN 5.9)', () => {
  it('404 và 403 dùng mã và câu mặc định chung', () => {
    const run = (scope: AdminScope, who: LockTarget): AppException => {
      try {
        decideLockAction({
          action: 'lock',
          scope,
          actorId: ACTOR,
          target: who,
          systemAdmins: [],
        });
      } catch (error) {
        return error as AppException;
      }
      throw new Error('phải ném lỗi');
    };
    const notFound = run(branch7, target({ loaiTaiKhoan: 'QuanTriVien' }));
    expect(notFound.getStatus()).toBe(404);
    expect(notFound.getResponse()).toEqual({
      maLoi: 'KHONG_TIM_THAY',
      thongBao: 'Không tìm thấy dữ liệu.',
    } satisfies ErrorBody);
    const forbidden = run(branch7, target({ loaiTaiKhoan: 'BenhNhan' }));
    expect(forbidden.getStatus()).toBe(403);
    expect(forbidden.getResponse()).toEqual({
      maLoi: 'KHONG_DU_QUYEN',
      thongBao: 'Bạn không có quyền thực hiện thao tác này.',
    } satisfies ErrorBody);
  });
});
