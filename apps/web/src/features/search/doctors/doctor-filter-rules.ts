import type { DoctorSort } from '../api/search-types';

// Giá trị các ô lọc trên màn hình (chuỗi, như người dùng gõ). Rỗng = không lọc.
export interface DoctorFilterValues {
  chiNhanhId: string;
  // Chỉ dùng ở trang "Đội ngũ bác sĩ"; nơi đã cố định chuyên khoa thì bỏ qua
  chuyenKhoaId: string;
  q: string;
  giaTu: string;
  giaDen: string;
  diemTu: string;
  sapXep: DoctorSort;
}

export interface DoctorFilterErrors {
  giaTu?: string;
  giaDen?: string;
}

export const PRICE_NOT_NUMBER_MESSAGE = 'Giá phải là số không âm';
export const PRICE_RANGE_MESSAGE = 'Giá từ phải nhỏ hơn hoặc bằng giá đến';
export const KEYWORD_MAX_LENGTH = 100;

export const DEFAULT_SORT: DoctorSort = 'kinhNghiem';

export const SORT_OPTIONS: { value: DoctorSort; label: string }[] = [
  { value: 'kinhNghiem', label: 'Nhiều kinh nghiệm' },
  { value: 'giaTangDan', label: 'Giá tăng dần' },
  { value: 'danhGiaCao', label: 'Đánh giá cao' },
];

export const RATING_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Mọi mức đánh giá' },
  { value: '3', label: 'Từ 3★' },
  { value: '4', label: 'Từ 4★' },
  { value: '4.5', label: 'Từ 4,5★' },
];

const WHOLE_NUMBER = /^\d+$/;

// Kiểm ở trình duyệt cùng luật với server (số nguyên đồng ≥ 0, giá từ ≤ giá đến) để báo lỗi ngay dưới ô và không gọi API vô ích.
export function validateDoctorFilters(
  values: Pick<DoctorFilterValues, 'giaTu' | 'giaDen'>,
): DoctorFilterErrors {
  const errors: DoctorFilterErrors = {};
  const from = values.giaTu.trim();
  const to = values.giaDen.trim();
  if (from !== '' && !WHOLE_NUMBER.test(from)) {
    errors.giaTu = PRICE_NOT_NUMBER_MESSAGE;
  }
  if (to !== '' && !WHOLE_NUMBER.test(to)) {
    errors.giaDen = PRICE_NOT_NUMBER_MESSAGE;
  }
  if (
    !errors.giaTu &&
    !errors.giaDen &&
    from !== '' &&
    to !== '' &&
    Number(from) > Number(to)
  ) {
    errors.giaTu = PRICE_RANGE_MESSAGE;
  }
  return errors;
}

export function hasFilterErrors(errors: DoctorFilterErrors): boolean {
  return Boolean(errors.giaTu || errors.giaDen);
}
