import { relationshipLabel } from '../../../api/booking-labels';
import type { DetailFailureTexts } from '../../common/detail-failure';
import { COMMON_LIST_TEXT } from '../../common/list-text';

// Chữ của trang chi tiết "Chi tiết ca khám" của Bác sĩ (booking F11). Chữ của Figma `458:2`, `459:2`, `462:2`, `465:2`, `692:2` khi có (liên kết quay lại, h1, tên thẻ, nhãn hàng, câu của thẻ hồ sơ, tên bước và
// chữ phụ của timeline); còn lại là [đề xuất], chờ nhóm duyệt (Figma chưa có frame cho đang tải, không tìm thấy, lỗi: PLAN 4.5). KHÔNG có chữ cho Email, Giá khám, cọc, thanh toán (Q33, H10).
export const DETAIL_TEXT = {
  back: 'Lịch hẹn',
  title: 'Chi tiết ca khám',
  loading: 'Đang tải ca khám...',
  // Tên vùng của thẻ đầu (F12, như trang Bệnh nhân)
  summary: 'Tóm tắt ca khám',
  notFound: 'Không tìm thấy ca khám này.',
  sessionExpired: COMMON_LIST_TEXT.sessionExpired,
  forbidden: 'Bạn không có quyền xem ca khám này.',
  sections: {
    patient: 'Thông tin người khám',
    appointment: 'Thông tin lịch hẹn',
    record: 'Hồ sơ khám bệnh',
    timeline: 'Trạng thái ca khám',
  },
  rows: {
    // Nhãn ô `Người khám` của thẻ đầu (F12)
    person: 'Người khám',
    name: 'Họ tên',
    relation: 'Quan hệ',
    phone: 'Điện thoại',
    gender: 'Giới tính',
    birth: 'Ngày sinh',
    reason: 'Lý do khám',
    date: 'Ngày khám',
    time: 'Giờ khám',
    specialty: 'Chuyên khoa',
    branch: 'Chi nhánh',
  },
  ownPerson: 'Bản thân',
  // SĐT, giới tính, ngày sinh trống (khoá luôn có mặt nhưng có thể `null`) [đề xuất]
  notProvided: 'Chưa cập nhật',
  noReason: 'Không có',
  bookedOn: 'Ngày đặt lịch',
  pendingPayment: 'Chờ xác nhận thanh toán cọc',
  // Chữ phụ của bước (Figma): B5 không trả mốc thời gian của từng bước nên bước đã qua hay đang ở chỉ có "Chưa ghi nhận" [cần điền]
  stepNotRecorded: 'Chưa ghi nhận',
  stepUpcoming: 'Chưa đến',
} as const;

export const DETAIL_FAILURE_TEXTS: DetailFailureTexts = {
  notFound: DETAIL_TEXT.notFound,
  sessionExpired: DETAIL_TEXT.sessionExpired,
  forbidden: DETAIL_TEXT.forbidden,
};

// Câu của thẻ `Hồ sơ khám bệnh` khi `ghiChuKham` là `null` (B5: luôn `null` tới khi `doctor` có `ho_so_kham`), theo trạng thái (chữ Figma `458:2`, `459:2`, `464:2`, `692:2`). Câu thứ hai của Figma mời bấm nút
// `Ghi hồ sơ khám` của `doctor` nên F11 không hiện [đề xuất]. `none` (huỷ, vắng mặt, mã lạ): chữ nghiêng.
const RECORD_PENDING =
  'Hồ sơ khám sẽ được bác sĩ cập nhật sau khi người bệnh được tiếp đón.';
const RECORD_STARTED = 'Chưa ghi hồ sơ khám.';
const RECORD_COMPLETED = 'Ca khám đã hoàn thành nhưng chưa có hồ sơ khám.';
const RECORD_NONE = 'Không có hồ sơ khám.';

export function recordMessage(trangThai: string): {
  text: string;
  italic: boolean;
} {
  switch (trangThai) {
    case 'ChoThanhToan':
    case 'DaXacNhan':
      return { text: RECORD_PENDING, italic: false };
    case 'DaTiepDon':
      return { text: RECORD_STARTED, italic: false };
    case 'HoanThanh':
      return { text: RECORD_COMPLETED, italic: false };
    default:
      return { text: RECORD_NONE, italic: true };
  }
}

// `BanThan` ⇒ "Bản thân" (Figma); mã của `moi_quan_he` ⇒ nhãn; mã lạ ⇒ "Người thân" (không lộ mã thô). `relationshipLabel` của F4 không biết `BanThan` nên xử lý trước.
export function relationLabel(code: string): string {
  return code === 'BanThan' ? DETAIL_TEXT.ownPerson : relationshipLabel(code);
}

// Mã của `tai_khoan.gioi_tinh` và `ho_so_nguoi_than.gioi_tinh` (không có enum ở DB; mã lạ ⇒ không hiện, thay bằng "Chưa cập nhật"). Trùng bản của `patient/profile/profile-format.ts` (TECH_DEBT).
const GENDER_LABELS = new Map<string, string>([
  ['Nam', 'Nam'],
  ['Nu', 'Nữ'],
  ['Khac', 'Khác'],
]);

export function genderLabel(code: string | null): string {
  return (
    (code === null ? undefined : GENDER_LABELS.get(code)) ??
    DETAIL_TEXT.notProvided
  );
}

// `YYYY-MM-DD` ⇒ `dd/mm/yyyy` bằng cắt chuỗi, KHÔNG qua `Date` (ngày sinh không có múi giờ); `null` ⇒ "Chưa cập nhật". Bộ đọc đã kiểm dạng nên không cần kiểm lại ở đây.
export function birthDateLabel(iso: string | null): string {
  if (iso === null) return DETAIL_TEXT.notProvided;
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}
