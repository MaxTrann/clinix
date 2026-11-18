import { IsIn, ValidateBy, type ValidationArguments } from 'class-validator';
import {
  IsAccountEmail,
  IsAccountFullName,
  IsAccountPhone,
} from '../../auth/dto/account-field.decorators.js';
import { FIELD_ERROR_CODES } from '../../common/errors/error-codes.js';
import {
  CHUC_DANH_BAC_SI,
  HOC_VI_BAC_SI,
  type ChucDanhBacSi,
  type HocViBacSi,
} from '../entities/enums.js';
import { isValidExperienceYears } from './staff-account-rules.js';
import { STAFF_ACCOUNT_FIELD_CODES } from './staff-account.errors.js';
import {
  ADMIN_SCOPES,
  STAFF_ROLES,
  type AdminScopeName,
  type StaffAccountInput,
  type StaffRole,
} from './staff-account.types.js';

// Thân của POST /admin/staff-accounts (task B15; PLAN admin 5.3 và 7.4). Chỉ các trường dưới đây; trường lạ (matKhau, trangThai, daXacMinhEmail,
// loaiTaiKhoan, moTaChuyenMon…) bị ValidationPipe toàn cục từ chối (NS-18). Email, SĐT, họ tên dùng nguyên decorator của auth A1/A5 (chuẩn hoá + kiểm).

const BIGINT_MAX = 9223372036854775807n;
const ID_PATTERN = /^[1-9][0-9]{0,18}$/;

/** ID bigint là CHUỖI số nguyên dương, không số 0 đứng đầu, không vượt BIGINT (số JSON bị từ chối: mất độ chính xác quá 2^53). */
export const isBigintId = (value: unknown): value is string =>
  typeof value === 'string' &&
  ID_PATTERN.test(value) &&
  BigInt(value) <= BIGINT_MAX;

const isOneOf = (list: readonly string[], value: unknown): boolean =>
  typeof value === 'string' && list.includes(value);

type RoleShape = { readonly vaiTro?: unknown; readonly phamVi?: unknown };
// required: thuộc vai trò, phải hợp lệ; forbidden: không thuộc vai trò, phải VẮNG; skip: vai trò (hay phạm vi) tự nó sai, lỗi đã báo ở trường đó nên không dội thêm
type Applicability = 'required' | 'forbidden' | 'skip';

const roleOf = (shape: RoleShape): StaffRole | null =>
  isOneOf(STAFF_ROLES, shape.vaiTro) ? (shape.vaiTro as StaffRole) : null;

const onlyFor =
  (role: StaffRole) =>
  (shape: RoleShape): Applicability => {
    const current = roleOf(shape);
    if (current === null) return 'skip';
    return current === role ? 'required' : 'forbidden';
  };

// Chi nhánh: bắt buộc với Bác sĩ, Lễ tân và Quản trị viên Chi nhánh; CẤM với Quản trị viên Toàn hệ thống (CHECK chk_qtv_pham_vi, NS-04)
const branchApplicability = (shape: RoleShape): Applicability => {
  const current = roleOf(shape);
  if (current === null) return 'skip';
  if (current !== 'QuanTriVien') return 'required';
  if (!isOneOf(ADMIN_SCOPES, shape.phamVi)) return 'skip';
  return shape.phamVi === 'ChiNhanh' ? 'required' : 'forbidden';
};

/**
 * MỘT decorator cho cả hai chiều "thuộc vai trò thì kiểm, không thuộc thì phải vắng". Không dùng `@ValidateIf`: ValidationPipe `forbidNonWhitelisted`
 * chỉ chặn trường KHÔNG có decorator, nên trường có decorator mà không thuộc vai trò (ví dụ Lễ tân gửi `chuyenKhoaId`) vẫn lọt; và hai điều kiện
 * ngược nhau trên một thuộc tính không đặt được bằng `@ValidateIf`. Mã lỗi: `code` khi thuộc vai trò mà sai/thiếu, TRUONG_KHONG_DUOC_PHEP khi không thuộc.
 */
function RoleField(
  applicability: (shape: RoleShape) => Applicability,
  code: string,
  isValid: (value: unknown) => boolean,
): PropertyDecorator {
  const modeOf = (args?: ValidationArguments): Applicability =>
    applicability((args?.object ?? {}) as RoleShape);
  return ValidateBy({
    name: 'staffRoleField',
    validator: {
      validate: (value: unknown, args?: ValidationArguments): boolean => {
        const mode = modeOf(args);
        if (mode === 'skip') return true;
        return mode === 'required' ? isValid(value) : value === undefined;
      },
      defaultMessage: (args?: ValidationArguments): string =>
        modeOf(args) === 'forbidden' ? FIELD_ERROR_CODES.NOT_ALLOWED : code,
    },
  });
}

export class CreateStaffAccountDto {
  @IsIn(STAFF_ROLES, { message: STAFF_ACCOUNT_FIELD_CODES.role })
  vaiTro!: StaffRole;

  @IsAccountFullName()
  hoTen!: string;

  @IsAccountEmail()
  email!: string;

  @IsAccountPhone()
  soDienThoai!: string;

  @RoleField(branchApplicability, STAFF_ACCOUNT_FIELD_CODES.branch, isBigintId)
  chiNhanhId?: string;

  @RoleField(onlyFor('BacSi'), STAFF_ACCOUNT_FIELD_CODES.specialty, isBigintId)
  chuyenKhoaId?: string;

  @RoleField(onlyFor('BacSi'), STAFF_ACCOUNT_FIELD_CODES.serviceId, isBigintId)
  dichVuKhamId?: string;

  @RoleField(onlyFor('BacSi'), STAFF_ACCOUNT_FIELD_CODES.title, (value) =>
    isOneOf(CHUC_DANH_BAC_SI, value),
  )
  chucDanh?: ChucDanhBacSi;

  @RoleField(onlyFor('BacSi'), STAFF_ACCOUNT_FIELD_CODES.degree, (value) =>
    isOneOf(HOC_VI_BAC_SI, value),
  )
  hocVi?: HocViBacSi;

  @RoleField(
    onlyFor('BacSi'),
    STAFF_ACCOUNT_FIELD_CODES.experience,
    isValidExperienceYears,
  )
  soNamKinhNghiem?: number;

  @RoleField(
    onlyFor('QuanTriVien'),
    STAFF_ACCOUNT_FIELD_CODES.adminScope,
    (value) => isOneOf(ADMIN_SCOPES, value),
  )
  phamVi?: AdminScopeName;
}

// Trường đã qua kiểm thì không thể vắng; nếu vắng là lỗi lập trình (DTO và hàm này lệch nhau), không phải lỗi của người dùng.
function present<T>(value: T | undefined, field: string): T {
  if (value === undefined) {
    throw new Error(`DTO đã qua kiểm nhưng thiếu trường ${field}`);
  }
  return value;
}

/** Đổi DTO đã qua kiểm thành đầu vào theo từng vai trò cho dịch vụ (xem `StaffAccountInput`). */
export function toStaffAccountInput(
  dto: CreateStaffAccountDto,
): StaffAccountInput {
  const common = {
    hoTen: dto.hoTen,
    email: dto.email,
    soDienThoai: dto.soDienThoai,
  };
  switch (dto.vaiTro) {
    case 'BacSi':
      return {
        ...common,
        vaiTro: 'BacSi',
        chiNhanhId: present(dto.chiNhanhId, 'chiNhanhId'),
        chuyenKhoaId: present(dto.chuyenKhoaId, 'chuyenKhoaId'),
        dichVuKhamId: present(dto.dichVuKhamId, 'dichVuKhamId'),
        chucDanh: present(dto.chucDanh, 'chucDanh'),
        hocVi: present(dto.hocVi, 'hocVi'),
        soNamKinhNghiem: present(dto.soNamKinhNghiem, 'soNamKinhNghiem'),
      };
    case 'LeTan':
      return {
        ...common,
        vaiTro: 'LeTan',
        chiNhanhId: present(dto.chiNhanhId, 'chiNhanhId'),
      };
    case 'QuanTriVien':
      return present(dto.phamVi, 'phamVi') === 'ToanHeThong'
        ? { ...common, vaiTro: 'QuanTriVien', phamVi: 'ToanHeThong' }
        : {
            ...common,
            vaiTro: 'QuanTriVien',
            phamVi: 'ChiNhanh',
            chiNhanhId: present(dto.chiNhanhId, 'chiNhanhId'),
          };
  }
}
