import { RESCHEDULE_NOTIFICATION_EVENTS } from '../appointments.constants.js';
import { contextOf, MA_LICH_HEN } from '../testing/notification-fixtures.js';
import type { ClinicFooter } from './clinic-footer.query.js';
import {
  renderRescheduledMail,
  renderRescheduleRequestApprovedMail,
  renderRescheduleRequestPendingMail,
  renderRescheduleRequestRejectedMail,
  type RescheduleRequestMailCommon,
} from './reschedule-mail.templates.js';

// reschedule B3 — bốn mẫu thư của đổi lịch (PLAN reschedule 5.10, 7.8, 7.10; Q9, Q10, Q13 `[đề xuất]`): NDL-02 phần mẫu (qua `renderMailShell`, tiêu đề cố định, chi tiết là `thong_bao.noi_dung`) và BDL-04 (dữ liệu
// người nhập chứa `<script>`, `&`, dấu nháy ⇒ html thoát hết; không liên kết, script, ảnh). Hàm thuần: đơn vị, không DB, không gửi gì. Dữ liệu giả.
const FOOTER: ClinicFooter = {
  tenThuongHieu: 'CLINIX Clinic',
  diaChi: '123 Nguyễn Thị Minh Khai, Q.3, TP.HCM',
  hotline: '1900 5555',
  email: 'ho-tro@example.test',
};
const NAME = 'Nguyễn Văn An';
const AT = '02/11/2026 — 08:00';
const NOI_DUNG = 'Câu của thông báo.';
const HOSTILE = `<script>alert('x')</script> "q" & 'a'`;

const common = (
  over: Partial<RescheduleRequestMailCommon> = {},
): RescheduleRequestMailCommon => ({
  recipientName: NAME,
  noiDung: NOI_DUNG,
  thoiDiem: AT,
  footer: FOOTER,
  ...over,
});

type Mail = { subject: string; text: string; html: string };
type Build = (over?: Partial<RescheduleRequestMailCommon>) => Mail;
// [tên, hàm dựng, tiêu đề thư, tiêu đề thân, màu dải đầu]
const ALL: [string, Build, string, string, string][] = [
  [
    'LichHenDaDoiLich',
    (over) =>
      renderRescheduledMail({
        recipientName: over?.recipientName ?? NAME,
        noiDung: over?.noiDung ?? NOI_DUNG,
        footer: over?.footer === undefined ? FOOTER : over.footer,
        context: contextOf(),
      }),
    '[CLINIX] Lịch hẹn đã được đổi',
    'Lịch hẹn đã được đổi',
    '#16A34A',
  ],
  [
    'YeuCauDoiLichDangCho',
    (over) => renderRescheduleRequestPendingMail(common(over)),
    '[CLINIX] Đã nhận yêu cầu đổi lịch hẹn',
    'Đã nhận yêu cầu đổi lịch hẹn',
    '#D97706',
  ],
  [
    'YeuCauDoiLichDaDuyet',
    (over) => renderRescheduleRequestApprovedMail(common(over)),
    '[CLINIX] Yêu cầu đổi lịch hẹn đã được duyệt',
    'Yêu cầu đổi lịch hẹn đã được duyệt',
    '#16A34A',
  ],
  [
    'YeuCauDoiLichBiTuChoi',
    (over) => renderRescheduleRequestRejectedMail(common(over)),
    '[CLINIX] Yêu cầu đổi lịch hẹn bị từ chối',
    'Yêu cầu đổi lịch hẹn bị từ chối',
    '#EF4444',
  ],
];
const BUILDS = ALL.map(([name, build]) => [name, build] as const);

describe('NDL-11 phần chuẩn bị: bốn mã đổi lịch (D1)', () => {
  it('đúng bốn mã, đúng chữ, PascalCase, ≤ 100 ký tự, khác nhau kể cả không phân biệt hoa thường', () => {
    expect(RESCHEDULE_NOTIFICATION_EVENTS).toEqual({
      RESCHEDULED: 'LichHenDaDoiLich',
      REQUEST_PENDING: 'YeuCauDoiLichDangCho',
      REQUEST_APPROVED: 'YeuCauDoiLichDaDuyet',
      REQUEST_REJECTED: 'YeuCauDoiLichBiTuChoi',
    });
    const codes = Object.values(RESCHEDULE_NOTIFICATION_EVENTS);
    expect(new Set(codes.map((c) => c.toLowerCase())).size).toBe(4);
    for (const code of codes) {
      expect(code, code).toMatch(/^[A-Z][A-Za-z0-9]*$/);
      expect(code.length, code).toBeLessThanOrEqual(100);
    }
  });
});

describe('NDL-02 bốn mẫu: tiêu đề cố định, tiêu đề thân, dải màu; tiêu đề thư một dòng, không dữ liệu người dùng', () => {
  it.each(ALL)('%s', (_name, build, subject, title, band) => {
    const mail = build({ recipientName: HOSTILE, noiDung: HOSTILE });
    expect(mail.subject).toBe(subject);
    expect(mail.subject).not.toMatch(/[\r\n<>&"]/);
    expect(mail.text.startsWith(`${title}\n`)).toBe(true);
    expect(mail.html).toContain(title);
    expect(mail.html).toContain(band);
  });

  it('chữ thông báo là chính `thong_bao.noi_dung` ở ô lưu ý; bảng chỉ có dữ kiện đọc lại được từ DB', () => {
    const rescheduled = ALL[0]![1]();
    for (const part of [
      `Xin chào ${NAME},`,
      `Mã lịch hẹn mới: ${MA_LICH_HEN}`,
      'Bác sĩ: TS.BS. Nguyễn Thị Hương',
      'Dịch vụ: Khám nội tổng quát',
      'Ngày giờ: Thứ Ba, 10/11/2026 — 09:30',
      'Chi nhánh: CLINIX Clinic Q.3',
      NOI_DUNG,
      'Mã lịch hẹn cũ không còn dùng được',
    ])
      expect(rescheduled.text, part).toContain(part);

    const pending = ALL[1]![1]();
    for (const part of [
      'Trạng thái: Đang chờ duyệt',
      `Thời gian gửi: ${AT}`,
      NOI_DUNG,
      'giữ nguyên cho tới khi có kết quả',
    ])
      expect(pending.text, part).toContain(part);

    const approved = ALL[2]![1]();
    for (const part of [
      'Trạng thái: Đã duyệt',
      `Thời gian duyệt: ${AT}`,
      NOI_DUNG,
    ])
      expect(approved.text, part).toContain(part);

    const rejected = ALL[3]![1]();
    for (const part of [
      'Trạng thái: Từ chối',
      `Thời gian xử lý: ${AT}`,
      NOI_DUNG,
      'Lịch hẹn của bạn được giữ nguyên',
    ])
      expect(rejected.text, part).toContain(part);
  });

  it('bản text và html cùng một bộ chữ: câu của thông báo có ở cả hai', () => {
    for (const [name, build] of BUILDS) {
      const mail = build();
      expect(mail.text, name).toContain(NOI_DUNG);
      expect(mail.html, name).toContain(NOI_DUNG);
    }
  });
});

describe('BDL-04 dữ liệu người nhập có `<script>`, `&`, dấu nháy: html thoát hết, text giữ nguyên', () => {
  it.each(BUILDS)('%s', (_name, build) => {
    const mail = build({
      recipientName: HOSTILE,
      noiDung: `Ghi chú: <img src=x onerror=alert(1)> ${HOSTILE}`,
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
    expect(mail.html).toContain('&amp;');
    expect(mail.html).toContain('&quot;q&quot;');
    expect(mail.html).toContain('&#39;a&#39;');
    // bản text là chữ thuần: giữ nguyên ký tự, KHÔNG thoát HTML
    expect(mail.text).toContain('<script>');
  });

  it('dữ liệu độc hại ở ngữ cảnh lịch mới (mã, bác sĩ, dịch vụ, chi nhánh) của thư LichHenDaDoiLich cũng được thoát', () => {
    const mail = renderRescheduledMail({
      recipientName: NAME,
      noiDung: NOI_DUNG,
      footer: null,
      context: contextOf({
        maLichHen: '<b>ma</b>',
        tenBacSi: '<i>bs</i>',
        dichVu: '<u>dv</u>',
        chiNhanh: '<s>cn</s>',
      }),
    });
    for (const tag of ['<b>', '<i>', '<u>', '<s>'])
      expect(mail.html).not.toContain(tag);
    expect(mail.html).toContain('&lt;b&gt;ma&lt;/b&gt;');
    expect(mail.html).toContain('&lt;s&gt;cn&lt;/s&gt;');
  });

  it('không script, ảnh, liên kết, thẻ style, font hay tài nguyên ngoài', () => {
    const FORBIDDEN =
      /<script|<img|<a[\s>]|<style|<link|<iframe|<form|<button|href\s*=|src\s*=|@import|url\(|@font-face/i;
    for (const [name, build] of BUILDS) {
      const mail = build();
      expect(mail.html, name).not.toMatch(FORBIDDEN);
      expect(mail.html, name).toContain('style="');
    }
  });

  it('xuống dòng và ký tự điều khiển ở tên người nhận và thông báo không tạo được dòng giả', () => {
    for (const [name, build] of BUILDS) {
      const mail = build({
        recipientName: 'An\r\nBcc: ke-xau@example.test',
        noiDung: 'Đã duyệt\nSubject: giả\u0000',
        thoiDiem: '02/11/2026\r\n— 08:00',
      });
      expect(mail.text, name).not.toMatch(/^Bcc:/m);
      expect(mail.text, name).not.toMatch(/^Subject:/m);
      expect(mail.text, name).not.toContain('\u0000');
      expect(mail.text, name).toContain('An Bcc: ke-xau@example.test');
    }
  });

  it('thông báo dài hơn 500 ký tự bị cắt ở 500 (cột `thong_bao.noi_dung`)', () => {
    for (const [name, build] of BUILDS)
      expect(build({ noiDung: 'x'.repeat(600) }).text, name).not.toContain(
        'x'.repeat(501),
      );
  });
});
