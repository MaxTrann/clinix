import { formatCount } from '../exam-messages';
import { RATING_COMMENT_MAX } from './rating-rules';

// Chữ của khối "Đánh giá bác sĩ" ở chi tiết lịch hẹn của Bệnh nhân (doctor-exam F6; Figma `422:2`, `423:2`, `424:2`, `425:2`; PLAN 4.5, 5.14). Chữ có trong Figma: `title`, `notRated`, `rateNow`, `starsLegend`, `cancel`, `submit`, nhãn "Xuất sắc".
// Còn lại là [đề xuất] ĐÃ ĐƯỢC ĐẠI DUYỆT trực tiếp 16/11/2026 (hộp câu hỏi: L1 nhận xét tuỳ chọn, L8 bộ chữ): Figma không có khung cho nhãn bốn mức sao còn lại, đang gửi, lỗi từng mã. `loading` là chữ mới theo nếp "Đang tải …" của F5.
// Hai câu 401 và 403 chép chữ của hộp ghi hồ sơ F3 (cùng câu cho cùng mã lỗi). Hằng, không logic; số trong chữ lấy từ hằng của `rating-rules.ts` (MỘT nơi).
export const RATING_TEXT = {
  title: 'Đánh giá bác sĩ',
  loading: 'Đang tải đánh giá...',
  notRated: 'Bạn chưa đánh giá bác sĩ cho buổi khám này.',
  rateNow: 'Đánh giá ngay',
  starsLegend: 'Số sao',
  // Nhận xét TUỲ CHỌN (Q7, L1): nhãn kèm "(tuỳ chọn)", gợi ý bỏ "(tối thiểu 10 ký tự)" của Figma
  commentLabel: 'Nhận xét',
  optional: '(tuỳ chọn)',
  commentPlaceholder: 'Chia sẻ trải nghiệm của bạn',
  cancel: 'Huỷ',
  submit: 'Gửi đánh giá',
  submitting: 'Đang gửi...',
  sent: 'Đã gửi đánh giá của bạn.',
  already: 'Bạn đã đánh giá buổi khám này.',
  starsRequired: 'Vui lòng chọn số sao.',
  tooLong: `Tối đa ${formatCount(RATING_COMMENT_MAX)} ký tự.`,
  notCompleted: 'Chỉ đánh giá được ca khám đã hoàn thành.',
  notFound: 'Không tìm thấy ca khám này.',
  busy: 'Hệ thống đang bận, thử lại sau ít phút.',
  sessionExpired: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  forbidden: 'Bạn không có quyền thực hiện thao tác này.',
  unsure:
    'Chưa rõ đánh giá đã được gửi chưa (mất kết nối hoặc quá thời gian chờ). Nội dung của bạn vẫn còn ở đây. Bấm Gửi đánh giá để thử lại.',
} as const;

// Nhãn mức sao, chỉ số là số sao trừ 1 (Figma `424:2` chỉ có "Xuất sắc"; bốn nhãn còn lại là [đề xuất] đã duyệt)
const STAR_LABELS = ['Rất tệ', 'Tệ', 'Bình thường', 'Tốt', 'Xuất sắc'] as const;

// Ngoài miền 1 đến 5 hay không nguyên ⇒ `null` (không in nhãn bịa)
export function ratingLabel(stars: number): string | null {
  return Number.isInteger(stars) && stars >= 1 && stars <= STAR_LABELS.length
    ? STAR_LABELS[stars - 1]
    : null;
}

// Tên truy cập của một ô sao: "1 sao" … "5 sao"
export const starName = (stars: number): string => `${stars} sao`;
