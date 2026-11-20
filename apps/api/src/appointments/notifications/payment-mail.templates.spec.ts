import { TOPUP_NOTIFICATION_EVENTS } from '../../payment/payment.constants.js';
import { buildTopupFailedText } from '../../payment/topup/topup-notifier.js';
import { buildRefundedText } from '../../wallet/refund/refund.rules.js';
import {
  REFUND_NOTIFICATION_EVENTS,
  WITHDRAWAL_NOTIFICATION_EVENTS,
} from '../../wallet/wallet.constants.js';
import {
  buildWithdrawalApprovedText,
  buildWithdrawalRejectedText,
} from '../../wallet/withdrawal/withdrawal-notifier.js';
import type { ClinicFooter } from './clinic-footer.query.js';
import { PAYMENT_MAIL_EVENTS } from './notifications.constants.js';
import {
  renderRefundMail,
  renderTopupFailedMail,
  renderWithdrawalApprovedMail,
  renderWithdrawalRejectedMail,
  type PaymentMailCommon,
} from './payment-mail.templates.js';

// payment B17 — bốn mẫu thư của payment và wallet (PLAN payment 5.12, 7; Figma `679:2`, `680:2`, `682:2`, `683:2`): TDT-10 (escapeHtml, một dòng, không liên kết, không script) và chữ của từng mẫu.
// Hàm thuần: đơn vị, không DB, không gửi gì. Dữ liệu giả.
const FOOTER: ClinicFooter = {
  tenThuongHieu: 'CLINIX Clinic',
  diaChi: '123 Nguyễn Thị Minh Khai, Q.3, TP.HCM',
  hotline: '1900 5555',
  email: 'ho-tro@example.test',
};
const NAME = 'Nguyễn Văn An';
const AT = '15/10/2026 — 14:30';
const MA = 'CLX-20261015-7K3QF';
const common = (over: Partial<PaymentMailCommon> = {}): PaymentMailCommon => ({
  recipientName: NAME,
  noiDung: 'Thông báo thử nghiệm.',
  thoiDiem: AT,
  footer: FOOTER,
  ...over,
});

type Build = (over?: Partial<PaymentMailCommon>) => {
  subject: string;
  text: string;
  html: string;
};
// [tên, hàm dựng, tiêu đề thư, tiêu đề thân, màu dải đầu]
const ALL: [string, Build, string, string, string][] = [
  [
    'nạp ví thất bại (679:2)',
    (over) => renderTopupFailedMail(common(over)),
    '[CLINIX] Thanh toán không thành công',
    'Thanh toán không thành công',
    '#EF4444',
  ],
  [
    'hoàn cọc (680:2)',
    (over) =>
      renderRefundMail({ ...common(over), maLichHen: MA, special: false }),
    '[CLINIX] Hoàn tiền đã được xử lý',
    'Hoàn tiền đã hoàn tất',
    '#16A34A',
  ],
  [
    'hoàn đặc biệt (680:2)',
    (over) =>
      renderRefundMail({ ...common(over), maLichHen: MA, special: true }),
    '[CLINIX] Hoàn tiền đã được xử lý',
    'Hoàn tiền đã hoàn tất',
    '#16A34A',
  ],
  [
    'rút tiền được duyệt (682:2)',
    (over) => renderWithdrawalApprovedMail(common(over)),
    '[CLINIX] Yêu cầu rút tiền đã được duyệt',
    'Yêu cầu rút tiền đã được duyệt',
    '#16A34A',
  ],
  [
    'rút tiền bị từ chối (683:2)',
    (over) => renderWithdrawalRejectedMail(common(over)),
    '[CLINIX] Yêu cầu rút tiền bị từ chối',
    'Yêu cầu rút tiền bị từ chối',
    '#EF4444',
  ],
];
const BUILDS = ALL.map(([name, build]) => [name, build] as const);

describe('TDT-09 phần chuẩn bị: năm loại có thư của worker khớp hằng của payment và wallet (booking viết bằng chữ để không import ngược lúc chạy)', () => {
  it('đúng năm loại, đúng chữ', () => {
    expect(PAYMENT_MAIL_EVENTS).toEqual({
      TOPUP_FAILED: TOPUP_NOTIFICATION_EVENTS.FAILED,
      DEPOSIT_REFUNDED: REFUND_NOTIFICATION_EVENTS.REFUNDED,
      SPECIAL_REFUND: REFUND_NOTIFICATION_EVENTS.SPECIAL_REFUND,
      WITHDRAWAL_APPROVED: WITHDRAWAL_NOTIFICATION_EVENTS.APPROVED,
      WITHDRAWAL_REJECTED: WITHDRAWAL_NOTIFICATION_EVENTS.REJECTED,
    });
  });
});

describe('TDT-10 bốn mẫu: tiêu đề, tiêu đề thân, dải màu của Figma; tiêu đề thư một dòng', () => {
  it.each(ALL)('%s', (_name, build, subject, title, band) => {
    const mail = build();
    expect(mail.subject).toBe(subject);
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.text.startsWith(`${title}\n`)).toBe(true);
    expect(mail.html).toContain(escapeTitle(title));
    expect(mail.html).toContain(band);
    expect(mail.text).toContain(`Xin chào ${NAME},`);
  });
});

const HOSTILE = `<script>alert('x')</script> "q" & 'a'`;

describe('TDT-10 dữ liệu độc hại ở tên người nhận, nội dung thông báo, mã lịch, chân thư: html thoát hết', () => {
  it.each(BUILDS)('%s', (_name, build) => {
    const mail = build({
      recipientName: HOSTILE,
      noiDung: `Hoàn <img src=x onerror=alert(1)> ${HOSTILE}`,
      footer: {
        tenThuongHieu: HOSTILE,
        diaChi: HOSTILE,
        hotline: HOSTILE,
        email: HOSTILE,
      },
    });
    expect(mail.html).not.toContain('<script');
    expect(mail.html).not.toContain('<img');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(mail.html).toContain('&quot;q&quot;');
    // bản text là chữ thuần: giữ nguyên ký tự, KHÔNG thoát HTML
    expect(mail.text).toContain('<script>');
  });

  it('mã lịch hẹn độc hại ở thư hoàn tiền cũng được thoát', () => {
    const mail = renderRefundMail({
      ...common(),
      maLichHen: '<b>x</b>',
      special: false,
    });
    expect(mail.html).not.toContain('<b>x</b>');
    expect(mail.html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('TDT-10 không script, ảnh, liên kết, thẻ style, font hay tài nguyên ngoài', () => {
  const FORBIDDEN =
    /<script|<img|<a[\s>]|<style|<link|<iframe|<form|<button|href\s*=|src\s*=|@import|url\(|@font-face/i;
  it.each(BUILDS)('%s', (_name, build) => {
    const mail = build();
    expect(mail.html).not.toMatch(FORBIDDEN);
    expect(mail.html).toContain('style="');
  });
});

describe('TDT-10 xuống dòng và ký tự điều khiển trong dữ liệu không tạo được dòng giả; nội dung cắt ở 500 ký tự', () => {
  it.each(BUILDS)('%s', (_name, build) => {
    const mail = build({
      recipientName: 'An\r\nBcc: ke-xau@example.test',
      noiDung: 'Đã hoàn\nSubject: giả\u0000',
      thoiDiem: '15/10/2026\r\n— 14:30',
    });
    expect(mail.text).not.toMatch(/^Bcc:/m);
    expect(mail.text).not.toMatch(/^Subject:/m);
    expect(mail.text).not.toContain('\u0000');
    expect(mail.text).toContain('An Bcc: ke-xau@example.test');
  });

  it('nội dung dài hơn 500 ký tự bị cắt (cột thong_bao.noi_dung tối đa 500)', () => {
    const mail = renderWithdrawalApprovedMail(
      common({ noiDung: 'x'.repeat(600) }),
    );
    expect(mail.text).not.toContain('x'.repeat(501));
  });
});

describe('TDT-10 chữ của từng mẫu: chi tiết là chính thong_bao.noi_dung, bảng chỉ có dữ kiện đọc lại được (Trung chốt 20/11/2026)', () => {
  it('679:2 nạp ví thất bại: câu mở đầu nói về NẠP VÍ, không có mã lịch hẹn hay "Chờ thanh toán"; có thời gian, trạng thái Thất bại, câu của thông báo', () => {
    const noiDung = buildTopupFailedText('200000.00');
    const mail = renderTopupFailedMail(common({ noiDung }));
    for (const part of [
      'nạp tiền vào ví CLINIX',
      `Thời gian: ${AT}`,
      'Trạng thái: Thất bại',
      noiDung,
      'thử nạp lại',
    ])
      expect(mail.text).toContain(part);
    expect(mail.text).not.toMatch(/Mã lịch hẹn|Chờ thanh toán|lịch hẹn/);
  });

  it('680:2 hoàn cọc và hoàn đặc biệt: mã lịch, "Ví CLINIX", thời gian xử lý, câu của thông báo; câu mở đầu khác nhau giữa hai biến thể', () => {
    const noiDung = buildRefundedText(MA, '50000.00');
    const normal = renderRefundMail({
      ...common({ noiDung }),
      maLichHen: MA,
      special: false,
    });
    const special = renderRefundMail({
      ...common({ noiDung }),
      maLichHen: MA,
      special: true,
    });
    for (const mail of [normal, special])
      for (const part of [
        `Mã lịch hẹn: ${MA}`,
        'Phương thức nhận: Ví CLINIX',
        `Thời gian xử lý: ${AT}`,
        noiDung,
        'Vui lòng kiểm tra số dư ví',
      ])
        expect(mail.text).toContain(part);
    expect(normal.text).toContain('lịch hẹn đã hủy');
    expect(special.text).toContain('Phòng khám đã hoàn một khoản tiền');
    expect(special.text).not.toContain('lịch hẹn đã hủy');
  });

  it('682:2 rút tiền được duyệt: Đã duyệt, thời gian duyệt, câu của thông báo kèm ghi chú', () => {
    const noiDung = buildWithdrawalApprovedText('500000.00', 'Đã chuyển khoản');
    const mail = renderWithdrawalApprovedMail(common({ noiDung }));
    for (const part of [
      'Số dư ví CLINIX đã được cập nhật',
      'Trạng thái: Đã duyệt',
      `Thời gian duyệt: ${AT}`,
      'Ghi chú: Đã chuyển khoản',
    ])
      expect(mail.text).toContain(part);
  });

  it('683:2 rút tiền bị từ chối: Từ chối, lý do (ghi chú) nằm trong câu của thông báo; không có dòng tài khoản ngân hàng', () => {
    const noiDung = buildWithdrawalRejectedText(
      '500000.00',
      'Thông tin tài khoản ngân hàng không hợp lệ',
    );
    const mail = renderWithdrawalRejectedMail(common({ noiDung }));
    for (const part of [
      'Trạng thái: Từ chối',
      'Ghi chú: Thông tin tài khoản ngân hàng không hợp lệ',
      'Số tiền vẫn còn trong ví CLINIX',
    ])
      expect(mail.text).toContain(part);
    expect(mail.text).not.toMatch(/Tài khoản:|\*\*\*\*/);
  });

  it('text và html cùng một bộ chữ: câu của thông báo và các dòng bảng có ở cả hai bản', () => {
    for (const [name, build] of BUILDS) {
      const mail = build({ noiDung: 'Câu thông báo riêng của ca này.' });
      expect(mail.text, name).toContain('Câu thông báo riêng của ca này.');
      expect(mail.html, name).toContain('Câu thông báo riêng của ca này.');
      expect(mail.html, name).toContain(AT);
    }
  });
});

// Tiêu đề thân trong html đã qua escapeHtml (chữ tiếng Việt không đổi)
function escapeTitle(title: string): string {
  return title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}
