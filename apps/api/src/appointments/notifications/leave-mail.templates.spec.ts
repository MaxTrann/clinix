import {
  buildLeaveMessage,
  LEAVE_EVENTS,
  type LeaveNotificationInput,
} from '../../doctor/notifications/leave-notifier.js';
import type { ClinicFooter } from './clinic-footer.query.js';
import {
  isLeaveMailEvent,
  renderLeaveMail,
  type LeaveMailCommon,
} from './leave-mail.templates.js';
import { LEAVE_MAIL_EVENTS } from './notifications.constants.js';

// notification B5 — mẫu thư nghỉ phép gửi Bác sĩ (Figma `688:2`; PLAN notification 5.7): EMT-05 phần mẫu (chi tiết là `thong_bao.noi_dung`, không lý do xin nghỉ), EMT-10 (dữ liệu chứa `<script>`, `&`,
// dấu nháy ⇒ html thoát hết), EMT-13 (hằng chữ `LEAVE_MAIL_EVENTS` khớp hằng của doctor; `NghiPhepChoDuyet` không có thư). Hàm thuần, dữ liệu giả.
const FOOTER: ClinicFooter = {
  tenThuongHieu: 'CLINIX Clinic',
  diaChi: '123 Nguyễn Thị Minh Khai, Q.3, TP.HCM',
  hotline: '1900 5555',
  email: 'ho-tro@example.test',
};
const HOSTILE = `<script>alert('x')</script> "q" & 'a'`;
const DOCTOR = 'Nguyễn Thị Hương';
const INPUT: LeaveNotificationInput = {
  bacSiId: '7',
  chiNhanhId: '1',
  tenBacSi: DOCTOR,
  ngayBatDau: '2026-10-20',
  ngayKetThuc: '2026-10-22',
  ca: null,
};
const common = (noiDung: string): LeaveMailCommon => ({
  recipientName: DOCTOR,
  noiDung,
  thoiDiem: '15/10/2026 — 09:00',
  footer: FOOTER,
});

describe('EMT-05 mẫu thư nghỉ phép', () => {
  it('NghiPhepDaGui: tiêu đề và câu theo Figma `688:2`, trạng thái Chờ duyệt, ngày gửi, chi tiết là câu thông báo (khoảng ngày)', () => {
    const noiDung = buildLeaveMessage({
      loaiSuKien: LEAVE_EVENTS.Submitted,
      ...INPUT,
    });
    const mail = renderLeaveMail('NghiPhepDaGui', common(noiDung));
    expect(mail.subject).toBe('[CLINIX] Cập nhật yêu cầu nghỉ phép');
    for (const line of [
      'Yêu cầu nghỉ phép đã được gửi',
      `Xin chào ${DOCTOR},`,
      'Yêu cầu nghỉ phép của bạn đã được ghi nhận và đang chờ phê duyệt.',
      'Trạng thái: Chờ duyệt',
      'Ngày gửi: 15/10/2026 — 09:00',
      'từ 20/10/2026 đến 22/10/2026',
      '1900 5555',
    ])
      expect(mail.text).toContain(line);
  });

  it('NghiPhepDaDuyet và NghiPhepTuChoi: trạng thái và nhãn thời gian riêng; thư từ chối có lý do TỪ CHỐI của Admin', () => {
    const approved = renderLeaveMail(
      'NghiPhepDaDuyet',
      common(
        buildLeaveMessage({ loaiSuKien: LEAVE_EVENTS.Approved, ...INPUT }),
      ),
    );
    expect(approved.subject).toBe('[CLINIX] Cập nhật yêu cầu nghỉ phép');
    for (const line of [
      'Yêu cầu nghỉ phép đã được duyệt',
      'Trạng thái: Đã duyệt',
      'Thời gian duyệt: 15/10/2026 — 09:00',
      'đã được duyệt.',
    ])
      expect(approved.text).toContain(line);

    const rejected = renderLeaveMail(
      'NghiPhepTuChoi',
      common(
        buildLeaveMessage({
          loaiSuKien: LEAVE_EVENTS.Rejected,
          ...INPUT,
          lyDoTuChoi: 'Thiếu người trực',
        }),
      ),
    );
    for (const line of [
      'Yêu cầu nghỉ phép bị từ chối',
      'Trạng thái: Bị từ chối',
      'Thời gian xử lý: 15/10/2026 — 09:00',
      'Lý do: Thiếu người trực',
    ])
      expect(rejected.text).toContain(line);
  });

  it('không có hàng "Lý do" của Figma (lý do xin nghỉ của Bác sĩ, doctor Q33); không liên kết, nút, ảnh, script, thẻ style', () => {
    for (const loai of Object.values(LEAVE_MAIL_EVENTS)) {
      const mail = renderLeaveMail(loai, common('Yêu cầu nghỉ phép.'));
      expect(mail.text).not.toMatch(/^\s*Lý do:/m);
      expect(mail.html).not.toMatch(
        /<a\b|href=|<img\b|<button\b|<script\b|<style\b/i,
      );
    }
  });
});

describe('EMT-10 an toàn chữ của thư nghỉ phép', () => {
  it('tên Bác sĩ, câu chi tiết (có lý do từ chối), thời điểm chứa thẻ, dấu nháy, & và xuống dòng: html thoát hết, text một dòng mỗi giá trị', () => {
    const mail = renderLeaveMail('NghiPhepTuChoi', {
      recipientName: `${HOSTILE}\nDòng hai`,
      noiDung: buildLeaveMessage({
        loaiSuKien: LEAVE_EVENTS.Rejected,
        ...INPUT,
        lyDoTuChoi: `${HOSTILE}\nDòng ba`,
      }),
      thoiDiem: `${HOSTILE}`,
      footer: FOOTER,
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('&amp;');
    expect(mail.html).toContain('&#39;a&#39;');
    expect(mail.text).not.toContain('\nDòng hai');
    expect(mail.text).not.toContain('\nDòng ba');
  });
});

describe('EMT-13 hằng chữ của booking khớp doctor', () => {
  it('LEAVE_MAIL_EVENTS (booking, viết bằng chữ) bằng ba mã gửi Bác sĩ của LEAVE_EVENTS; NghiPhepChoDuyet (gửi Admin) không có thư', () => {
    expect(LEAVE_MAIL_EVENTS).toEqual({
      SUBMITTED: LEAVE_EVENTS.Submitted,
      APPROVED: LEAVE_EVENTS.Approved,
      REJECTED: LEAVE_EVENTS.Rejected,
    });
    expect(isLeaveMailEvent(LEAVE_EVENTS.Pending)).toBe(false);
    for (const loai of Object.values(LEAVE_MAIL_EVENTS))
      expect(isLeaveMailEvent(loai)).toBe(true);
  });
});
