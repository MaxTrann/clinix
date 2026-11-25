import {
  renderMailSpec,
  type Row,
} from '../../appointments/notifications/booking-mail.templates.js';
import type { ClinicFooter } from '../../appointments/notifications/clinic-footer.query.js';
import {
  formatAppointmentTime,
  formatDoctorName,
} from '../../appointments/notifications/mail-format.js';
import type { NotificationContext } from '../../appointments/notifications/notification-context.query.js';
import { toSingleLine } from '../../mail/mail-safety.js';
import type { RenderedMail } from '../../mail/templates/otp-mail.js';

// Mẫu thư nhắc lịch hẹn (notification B3; PLAN 5.6; 2.4.69 b2; Q15). Hàm THUẦN dựng trên `renderMailSpec` của booking B15 (cùng `renderMailShell`, cùng cách in `text` và `html` từ MỘT bộ chữ,
// cùng bảng màu đã đo tương phản); chưa có khung Figma.
// Q15 (Đại chốt): thư ghi THỜI GIAN HẸN CỤ THỂ "HH:mm ngày dd/MM" ở tiêu đề và câu chính; "sau khoảng N giờ nữa" chỉ là phần phụ, in theo CHÍNH mốc nên gửi lại vẫn ổn định.
// Ngày giờ lấy từ `readNotificationContext` (`ngay`, `gio` do `DATE_FORMAT` của MySQL, không qua `Date` của JS nên không lệch múi giờ; NLH-20).
// AN TOÀN: mọi chữ từ DB qua `toSingleLine` ở đây, rồi `renderMailSpec` `escapeHtml` khi in html. Không nút, không liên kết, không phản hồi nhanh (2.4.69 MT).
// Mẫu KHÔNG biết `ly_do_kham`, `ly_do_huy`, `so_dien_thoai`: `NotificationContext` không có trường nào như vậy (BTB-06).

const BAND = '#16A34A';
const one = (value: string, max = 100): string => toSingleLine(value, max);

/** "14:30 ngày 02/12": giờ và phần ngày-tháng của `ngay` ("dd/MM/yyyy"). */
export function shortAppointmentTime(
  context: Pick<NotificationContext, 'gio' | 'ngay'>,
): string {
  return `${context.gio} ngày ${context.ngay.slice(0, 5)}`;
}

/** `context` là lịch được nhắc; người nhận là TÀI KHOẢN ĐẶT (`tenNguoiDat`), kể cả khi đặt hộ. `soGio` là CHÍNH mốc của dòng `nhac_lich_hen`. */
export function renderReminderMail(p: {
  context: NotificationContext;
  soGio: number;
  footer: ClinicFooter | null;
}): RenderedMail {
  const c = p.context;
  const when = shortAppointmentTime(c);
  const rows: Row[] = [
    { label: 'Mã lịch hẹn', value: one(c.maLichHen, 20), emphasis: 'accent' },
    {
      label: 'Người được khám',
      value: one(c.nguoiDuocKham),
      ...(c.datHo ? { suffix: '(đặt hộ)' } : {}),
    },
    { label: 'Bác sĩ', value: formatDoctorName(c.chucDanh, one(c.tenBacSi)) },
    { label: 'Dịch vụ', value: one(c.dichVu) },
    { label: 'Chuyên khoa', value: one(c.chuyenKhoa) },
    { label: 'Ngày giờ', value: formatAppointmentTime(c) },
    { label: 'Chi nhánh', value: one(c.chiNhanh) },
    { label: 'Địa chỉ', value: one(c.diaChiChiNhanh, 255) },
  ];
  return renderMailSpec({
    subject: `[CLINIX] Nhắc lịch hẹn khám lúc ${when}`,
    band: BAND,
    title: 'Nhắc lịch hẹn khám',
    name: one(c.tenNguoiDat),
    intro: [
      { text: `Lịch hẹn ${one(c.maLichHen, 20)} của bạn diễn ra ` },
      { text: `lúc ${when}`, bold: true },
      { text: ` (sau khoảng ${String(p.soGio)} giờ nữa).` },
    ],
    tables: [{ tone: 'green', rows }],
    notice: null,
    closing:
      'Vui lòng đến trước giờ hẹn 10–15 phút và mang theo giấy tờ tùy thân.',
    footer: p.footer,
  });
}
