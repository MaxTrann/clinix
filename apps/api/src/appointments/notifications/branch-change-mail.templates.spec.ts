import { BRANCH_CHANGE_MAIL_TYPES } from '../../notification/branch-change-events.js';
import {
  BRANCH_CHANGE_SUBJECTS,
  renderBranchChangeAffectedMail,
  renderBranchChangeCancelledMail,
  renderBranchChangeRescheduledMail,
  renderBranchChangeResultMail,
  type BranchChangeMailCommon,
} from './branch-change-mail.templates.js';
import { baseEventOf } from './email-outbox.service.js';
import { BRANCH_CHANGE_MAIL_EVENTS } from './notifications.constants.js';

// Admin C4 — bốn mẫu thư của yêu cầu thay đổi chi nhánh (chữ [đề xuất], đối chiếu Figma 689:2, 690:2 trước khi merge): NTB-04 (tiêu đề, text và html cùng chữ, thoát HTML, không liên kết hay script),
// NTB-06 (hằng viết bằng chữ của booking khớp `notification/`). Đơn vị, không DB.

const COMMON: BranchChangeMailCommon = {
  recipientName: 'Nguyễn Văn A',
  noiDung: 'Lịch hẹn bị ảnh hưởng: LH00000001, LH00000002.',
  thoiDiem: '02/11/2026 — 08:00',
  context: {
    tenChiNhanh: 'Chi nhánh Quận 1',
    diaChiChiNhanh: '1 Lê Lợi, Quận 1',
    hieuLucTu: '10/11/2026 — 00:00',
  },
  footer: null,
};

const RENDERERS = [
  [
    'kết quả (689:2)',
    renderBranchChangeResultMail,
    BRANCH_CHANGE_SUBJECTS.result,
  ],
  [
    'ảnh hưởng (690:2)',
    renderBranchChangeAffectedMail,
    BRANCH_CHANGE_SUBJECTS.affected,
  ],
  [
    'dời hiệu lực',
    renderBranchChangeRescheduledMail,
    BRANCH_CHANGE_SUBJECTS.rescheduled,
  ],
  ['hủy', renderBranchChangeCancelledMail, BRANCH_CHANGE_SUBJECTS.cancelled],
] as const;

describe('NTB-06 hằng của booking khớp mã có thư của notification/', () => {
  it('đúng bốn loại, đúng chữ', () => {
    expect(Object.values(BRANCH_CHANGE_MAIL_EVENTS).sort()).toEqual(
      [...BRANCH_CHANGE_MAIL_TYPES].sort(),
    );
  });

  it('baseEventOf bỏ hậu tố phiên bản; mã không có `:` giữ nguyên', () => {
    expect(baseEventOf('ThayDoiChiNhanhAnhHuongLichHen:v3')).toBe(
      'ThayDoiChiNhanhAnhHuongLichHen',
    );
    expect(baseEventOf('KetQuaYeuCauThayDoiChiNhanh')).toBe(
      'KetQuaYeuCauThayDoiChiNhanh',
    );
    expect(baseEventOf('')).toBe('');
  });
});

describe('NTB-04 bốn mẫu: tiêu đề một dòng, text và html cùng bộ chữ', () => {
  it.each(RENDERERS)('%s', (_name, render, subject) => {
    const mail = render(COMMON);
    expect(mail.subject).toBe(subject);
    expect(mail.subject).not.toMatch(/[\r\n]/);
    for (const part of [mail.text, mail.html]) {
      expect(part).toContain('Nguyễn Văn A');
      expect(part).toContain('Chi nhánh Quận 1');
      expect(part).toContain('LH00000001, LH00000002');
    }
  });

  it('thư ảnh hưởng và thư dời có địa chỉ và thời điểm hiệu lực; thiếu hiệu lực thì in "Đang cập nhật"', () => {
    for (const render of [
      renderBranchChangeAffectedMail,
      renderBranchChangeRescheduledMail,
    ]) {
      const mail = render(COMMON);
      expect(mail.text).toContain('Có hiệu lực từ: 10/11/2026 — 00:00');
      expect(mail.text).toContain('Địa chỉ: 1 Lê Lợi, Quận 1');
      const missing = render({
        ...COMMON,
        context: { ...COMMON.context, hieuLucTu: null },
      });
      expect(missing.text).toContain('Có hiệu lực từ: Đang cập nhật');
    }
  });

  it('thư kết quả không tự in "Đã duyệt" hay "Từ chối" (kết quả nằm trong câu của thông báo)', () => {
    const mail = renderBranchChangeResultMail(COMMON);
    expect(mail.text).not.toMatch(/Đã duyệt|Từ chối/);
  });
});

describe('NTB-04 dữ liệu độc hại bị thoát; không script, liên kết, ảnh', () => {
  const evil = '<script>alert(1)</script><a href="http://x">x</a>';
  it.each(RENDERERS)('%s', (_name, render) => {
    const mail = render({
      ...COMMON,
      recipientName: evil,
      noiDung: evil,
      context: {
        tenChiNhanh: evil,
        diaChiChiNhanh: evil,
        hieuLucTu: evil,
      },
    });
    // Chỉ bắt thẻ THẬT: bản đã thoát (`&lt;a href=&quot;…`) vẫn chứa chữ "href=" nên không so chữ đó
    expect(mail.html).not.toMatch(/<script|<a[\s>]|<img|href="/i);
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('xuống dòng trong dữ liệu không tạo được dòng giả; nội dung cắt ở 500 ký tự', () => {
    const mail = renderBranchChangeAffectedMail({
      ...COMMON,
      recipientName: 'A\r\nTiêu đề giả: x',
      noiDung: `Đầu\n${'z'.repeat(700)}`,
    });
    expect(mail.text).toContain('Xin chào A Tiêu đề giả: x,');
    const longest = Math.max(...mail.text.split('\n').map((l) => l.length));
    expect(longest).toBeLessThanOrEqual(500);
  });
});
