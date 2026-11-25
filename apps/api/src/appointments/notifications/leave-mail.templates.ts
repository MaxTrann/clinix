import { toSingleLine } from '../../mail/mail-safety.js';
import type { RenderedMail } from '../../mail/templates/otp-mail.js';
import { renderMailSpec, type Tone } from './booking-mail.templates.js';
import type { ClinicFooter } from './clinic-footer.query.js';
import { LEAVE_MAIL_EVENTS } from './notifications.constants.js';

// Ba mẫu thư nghỉ phép gửi BÁC SĨ (notification B5; PLAN notification 5.7, Q6, Q15; doctor Q33; Figma `688:2` "Yêu cầu nghỉ phép bác sĩ"). Hàm THUẦN dựng trên `renderMailSpec` của booking
// (cùng `renderMailShell`, cùng cách in `text` và `html` từ MỘT bộ chữ, cùng bảng màu đã đo tương phản).
//
// NGUỒN DỮ LIỆU: `thong_bao` của nghỉ phép không trỏ tới yêu cầu nghỉ (không có `lich_hen_id` hay khoá nào khác), nên phần chi tiết là CHÍNH `thong_bao.noi_dung` do `LeaveNotifier` dựng (khoảng ngày,
// ca, và lý do TỪ CHỐI của Admin nếu có), như thư của payment. Bảng chỉ có trạng thái và thời điểm ghi thông báo. Lệch Figma có chủ ý:
//  - Figma có hàng "Lý do" (lý do xin nghỉ của Bác sĩ): BỎ, vì doctor Q33 cấm đưa `ly_do` xin nghỉ ra ngoài (EMT-05); đường dữ liệu này cũng không tồn tại (không đọc bảng nghỉ phép);
//  - hàng "Bác sĩ", "Thời gian nghỉ" của Figma nằm trong câu chi tiết (`noi_dung`), không tách thành hàng riêng;
//  - Figma chỉ vẽ tab "Đã gửi · Chờ duyệt": tiêu đề và câu của hai thư "đã duyệt", "bị từ chối" là `[đề xuất]` (Đại đồng ý ở Q15, nhóm duyệt khi review B5).
// AN TOÀN (EMT-10): mọi chữ từ DB qua `toSingleLine` ở đây, rồi `renderMailSpec` `escapeHtml` khi in html; tiêu đề thư là hằng; không liên kết, script, ảnh.

/** Tiêu đề thư chung cho cả ba loại, đúng chữ Figma `688:2`. */
const SUBJECT = '[CLINIX] Cập nhật yêu cầu nghỉ phép';

export type LeaveMailEvent =
  (typeof LEAVE_MAIL_EVENTS)[keyof typeof LEAVE_MAIL_EVENTS];

interface Variant {
  band: string;
  tone: Tone;
  title: string;
  intro: string;
  status: string;
  /** Nhãn của hàng thời điểm ghi thông báo */
  timeLabel: string;
  closing: string | null;
}

// Dải đầu: vàng (đang chờ), xanh lá (duyệt), đỏ (từ chối), cùng mã màu với thư của yêu cầu đổi lịch
const VARIANTS: Readonly<Record<LeaveMailEvent, Variant>> = {
  // Figma `688:2` tab "Đã gửi · Chờ duyệt"
  [LEAVE_MAIL_EVENTS.SUBMITTED]: {
    band: '#D97706',
    tone: 'amber',
    title: 'Yêu cầu nghỉ phép đã được gửi',
    intro: 'Yêu cầu nghỉ phép của bạn đã được ghi nhận và đang chờ phê duyệt.',
    status: 'Chờ duyệt',
    timeLabel: 'Ngày gửi',
    closing: null,
  },
  // [đề xuất]
  [LEAVE_MAIL_EVENTS.APPROVED]: {
    band: '#16A34A',
    tone: 'green',
    title: 'Yêu cầu nghỉ phép đã được duyệt',
    intro: 'Yêu cầu nghỉ phép của bạn đã được Quản trị viên phê duyệt.',
    status: 'Đã duyệt',
    timeLabel: 'Thời gian duyệt',
    closing:
      'Lịch làm việc trong thời gian nghỉ đã được cập nhật. Bạn có thể xem chi tiết trong mục Lịch làm việc khi đăng nhập CLINIX.',
  },
  // [đề xuất]
  [LEAVE_MAIL_EVENTS.REJECTED]: {
    band: '#EF4444',
    tone: 'red',
    title: 'Yêu cầu nghỉ phép bị từ chối',
    intro: 'Yêu cầu nghỉ phép của bạn không được phê duyệt.',
    status: 'Bị từ chối',
    timeLabel: 'Thời gian xử lý',
    closing:
      'Lịch làm việc của bạn được giữ nguyên. Nếu cần, bạn có thể gửi yêu cầu nghỉ phép khác.',
  },
};

const LEAVE_MAIL_LOAI: ReadonlySet<string> = new Set(
  Object.values(LEAVE_MAIL_EVENTS),
);

/** Loại có phải một trong ba loại nghỉ phép có thư không (để worker rẽ nhánh TRƯỚC khi đòi `lich_hen_id`). */
export function isLeaveMailEvent(loai: string): loai is LeaveMailEvent {
  return LEAVE_MAIL_LOAI.has(loai);
}

export interface LeaveMailCommon {
  /** Họ tên BÁC SĨ: tài khoản của dòng `thong_bao` */
  recipientName: string;
  /** `thong_bao.noi_dung` (≤ 500 ký tự) */
  noiDung: string;
  /** Lúc ghi thông báo "dd/MM/yyyy — HH:mm" giờ Việt Nam */
  thoiDiem: string;
  footer: ClinicFooter | null;
}

export function renderLeaveMail(
  loai: LeaveMailEvent,
  p: LeaveMailCommon,
): RenderedMail {
  const v = VARIANTS[loai];
  return renderMailSpec({
    subject: SUBJECT,
    band: v.band,
    title: v.title,
    name: toSingleLine(p.recipientName, 100),
    intro: [{ text: v.intro }],
    tables: [
      {
        tone: v.tone,
        rows: [
          { label: 'Trạng thái', value: v.status, emphasis: 'accent' },
          { label: v.timeLabel, value: toSingleLine(p.thoiDiem, 30) },
        ],
      },
    ],
    notice: { tone: 'slate', text: toSingleLine(p.noiDung, 500) },
    closing: v.closing,
    footer: p.footer,
  });
}
