import { EXAM_NOTIFICATION_EVENTS } from '../../doctor/examination/examination.constants.js';
import { contextOf, MA_LICH_HEN } from '../testing/notification-fixtures.js';
import type { ClinicFooter } from './clinic-footer.query.js';
import { renderExamCompletedMail } from './exam-mail.templates.js';
import { EXAM_MAIL_EVENTS } from './notifications.constants.js';

// notification B4 — mẫu thư "Lịch khám đã hoàn thành" (Figma `678:2`; PLAN notification 5.7): EMT-02 phần mẫu (tiêu đề, đủ hàng, câu nhắc đánh giá bằng chữ, không liên kết), EMT-10 (dữ liệu chứa `<script>`,
// `&`, dấu nháy ⇒ html thoát hết), và hằng chữ `EXAM_MAIL_EVENTS` khớp hằng của doctor-exam. Hàm thuần, dữ liệu giả.
const FOOTER: ClinicFooter = {
  tenThuongHieu: 'CLINIX Clinic',
  diaChi: '123 Nguyễn Thị Minh Khai, Q.3, TP.HCM',
  hotline: '1900 5555',
  email: 'ho-tro@example.test',
};
const HOSTILE = `<script>alert('x')</script> "q" & 'a'`;
const NAME = 'Nguyễn Văn An';

describe('EMT-02 mẫu thư hoàn thành lịch khám', () => {
  it('tiêu đề và câu theo Figma `678:2`; đủ mã lịch, người được khám, bác sĩ, ngày giờ, chi nhánh; câu nhắc đánh giá bằng chữ', () => {
    const mail = renderExamCompletedMail({
      recipientName: NAME,
      context: contextOf(),
      footer: FOOTER,
    });
    expect(mail.subject).toBe('[CLINIX] Lịch khám đã hoàn thành');
    for (const line of [
      'Lịch khám đã hoàn thành',
      `Xin chào ${NAME},`,
      'Lịch khám dưới đây đã được ghi nhận hoàn thành. Cảm ơn bạn đã tin tưởng dịch vụ tại CLINIX Clinic.',
      `Mã lịch hẹn: ${MA_LICH_HEN}`,
      'Người được khám: Nguyễn Văn An',
      'Bác sĩ: TS.BS.',
      'Ngày giờ: Thứ Ba, 10/11/2026 — 09:30',
      'Chi nhánh: ',
      'đánh giá bác sĩ trong mục Hồ sơ khám bệnh',
      'Nếu cần thêm thông tin về lần khám này, vui lòng liên hệ phòng khám trực tiếp.',
      '1900 5555',
    ])
      expect(mail.text).toContain(line);
    expect(mail.text).not.toContain('(đặt hộ)');
  });

  it('lịch của hồ sơ người thân: "(đặt hộ)"; không liên kết, nút, ảnh hay script; không có tiền', () => {
    const mail = renderExamCompletedMail({
      recipientName: NAME,
      context: contextOf({ datHo: true, nguoiDuocKham: 'Trần Thị Bình' }),
      footer: null,
    });
    expect(mail.text).toContain('Người được khám: Trần Thị Bình (đặt hộ)');
    expect(mail.html).not.toMatch(
      /<a\b|href=|<img\b|<button\b|<script\b|<style\b/i,
    );
    expect(mail.text).not.toMatch(/VNĐ/);
  });
});

describe('EMT-10 an toàn chữ của thư hoàn thành', () => {
  it('tên người nhận, bác sĩ, người được khám, chi nhánh chứa thẻ, dấu nháy, & và xuống dòng: html thoát hết, text một dòng mỗi giá trị', () => {
    const mail = renderExamCompletedMail({
      recipientName: `${HOSTILE}\nDòng hai`,
      context: contextOf({
        tenBacSi: HOSTILE,
        nguoiDuocKham: HOSTILE,
        chiNhanh: HOSTILE,
      }),
      footer: FOOTER,
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('&amp;');
    expect(mail.html).toContain('&#39;a&#39;');
    expect(mail.text).not.toContain('\nDòng hai');
  });
});

describe('EMT-13 hằng chữ của booking khớp doctor-exam', () => {
  it('EXAM_MAIL_EVENTS (booking, viết bằng chữ) bằng EXAM_NOTIFICATION_EVENTS (doctor-exam)', () => {
    expect(EXAM_MAIL_EVENTS).toEqual(EXAM_NOTIFICATION_EVENTS);
  });
});
