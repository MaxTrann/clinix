import { readListSearch } from '../list-search';
import { readRequestFilters, writeRequestFilters } from './request-query-state';

// `search` CHUẨN của danh sách mà người dùng đã mở trước khi vào trang chi tiết (reschedule F4): `state.listSearch` của liên kết `Chi tiết` là dữ liệu từ lịch sử trình duyệt nên được kiểm lại (`readListSearch`) và chuẩn hoá
// qua bộ lọc (khoá lạ, giá trị sai bị bỏ). Dùng cho liên kết `Quay lại danh sách` và cho điều hướng sau khi duyệt, từ chối xong (về ĐÚNG tab, trang và bộ lọc đã mở). Hàm thuần.
export function listSearchOf(state: unknown): string {
  const search = writeRequestFilters(
    readRequestFilters(new URLSearchParams(readListSearch(state))),
  ).toString();
  return search === '' ? '' : `?${search}`;
}
