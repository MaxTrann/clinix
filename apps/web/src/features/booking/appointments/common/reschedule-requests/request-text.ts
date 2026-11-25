import { COMMON_LIST_TEXT } from '../list-text';
import type { RequestStatus, RequestTab } from './request-types';

// Chữ của trang yêu cầu đổi lịch (reschedule F4). Figma chỉ là bản phác thảo và chưa có frame cho các màn này (PLAN reschedule 4.4): toàn bộ chữ là `[đề xuất]` (Q13), nhóm sửa khi duyệt PR. Chữ dùng chung với
// các trang danh sách ở `common/list-text.ts`. Câu theo MÃ lỗi ở `request-states.ts` (chi tiết) và `request-handle-failure.ts` (ghi, Pha B).
export const REQUEST_TEXT = {
  ...COMMON_LIST_TEXT,
  // Tiêu đề trang do nơi gọi đặt (Lễ tân: h1 riêng; Quản trị viên: nằm trong trang "Duyệt yêu cầu")
  title: 'Yêu cầu đổi lịch',
  subtitle:
    'Duyệt hoặc từ chối yêu cầu đổi lịch ngoài chính sách của bệnh nhân',
  tabsLabel: 'Trạng thái xử lý',
  tabs: { 'cho-duyet': 'Chờ duyệt', 'da-xu-ly': 'Đã xử lý' } satisfies Record<
    RequestTab,
    string
  >,
  searchLabel: 'Tìm theo mã lịch hẹn',
  searchPlaceholder: 'Nhập mã lịch hẹn, ví dụ CLX-20261120-7K3M9',
  searchButton: 'Tìm',
  codeInvalid: 'Mã lịch hẹn không hợp lệ. Mã có dạng CLX-20261120-7K3M9.',
  doctorLabel: 'Bác sĩ',
  doctorsWhat: 'bác sĩ',
  selectedDoctor: 'Bác sĩ đã chọn',
  clearFilters: 'Xóa lọc',
  loading: 'Đang tải yêu cầu đổi lịch...',
  emptyWaiting: 'Không có yêu cầu nào đang chờ duyệt.',
  emptyHandled: 'Chưa có yêu cầu nào được xử lý.',
  noMatch: 'Không có yêu cầu nào khớp bộ lọc.',
  resultsRegion: 'Kết quả yêu cầu đổi lịch',
  tableCaption: 'Danh sách yêu cầu đổi lịch',
  columns: {
    code: 'Mã lịch',
    patient: 'Người khám',
    doctor: 'Bác sĩ',
    change: 'Giờ cũ → giờ mong muốn',
    selfChanges: 'Đã tự đổi',
    sent: 'Ngày gửi',
    status: 'Trạng thái',
    actions: 'Thao tác',
  },
  relative: 'Người thân',
  changedTo: 'đổi sang',
  detail: 'Chi tiết',
  // Chi tiết
  back: 'Quay lại danh sách',
  detailTitle: 'Chi tiết yêu cầu đổi lịch',
  detailLoading: 'Đang tải yêu cầu...',
  notFound: 'Không tìm thấy yêu cầu.',
  forbiddenDetail: 'Bạn không có quyền xem yêu cầu này.',
  summary: 'Tóm tắt yêu cầu đổi lịch',
  sections: {
    appointment: 'Lịch hẹn gốc',
    request: 'Yêu cầu của bệnh nhân',
    desired: 'Khung giờ mong muốn',
    decision: 'Xử lý',
    result: 'Kết quả xử lý',
  },
  rows: {
    person: 'Người khám',
    doctor: 'Bác sĩ',
    branch: 'Chi nhánh',
    time: 'Giờ hẹn hiện tại',
    appointmentStatus: 'Trạng thái lịch hẹn',
    sent: 'Ngày gửi yêu cầu',
    selfChanges: 'Số lần đã tự đổi',
    reason: 'Lý do của bệnh nhân',
    desiredTime: 'Giờ mong muốn',
    handler: 'Người xử lý',
    handledAt: 'Thời điểm xử lý',
    note: 'Ghi chú xử lý',
  },
  ownPerson: 'Bản thân',
  relativePerson: 'Người thân',
  noLimitConfigured: 'chưa cấu hình số lần tối đa',
  waitingDecision: 'Yêu cầu đang chờ xử lý.',
} as const;

// Dòng đếm ở góc tab: LUÔN là `total` của API, không đếm lại `items`
export const countLabel = (total: number) => `${total} yêu cầu`;

// "2 / 3 lần" khi biết số tối đa; chưa cấu hình ⇒ "2 lần (chưa cấu hình số lần tối đa)". Số lấy NGUYÊN từ API, không tự tính "còn lại".
export const selfChangesLabel = (done: number, max: number | null) =>
  max === null
    ? `${done} lần (${REQUEST_TEXT.noLimitConfigured})`
    : `${done} / ${max} lần`;

// Chữ ẩn sau `Chi tiết`: để người dùng trình đọc màn hình phân biệt các liên kết cùng tên trong bảng
export const detailLinkSuffix = (maLichHen: string) =>
  ` yêu cầu của lịch hẹn ${maLichHen}`;

export const REQUEST_STATUS_LABELS: Readonly<Record<RequestStatus, string>> = {
  ChoDuyet: 'Chờ duyệt',
  DaDuyet: 'Đã duyệt',
  TuChoi: 'Từ chối',
};

// Câu rỗng theo tab; có bộ lọc đang áp dụng thì "không khớp"
export function emptyMessage(tab: RequestTab, filtered: boolean): string {
  if (filtered) return REQUEST_TEXT.noMatch;
  return tab === 'da-xu-ly'
    ? REQUEST_TEXT.emptyHandled
    : REQUEST_TEXT.emptyWaiting;
}
