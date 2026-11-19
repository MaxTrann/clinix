import type { AdminScope } from '../../../rbac/admin-scope.js';
import { CHUC_DANH_BAC_SI, HOC_VI_BAC_SI } from '../../entities/enums.js';
import {
  DEGREE_OF_TITLE,
  branchIdOf,
  canCreateRole,
  isCompatibleTitleDegree,
  isValidExperienceYears,
  MAX_EXPERIENCE_YEARS,
} from '../staff-account-rules.js';
import type { StaffAccountInput } from '../staff-account.types.js';
import { STAFF_ROLES } from '../staff-account.types.js';

// Task B15 (admin) — quy tắc thuần của tạo tài khoản nhân sự (PLAN admin 7.4: NS-05, 07, 08, 12, 14). Mã NSB15-nn là [đề xuất].

const SYSTEM: AdminScope = { kind: 'ToanHeThong' };
const BRANCH: AdminScope = { kind: 'ChiNhanh', chiNhanhId: '4' };

describe('chức danh và học vị (NS-14, Q20)', () => {
  it('NSB15-01 (NS-14) trong 35 tổ hợp chức danh × học vị đúng 7 cặp tương thích, 28 cặp còn lại sai', () => {
    const accepted: string[] = [];
    for (const chucDanh of CHUC_DANH_BAC_SI) {
      for (const hocVi of HOC_VI_BAC_SI) {
        if (isCompatibleTitleDegree(chucDanh, hocVi)) {
          accepted.push(`${chucDanh}/${hocVi}`);
        }
      }
    }
    expect(CHUC_DANH_BAC_SI.length * HOC_VI_BAC_SI.length).toBe(35);
    expect(accepted.sort()).toEqual(
      [
        'BS/BS',
        'BS_CKI/BS',
        'BS_CKII/BS',
        'GS_TS_BS/GS',
        'PGS_TS_BS/PGS',
        'TS_BS/TS',
        'ThS_BS/ThS',
      ].sort(),
    );
  });

  it('NSB15-01 bảng tra có đủ 7 chức danh và mỗi chức danh đúng MỘT học vị', () => {
    expect(Object.keys(DEGREE_OF_TITLE).sort()).toEqual(
      [...CHUC_DANH_BAC_SI].sort(),
    );
    for (const hocVi of Object.values(DEGREE_OF_TITLE)) {
      expect(HOC_VI_BAC_SI).toContain(hocVi);
    }
  });
});

describe('quyền theo vai trò được tạo (NS-05, 07, 08)', () => {
  it('NSB15-02 (NS-08) Toàn hệ thống tạo được cả ba vai trò', () => {
    for (const role of STAFF_ROLES) {
      expect(canCreateRole(SYSTEM, role)).toBe(true);
    }
  });

  it('NSB15-02 (NS-05, NS-07) Chi nhánh tạo được Bác sĩ và Lễ tân, KHÔNG tạo được Quản trị viên', () => {
    expect(canCreateRole(BRANCH, 'BacSi')).toBe(true);
    expect(canCreateRole(BRANCH, 'LeTan')).toBe(true);
    expect(canCreateRole(BRANCH, 'QuanTriVien')).toBe(false);
  });
});

describe('số năm kinh nghiệm (NS-12, Q20)', () => {
  it('NSB15-08 (NS-12) nhận số nguyên 0 đến 60; biên 0 và 60 nhận, −1 và 61 từ chối', () => {
    expect(MAX_EXPERIENCE_YEARS).toBe(60);
    for (const ok of [0, 1, 30, 59, 60]) {
      expect(isValidExperienceYears(ok)).toBe(true);
    }
    for (const bad of [-1, 61, 100, Number.MAX_SAFE_INTEGER]) {
      expect(isValidExperienceYears(bad)).toBe(false);
    }
  });

  it('NSB15-08 (NS-12) không nhận số thập phân, NaN, vô cực, chuỗi, null, boolean, mảng', () => {
    for (const bad of [
      1.5,
      0.1,
      59.999,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      '5',
      '',
      null,
      undefined,
      true,
      [5],
      {},
    ]) {
      expect(isValidExperienceYears(bad)).toBe(false);
    }
  });
});

describe('chi nhánh của nhân sự mới', () => {
  const common = {
    hoTen: 'A',
    email: 'a@example.com',
    soDienThoai: '0900000000',
  };

  it('NSB15-31 Quản trị viên Toàn hệ thống không thuộc chi nhánh nào (null); các vai trò còn lại có đúng chi nhánh đã chọn', () => {
    const cases: [StaffAccountInput, string | null][] = [
      [{ ...common, vaiTro: 'QuanTriVien', phamVi: 'ToanHeThong' }, null],
      [
        {
          ...common,
          vaiTro: 'QuanTriVien',
          phamVi: 'ChiNhanh',
          chiNhanhId: '7',
        },
        '7',
      ],
      [{ ...common, vaiTro: 'LeTan', chiNhanhId: '8' }, '8'],
      [
        {
          ...common,
          vaiTro: 'BacSi',
          chiNhanhId: '9',
          chuyenKhoaId: '1',
          dichVuKhamId: '1',
          chucDanh: 'BS',
          hocVi: 'BS',
          soNamKinhNghiem: 0,
        },
        '9',
      ],
    ];
    for (const [input, expected] of cases) {
      expect(branchIdOf(input)).toBe(expected);
    }
  });
});
