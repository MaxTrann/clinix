import {
  renderBookingConfirmationMail,
  renderCancellationMail,
  renderNoShowMail,
  renderNoShowRestrictionMail,
  type MailCommon,
} from './booking-mail.templates.js';
import type { ClinicFooter } from './clinic-footer.query.js';
import { buildNotificationText } from './notification-text.js';
import { BOOKING_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import { contextOf, MA_LICH_HEN } from '../testing/notification-fixtures.js';

// Task B15 — bốn mẫu thư (PLAN booking 5.12, 7.14, 7.43; TRACKING 3.37 B15-I): MLT-01…MLT-10 (TB-04, TB-07 phần thư). Hàm thuần: đơn vị, không DB, không gửi gì (TB-08: không có đường nào tới SMTP ở file này).
const FULL_FOOTER: ClinicFooter = {
  tenThuongHieu: 'CLINIX Clinic',
  diaChi: '123 Nguyễn Thị Minh Khai, Q.3, TP.HCM',
  hotline: '1900 5555',
  email: 'ho-tro@example.test',
};
const NAME = 'Nguyễn Văn An';
const common = (over: Partial<MailCommon> = {}): MailCommon => ({
  recipientName: NAME,
  context: contextOf(),
  footer: FULL_FOOTER,
  ...over,
});
const sentence = (
  reason: 'BenhNhanHuy' | 'LeTanHuy' | 'QtvOverride' | 'BacSiNghiPhep',
  hoanCoc: { tyLe: number; soTien: string } | null = null,
) =>
  buildNotificationText({
    loai: BOOKING_NOTIFICATION_EVENTS.CANCELLED,
    context: contextOf(),
    huy: { reason, hoanCoc },
  });

// Mỗi mẫu với dữ liệu mặc định, để chạy cùng một khẳng định cho cả bốn
const ALL: [
  string,
  (over?: Partial<MailCommon>) => ReturnType<typeof renderNoShowMail>,
][] = [
  ['xác nhận', (over) => renderBookingConfirmationMail(common(over))],
  [
    'huỷ',
    (over) =>
      renderCancellationMail({
        ...common(over),
        noiDung: sentence('BenhNhanHuy'),
      }),
  ],
  [
    'vắng mặt',
    (over) => renderNoShowMail({ ...common(over), soLan: 2, nguong: 3 }),
  ],
  [
    'hạn chế',
    (over) =>
      renderNoShowRestrictionMail({ ...common(over), soLan: 3, nguong: 3 }),
  ],
];

describe('MLT-01 bốn hàm trả { subject, text, html } với tiêu đề, tiêu đề thân và dải màu của Figma', () => {
  it.each([
    [
      'xác nhận',
      0,
      '[CLINIX] Lịch hẹn của bạn đã được xác nhận',
      'Lịch hẹn đã được xác nhận',
      '#16A34A',
    ],
    ['huỷ', 1, '[CLINIX] Lịch hẹn đã bị hủy', 'Lịch hẹn đã bị hủy', '#EF4444'],
    [
      'vắng mặt',
      2,
      '[CLINIX] Ghi nhận vắng mặt tại lịch hẹn',
      'Ghi nhận vắng mặt tại lịch hẹn',
      '#D97706',
    ],
    [
      'hạn chế',
      3,
      '[CLINIX] Tài khoản bị hạn chế đặt lịch',
      'Tài khoản bị hạn chế đặt lịch online',
      '#EF4444',
    ],
  ])('%s', (_name, index, subject, title, band) => {
    const mail = ALL[index]![1]();
    expect(mail.subject).toBe(subject);
    expect(mail.html).toContain(`<h2`);
    expect(mail.html).toContain(`>${title}</h2>`);
    expect(mail.html).toContain(`background:${band}`);
    expect(mail.text.startsWith(`${title}\n`)).toBe(true);
    expect(mail.html.startsWith('<!doctype html>')).toBe(true);
    // lời chào gọi tên người nhận (tài khoản đặt)
    expect(mail.html).toContain(`Xin chào <strong>${NAME}</strong>,`);
    expect(mail.text).toContain(`Xin chào ${NAME},`);
  });

  it('tiêu đề thư là MỘT dòng ≤ 200 ký tự (giới hạn của MailService)', () => {
    for (const [name, build] of ALL) {
      const { subject } = build();
      expect(subject, name).not.toMatch(/[\r\n]/);
      expect(subject.length, name).toBeLessThanOrEqual(200);
    }
  });
});

const HOSTILE = `<script>alert('x')</script> "q" & 'a'`;

describe('MLT-02 dữ liệu độc hại trong tên bác sĩ, người khám, chi nhánh, địa chỉ, người nhận, chân thư: html thoát hết (TB-04)', () => {
  it.each(ALL)('%s', (_name, build) => {
    const hostile = contextOf({
      tenBacSi: HOSTILE,
      nguoiDuocKham: HOSTILE,
      chiNhanh: HOSTILE,
      diaChiChiNhanh: HOSTILE,
      dichVu: HOSTILE,
      chuyenKhoa: HOSTILE,
    });
    const mail = build({
      recipientName: HOSTILE,
      context: hostile,
      footer: {
        tenThuongHieu: HOSTILE,
        diaChi: HOSTILE,
        hotline: HOSTILE,
        email: HOSTILE,
      },
    });
    expect(mail.html).not.toContain('<script');
    expect(mail.html).not.toContain(`'x'`);
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('&quot;q&quot;');
    expect(mail.html).toContain('&amp;');
    // bản text là chữ thuần: giữ nguyên ký tự, KHÔNG thoát HTML
    expect(mail.text).toContain('<script>');
  });

  it('thoát HTML cả trong `noi_dung` của thư huỷ', () => {
    const mail = renderCancellationMail({
      ...common(),
      noiDung: `Hủy <img src=x onerror=alert(1)> "q"`,
    });
    expect(mail.html).not.toContain('<img');
    expect(mail.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});

describe('MLT-03 không script, ảnh, liên kết, thẻ style, font hay tài nguyên ngoài (A14, Q30)', () => {
  const FORBIDDEN =
    /<script|<img|<a[\s>]|<style|<link|<iframe|<form|<button|href\s*=|src\s*=|@import|url\(|@font-face/i;
  it.each(ALL)('%s', (_name, build) => {
    const mail = build();
    expect(mail.html).not.toMatch(FORBIDDEN);
    // chỉ dùng CSS nội tuyến (thuộc tính style), không thẻ <style>
    expect(mail.html).toContain('style="');
  });
});

describe('MLT-04 xuống dòng và ký tự điều khiển trong dữ liệu không tạo được dòng giả', () => {
  it.each(ALL)('%s', (_name, build) => {
    const mail = build({
      recipientName: 'An\r\nBcc: ke-xau@example.test',
      context: contextOf({
        tenBacSi: 'Hương Subject: giả',
        chiNhanh: 'Q.3\nQ.4\u0000',
      }),
    });
    expect(mail.text).not.toMatch(/^Bcc:/m);
    expect(mail.text).not.toMatch(/^Subject:/m);
    expect(mail.text).not.toContain('\u0000');
    expect(mail.text).toContain('An Bcc: ke-xau@example.test');
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });
});

describe('MLT-05 chân thư từ thong_tin_phong_kham; thiếu thì bỏ dòng, không ném, không chữ [cần điền] hay null (TB-04)', () => {
  const SUPPORT = 'Cần hỗ trợ?';
  const NEVER = /\[cần điền|null|undefined|NaN/;

  it.each(ALL)('%s: đủ ba trường', (_name, build) => {
    const mail = build();
    expect(mail.text).toContain(
      'Cần hỗ trợ? Liên hệ qua hotline 1900 5555 hoặc email ho-tro@example.test trong giờ làm việc.',
    );
    expect(mail.text).toContain(
      'CLINIX Clinic — 123 Nguyễn Thị Minh Khai, Q.3, TP.HCM. Email này được gửi tự động.',
    );
    expect(mail.html).toContain('<strong>1900 5555</strong>');
    expect(mail.html).toContain('<strong>ho-tro@example.test</strong>');
  });

  it.each(ALL)(
    '%s: chỉ có hotline / chỉ có email / không có cả hai (bỏ cả ô hỗ trợ)',
    (_name, build) => {
      const hotlineOnly = build({ footer: { ...FULL_FOOTER, email: null } });
      expect(hotlineOnly.text).toContain(
        'Cần hỗ trợ? Liên hệ qua hotline 1900 5555 trong giờ làm việc.',
      );
      expect(hotlineOnly.text).not.toContain('hoặc email');
      const emailOnly = build({ footer: { ...FULL_FOOTER, hotline: null } });
      expect(emailOnly.text).toContain(
        'Cần hỗ trợ? Liên hệ qua email ho-tro@example.test trong giờ làm việc.',
      );
      const neither = build({
        footer: { ...FULL_FOOTER, hotline: null, email: null },
      });
      expect(neither.text).not.toContain(SUPPORT);
      expect(neither.html).not.toContain(SUPPORT);
      for (const mail of [hotlineOnly, emailOnly, neither]) {
        expect(mail.text).not.toMatch(NEVER);
        expect(mail.html).not.toMatch(NEVER);
      }
    },
  );

  it.each(ALL)(
    '%s: thiếu địa chỉ / thiếu tên thương hiệu / thiếu cả dòng cấu hình',
    (_name, build) => {
      const noAddress = build({ footer: { ...FULL_FOOTER, diaChi: null } });
      expect(noAddress.text).toContain(
        'CLINIX Clinic. Email này được gửi tự động.',
      );
      // dấu "—" cũng nằm ở dòng Ngày giờ, nên chỉ kiểm riêng cụm của chân thư
      expect(noAddress.text).not.toContain('CLINIX Clinic — ');
      const noBrand = build({
        footer: { ...FULL_FOOTER, tenThuongHieu: null },
      });
      expect(noBrand.text).toContain(
        'CLINIX Clinic — 123 Nguyễn Thị Minh Khai',
      );
      const noRow = build({ footer: null });
      expect(noRow.text).toContain(
        'CLINIX Clinic. Email này được gửi tự động.',
      );
      expect(noRow.text).not.toContain(SUPPORT);
      for (const mail of [noAddress, noBrand, noRow]) {
        expect(mail.text).not.toMatch(NEVER);
        expect(mail.html).not.toMatch(NEVER);
      }
    },
  );
});

describe('MLT-06 xác nhận: "(đặt hộ)", ba dòng tiền (Q46), không phụ phí', () => {
  it('lịch của bản thân: không có "(đặt hộ)"; hồ sơ người thân: có, gắn sau tên người được khám', () => {
    const self = renderBookingConfirmationMail(common());
    expect(self.text).not.toContain('(đặt hộ)');
    expect(self.html).not.toContain('(đặt hộ)');
    const relative = renderBookingConfirmationMail(
      common({
        context: contextOf({ datHo: true, nguoiDuocKham: 'Trần Thị Bình' }),
      }),
    );
    expect(relative.text).toContain('Người được khám: Trần Thị Bình (đặt hộ)');
    expect(relative.html).toContain('Trần Thị Bình');
    expect(relative.html).toContain('(đặt hộ)');
    // lời chào vẫn gọi tên NGƯỜI ĐẶT, không phải người thân
    expect(relative.text).toContain(`Xin chào ${NAME},`);
  });

  it('cọc > 0: đủ Tổng giá, Tiền cọc đã thanh toán, Còn lại cần thanh toán (350.000, 100.000, 250.000 VNĐ); không dòng phụ phí hay giá dịch vụ', () => {
    const mail = renderBookingConfirmationMail(common());
    expect(mail.text).toContain('Tổng giá: 350.000 VNĐ');
    expect(mail.text).toContain('Tiền cọc đã thanh toán: 100.000 VNĐ');
    expect(mail.text).toContain('Còn lại cần thanh toán: 250.000 VNĐ');
    expect(mail.text).not.toMatch(/Phụ phí|Giá dịch vụ/);
    expect(mail.html).not.toMatch(/Phụ phí|Giá dịch vụ/);
  });

  it('cọc 0đ: bỏ dòng cọc, Còn lại bằng Tổng giá', () => {
    const mail = renderBookingConfirmationMail(
      common({ context: contextOf({ tienCocSnapshot: '0.00' }) }),
    );
    expect(mail.text).not.toContain('Tiền cọc đã thanh toán');
    expect(mail.text).toContain('Tổng giá: 350.000 VNĐ');
    expect(mail.text).toContain('Còn lại cần thanh toán: 350.000 VNĐ');
  });

  it('ca biên: cọc lớn hơn giá thì Còn lại là 0 VNĐ, không bao giờ số âm', () => {
    const mail = renderBookingConfirmationMail(
      common({
        context: contextOf({
          giaSnapshot: '100000.00',
          tienCocSnapshot: '150000.00',
        }),
      }),
    );
    expect(mail.text).toContain('Còn lại cần thanh toán: 0 VNĐ');
    // không số tiền âm (dấu trừ đứng trước chữ số sau khoảng trắng); dấu gạch trong mã lịch hẹn hay email không tính
    expect(mail.text).not.toMatch(/\s-\d/);
  });

  it('đủ các dòng thông tin lịch, giờ in kiểu "Thứ Ba, 10/11/2026 — 09:30" và chữ lưu ý của Figma', () => {
    const mail = renderBookingConfirmationMail(common());
    for (const line of [
      `Mã lịch hẹn: ${MA_LICH_HEN}`,
      'Bác sĩ: TS.BS. Nguyễn Thị Hương',
      'Chuyên khoa: Nội tổng quát',
      'Dịch vụ: Khám nội tổng quát',
      'Ngày giờ: Thứ Ba, 10/11/2026 — 09:30',
      'Chi nhánh: CLINIX Clinic Q.3',
      'Địa chỉ: 123 Nguyễn Thị Minh Khai, Q.3, TP.HCM',
      'Vui lòng đến trước giờ hẹn 10–15 phút và mang theo giấy tờ tùy thân.',
      'Giá trên là giá tại thời điểm đặt lịch.',
    ])
      expect(mail.text, line).toContain(line);
    expect(mail.text).not.toContain('(snapshot)');
  });
});

describe('MLT-07 huỷ: biến thể và câu hoàn nằm trong noi_dung, thư in nguyên chữ đó (phương án P; TB-07)', () => {
  it.each([
    ['BenhNhanHuy', 'đã được hủy theo yêu cầu của bạn.'],
    ['LeTanHuy', 'đã được phòng khám điều chỉnh và hủy.'],
    ['QtvOverride', 'đã được phòng khám điều chỉnh và hủy.'],
    ['BacSiNghiPhep', 'đã bị hủy do bác sĩ nghỉ phép.'],
  ] as const)('%s: ô lưu ý mang đúng chữ biến thể', (reason, words) => {
    const mail = renderCancellationMail({
      ...common(),
      noiDung: sentence(reason),
    });
    expect(mail.html).toContain(words);
    expect(mail.text).toContain(words);
  });

  it('ba dạng hoàn: có số, chưa thu đồng nào, tỷ lệ 0 — thư mang đúng câu và KHÔNG có số tiền khi không hoàn', () => {
    const refund = renderCancellationMail({
      ...common(),
      noiDung: sentence('BenhNhanHuy', { tyLe: 50, soTien: '50000.00' }),
    });
    expect(refund.text).toContain('Hoàn dự kiến 50.000 VNĐ (50% tiền cọc).');
    const none = renderCancellationMail({
      ...common(),
      noiDung: sentence('BenhNhanHuy', null),
    });
    expect(none.text).toContain(
      'chưa phát sinh khoản thanh toán nên không có hoàn tiền',
    );
    expect(none.text).not.toMatch(/Hoàn dự kiến|VNĐ/);
    const zero = renderCancellationMail({
      ...common(),
      noiDung: sentence('LeTanHuy', { tyLe: 0, soTien: '0.00' }),
    });
    expect(zero.text).toContain('khoản cọc không được hoàn');
  });

  it('bảng chỉ có mã, bác sĩ, ngày giờ (không "Lý do hủy" tự do); câu mời đặt lịch mới có hotline khi có, bỏ khi thiếu', () => {
    const mail = renderCancellationMail({
      ...common(),
      noiDung: sentence('BenhNhanHuy'),
    });
    expect(mail.text).not.toMatch(/Lý do/);
    expect(mail.text).toContain(
      'Để đặt lịch mới, vui lòng truy cập CLINIX hoặc liên hệ hotline 1900 5555.',
    );
    const noHotline = renderCancellationMail({
      ...common({ footer: { ...FULL_FOOTER, hotline: null } }),
      noiDung: sentence('BenhNhanHuy'),
    });
    expect(noHotline.text).toContain(
      'Để đặt lịch mới, vui lòng truy cập CLINIX.',
    );
    expect(noHotline.text).not.toContain('hotline');
  });
});

describe('MLT-08 vắng mặt: số lần và ngưỡng lấy từ tham số, không viết cứng', () => {
  it('số lần 5, ngưỡng 7', () => {
    const mail = renderNoShowMail({ ...common(), soLan: 5, nguong: 7 });
    expect(mail.text).toContain('Số lần vắng mặt (hiện tại): 5 lần');
    expect(mail.text).toContain(
      'Tích lũy từ 7 lần vắng mặt không thông báo sẽ dẫn đến hạn chế quyền đặt lịch online.',
    );
    // ngưỡng 3 của cấu hình mẫu KHÔNG bị viết cứng vào chữ ("Q.3" của tên chi nhánh không tính)
    expect(mail.text).not.toContain('3 lần');
    expect(mail.text).toContain(
      'Chúng tôi ghi nhận bạn không đến khám theo lịch hẹn dưới đây. Nếu có nhầm lẫn, vui lòng liên hệ phòng khám.',
    );
  });
});

describe('MLT-09 hạn chế đặt lịch: giờ lịch gần nhất, "không phải khóa đăng nhập", hotline khi có', () => {
  it('đủ số lần, ngưỡng, lịch gần nhất; chữ đậm đúng cụm; có hotline', () => {
    const mail = renderNoShowRestrictionMail({
      ...common(),
      soLan: 4,
      nguong: 3,
    });
    expect(mail.text).toContain('Số lần vắng mặt: 4 lần');
    expect(mail.text).toContain('Ngưỡng áp dụng: 3 lần');
    expect(mail.text).toContain(
      'Lịch hẹn gần nhất: Thứ Ba, 10/11/2026 — 09:30',
    );
    expect(mail.html).toContain('<strong>đặt lịch online</strong>');
    expect(mail.html).toContain('<strong>không phải khóa đăng nhập</strong>');
    expect(mail.text).toContain('không phải khóa đăng nhập tài khoản.');
    expect(mail.text).toContain(
      '🔒 Chức năng đặt lịch online tạm khóa. Để được kiểm tra và hỗ trợ mở khóa, vui lòng liên hệ CLINIX qua hotline 1900 5555. Việc mở khóa sẽ do Admin Toàn hệ thống xử lý theo thẩm quyền.',
    );
  });

  it('thiếu hotline: bỏ cụm "qua hotline", câu vẫn trọn vẹn', () => {
    const mail = renderNoShowRestrictionMail({
      ...common({ footer: { ...FULL_FOOTER, hotline: null } }),
      soLan: 3,
      nguong: 3,
    });
    expect(mail.text).toContain('vui lòng liên hệ CLINIX. Việc mở khóa');
    expect(mail.text).not.toContain('qua hotline');
  });
});

describe('MLT-10 text và html cùng một bộ chữ (như renderOtpMail)', () => {
  it.each(ALL)('%s: các giá trị chính có mặt ở CẢ HAI bản', (_name, build) => {
    const mail = build();
    for (const token of [
      '10/11/2026 — 09:30',
      'CLINIX Clinic',
      '1900 5555',
      'ho-tro@example.test',
    ]) {
      expect(mail.text, `text ${token}`).toContain(token);
      expect(mail.html, `html ${token}`).toContain(token);
    }
  });

  it('mã lịch hẹn và bác sĩ (mẫu xác nhận, huỷ, vắng mặt có hai dòng này; mẫu hạn chế không có) có ở cả hai bản', () => {
    for (const [name, build] of ALL.slice(0, 3)) {
      const mail = build();
      for (const token of [MA_LICH_HEN, 'Nguyễn Thị Hương']) {
        expect(mail.text, `${name} text ${token}`).toContain(token);
        expect(mail.html, `${name} html ${token}`).toContain(token);
      }
    }
  });

  it('phần chữ cố định của từng mẫu có ở cả hai bản', () => {
    const confirmation = renderBookingConfirmationMail(common());
    for (const words of [
      'Lịch khám của bạn tại CLINIX Clinic đã được xác nhận thành công.',
      'Tổng giá',
      'Còn lại cần thanh toán',
    ]) {
      expect(confirmation.text).toContain(words);
      expect(confirmation.html).toContain(words);
    }
  });
});
