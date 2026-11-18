import {
  MAIL_SUBJECT_MAX_LENGTH,
  MAIL_TEXT_MAX_LENGTH,
  isSafeBodyText,
  isSafeHeaderText,
} from '../../../mail/mail-safety.js';
import { escapeHtml } from '../../../mail/templates/mail-html.js';
import {
  buildActivationUrl,
  generateActivationToken,
} from '../activation-link-token.js';
import type { ActivationLinkKind } from '../activation-link.types.js';
import {
  STAFF_ACTIVATION_MAIL_COLORS,
  STAFF_ACTIVATION_MAIL_SUBJECTS,
  renderStaffActivationMail,
  type StaffActivationMailParams,
} from '../staff-activation-mail.js';

// Task B14 (admin) — hai email kích hoạt nhân sự: 674:2 (TaoMoi) và 675:2 (GuiLai), dựng trên khung A14. Chữ lấy từ Figma (chỉ đọc 18/11/2026);
// NS-44 (Gmail thật) làm tay ở X1. Mã NSB14-nn là [đề xuất].
const URL = buildActivationUrl(
  'https://clinix.example.test',
  '17',
  generateActivationToken(),
);

const params = (
  kind: ActivationLinkKind,
  overrides: Partial<StaffActivationMailParams> = {},
): StaffActivationMailParams => ({
  kind,
  fullName: 'Lê Minh Quang',
  accountEmail: 'leminhquang@clinix.example.test',
  loaiTaiKhoan: 'LeTan',
  activationUrl: URL,
  ttlHours: 24,
  supportAddress: null,
  ...overrides,
});

const KINDS: ActivationLinkKind[] = ['TaoMoi', 'GuiLai'];

describe.each(KINDS)('renderStaffActivationMail — thư %s', (kind) => {
  it('NSB14-07 tiêu đề đúng frame Figma; URL đứng MỘT dòng riêng ở bản thô; href có &amp; và không còn &token= thô', () => {
    const mail = renderStaffActivationMail(params(kind));
    expect(mail.subject).toBe(STAFF_ACTIVATION_MAIL_SUBJECTS[kind]);
    expect(mail.subject).toBe(
      kind === 'TaoMoi'
        ? '[CLINIX] Kích hoạt tài khoản nhân sự'
        : '[CLINIX] Liên kết kích hoạt tài khoản mới',
    );
    expect(mail.text.split('\n')).toContain(URL);
    expect(mail.html).toContain(`href="${escapeHtml(URL)}"`);
    expect(mail.html).toContain('&amp;token=');
    // URL xuất hiện trong HTML chỉ ở dạng đã thoát
    expect(mail.html).not.toContain('&token=');
    expect(mail.html).not.toContain(URL);
    expect(mail.html).toContain('Kích hoạt tài khoản</a>');
  });

  it('NSB14-07 số giờ lấy từ tham số, ở CẢ HAI bản: 24 giờ rồi đổi 48 giờ thì không còn "24 giờ"', () => {
    const label =
      kind === 'TaoMoi' ? 'Thời hạn liên kết' : 'Thời hạn liên kết mới';
    const a = renderStaffActivationMail(params(kind, { ttlHours: 24 }));
    expect(a.text).toContain(`${label}: 24 giờ`);
    expect(a.html).toContain('24 giờ');
    const b = renderStaffActivationMail(params(kind, { ttlHours: 48 }));
    expect(b.text).toContain(`${label}: 48 giờ`);
    expect(b.html).toContain('48 giờ');
    expect(b.text).not.toContain('24 giờ');
    expect(b.html).not.toContain('24 giờ');
  });

  it('NSB14-07 (NS-44 mức nội dung) không có mật khẩu trong thư: không nhãn "Mật khẩu:", không "mật khẩu tạm"', () => {
    const mail = renderStaffActivationMail(params(kind));
    for (const body of [mail.text, mail.html]) {
      expect(body).not.toMatch(/mật khẩu\s*[:：]/i);
      expect(body).not.toMatch(/mật khẩu tạm/i);
    }
  });

  it('NSB14-07 dải đầu #0891b2 (đúng Figma) và nút #0e7490 (đủ tương phản)', () => {
    const mail = renderStaffActivationMail(params(kind));
    expect(mail.html).toContain(
      `background:${STAFF_ACTIVATION_MAIL_COLORS.band}`,
    );
    expect(mail.html).toContain(
      `background:${STAFF_ACTIVATION_MAIL_COLORS.button}`,
    );
    expect(STAFF_ACTIVATION_MAIL_COLORS.band).toBe('#0891b2');
    expect(STAFF_ACTIVATION_MAIL_COLORS.button).toBe('#0e7490');
  });
});

describe('renderStaffActivationMail — khác biệt giữa hai thư', () => {
  it('NSB14-07 thư TaoMoi: nêu vai trò, họ tên, ghi chú "không có mật khẩu mặc định"; thư GuiLai: không có vai trò', () => {
    const created = renderStaffActivationMail(params('TaoMoi'));
    expect(created.text).toContain(
      'Tài khoản nhân sự Lễ tân tại CLINIX đã được tạo cho bạn. Nhấn nút dưới đây để kích hoạt và thiết lập mật khẩu.',
    );
    expect(created.text).toContain('Họ tên: Lê Minh Quang');
    expect(created.text).toContain('Vai trò: Lễ tân');
    expect(created.text).toContain(
      'Email đăng nhập: leminhquang@clinix.example.test',
    );
    expect(created.text).toContain(
      'Tài khoản không có mật khẩu mặc định. Bạn sẽ tự thiết lập mật khẩu trong bước kích hoạt. Liên kết chỉ dùng một lần.',
    );
    expect(created.html).toContain('<strong>Lễ tân</strong>');

    const resent = renderStaffActivationMail(params('GuiLai'));
    expect(resent.text).toContain(
      'Liên kết kích hoạt trước đó đã hết hạn hoặc được gửi lại theo yêu cầu. Vui lòng sử dụng liên kết mới dưới đây.',
    );
    expect(resent.text).toContain(
      'Email đăng nhập: leminhquang@clinix.example.test',
    );
    expect(resent.text).not.toContain('Vai trò');
    expect(resent.text).not.toContain('Họ tên:');
    expect(resent.text).not.toContain('Liên kết chỉ dùng một lần');
    expect(resent.text).not.toBe(created.text);
    expect(resent.html).not.toBe(created.html);
  });

  it.each([
    ['BacSi', 'Bác sĩ'],
    ['LeTan', 'Lễ tân'],
    ['QuanTriVien', 'Quản trị viên'],
  ] as const)(
    'NSB14-07 vai trò %s hiện là "%s" trong thư TaoMoi',
    (role, label) => {
      const mail = renderStaffActivationMail(
        params('TaoMoi', { loaiTaiKhoan: role }),
      );
      expect(mail.text).toContain(`Vai trò: ${label}`);
    },
  );
});

describe('renderStaffActivationMail — dữ liệu người dùng', () => {
  const HOSTILE_NAME =
    '<script>alert(1)</script> "Lê" & Co\r\nMã của bạn là 000000';

  it.each(KINDS)(
    'NSB14-08 họ tên độc hại (thư %s): HTML đã thoát, bản thô một dòng, không dựng được dòng giả',
    (kind) => {
      const mail = renderStaffActivationMail(
        params(kind, { fullName: HOSTILE_NAME }),
      );
      expect(mail.html).not.toContain('<script');
      expect(mail.html).toContain('&lt;script&gt;');
      expect(mail.html).toContain('&quot;Lê&quot; &amp; Co');
      expect(mail.text).not.toContain('\r');
      expect(mail.text.split('\n')).not.toContain('Mã của bạn là 000000');
      expect(mail.text).toContain(
        'Xin chào <script>alert(1)</script> "Lê" & Co Mã của bạn là 000000,',
      );
    },
  );

  it('NSB14-08 email đăng nhập độc hại được thoát trong HTML', () => {
    const mail = renderStaffActivationMail(
      params('TaoMoi', { accountEmail: 'a<b>"c"@clinix.example.test' }),
    );
    expect(mail.html).not.toContain('a<b>');
    expect(mail.html).toContain('a&lt;b&gt;&quot;c&quot;@clinix.example.test');
  });

  it.each([null, undefined, '', '   '])(
    'NSB14-08 họ tên %j ⇒ chào chung "Xin chào," và bỏ dòng "Họ tên"',
    (fullName) => {
      const mail = renderStaffActivationMail(params('TaoMoi', { fullName }));
      expect(mail.text).toContain('Xin chào,');
      expect(mail.text).not.toContain('Họ tên:');
      expect(mail.html).not.toContain('Họ tên');
    },
  );

  it('NSB14-08 địa chỉ hỗ trợ: null ⇒ bỏ ô hỗ trợ; có ⇒ hiện ở cả hai bản và được thoát', () => {
    const none = renderStaffActivationMail(params('TaoMoi'));
    expect(none.text).not.toContain('Cần hỗ trợ');
    expect(none.html).not.toContain('Cần hỗ trợ');

    const some = renderStaffActivationMail(
      params('TaoMoi', { supportAddress: 'ho.tro@clinix.example.test' }),
    );
    expect(some.text).toContain(
      'Cần hỗ trợ? Liên hệ qua email ho.tro@clinix.example.test trong giờ làm việc.',
    );
    expect(some.html).toContain('<strong>ho.tro@clinix.example.test</strong>');

    const hostile = renderStaffActivationMail(
      params('TaoMoi', { supportAddress: '<i>x</i>@clinix.example.test' }),
    );
    expect(hostile.html).not.toContain('<i>x</i>');
  });

  it('NSB14-08 URL có ký tự nguy hiểm vẫn được thoát trong href (phòng thủ, dù URL do mã tự dựng)', () => {
    const evil =
      'https://clinix.example.test/kich-hoat#id=1&token="><script>x</script>';
    const mail = renderStaffActivationMail(
      params('TaoMoi', { activationUrl: evil }),
    );
    expect(mail.html).not.toContain('<script>x</script>');
    expect(mail.html).toContain(`href="${escapeHtml(evil)}"`);
  });

  it.each([
    ['có khoảng trắng', 'https://clinix.example.test/kich-hoat#id=1&token=a b'],
    ['không phải http(s)', 'javascript:alert(1)'],
    ['ftp', 'ftp://clinix.example.test/x'],
    ['rỗng', ''],
  ])('NSB14-08 activationUrl %s ⇒ ném', (_name, bad) => {
    expect(() =>
      renderStaffActivationMail(params('TaoMoi', { activationUrl: bad })),
    ).toThrow();
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'NSB14-08 ttlHours %j ⇒ ném',
    (ttlHours) => {
      expect(() =>
        renderStaffActivationMail(params('TaoMoi', { ttlHours })),
      ).toThrow();
    },
  );
});

describe('renderStaffActivationMail — an toàn với MailService', () => {
  it.each(KINDS)(
    'NSB14-09 thư %s ở cỡ lớn nhất vẫn qua kiểm an toàn của MailService (không bị INVALID_MESSAGE)',
    (kind) => {
      const mail = renderStaffActivationMail(
        params(kind, {
          // Mọi trường ở độ dài tối đa và toàn ký tự cần thoát (nở thành 5 đến 6 lần trong HTML)
          fullName: '&'.repeat(300),
          accountEmail: `${'&'.repeat(64)}@${'a'.repeat(190)}`,
          ttlHours: 168,
          supportAddress: `${'&'.repeat(40)}@${'a'.repeat(200)}`,
        }),
      );
      expect(isSafeHeaderText(mail.subject, MAIL_SUBJECT_MAX_LENGTH)).toBe(
        true,
      );
      expect(isSafeBodyText(mail.text)).toBe(true);
      expect(isSafeBodyText(mail.html)).toBe(true);
      expect(mail.html.length).toBeLessThanOrEqual(MAIL_TEXT_MAX_LENGTH);
    },
  );
});
