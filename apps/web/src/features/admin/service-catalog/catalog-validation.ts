import type { ServiceGroupInput, ServiceInput } from './service-catalog-types';

// Kiểm dữ liệu form nhóm dịch vụ và dịch vụ khám ở phía trình duyệt (admin PR2 mục 6.3). Chữ là `[đề xuất]` đã được Đại duyệt
// 16/11/2026. Khóa của `errors` đi theo thứ tự các ô trên form để "focus vào ô lỗi đầu tiên" khớp thứ tự đọc.

const MAX_DURATION = 2147483647;

export interface GroupFieldErrors {
  ten?: string;
  thuTuHienThi?: string;
}

export interface ServiceFieldErrors {
  ten?: string;
  nhomDichVuId?: string;
  thoiLuong?: string;
  giaMacDinh?: string;
}

export function validateGroupInput(
  name: string,
  order: string,
): { errors: GroupFieldErrors; value?: ServiceGroupInput } {
  const errors: GroupFieldErrors = {};
  if (!name.trim()) errors.ten = 'Vui lòng nhập tên nhóm.';
  // Chỉ chữ số: loại "", "-1", "1.5", "1e2"; ô trống không còn bị coi là 0
  const parsedOrder = /^\d+$/u.test(order) ? Number(order) : Number.NaN;
  if (!Number.isSafeInteger(parsedOrder))
    errors.thuTuHienThi = 'Thứ tự phải là số nguyên không âm.';
  if (Object.keys(errors).length > 0) return { errors };
  return { errors, value: { ten: name, thuTuHienThi: parsedOrder } };
}

export function validateServiceInput(draft: {
  name: string;
  groupId: string;
  duration: string;
  priceDigits: string;
}): { errors: ServiceFieldErrors; value?: ServiceInput } {
  const errors: ServiceFieldErrors = {};
  if (!draft.name.trim()) errors.ten = 'Vui lòng nhập tên dịch vụ.';
  if (!draft.groupId) errors.nhomDichVuId = 'Vui lòng chọn nhóm dịch vụ.';

  const duration = /^\d+$/u.test(draft.duration)
    ? Number(draft.duration)
    : Number.NaN;
  if (!Number.isInteger(duration) || duration < 1 || duration > MAX_DURATION)
    errors.thoiLuong = 'Thời lượng phải là số nguyên dương.';

  if (draft.priceDigits === '') errors.giaMacDinh = 'Vui lòng nhập giá.';
  else if (/^0+$/u.test(draft.priceDigits))
    errors.giaMacDinh = 'Giá phải lớn hơn 0.';

  if (Object.keys(errors).length > 0) return { errors };
  return {
    errors,
    value: {
      nhomDichVuId: draft.groupId,
      ten: draft.name,
      thoiLuong: duration,
      giaMacDinh: draft.priceDigits,
    },
  };
}
