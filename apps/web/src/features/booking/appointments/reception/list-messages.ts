import { COMMON_LIST_TEXT } from '../common/list-text';

// Chữ của trang "Quản lý lịch hẹn" của Lễ tân (booking F8). Chữ của Figma `479:2`, `494:2` khi có (tiêu đề, phụ đề, chữ mờ của ô tìm, chip, ba ô chọn, `Xóa lọc`, tiêu đề
// cột); còn lại là [đề xuất], chờ nhóm duyệt (Figma chưa có frame cho rỗng, lỗi, đang tải, phân trang: PLAN 4.5). Chữ dùng chung với "Lịch hẹn của tôi" ở `common/list-text.ts`.
export const LIST_TEXT = {
  ...COMMON_LIST_TEXT,
  title: 'Quản lý lịch hẹn',
  subtitle: 'Tra cứu, theo dõi và xử lý lịch hẹn của bệnh nhân',
  // Figma `479:2`: chữ mờ trong ô; tên truy cập của ô cùng nội dung
  searchLabel: 'Tìm theo mã lịch, tên bệnh nhân, số điện thoại, bác sĩ...',
  searchPlaceholder:
    'Tìm theo mã lịch, tên bệnh nhân, số điện thoại, bác sĩ...',
  dateGroup: 'Lọc theo ngày',
  // Figma: chữ nằm TRONG ô chọn (không có nhãn nhìn thấy); tên truy cập là nhãn ngắn
  allSpecialties: 'Tất cả chuyên khoa',
  allDoctors: 'Tất cả bác sĩ',
  allStatuses: 'Tất cả trạng thái',
  specialtyLabel: 'Chuyên khoa',
  doctorLabel: 'Bác sĩ',
  statusLabel: 'Trạng thái',
  clearFilters: 'Xóa lọc',
  loading: 'Đang tải lịch hẹn...',
  noInRange: 'Không có lịch hẹn nào trong khoảng ngày đã chọn.',
  noMatch: 'Không có lịch hẹn nào khớp bộ lọc.',
  resultsRegion: 'Kết quả lịch hẹn',
  tableCaption: 'Danh sách lịch hẹn',
  columns: {
    code: 'Mã lịch',
    dateTime: 'Ngày & Giờ',
    patient: 'Bệnh nhân',
    doctor: 'Bác sĩ / Chuyên khoa',
    status: 'Trạng thái',
    // Figma không có chữ cho cột cuối; giữ tiêu đề ẩn để bảng đủ tiêu đề cột
    actions: 'Thao tác',
  },
  detail: 'Chi tiết',
} as const;

// Dòng đếm ở góc phải tiêu đề (Figma "8 lịch hẹn"): LUÔN là `total` của API, không đếm lại `items`
export const countLabel = (total: number) => `${total} lịch hẹn`;

// Dòng phụ của cột `Bệnh nhân` khi người đặt khác người khám (Figma chỉ có họ tên và SĐT; API có hai người) [đề xuất]
export const bookedByLabel = (name: string) => `Đặt bởi ${name}`;

// Chữ ẩn sau `Chi tiết`: "Chi tiết lịch hẹn CP…", để người dùng trình đọc màn hình phân biệt các nút cùng tên trong bảng
export const detailButtonSuffix = (maLichHen: string) =>
  ` lịch hẹn ${maLichHen}`;
