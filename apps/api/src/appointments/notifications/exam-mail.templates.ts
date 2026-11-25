import { toSingleLine } from '../../mail/mail-safety.js';
import type { RenderedMail } from '../../mail/templates/otp-mail.js';
import { renderMailSpec, type MailCommon } from './booking-mail.templates.js';
import { formatAppointmentTime, formatDoctorName } from './mail-format.js';

// Mẫu thư "Lịch khám đã hoàn thành" (notification B4; PLAN notification 5.7, Q6; Figma `678:2`). Hàm THUẦN dựng trên `renderMailSpec` của booking B15 (cùng `renderMailShell`, cùng cách in `text` và
// `html` từ MỘT bộ chữ). Tiêu đề, câu mở đầu, bốn hàng và câu kết theo Figma; THÊM theo PLAN (EMT-02): hàng "Người được khám" (kèm "(đặt hộ)") và câu nhắc đánh giá bác sĩ bằng CHỮ (thư không có liên kết).
// Màu `[đề xuất]`: Figma dùng dải xanh ngọc chưa đo tương phản, nên dùng dải và bảng xanh lá đã đo của thư xác nhận (`booking-mail.templates.ts`).
// AN TOÀN (EMT-10): mọi chữ từ DB qua `toSingleLine` ở đây, rồi `renderMailSpec` `escapeHtml` khi in html. Dữ kiện từ `readNotificationContext`: không có `ly_do_kham`, SĐT hay dữ liệu khám (EMT-02).

const SUBJECT = '[CLINIX] Lịch khám đã hoàn thành';
const BAND = '#16A34A';
const one = (value: string, max = 100): string => toSingleLine(value, max);

/** `context` là lịch vừa hoàn thành; người nhận là TÀI KHOẢN của dòng `thong_bao` (tài khoản đặt). */
export function renderExamCompletedMail(p: MailCommon): RenderedMail {
  const c = p.context;
  return renderMailSpec({
    subject: SUBJECT,
    band: BAND,
    title: 'Lịch khám đã hoàn thành',
    name: one(p.recipientName),
    intro: [
      {
        text: 'Lịch khám dưới đây đã được ghi nhận hoàn thành. Cảm ơn bạn đã tin tưởng dịch vụ tại CLINIX Clinic.',
      },
    ],
    tables: [
      {
        tone: 'green',
        rows: [
          { label: 'Mã lịch hẹn', value: one(c.maLichHen, 20) },
          {
            label: 'Người được khám',
            value: one(c.nguoiDuocKham),
            ...(c.datHo ? { suffix: '(đặt hộ)' } : {}),
          },
          {
            label: 'Bác sĩ',
            value: formatDoctorName(c.chucDanh, one(c.tenBacSi)),
          },
          { label: 'Ngày giờ', value: formatAppointmentTime(c) },
          { label: 'Chi nhánh', value: one(c.chiNhanh) },
        ],
      },
    ],
    notice: {
      tone: 'slate',
      text: 'Bạn có thể xem hồ sơ khám bệnh và đánh giá bác sĩ trong mục Hồ sơ khám bệnh khi đăng nhập CLINIX.',
    },
    closing:
      'Nếu cần thêm thông tin về lần khám này, vui lòng liên hệ phòng khám trực tiếp.',
    footer: p.footer,
  });
}
