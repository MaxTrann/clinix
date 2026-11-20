import { toSingleLine } from '../../mail/mail-safety.js';
import type { RenderedMail } from '../../mail/templates/otp-mail.js';
import { renderMailSpec, type Row } from './booking-mail.templates.js';
import type { ClinicFooter } from './clinic-footer.query.js';

// Bốn mẫu thư của payment và wallet (payment B17; PLAN payment 5.12, Q18, L11, L13; Figma "Admin - Email Preview" `679:2`, `680:2`, `682:2`, `683:2`). Hàm THUẦN dựng trên `renderMailSpec` của booking
// (cùng vỏ `renderMailShell`, cùng cách in `text` và `html` từ MỘT bộ chữ, cùng màu đã đo tương phản ở `booking-mail.templates.ts`).
//
// NGUỒN DỮ LIỆU (Trung chốt 20/11/2026): `thong_bao` không trỏ tới giao dịch hay yêu cầu rút, nên phần chi tiết của thư là CHÍNH `thong_bao.noi_dung` (đã có số tiền, mã lịch, ghi chú của Quản trị viên),
// như "phương án P" của thư huỷ lịch. Bảng chỉ có dữ kiện đọc lại được: thời điểm ghi thông báo, trạng thái, mã lịch hẹn (thư hoàn tiền có `lich_hen_id`). Lệch Figma có chủ ý:
//  - `679:2` vẽ cho thanh toán LỊCH HẸN, sự kiện thật là NẠP VÍ thất bại (L13): đổi câu mở đầu, bỏ dòng "Mã lịch hẹn" và ô "lịch hẹn Chờ thanh toán" [đề xuất];
//  - không có mã giao dịch `TXN-…`, mã yêu cầu `WR-…`, tài khoản ngân hàng (`683:2`): DB không lưu tài khoản ngân hàng, hai mã kia là chữ mô phỏng.
// AN TOÀN (TDT-10): mọi chữ từ DB qua `toSingleLine` ở đây, rồi `renderMailSpec` `escapeHtml` khi in html; không liên kết, không script, không ảnh.

const BANDS = { red: '#EF4444', green: '#16A34A' } as const;

/** Dữ liệu chung của bốn mẫu: người nhận là chủ tài khoản của dòng `thong_bao`. */
export interface PaymentMailCommon {
  recipientName: string;
  /** `thong_bao.noi_dung` (≤ 500 ký tự) */
  noiDung: string;
  /** Lúc ghi thông báo "dd/MM/yyyy — HH:mm" giờ Việt Nam */
  thoiDiem: string;
  footer: ClinicFooter | null;
}

const one = (value: string, max = 100): string => toSingleLine(value, max);
const detail = (noiDung: string): string => one(noiDung, 500);

/** `679:2` Thanh toán thất bại, dùng cho NẠP VÍ thất bại (`NapViThatBai`). */
export function renderTopupFailedMail(p: PaymentMailCommon): RenderedMail {
  return renderMailSpec({
    subject: '[CLINIX] Thanh toán không thành công',
    band: BANDS.red,
    title: 'Thanh toán không thành công',
    name: one(p.recipientName),
    // [đề xuất] Figma: "Giao dịch thanh toán cho lịch hẹn dưới đây chưa được xử lý thành công."
    intro: [
      {
        text: 'Giao dịch nạp tiền vào ví CLINIX của bạn chưa được xử lý thành công.',
      },
    ],
    tables: [
      {
        tone: 'red',
        rows: [
          { label: 'Thời gian', value: one(p.thoiDiem, 30) },
          { label: 'Trạng thái', value: 'Thất bại', emphasis: 'accent' },
        ],
      },
    ],
    notice: { tone: 'slate', text: detail(p.noiDung) },
    // [đề xuất]
    closing:
      'Bạn có thể thử nạp lại tại mục Ví của tôi. Nếu tài khoản ngân hàng đã bị trừ tiền, vui lòng liên hệ phòng khám để được kiểm tra.',
    footer: p.footer,
  });
}

/**
 * `680:2` Hoàn tiền hoàn tất: hoàn cọc khi huỷ (`HoanCocThanhCong`, biến thể "thông thường") và hoàn tiền đặc biệt (`HoanTienDacBiet`, biến thể "đặc biệt" của Figma; câu mở đầu [đề xuất]).
 * `maLichHen` đọc từ `lich_hen_id` của thông báo.
 */
export function renderRefundMail(
  p: PaymentMailCommon & { maLichHen: string; special: boolean },
): RenderedMail {
  const rows: Row[] = [
    { label: 'Mã lịch hẹn', value: one(p.maLichHen, 20) },
    { label: 'Phương thức nhận', value: 'Ví CLINIX' },
    { label: 'Thời gian xử lý', value: one(p.thoiDiem, 30) },
  ];
  return renderMailSpec({
    subject: '[CLINIX] Hoàn tiền đã được xử lý',
    band: BANDS.green,
    title: 'Hoàn tiền đã hoàn tất',
    name: one(p.recipientName),
    intro: [
      {
        text: p.special
          ? 'Phòng khám đã hoàn một khoản tiền liên quan đến lịch hẹn của bạn vào ví CLINIX.'
          : 'Khoản hoàn tiền cho lịch hẹn đã hủy đã được xử lý thành công.',
      },
    ],
    tables: [{ tone: 'green', rows }],
    notice: { tone: 'slate', text: detail(p.noiDung) },
    closing:
      'Số tiền đã được ghi vào ví CLINIX của bạn. Vui lòng kiểm tra số dư ví để xác nhận.',
    footer: p.footer,
  });
}

/** `682:2` Rút tiền được duyệt (`RutTienDuocDuyet`). */
export function renderWithdrawalApprovedMail(
  p: PaymentMailCommon,
): RenderedMail {
  return renderMailSpec({
    subject: '[CLINIX] Yêu cầu rút tiền đã được duyệt',
    band: BANDS.green,
    title: 'Yêu cầu rút tiền đã được duyệt',
    name: one(p.recipientName),
    intro: [
      {
        text: 'Yêu cầu rút tiền của bạn đã được xét duyệt. Số dư ví CLINIX đã được cập nhật tương ứng.',
      },
    ],
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
    closing: null,
    footer: p.footer,
  });
}

/** `683:2` Rút tiền bị từ chối (`RutTienBiTuChoi`). Lý do từ chối (ghi chú của Quản trị viên, L11) nằm trong `noiDung`. */
export function renderWithdrawalRejectedMail(
  p: PaymentMailCommon,
): RenderedMail {
  return renderMailSpec({
    subject: '[CLINIX] Yêu cầu rút tiền bị từ chối',
    band: BANDS.red,
    title: 'Yêu cầu rút tiền bị từ chối',
    name: one(p.recipientName),
    intro: [],
    tables: [
      {
        tone: 'red',
        rows: [
          { label: 'Trạng thái', value: 'Từ chối', emphasis: 'accent' },
          // [đề xuất] Figma không có dòng thời gian
          { label: 'Thời gian xử lý', value: one(p.thoiDiem, 30) },
        ],
      },
    ],
    notice: { tone: 'red', text: detail(p.noiDung) },
    // [đề xuất] Figma: "...Vui lòng cập nhật thông tin tài khoản và gửi lại yêu cầu." (hệ thống không lưu tài khoản ngân hàng)
    closing:
      'Số tiền vẫn còn trong ví CLINIX của bạn. Bạn có thể gửi lại yêu cầu rút tiền khi cần.',
    footer: p.footer,
  });
}
