import type { ProfileField } from './doctor-profile-errors';
import { DEGREE_OF_TITLE } from './doctor-profile-format';
import type {
  BranchOption,
  DoctorDegree,
  DoctorDetail,
  DoctorProfileInput,
  DoctorTitle,
  ServiceOption,
  SpecialtyOption,
} from './doctor-profile-types';

// Logic THUẦN của panel Chỉnh sửa hồ sơ bác sĩ (admin F7): giá trị form, kiểm trước khi gửi, các ô phụ thuộc nhau. Không React, test riêng được.
// Server (B13) vẫn kiểm lại mọi thứ; phần kiểm ở đây chỉ để báo sớm.

export const DESCRIPTION_MAX_LENGTH = 5000;
export const EXPERIENCE_MAX = 60;

/** Giá trị ô form: mọi ô là chuỗi (ô số giữ nguyên chữ người dùng gõ cho tới lúc kiểm). */
export interface ProfileFormValues {
  chucDanh: DoctorTitle;
  hocVi: DoctorDegree | '';
  chuyenKhoaId: string;
  dichVuKhamId: string;
  soNamKinhNghiem: string;
  moTaChuyenMon: string;
  chiNhanhId: string;
}

export function initialValues(doctor: DoctorDetail): ProfileFormValues {
  return {
    chucDanh: doctor.chucDanh,
    hocVi: doctor.hocVi,
    chuyenKhoaId: doctor.chuyenKhoa.chuyenKhoaId,
    dichVuKhamId: doctor.dichVuKham.dichVuKhamId,
    soNamKinhNghiem: String(doctor.soNamKinhNghiem),
    moTaChuyenMon: doctor.moTaChuyenMon ?? '',
    chiNhanhId: doctor.chiNhanh.chiNhanhId,
  };
}

/** Đổi chức danh thì học vị được ĐIỀN SẴN theo chức danh (Q20), người dùng vẫn sửa được. */
export function withTitle(
  values: ProfileFormValues,
  chucDanh: DoctorTitle,
): ProfileFormValues {
  return { ...values, chucDanh, hocVi: DEGREE_OF_TITLE[chucDanh] };
}

/** Đổi chi nhánh: dịch vụ đang chọn không có ở chi nhánh mới thì bỏ chọn, buộc chọn lại (BS-08). */
export function withBranch(
  values: ProfileFormValues,
  chiNhanhId: string,
  branches: readonly BranchOption[],
): ProfileFormValues {
  const services = servicesOf(chiNhanhId, branches);
  const keep = services.some((s) => s.dichVuKhamId === values.dichVuKhamId);
  return {
    ...values,
    chiNhanhId,
    dichVuKhamId: keep ? values.dichVuKhamId : '',
  };
}

export function servicesOf(
  chiNhanhId: string,
  branches: readonly BranchOption[],
): ServiceOption[] {
  return branches.find((b) => b.chiNhanhId === chiNhanhId)?.dichVuKham ?? [];
}

/**
 * Chuyên khoa chọn được: các chuyên khoa đang hoạt động, cộng chuyên khoa hiện tại nếu nó đã ngừng (Q19: giữ nguyên được, không gán mới được),
 * để ô chọn không bị trống và không tự đổi chuyên khoa của bác sĩ.
 */
export function specialtyChoices(
  doctor: DoctorDetail,
  active: readonly SpecialtyOption[],
): SpecialtyOption[] {
  if (active.some((s) => s.chuyenKhoaId === doctor.chuyenKhoa.chuyenKhoaId))
    return [...active];
  return [
    {
      chuyenKhoaId: doctor.chuyenKhoa.chuyenKhoaId,
      ten: doctor.chuyenKhoa.ten,
      ngungHoatDong: doctor.chuyenKhoa.trangThaiHoatDong === 'NgungHoatDong',
    },
    ...active,
  ];
}

export type ValidationResult =
  | { ok: true; input: DoctorProfileInput }
  | { ok: false; fields: Partial<Record<ProfileField, string>> };

export function validate(values: ProfileFormValues): ValidationResult {
  const fields: Partial<Record<ProfileField, string>> = {};
  if (values.hocVi === '') fields.hocVi = 'Vui lòng chọn học vị.';
  else if (DEGREE_OF_TITLE[values.chucDanh] !== values.hocVi)
    fields.hocVi = 'Chức danh và học vị không tương thích.';
  if (values.chuyenKhoaId === '')
    fields.chuyenKhoaId = 'Vui lòng chọn chuyên khoa.';
  if (values.dichVuKhamId === '')
    fields.dichVuKhamId = 'Vui lòng chọn dịch vụ khám chính.';
  if (values.chiNhanhId === '') fields.chiNhanhId = 'Vui lòng chọn chi nhánh.';
  const years = values.soNamKinhNghiem.trim();
  const experience = /^\d{1,2}$/.test(years) ? Number(years) : NaN;
  if (!(experience >= 0 && experience <= EXPERIENCE_MAX))
    fields.soNamKinhNghiem = 'Số năm kinh nghiệm là số nguyên từ 0 đến 60.';
  const description = values.moTaChuyenMon.trim();
  if (description.length > DESCRIPTION_MAX_LENGTH)
    fields.moTaChuyenMon = 'Giới thiệu tối đa 5.000 ký tự.';

  if (Object.keys(fields).length > 0 || values.hocVi === '')
    return { ok: false, fields };
  return {
    ok: true,
    input: {
      chucDanh: values.chucDanh,
      hocVi: values.hocVi,
      chuyenKhoaId: values.chuyenKhoaId,
      dichVuKhamId: values.dichVuKhamId,
      soNamKinhNghiem: experience,
      // Rỗng sau trim ⇒ null: xoá mô tả (BS-03)
      moTaChuyenMon: description === '' ? null : description,
      chiNhanhId: values.chiNhanhId,
    },
  };
}
