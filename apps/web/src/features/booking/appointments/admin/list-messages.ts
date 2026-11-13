import { COMMON_LIST_TEXT } from '../common/list-text';

// Chữ của trang "Lịch hẹn" của Quản trị viên (booking F10). Chữ của Figma `511:2`, `621:2` khi có (tiêu đề, nhãn `Tìm kiếm`, chữ mờ của ô tìm, nhãn năm ô lọc, `Tất cả`, tiêu đề cột,
// `Chi tiết`, dòng đếm "{n} lịch hẹn phù hợp"); còn lại là [đề xuất], chờ nhóm duyệt (Figma chưa có frame cho rỗng, lỗi, đang tải, phân trang: PLAN 4.5). Đã bỏ cột và ô `Thanh toán`
// (B4 không trả `thanhToan`). Chữ dùng chung với "Lịch hẹn của tôi" và "Quản lý lịch hẹn" ở `common/list-text.ts`.
export const LIST_TEXT = {
  ...COMMON_LIST_TEXT,
  title: 'Lịch hẹn',
  // Figma: nhãn "Tìm kiếm" nằm trên ô; chữ mờ trong ô là gợi ý
  searchCaption: 'Tìm kiếm',
  searchLabel: 'Tìm kiếm',
  searchPlaceholder: 'Mã lịch, tên bệnh nhân, số điện thoại...',
  branchLabel: 'Chi nhánh',
  specialtyLabel: 'Chuyên khoa',
  doctorLabel: 'Bác sĩ',
  serviceLabel: 'Loại dịch vụ',
  statusLabel: 'Trạng thái lịch',
  allStatuses: 'Tất cả',
  clearFilters: 'Xóa lọc',
  loading: 'Đang tải lịch hẹn...',
  noRows: 'Chưa có lịch hẹn nào.',
  noInRange: 'Không có lịch hẹn nào trong khoảng ngày đã chọn.',
  noMatch: 'Không có lịch hẹn nào khớp bộ lọc.',
  resultsRegion: 'Kết quả lịch hẹn',
  tableCaption: 'Danh sách lịch hẹn',
  columns: {
    code: 'Mã lịch',
    dateTime: 'Ngày / Giờ',
    patient: 'Bệnh nhân',
    doctor: 'Bác sĩ',
    service: 'Dịch vụ',
    status: 'Trạng thái',
    // Figma không có chữ cho cột cuối; giữ tiêu đề ẩn để bảng đủ tiêu đề cột
    actions: 'Thao tác',
  },
  detail: 'Chi tiết',
} as const;

// Dòng đếm ở góc phải tiêu đề (Figma "20 lịch hẹn phù hợp"): LUÔN là `total` của API, không đếm lại `items`
export const countLabel = (total: number) => `${total} lịch hẹn phù hợp`;

// Dòng phụ của cột `Bệnh nhân` khi người đặt khác người khám (Figma chỉ có họ tên và SĐT; API có hai người) [đề xuất], như Lễ tân
export const bookedByLabel = (name: string) => `Đặt bởi ${name}`;

// Chữ ẩn sau `Chi tiết`: "Chi tiết lịch hẹn CP…", để người dùng trình đọc màn hình phân biệt các liên kết cùng tên trong bảng
export const detailLinkSuffix = (maLichHen: string) => ` lịch hẹn ${maLichHen}`;
