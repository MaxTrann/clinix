import { genderLabel, toDisplayDate } from '../profile/profile-format';
import { relationshipLabel } from './relative-labels';
import type { Relative, RelativeFormValues } from './relatives-types';

// Hàm thuần của khối Người thân (patient F6; TRACKING F6-C): thứ tự hiển thị, đếm, giá trị ban đầu của form.

// So hai id BIGINT dạng chuỗi (không có số 0 đứng đầu): độ dài trước rồi từ điển. KHÔNG `Number`: id lớn hơn 2^53 sẽ sai chữ số.
export function compareIds(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// Thứ tự hiển thị (Q10): hồ sơ đang sử dụng trước, rồi id tăng dần. Trả mảng mới, không đổi mảng gốc.
export function sortRelatives(items: readonly Relative[]): Relative[] {
  return [...items].sort(
    (a, b) =>
      Number(b.trangThaiHieuLuc) - Number(a.trangThaiHieuLuc) ||
      compareIds(a.hoSoNguoiThanId, b.hoSoNguoiThanId),
  );
}

// "N hồ sơ người thân · M đang sử dụng": N tính cả hồ sơ đã ngừng, M chỉ tính hồ sơ đang sử dụng
export function summarize(items: readonly Relative[]): {
  total: number;
  active: number;
} {
  return {
    total: items.length,
    active: items.filter((item) => item.trangThaiHieuLuc).length,
  };
}

export const EMPTY_VALUES: RelativeFormValues = {
  hoTen: '',
  moiQuanHe: '',
  gioiTinh: '',
  ngaySinh: '',
  soDienThoai: '',
};

// Giá trị ban đầu của form sửa. Mã quan hệ hoặc giới tính lạ ⇒ '' (chưa chọn): API từ chối mã lạ và cả hai ô bắt buộc nên
// không có `null` để thay; người dùng phải chọn lại trước khi lưu (TRACKING F6-F), khác F3 (giới tính bản thân tuỳ chọn).
export function valuesFromRelative(relative: Relative): RelativeFormValues {
  return {
    hoTen: relative.hoTen,
    moiQuanHe:
      relationshipLabel(relative.moiQuanHe) === null ? '' : relative.moiQuanHe,
    gioiTinh: genderLabel(relative.gioiTinh) === null ? '' : relative.gioiTinh,
    ngaySinh: toDisplayDate(relative.ngaySinh) ?? '',
    soDienThoai: relative.soDienThoai ?? '',
  };
}
