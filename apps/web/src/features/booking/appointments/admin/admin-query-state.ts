import {
  isAppointmentState,
  type AppointmentState,
} from '../common/appointment-status';
import { isCalendarDate, isDateRangeValid } from '../common/date-range';

// Hàm kiểm ngày đã chuyển lên `common/date-range.ts` ở F11; xuất lại tên cũ cho test của F10
export { isCalendarDate };

// Bộ lọc KHÔNG cá nhân của "Lịch hẹn" của Quản trị viên (booking F10; trả lời (c) của phiên kiểm 13/11/2026: giữ bộ lọc trên URL để quay lại từ trang chi tiết không mất). Hàm thuần: đọc từ
// và ghi vào `URLSearchParams`. CHỈ trạng thái, chi nhánh, chuyên khoa, bác sĩ, dịch vụ, khoảng ngày và trang nằm trên URL (id số, mã trạng thái, ngày: không phải dữ liệu cá nhân);
// từ khoá `q` (tên, SĐT bệnh nhân) KHÔNG BAO GIỜ lên URL hay kho trình duyệt (nếp F1, F8) nên ở bộ nhớ của trang và mất khi quay lại từ chi tiết. Tên khoá URL trùng tên tham số API.
// URL là dữ liệu NGƯỜI DÙNG SỬA ĐƯỢC: mọi giá trị đọc ra đều được kiểm lại, sai dạng thì bỏ như không có.

export interface AdminFilters {
  // null = `Tất cả` ở ô `Trạng thái lịch`
  status: AppointmentState | null;
  // '' = `Tất cả`. `branch` CHỈ có nghĩa với Quản trị viên Toàn hệ thống (Chi nhánh bị bỏ khi đọc)
  branch: string;
  specialty: string;
  doctor: string;
  service: string;
  // Khoảng ngày ĐÃ ÁP DỤNG lên truy vấn (luôn hợp lệ: đầu trống thì không ràng buộc đầu đó)
  from: string;
  to: string;
  page: number;
}

export const EMPTY_FILTERS: AdminFilters = {
  status: null,
  branch: '',
  specialty: '',
  doctor: '',
  service: '',
  from: '',
  to: '',
  page: 1,
};

// Id BIGINT dạng chuỗi số dương không có số 0 đứng đầu (như `readId`): giữ chuỗi, KHÔNG bao giờ `Number`
const ID = /^[1-9][0-9]*$/;
// Trang: số nguyên dương nhiều nhất 5 chữ số `[đề xuất]` (URL tự gõ `page=99999999999` không được đẩy lên API)
const PAGE = /^[1-9][0-9]{0,4}$/;

export function readFilters(
  params: URLSearchParams,
  allowBranch: boolean,
): AdminFilters {
  const id = (key: string) => {
    const value = params.get(key) ?? '';
    return ID.test(value) ? value : '';
  };
  const date = (key: string) => {
    const value = params.get(key) ?? '';
    return isCalendarDate(value) ? value : '';
  };
  const status = params.get('trangThai') ?? '';
  let from = date('tuNgay');
  let to = date('denNgay');
  // Đến ngày trước Từ ngày trên URL: bỏ cả hai (không có khoảng nào hợp lệ để áp dụng)
  if (!isDateRangeValid({ from, to })) {
    from = '';
    to = '';
  }
  const page = params.get('page') ?? '';
  return {
    status: isAppointmentState(status) ? status : null,
    branch: allowBranch ? id('chiNhanhId') : '',
    specialty: id('chuyenKhoaId'),
    doctor: id('bacSiId'),
    service: id('dichVuKhamId'),
    from,
    to,
    page: PAGE.test(page) ? Number(page) : 1,
  };
}

// Chỉ ghi khoá KHÁC mặc định, thứ tự cố định: hai bộ lọc bằng nhau cho đúng cùng một chuỗi (so sánh để biết có đổi không)
export function writeFilters(filters: AdminFilters): URLSearchParams {
  const params = new URLSearchParams();
  const entries: [string, string][] = [
    ['trangThai', filters.status ?? ''],
    ['chiNhanhId', filters.branch],
    ['chuyenKhoaId', filters.specialty],
    ['bacSiId', filters.doctor],
    ['dichVuKhamId', filters.service],
    ['tuNgay', filters.from],
    ['denNgay', filters.to],
    ['page', filters.page > 1 ? String(filters.page) : ''],
  ];
  for (const [key, value] of entries) {
    if (value !== '') params.set(key, value);
  }
  return params;
}

// Có bộ lọc nào KHÁC khoảng ngày (hay từ khoá) đang áp dụng không: phân biệt "không có lịch nào trong khoảng ngày đã chọn" với "không có lịch khớp bộ lọc"
export function hasNonDateFilters(filters: AdminFilters, q: string): boolean {
  return (
    filters.status !== null ||
    filters.branch !== '' ||
    filters.specialty !== '' ||
    filters.doctor !== '' ||
    filters.service !== '' ||
    q !== ''
  );
}

// Có gì khác mặc định không (không tính trang): hiện nút `Xóa lọc`
export function hasActiveFilters(filters: AdminFilters, q: string): boolean {
  return (
    hasNonDateFilters(filters, q) || filters.from !== '' || filters.to !== ''
  );
}
