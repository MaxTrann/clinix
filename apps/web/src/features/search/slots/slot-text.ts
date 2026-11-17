import type { DoctorDaySlots, SlotShift, SlotStatus } from '../api/slot-types';
import { weekdayName } from './slot-dates';

// Chữ của dải "Ngày khám" và lưới khung giờ, gom MỘT chỗ (search PR-C2). Chữ lấy NGUYÊN VĂN Figma (446:2, 259:2, 260:2) hoặc Make
// (`PublicSlotGrid.tsx`); chỗ Figma không có ghi `[đề xuất]` (đã duyệt ở TRACKING search mục 10.3(f)).

export const DATE_STRIP_LABEL = 'Ngày khám';
export const TODAY_LABEL = 'Hôm nay';

export const SLOT_STATUS_LABEL: Record<SlotStatus, string> = {
  ConTrong: 'Còn trống',
  DangGiuCho: 'Đang giữ chỗ',
  DaDat: 'Đã đặt',
  HetHan: 'Hết hạn',
};

// Thứ tự chú giải như Figma 446:367
export const SLOT_LEGEND_ORDER: readonly SlotStatus[] = [
  'ConTrong',
  'DangGiuCho',
  'DaDat',
  'HetHan',
];
export const SLOT_LEGEND_LABEL = 'Chú giải trạng thái khung giờ';

export const SHIFT_LABEL: Record<SlotShift, string> = {
  CaSang: 'Buổi sáng',
  CaChieu: 'Buổi chiều',
  // `[đề xuất]`: dữ liệu thật hiện chỉ có sáng và chiều (reader ẩn ô ca tối)
  CaToi: 'Buổi tối',
};

export const NO_SCHEDULE_TITLE = 'Bác sĩ không có lịch làm việc ngày này';
export const PICK_OTHER_DAY = 'Vui lòng chọn ngày khác';
// Make `PublicSlotGrid.tsx`: ngày có lịch nhưng không còn ô trống (hoặc ca chưa có khung giờ)
export const NO_SLOTS_LEFT = 'Không còn khung giờ trống trong ngày này';
// `[đề xuất]` (PLAN search K2, KGI-04): `thuNghi` là thứ ISO 1 đến 7
export const branchClosedText = (thuNghi: number): string =>
  `Chi nhánh nghỉ vào ${weekdayName(thuNghi)}`;

export const SLOTS_LOADING = 'Đang tải khung giờ…';
export const SLOTS_LOAD_ERROR = 'Không tải được khung giờ.';
export const SLOTS_RETRY = 'Thử lại';
export const SLOT_DATE_INVALID = 'Ngày đã chọn không còn hợp lệ.';
export const SLOT_DATE_BACK_TO_TODAY = 'Xem lịch hôm nay';

// Câu chính của ngày bác sĩ không có khung giờ để chọn: `KhongCoLich` (gộp cả nghỉ phép, API C1 không lộ lý do) hoặc `ChiNhanhNghi` kèm thứ nghỉ;
// `CoLich` ⇒ null (có lưới). Do MÁY CHỦ quyết định trạng thái ngày, máy khách chỉ chọn câu.
export function slotDayNoticeTitle(day: DoctorDaySlots): string | null {
  if (day.trangThaiNgay === 'KhongCoLich') return NO_SCHEDULE_TITLE;
  if (day.trangThaiNgay === 'ChiNhanhNghi' && day.thuNghi !== undefined)
    return branchClosedText(day.thuNghi);
  return null;
}

// Dòng đếm "13 khung giờ còn trống": số đậm màu thương hiệu, phần còn lại nhạt (Figma 446:250)
export const SLOT_COUNT_REST = ' khung giờ còn trống';

// Tên truy cập của ô: "09:30, còn trống"
export const slotAccessibleName = (time: string, status: SlotStatus): string =>
  `${time}, ${SLOT_STATUS_LABEL[status].toLowerCase()}`;

// Dòng dưới lưới ở chuyên khoa và Đội ngũ bác sĩ (Figma 259:2, 260:2); ở Bước 3 ý này nằm ở banner đầu trang
export const LISTING_SLOT_NOTE =
  'Chọn giờ chỉ chuyển lựa chọn sang bước đặt lịch, chưa giữ chỗ.';
export const SPECIALTY_SLOTS_SUBTITLE =
  'Chọn ngày, rồi chọn khung giờ còn trống của bác sĩ phù hợp.';
// Figma 446:439
export const BOOKING_PICK_SLOT_HINT =
  'Chọn một khung giờ còn trống để tiếp tục.';
// Figma 446:144 bỏ "15 phút": số đó là `cau_hinh_he_thong.thoi_gian_giu_cho` (quy tắc 35 cấm số cứng); Đại chọn 17/11/2026
export const BOOKING_SLOT_BANNER =
  'Chọn giờ chỉ ghi nhận lựa chọn của bạn. Khung giờ chỉ được giữ khi bạn bắt đầu thanh toán cọc ở bước cuối.';
