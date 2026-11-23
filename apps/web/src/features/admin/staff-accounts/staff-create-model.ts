import {
  FIELD_MESSAGES,
  isPlausibleEmail,
  isValidFullName,
  isValidPhone,
  trimAsciiWhitespace,
} from '../../auth';
import type { AdminMe } from '../admin-me';
import type { AdminScopeKind } from '../account-common/account-types';
import { DEGREE_OF_TITLE } from '../doctor-profiles/doctor-profile-format';
import type {
  DoctorDegree,
  DoctorTitle,
} from '../doctor-profiles/doctor-profile-types';
import { formatRole } from './staff-rules';
import type { AdminScopeName, StaffRole } from './staff-types';

// Mô hình biểu mẫu "Tạo tài khoản nhân sự" (admin F8 PR2; PLAN NS b1 đến b7, A1 đến A4): giá trị các ô, ô nào thuộc vai trò nào, kiểm trước khi gửi
// và dựng thân `POST /admin/staff-accounts`. Hàm THUẦN: không React, không API. Server vẫn kiểm lại mọi thứ (NS A1 đến A4); đây chỉ là lớp giao diện.

export const BLANK_MESSAGE = 'Bắt buộc';
export const EXPERIENCE_MESSAGE =
  'Số năm kinh nghiệm phải là số nguyên từ 0 đến 60.';
export const TITLE_DEGREE_MESSAGE = 'Chức danh và học vị không tương thích.';
export const QTV_ONLY_SYSTEM_NOTE =
  'Chỉ Admin toàn hệ thống tạo được Quản trị viên.';

export interface CreateValues {
  vaiTro: StaffRole;
  hoTen: string;
  email: string;
  soDienThoai: string;
  /** Chỉ Quản trị viên; `''` = chưa chọn. */
  phamVi: AdminScopeName | '';
  chiNhanhId: string;
  chuyenKhoaId: string;
  dichVuKhamId: string;
  chucDanh: DoctorTitle | '';
  hocVi: DoctorDegree | '';
  /** Chữ người dùng gõ; chuyển thành số khi dựng thân. */
  soNamKinhNghiem: string;
}

export type FieldName = Exclude<keyof CreateValues, 'vaiTro'>;
export type FieldErrors = Partial<Record<FieldName, string>>;

export interface ServiceChoice {
  dichVuKhamId: string;
  ten: string;
}

export interface BranchChoice {
  chiNhanhId: string;
  ten: string;
  dichVuKham: ServiceChoice[];
}

export interface SpecialtyChoice {
  chuyenKhoaId: string;
  ten: string;
}

export interface CreateOptions {
  specialties: SpecialtyChoice[];
  branches: BranchChoice[];
}

export interface RoleOption {
  value: StaffRole;
  label: string;
  disabled: boolean;
}

/** Giá trị đầu: mặc định Bác sĩ (như Make); Admin Chi nhánh có sẵn chi nhánh của mình (cố định, không đổi được). */
export function initialValues(me: AdminMe): CreateValues {
  return {
    vaiTro: 'BacSi',
    hoTen: '',
    email: '',
    soDienThoai: '',
    phamVi: '',
    chiNhanhId: me.phamVi === 'ChiNhanh' ? me.chiNhanh.id : '',
    chuyenKhoaId: '',
    dichVuKhamId: '',
    chucDanh: '',
    hocVi: '',
    soNamKinhNghiem: '',
  };
}

const ROLES: StaffRole[] = ['BacSi', 'LeTan', 'QuanTriVien'];

/** Ba vai trò; Admin Chi nhánh KHÔNG tạo được Quản trị viên (NS-07): lựa chọn vẫn hiện nhưng vô hiệu. */
export function roleOptions(scope: AdminScopeKind): RoleOption[] {
  return ROLES.map((value) => ({
    value,
    label: formatRole(value),
    disabled: value === 'QuanTriVien' && scope !== 'ToanHeThong',
  }));
}

const DOCTOR_ONLY: Pick<
  CreateValues,
  'chuyenKhoaId' | 'dichVuKhamId' | 'chucDanh' | 'hocVi' | 'soNamKinhNghiem'
> = {
  chuyenKhoaId: '',
  dichVuKhamId: '',
  chucDanh: '',
  hocVi: '',
  soNamKinhNghiem: '',
};

/**
 * Đổi vai trò: giữ họ tên, email, SĐT; xoá các ô không thuộc vai trò mới để không bao giờ gửi trường thừa (API từ chối khoá lạ).
 * Bác sĩ và Lễ tân cùng dùng chi nhánh nên giữ; sang Quản trị viên thì bỏ chi nhánh và chưa chọn phạm vi.
 */
export function withRole(values: CreateValues, role: StaffRole): CreateValues {
  const base: CreateValues = { ...values, vaiTro: role, phamVi: '' };
  if (role === 'BacSi') return base;
  if (role === 'LeTan') return { ...base, ...DOCTOR_ONLY };
  return { ...base, ...DOCTOR_ONLY, chiNhanhId: '' };
}

/** Đổi chức danh thì học vị được ĐIỀN SẴN theo chức danh (Q20, NS-14); sửa lại được. */
export function withTitle(
  values: CreateValues,
  title: DoctorTitle | '',
): CreateValues {
  return {
    ...values,
    chucDanh: title,
    hocVi: title === '' ? '' : DEGREE_OF_TITLE[title],
  };
}

export function servicesOf(
  chiNhanhId: string,
  branches: readonly BranchChoice[],
): ServiceChoice[] {
  return branches.find((b) => b.chiNhanhId === chiNhanhId)?.dichVuKham ?? [];
}

/** Đổi chi nhánh: dịch vụ đang chọn mà chi nhánh mới không có thì bỏ chọn (buộc chọn lại). */
export function withBranch(
  values: CreateValues,
  chiNhanhId: string,
  branches: readonly BranchChoice[],
): CreateValues {
  const keep = servicesOf(chiNhanhId, branches).some(
    (service) => service.dichVuKhamId === values.dichVuKhamId,
  );
  return {
    ...values,
    chiNhanhId,
    dichVuKhamId: keep ? values.dichVuKhamId : '',
  };
}

/** Quản trị viên phạm vi Toàn hệ thống KHÔNG thuộc chi nhánh nào (CHECK `chk_qtv_pham_vi`): bỏ chi nhánh đã chọn. */
export function withScope(
  values: CreateValues,
  phamVi: AdminScopeName,
): CreateValues {
  return {
    ...values,
    phamVi,
    chiNhanhId: phamVi === 'ToanHeThong' ? '' : values.chiNhanhId,
  };
}

const COMMON_FIELDS: FieldName[] = ['hoTen', 'email', 'soDienThoai'];

/** Các ô thuộc biểu mẫu của vai trò (và phạm vi) này, theo thứ tự hiển thị; cũng là thứ tự focus ô lỗi đầu tiên. */
export function fieldsOf(values: CreateValues): FieldName[] {
  if (values.vaiTro === 'BacSi')
    return [
      ...COMMON_FIELDS,
      'chiNhanhId',
      'chucDanh',
      'hocVi',
      'chuyenKhoaId',
      'dichVuKhamId',
      'soNamKinhNghiem',
    ];
  if (values.vaiTro === 'LeTan') return [...COMMON_FIELDS, 'chiNhanhId'];
  return [
    ...COMMON_FIELDS,
    'phamVi',
    ...(values.phamVi === 'ChiNhanh' ? (['chiNhanhId'] as const) : []),
  ];
}

const EXPERIENCE_PATTERN = /^[0-9]{1,2}$/;
const EXPERIENCE_MAX = 60;

function fieldError(
  field: FieldName,
  values: CreateValues,
): string | undefined {
  const text = trimAsciiWhitespace(values[field]);
  if (text === '') return BLANK_MESSAGE;
  switch (field) {
    case 'hoTen':
      return isValidFullName(values.hoTen)
        ? undefined
        : FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE;
    case 'email':
      return isPlausibleEmail(values.email)
        ? undefined
        : FIELD_MESSAGES.EMAIL_KHONG_HOP_LE;
    case 'soDienThoai':
      return isValidPhone(values.soDienThoai)
        ? undefined
        : FIELD_MESSAGES.SDT_KHONG_HOP_LE;
    case 'soNamKinhNghiem':
      return EXPERIENCE_PATTERN.test(text) && Number(text) <= EXPERIENCE_MAX
        ? undefined
        : EXPERIENCE_MESSAGE;
    case 'hocVi':
      return values.chucDanh !== '' &&
        DEGREE_OF_TITLE[values.chucDanh] !== values.hocVi
        ? TITLE_DEGREE_MESSAGE
        : undefined;
    default:
      return undefined;
  }
}

/**
 * Kiểm khi bấm "Tạo tài khoản" (không kiểm khi gõ): ô thuộc vai trò mà trống ⇒ "Bắt buộc" (NS-11, NS-26); sai định dạng ⇒ chữ của luật đăng ký.
 * Chỉ trả lỗi của các ô THUỘC vai trò: Lễ tân không bao giờ bị hỏi ô của Bác sĩ. Kết quả rỗng nghĩa là gửi được.
 */
export function validate(values: CreateValues): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of fieldsOf(values)) {
    const message = fieldError(field, values);
    if (message !== undefined) errors[field] = message;
  }
  return errors;
}

interface BodyCommon {
  hoTen: string;
  email: string;
  soDienThoai: string;
}

/** Bốn dạng thân của `POST /admin/staff-accounts` (B15): API từ chối mọi khoá ngoài tập này bằng `TRUONG_KHONG_DUOC_PHEP`. */
export type CreateBody =
  | (BodyCommon & {
      vaiTro: 'BacSi';
      chiNhanhId: string;
      chuyenKhoaId: string;
      dichVuKhamId: string;
      chucDanh: DoctorTitle;
      hocVi: DoctorDegree;
      soNamKinhNghiem: number;
    })
  | (BodyCommon & { vaiTro: 'LeTan'; chiNhanhId: string })
  | (BodyCommon & { vaiTro: 'QuanTriVien'; phamVi: 'ToanHeThong' })
  | (BodyCommon & {
      vaiTro: 'QuanTriVien';
      phamVi: 'ChiNhanh';
      chiNhanhId: string;
    });

/**
 * Dựng thân theo vai trò: CHỈ các khoá của vai trò, đã cắt khoảng trắng đầu cuối, id là chuỗi, số năm là số. Chỉ gọi khi `validate` trả rỗng:
 * ô bắt buộc còn trống là lỗi lập trình nên ném, không gửi một thân thiếu.
 */
export function buildBody(values: CreateValues): CreateBody {
  const need = (value: string): string => {
    const text = trimAsciiWhitespace(value);
    if (text === '') throw new Error('buildBody gọi khi biểu mẫu chưa hợp lệ');
    return text;
  };
  const common = {
    hoTen: need(values.hoTen),
    email: need(values.email),
    soDienThoai: need(values.soDienThoai),
  };
  if (values.vaiTro === 'LeTan')
    return { vaiTro: 'LeTan', ...common, chiNhanhId: need(values.chiNhanhId) };
  if (values.vaiTro === 'QuanTriVien') {
    if (values.phamVi === 'ToanHeThong')
      return { vaiTro: 'QuanTriVien', ...common, phamVi: 'ToanHeThong' };
    if (values.phamVi === 'ChiNhanh')
      return {
        vaiTro: 'QuanTriVien',
        ...common,
        phamVi: 'ChiNhanh',
        chiNhanhId: need(values.chiNhanhId),
      };
    throw new Error('buildBody gọi khi biểu mẫu chưa hợp lệ');
  }
  if (values.chucDanh === '' || values.hocVi === '')
    throw new Error('buildBody gọi khi biểu mẫu chưa hợp lệ');
  return {
    vaiTro: 'BacSi',
    ...common,
    chiNhanhId: need(values.chiNhanhId),
    chuyenKhoaId: need(values.chuyenKhoaId),
    dichVuKhamId: need(values.dichVuKhamId),
    chucDanh: values.chucDanh,
    hocVi: values.hocVi,
    soNamKinhNghiem: Number(need(values.soNamKinhNghiem)),
  };
}
