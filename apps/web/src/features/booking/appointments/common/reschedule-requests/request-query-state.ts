import { checkRequestCode } from './request-code';
import { REQUEST_TABS, type RequestTab } from './request-types';

// Bộ lọc của trang yêu cầu đổi lịch nằm trên URL (reschedule F4, WXD-10; nếp `reception-query-state.ts` của F12b): tab, trang, bác sĩ và mã lịch `q`. Tải lại trang và nút Quay lại từ trang chi tiết
// giữ nguyên bộ lọc. Mã trạng thái, id số và mã lịch không phải dữ liệu cá nhân (mã lịch đã nằm trên đường dẫn chi tiết lịch hẹn). Hàm thuần: đọc từ và ghi vào `URLSearchParams`.
// URL là dữ liệu NGƯỜI DÙNG SỬA ĐƯỢC: mọi giá trị đọc ra đều được kiểm lại, sai dạng thì bỏ như không có.
export interface RequestFilters {
  tab: RequestTab;
  page: number;
  // '' = tất cả bác sĩ
  bacSiId: string;
  // '' = không tìm theo mã; luôn là mã ĐÃ chuẩn hoá (chữ hoa, đúng dạng)
  q: string;
}

export const EMPTY_REQUEST_FILTERS: RequestFilters = {
  tab: 'cho-duyet',
  page: 1,
  bacSiId: '',
  q: '',
};

// Id BIGINT dạng chuỗi số dương không có số 0 đứng đầu: giữ chuỗi, KHÔNG bao giờ `Number`
const ID = /^[1-9][0-9]*$/;
// Trang: số nguyên dương nhiều nhất 5 chữ số (URL tự gõ `page=99999999999` không được đẩy lên API)
const PAGE = /^[1-9][0-9]{0,4}$/;

// Id yêu cầu trên URL chi tiết có đúng dạng id BIGINT không (sai dạng ⇒ trang chi tiết không gọi API, hiện câu "không tìm thấy")
export function isRequestId(value: string): boolean {
  return ID.test(value);
}

function isTab(value: string): value is RequestTab {
  return (REQUEST_TABS as readonly string[]).includes(value);
}

function readCode(value: string): string {
  const checked = checkRequestCode(value);
  return checked.ok ? checked.code : '';
}

export function readRequestFilters(params: URLSearchParams): RequestFilters {
  const tab = params.get('tab') ?? '';
  const page = params.get('page') ?? '';
  const doctor = params.get('bacSiId') ?? '';
  return {
    tab: isTab(tab) ? tab : EMPTY_REQUEST_FILTERS.tab,
    page: PAGE.test(page) ? Number(page) : 1,
    bacSiId: ID.test(doctor) ? doctor : '',
    q: readCode(params.get('q') ?? ''),
  };
}

// Chỉ ghi khoá KHÁC mặc định, thứ tự cố định: hai bộ lọc bằng nhau cho đúng cùng một chuỗi (so sánh để biết có đổi không)
export function writeRequestFilters(filters: RequestFilters): URLSearchParams {
  const params = new URLSearchParams();
  const entries: [string, string][] = [
    ['tab', filters.tab === EMPTY_REQUEST_FILTERS.tab ? '' : filters.tab],
    ['bacSiId', filters.bacSiId],
    ['q', readCode(filters.q)],
    ['page', filters.page > 1 ? String(filters.page) : ''],
  ];
  for (const [key, value] of entries) {
    if (value !== '') params.set(key, value);
  }
  return params;
}

// Giá trị `trangThai` gửi API cho từng tab (B8: lặp khoá hoặc dấu phẩy): Chờ duyệt chỉ `ChoDuyet`; Đã xử lý là hai trạng thái đã có kết quả
export function tabStatuses(tab: RequestTab): string {
  return tab === 'da-xu-ly' ? 'DaDuyet,TuChoi' : 'ChoDuyet';
}

// Có bộ lọc nào đang áp dụng không (hiện `Xóa lọc`): tab và trang KHÔNG phải bộ lọc
export function hasActiveRequestFilters(filters: RequestFilters): boolean {
  return filters.bacSiId !== '' || filters.q !== '';
}
