import type { AppointmentState } from '../common/appointment-status';
import type { DatePresetOption } from '../common/date-presets';
import { COMMON_LIST_TEXT } from '../common/list-text';
import type { ShiftCode } from './api/doctor-appointment-types';

// Chữ của trang "Lịch hẹn" của Bác sĩ (booking F11). Chữ của Figma `457:2` khi có (tiêu đề, phụ đề, nhãn `Tìm kiếm`, chữ mờ của ô tìm, sáu chip ngày, `Từ ngày`, `Đến ngày`, `Ca khám`, `Tất cả ca`,
// `Sắp xếp`, `Mới nhất trước`, chip trạng thái, tiêu đề cột, `Chi tiết`); còn lại là [đề xuất], chờ nhóm duyệt (Figma chưa có frame cho rỗng, lỗi, đang tải, phân trang: PLAN 4.5). Chữ dùng chung với
// ba trang danh sách khác ở `common/list-text.ts`.
export const LIST_TEXT = {
  ...COMMON_LIST_TEXT,
  title: 'Lịch hẹn',
  subtitle: 'Danh sách ca khám được phân công theo ngày và khoảng thời gian.',
  // Figma: nhãn "Tìm kiếm" nằm trên ô; chữ mờ trong ô là gợi ý
  searchCaption: 'Tìm kiếm',
  searchLabel: 'Tìm kiếm',
  searchPlaceholder: 'Mã lịch, tên, SĐT...',
  dateGroup: 'Lọc theo ngày',
  shiftLabel: 'Ca khám',
  allShifts: 'Tất cả ca',
  sortLabel: 'Sắp xếp',
  newestFirst: 'Mới nhất trước',
  oldestFirst: 'Cũ nhất trước',
  statusGroup: 'Lọc theo trạng thái',
  allStatuses: 'Tất cả',
  clearFilters: 'Xóa lọc',
  loading: 'Đang tải lịch hẹn...',
  noneYet: 'Bạn chưa có lịch hẹn nào được phân công.',
  noInRange: 'Không có lịch hẹn nào trong khoảng ngày đã chọn.',
  noMatch: 'Không có lịch hẹn nào khớp bộ lọc.',
  resultsRegion: 'Kết quả lịch hẹn',
  tableCaption: 'Danh sách lịch hẹn',
  columns: {
    dateTime: 'Ngày / Giờ',
    patient: 'Bệnh nhân',
    specialty: 'Chuyên khoa',
    reason: 'Lý do khám',
    status: 'Trạng thái',
    actions: 'Thao tác',
  },
  detail: 'Chi tiết',
  // Lý do khám trống (khoá luôn có mặt nhưng có thể `null`)
  noReason: 'Không có',
} as const;

// Sáu chip ngày theo thứ tự và chữ của Figma `457:2`
export const DATE_PRESET_OPTIONS: readonly DatePresetOption[] = [
  { id: 'today', label: 'Hôm nay' },
  { id: 'tomorrow', label: 'Ngày mai' },
  { id: 'week', label: 'Tuần này' },
  { id: 'nextWeek', label: 'Tuần sau' },
  { id: 'month', label: 'Tháng này' },
  { id: 'range', label: 'Tùy chọn' },
];

// Thứ tự chip trạng thái của Figma `457:2` (Đã xác nhận, Đã tiếp đón, Hoàn thành, Vắng mặt, Đã hủy) cộng `Chờ thanh toán` ngay sau `Tất cả` [đề xuất]: Figma bỏ chip này dù danh sách có hàng đó, nên
// `Tất cả` không bằng tổng các chip
export const STATUS_TAB_ORDER: readonly AppointmentState[] = [
  'ChoThanhToan',
  'DaXacNhan',
  'DaTiepDon',
  'HoanThanh',
  'VangMat',
  'DaHuy',
];

// Nhãn ca khám: "Ca sáng" theo Figma `458:2`; "Ca chiều", "Ca tối" [đề xuất]
const SHIFT_LABELS: Readonly<Record<ShiftCode, string>> = {
  CaSang: 'Ca sáng',
  CaChieu: 'Ca chiều',
  CaToi: 'Ca tối',
};

// Mã ca lạ ⇒ `null`: không lộ mã thô, nơi gọi bỏ phần "ca" đi
export function shiftLabel(code: string): string | null {
  return Object.hasOwn(SHIFT_LABELS, code)
    ? SHIFT_LABELS[code as ShiftCode]
    : null;
}

// Chữ ẩn sau `Chi tiết`: "Chi tiết lịch hẹn CP…", để người dùng trình đọc màn hình phân biệt các liên kết cùng tên trong bảng
export const detailLinkSuffix = (maLichHen: string) => ` lịch hẹn ${maLichHen}`;
