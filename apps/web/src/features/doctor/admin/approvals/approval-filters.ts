import type { LeaveStatus } from '../../api/leave-api';

// Giá trị và kiểu của khối lọc Duyệt yêu cầu (tách khỏi file component để Fast Refresh chạy đúng).
export const ALL = 'all';

export interface ApprovalFilters {
  // Ô nhập thô; số chữ < 2 thì chưa gửi lên server (Q38)
  q: string;
  trangThai: LeaveStatus | typeof ALL;
  tuNgayGui: string;
  denNgayGui: string;
  chiNhanhId: string;
}

export const EMPTY_FILTERS: ApprovalFilters = {
  q: '',
  trangThai: ALL,
  tuNgayGui: '',
  denNgayGui: '',
  chiNhanhId: ALL,
};

export const DATE_ORDER_MESSAGE =
  '"Đến ngày gửi" không được trước "Từ ngày gửi".';
