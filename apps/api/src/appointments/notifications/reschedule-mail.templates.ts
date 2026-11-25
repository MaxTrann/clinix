import { toSingleLine } from '../../mail/mail-safety.js';
import type { RenderedMail } from '../../mail/templates/otp-mail.js';
import {
  renderMailSpec,
  type MailCommon,
  type Row,
} from './booking-mail.templates.js';
import type { ClinicFooter } from './clinic-footer.query.js';
import { formatAppointmentTime, formatDoctorName } from './mail-format.js';

// Bốn mẫu thư của đổi lịch (reschedule B3; PLAN reschedule 5.10, Q9, Q10, Q13 `[đề xuất]`; Figma không có frame cho bốn thư này nên chữ do Đại duyệt ở PR). Hàm THUẦN dựng trên `renderMailSpec` của booking
// (cùng `renderMailShell`, cùng cách in `text` và `html` từ MỘT bộ chữ, cùng bảng màu đã đo tương phản).
//
// NGUỒN DỮ LIỆU: như thư huỷ của booking và thư của payment, phần chi tiết là CHÍNH `thong_bao.noi_dung` (đã có mã cũ và mới, giờ cũ và mới, ghi chú của nhân sự hoặc lý do đổi hộ). Thư
// `LichHenDaDoiLich` thêm bảng thông tin lịch MỚI đọc từ DB lúc gửi; ba thư của yêu cầu chỉ có trạng thái và thời điểm ghi, KHÔNG đọc bảng yêu cầu nên `ly_do_yeu_cau` không có đường nào vào thư.
// AN TOÀN (BDL-04): mọi chữ từ DB và từ người nhập qua `toSingleLine` ở đây, rồi `renderMailSpec` `escapeHtml` khi in html; tiêu đề thư là hằng; không liên kết, script, ảnh.

const BANDS = { green: '#16A34A', amber: '#D97706', red: '#EF4444' } as const;
const SUBJECTS = {
  rescheduled: '[CLINIX] Lịch hẹn đã được đổi',
  pending: '[CLINIX] Đã nhận yêu cầu đổi lịch hẹn',
  approved: '[CLINIX] Yêu cầu đổi lịch hẹn đã được duyệt',
  rejected: '[CLINIX] Yêu cầu đổi lịch hẹn bị từ chối',
} as const;

const one = (value: string, max = 100): string => toSingleLine(value, max);
const detail = (noiDung: string): string => one(noiDung, 500);

/** `context` là lịch MỚI; `noiDung` là `thong_bao.noi_dung` (≤ 500). */
export function renderRescheduledMail(
  p: MailCommon & { noiDung: string },
): RenderedMail {
  const c = p.context;
  const rows: Row[] = [
    {
      label: 'Mã lịch hẹn mới',
      value: one(c.maLichHen, 20),
      emphasis: 'accent',
    },
    { label: 'Bác sĩ', value: formatDoctorName(c.chucDanh, one(c.tenBacSi)) },
    { label: 'Dịch vụ', value: one(c.dichVu) },
    { label: 'Ngày giờ', value: formatAppointmentTime(c) },
    { label: 'Chi nhánh', value: one(c.chiNhanh) },
  ];
  return renderMailSpec({
    subject: SUBJECTS.rescheduled,
    band: BANDS.green,
    title: 'Lịch hẹn đã được đổi',
    name: one(p.recipientName),
    intro: [{ text: 'Lịch hẹn của bạn đã được đổi sang khung giờ mới.' }],
    tables: [{ tone: 'green', rows }],
    notice: { tone: 'slate', text: detail(p.noiDung) },
    closing:
      'Vui lòng đến trước giờ hẹn mới 10–15 phút và mang theo giấy tờ tùy thân. Mã lịch hẹn cũ không còn dùng được.',
    footer: p.footer,
  });
}

/** Dữ liệu chung của ba thư yêu cầu: người nhận là chủ tài khoản của dòng `thong_bao`. */
export interface RescheduleRequestMailCommon {
  recipientName: string;
  /** `thong_bao.noi_dung` (≤ 500 ký tự) */
  noiDung: string;
  /** Lúc ghi thông báo "dd/MM/yyyy — HH:mm" giờ Việt Nam */
  thoiDiem: string;
  footer: ClinicFooter | null;
}

/** `YeuCauDoiLichDangCho`: yêu cầu đã gửi, lịch hiện tại giữ nguyên tới khi có kết quả. */
export function renderRescheduleRequestPendingMail(
  p: RescheduleRequestMailCommon,
): RenderedMail {
  return renderMailSpec({
    subject: SUBJECTS.pending,
    band: BANDS.amber,
    title: 'Đã nhận yêu cầu đổi lịch hẹn',
    name: one(p.recipientName),
    intro: [
      {
        text: 'Yêu cầu đổi lịch hẹn của bạn đã được gửi cho phòng khám và đang chờ xử lý.',
      },
    ],
    tables: [
      {
        tone: 'amber',
        rows: [
          { label: 'Trạng thái', value: 'Đang chờ duyệt', emphasis: 'accent' },
          { label: 'Thời gian gửi', value: one(p.thoiDiem, 30) },
        ],
      },
    ],
    notice: { tone: 'slate', text: detail(p.noiDung) },
    closing:
      'Lịch hẹn hiện tại của bạn được giữ nguyên cho tới khi có kết quả. Chúng tôi sẽ thông báo ngay khi yêu cầu được xử lý.',
    footer: p.footer,
  });
}

/** `YeuCauDoiLichDaDuyet`: lịch mới và ghi chú của nhân sự nằm trong `noiDung` (Q10). */
export function renderRescheduleRequestApprovedMail(
  p: RescheduleRequestMailCommon,
): RenderedMail {
  return renderMailSpec({
    subject: SUBJECTS.approved,
    band: BANDS.green,
    title: 'Yêu cầu đổi lịch hẹn đã được duyệt',
    name: one(p.recipientName),
    intro: [{ text: 'Yêu cầu đổi lịch hẹn của bạn đã được xét duyệt.' }],
    tables: [
      {
        tone: 'green',
        rows: [
          { label: 'Trạng thái', value: 'Đã duyệt', emphasis: 'accent' },
          { label: 'Thời gian duyệt', value: one(p.thoiDiem, 30) },
        ],
      },
    ],
    notice: { tone: 'slate', text: detail(p.noiDung) },
    closing:
      'Vui lòng đến trước giờ hẹn mới 10–15 phút và mang theo giấy tờ tùy thân. Mã lịch hẹn cũ không còn dùng được.',
    footer: p.footer,
  });
}

/** `YeuCauDoiLichBiTuChoi`: ghi chú của nhân sự nằm trong `noiDung` (Q10); lịch hẹn giữ nguyên. */
export function renderRescheduleRequestRejectedMail(
  p: RescheduleRequestMailCommon,
): RenderedMail {
  return renderMailSpec({
    subject: SUBJECTS.rejected,
    band: BANDS.red,
    title: 'Yêu cầu đổi lịch hẹn bị từ chối',
    name: one(p.recipientName),
    intro: [],
    tables: [
      {
        tone: 'red',
        rows: [
          { label: 'Trạng thái', value: 'Từ chối', emphasis: 'accent' },
          { label: 'Thời gian xử lý', value: one(p.thoiDiem, 30) },
        ],
      },
    ],
    notice: { tone: 'red', text: detail(p.noiDung) },
    closing:
      'Lịch hẹn của bạn được giữ nguyên. Nếu cần, bạn có thể gửi yêu cầu khác hoặc hủy lịch hẹn và đặt lịch mới.',
    footer: p.footer,
  });
}
