import type { ClinicFooter } from '../../appointments/notifications/clinic-footer.query.js';
import {
  contextOf,
  MA_LICH_HEN,
} from '../../appointments/testing/notification-fixtures.js';
import {
  renderReminderMail,
  shortAppointmentTime,
} from './reminder-mail.templates.js';

// notification B3 — mẫu thư nhắc lịch, phần ĐƠN VỊ: NLH-17 (thời gian hẹn CỤ THỂ "HH:mm ngày dd/MM" ở tiêu đề và câu chính, "sau khoảng N giờ nữa" là phần phụ, đủ hàng chi tiết,
// "(đặt hộ)", không liên kết; Q15) và an toàn chữ (dữ liệu chứa `<script>`, `&`, dấu nháy ⇒ html thoát hết; nếp EMT-10). Hàm thuần, dữ liệu giả.
const FOOTER: ClinicFooter = {
  tenThuongHieu: 'CLINIX Clinic',
  diaChi: '123 Nguyễn Thị Minh Khai, Q.3, TP.HCM',
  hotline: '1900 5555',
  email: 'ho-tro@example.test',
};
const HOSTILE = `<script>alert('x')</script> "q" & 'a'`;
const context = contextOf({ ngay: '02/12/2026', gio: '14:30', thu: 4 });

describe('NLH-17 nội dung thư nhắc lịch', () => {
  it('tiêu đề và câu chính ghi thời gian hẹn cụ thể; "sau khoảng 24 giờ nữa" chỉ là phần phụ; hàng "Ngày giờ" đầy đủ', () => {
    const mail = renderReminderMail({ context, soGio: 24, footer: FOOTER });
    expect(mail.subject).toBe(
      '[CLINIX] Nhắc lịch hẹn khám lúc 14:30 ngày 02/12',
    );
    expect(mail.text).toContain(
      `Lịch hẹn ${MA_LICH_HEN} của bạn diễn ra lúc 14:30 ngày 02/12 (sau khoảng 24 giờ nữa).`,
    );
    expect(mail.html).toContain('<strong>lúc 14:30 ngày 02/12</strong>');
    expect(mail.text).toContain('Ngày giờ: Thứ Tư, 02/12/2026 — 14:30');
    expect(mail.text).toContain(
      'Vui lòng đến trước giờ hẹn 10–15 phút và mang theo giấy tờ tùy thân.',
    );
    expect(mail.text).not.toMatch(/^Còn \d+ giờ/m);
  });

  it('lời chào theo TÀI KHOẢN ĐẶT; đủ người được khám, bác sĩ, dịch vụ, chuyên khoa, chi nhánh, địa chỉ; đặt hộ có "(đặt hộ)"', () => {
    const own = renderReminderMail({ context, soGio: 2, footer: FOOTER });
    expect(own.text).toContain(`Xin chào ${context.tenNguoiDat},`);
    for (const line of [
      `Mã lịch hẹn: ${MA_LICH_HEN}`,
      `Người được khám: ${context.nguoiDuocKham}`,
      `Bác sĩ: TS.BS. ${context.tenBacSi}`,
      `Dịch vụ: ${context.dichVu}`,
      `Chuyên khoa: ${context.chuyenKhoa}`,
      `Chi nhánh: ${context.chiNhanh}`,
      `Địa chỉ: ${context.diaChiChiNhanh}`,
    ])
      expect(own.text).toContain(line);
    expect(own.text).not.toContain('(đặt hộ)');
    const relative = renderReminderMail({
      context: contextOf({ datHo: true, nguoiDuocKham: 'Trần Thị Bình' }),
      soGio: 2,
      footer: FOOTER,
    });
    expect(relative.text).toContain('Người được khám: Trần Thị Bình (đặt hộ)');
  });

  it('không liên kết, nút hay ảnh; chân thư của phòng khám có mặt; thiếu chân thư vẫn dựng được', () => {
    const mail = renderReminderMail({ context, soGio: 72, footer: FOOTER });
    expect(mail.html).not.toMatch(/<a\b|href=|<img\b|<button\b|<script\b/i);
    expect(mail.text).toContain('1900 5555');
    expect(
      renderReminderMail({ context, soGio: 72, footer: null }).text,
    ).toContain('CLINIX Clinic. Email này được gửi tự động.');
  });

  it('mốc in đúng số giờ của dòng (ổn định khi gửi lại), không tính theo đồng hồ', () => {
    expect(
      renderReminderMail({ context, soGio: 72, footer: null }).text,
    ).toContain('(sau khoảng 72 giờ nữa)');
  });

  it('shortAppointmentTime lấy "dd/MM" từ `ngay`, giờ từ `gio`', () => {
    expect(shortAppointmentTime({ ngay: '31/12/2026', gio: '00:30' })).toBe(
      '00:30 ngày 31/12',
    );
  });
});

describe('an toàn chữ của thư nhắc lịch (nếp EMT-10)', () => {
  it('dữ liệu chứa thẻ, dấu nháy, & và xuống dòng: html thoát hết, text một dòng', () => {
    const mail = renderReminderMail({
      context: contextOf({
        tenNguoiDat: `${HOSTILE}\nDòng hai`,
        nguoiDuocKham: HOSTILE,
        dichVu: HOSTILE,
        chiNhanh: HOSTILE,
      }),
      soGio: 24,
      footer: FOOTER,
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.text).not.toContain('\nDòng hai');
  });
});
