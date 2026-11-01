import {
  readOtpFromHtml,
  visibleMailText,
} from '../../auth/testing/otp-test-helpers.js';
import { MAIL_TEXT_MAX_LENGTH, isSafeBodyText } from '../mail-safety.js';
import { MAIL_COLORS, escapeHtml } from './mail-html.js';
import {
  OTP_MAIL_SUBJECTS,
  OTP_NOTICE_COLORS,
  OTP_THEMES,
  renderOtpMail,
  type OtpMailParams,
} from './otp-mail.js';

// Task A14. Truy vết ĐK b6, QMK b5, G2, G3, G4, N8. Mã MAIL-H01… là [đề xuất]. DK-47, QM-23 (gửi Gmail thật, xem bằng mắt) chờ X1.
const OTP = '482913';
const NASTY = `<script>alert("x")</script> & 'y'`;
const NASTY_ESCAPED =
  '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;';

const register = (over: Partial<OtpMailParams> = {}) =>
  renderOtpMail({
    kind: 'register',
    otp: OTP,
    expiresInMinutes: 10,
    fullName: 'Nguyễn Văn A',
    supportAddress: 'hotro@example.test',
    ...over,
  } as OtpMailParams);
const forgot = (over: Partial<OtpMailParams> = {}) =>
  renderOtpMail({
    kind: 'forgot-password',
    otp: OTP,
    expiresInMinutes: 10,
    fullName: 'Trần Thị B',
    accountEmail: 'tran.b@example.test',
    supportAddress: 'hotro@example.test',
    ...over,
  } as OtpMailParams);
const BOTH = [
  ['đăng ký', register],
  ['quên mật khẩu', forgot],
] as const;

describe('escapeHtml (MAIL-H01)', () => {
  it('thoát đủ năm ký tự, & trước tiên nên không thoát hai lần', () => {
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
    expect(escapeHtml('Nguyễn Văn A')).toBe('Nguyễn Văn A');
  });
});

describe('Dữ liệu người dùng được thoát ở bản HTML (MAIL-H02)', () => {
  it('họ tên', () => {
    const { html } = register({ fullName: NASTY });
    expect(html).toContain(`Xin chào <strong>${NASTY_ESCAPED}</strong>,`);
    expect(html).not.toContain('<script');
  });

  it('email tài khoản', () => {
    const { html } = forgot({ accountEmail: NASTY });
    expect(html).toContain(`tài khoản <strong>${NASTY_ESCAPED}</strong>.`);
    expect(html).not.toContain('<script');
  });

  it('địa chỉ hỗ trợ', () => {
    const { html } = register({ supportAddress: NASTY });
    expect(html).toContain(`email <strong>${NASTY_ESCAPED}</strong> trong`);
    expect(html).not.toContain('<script');
  });

  it('bản text giữ nguyên chữ người dùng, không thoát (không in &amp; cho người đọc)', () => {
    expect(register({ fullName: 'A & B' }).text).toContain('Xin chào A & B,');
  });

  it('xuống dòng trong dữ liệu được đưa về một dòng ở cả ba trường', () => {
    const { html } = forgot({
      fullName: 'An\r\nBình',
      accountEmail: 'a@x.test\nb',
      supportAddress: 'h@x.test\r\nBcc: e@x.test',
    });
    expect(html).toContain('<strong>An Bình</strong>');
    expect(html).toContain('<strong>a@x.test b</strong>');
    expect(html).toContain('<strong>h@x.test Bcc: e@x.test</strong>');
    expect(html).not.toMatch(/[\r\n]/);
  });

  it('cắt 100 ký tự TRƯỚC khi thoát nên không đứt thực thể', () => {
    const { html } = register({ fullName: `${'A'.repeat(99)}&BCD` });
    expect(html).toContain(`<strong>${'A'.repeat(99)}&amp;</strong>`);
  });
});

describe.each(BOTH)(
  'Bản HTML mẫu %s không có gì ngoài ý muốn (MAIL-H03)',
  (_n, render) => {
    it('không tải tài nguyên ngoài, không script, không liên kết, không thẻ style', () => {
      const { html } = render();
      expect(html).toMatch(/^<!doctype html>/);
      expect(html).not.toMatch(
        /https?:|mailto:|\/\/|<img|<script|<style|<link|<a\s|href=|src=|url\(|@import/i,
      );
    });

    it('không in "undefined" hay "null" và không có ô hỗ trợ khi thiếu họ tên và địa chỉ hỗ trợ', () => {
      for (const over of [
        { fullName: undefined, supportAddress: undefined },
        { fullName: null, supportAddress: null },
        { fullName: '   ', supportAddress: '' },
      ]) {
        const { html, text } = render(over);
        expect(html).not.toMatch(/undefined|null/);
        expect(html).toContain('Xin chào,');
        expect(html).not.toContain('hỗ trợ');
        expect(text).not.toContain('hỗ trợ');
      }
    });

    it('không còn các chữ Figma sai (G2, G3, G4)', () => {
      for (const { html, text } of [render()]) {
        for (const body of [html, text]) {
          expect(body).not.toMatch(
            /hotline|\[cần điền|\[đề xuất|Dữ liệu minh họa|Xem trước|CLINIX Clinic|1900|5 phút/i,
          );
        }
      }
    });

    it('trường hợp dài nhất sau khi thoát vẫn lọt trần nội dung thư', () => {
      const { html } = render({
        fullName: '"'.repeat(500),
        accountEmail: '"'.repeat(500),
        supportAddress: '"'.repeat(500),
      } as Partial<OtpMailParams>);
      expect(html.length).toBeLessThanOrEqual(MAIL_TEXT_MAX_LENGTH);
      expect(isSafeBodyText(html)).toBe(true);
    });
  },
);

describe('Mã OTP và số phút ở bản HTML (MAIL-H04, G2)', () => {
  it.each(BOTH)(
    'mẫu %s: đúng MỘT chuỗi 6 số liền, ở cả text và html',
    (_n, render) => {
      const { html, text } = render();
      expect(readOtpFromHtml({ html })).toBe(OTP);
      expect(html).toContain(`>${OTP}</div>`);
      expect(html).toContain('letter-spacing:10px');
      expect(text.match(/\d{6}/g)).toEqual([OTP]);
    },
  );

  it('màu #111827 và thực thể &#39; không bị đếm nhầm là mã; chính chúng có mặt trong html', () => {
    const { html } = register({ fullName: `O'Neil` });
    expect(html).toContain('#111827');
    expect(html).toContain('&#39;');
    expect(readOtpFromHtml({ html })).toBe(OTP);
  });

  it('ĐỐI CHỨNG: html có hai mã thì helper báo lỗi, không lấy đại', () => {
    const { html } = register();
    expect(() => readOtpFromHtml({ html: `${html}<p>000000</p>` })).toThrow();
    expect(() => readOtpFromHtml({})).toThrow();
  });

  it.each([5, 10, 15])(
    'hiệu lực %s phút đúng như tham số ở cả hai mẫu',
    (minutes) => {
      for (const [, render] of BOTH) {
        const { html } = render({ expiresInMinutes: minutes });
        expect(html).toContain(
          `Mã có hiệu lực trong <strong>${String(minutes)} phút</strong>`,
        );
        if (minutes !== 10) expect(html).not.toContain('10 phút');
      }
    },
  );
});

describe('Chữ theo Figma, đúng ở cả hai bản (MAIL-H05)', () => {
  const register_ = register();
  const forgot_ = forgot();
  const inBoth = (mail: { text: string; html: string }, sentence: string) => {
    expect(mail.text).toContain(sentence);
    expect(visibleMailText(mail.html)).toContain(sentence);
  };

  it.each([
    'Xác minh địa chỉ email',
    'Xin chào Nguyễn Văn A,',
    'Cảm ơn bạn đã đăng ký tài khoản tại CLINIX. Vui lòng nhập mã OTP dưới đây để xác minh email và kích hoạt tài khoản.',
    'Mã có hiệu lực trong 10 phút',
    'Nhập mã trên vào ô xác minh trong ứng dụng để hoàn tất đăng ký.',
    'Nếu bạn không thực hiện đăng ký, vui lòng bỏ qua email này.',
    'Cần hỗ trợ? Liên hệ qua email hotro@example.test trong giờ làm việc.',
    'Email này được gửi tự động. Vui lòng không trả lời trực tiếp email này.',
  ])('đăng ký: %s', (sentence) => {
    inBoth(register_, sentence);
  });

  it.each([
    'Đặt lại mật khẩu',
    'Xin chào Trần Thị B,',
    'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản tran.b@example.test. Vui lòng nhập mã OTP dưới đây để tiếp tục.',
    'Mã có hiệu lực trong 10 phút',
    'Nếu bạn không yêu cầu đặt lại mật khẩu, tài khoản vẫn an toàn. Không chia sẻ mã này với bất kỳ ai.',
    'Cần hỗ trợ? Liên hệ qua email hotro@example.test trong giờ làm việc.',
    'Email này được gửi tự động. Vui lòng không trả lời trực tiếp email này.',
  ])('quên mật khẩu: %s', (sentence) => {
    inBoth(forgot_, sentence);
  });

  it('nhãn khung mã và ký tự ⏱ chỉ ở HTML; bản text không có ⏱', () => {
    for (const mail of [register_, forgot_]) {
      expect(mail.html).toContain('Mã xác minh OTP');
      expect(mail.html).toContain('⏱');
      expect(mail.text).not.toContain('⏱');
    }
  });

  it('mẫu đăng ký không có chữ của mẫu quên mật khẩu, và ngược lại', () => {
    expect(register_.html).not.toContain('Đặt lại mật khẩu');
    expect(forgot_.html).not.toContain('Cảm ơn bạn');
  });

  it('tiêu đề không đổi và bản HTML không tự thêm chữ vào tiêu đề', () => {
    expect(register_.subject).toBe(OTP_MAIL_SUBJECTS.register);
    expect(forgot_.subject).toBe(OTP_MAIL_SUBJECTS['forgot-password']);
  });
});

describe('Màu dải đầu và độ tương phản (MAIL-H06)', () => {
  it('đúng hai màu Figma', () => {
    expect(register().html).toContain('background:#3B82F6');
    expect(forgot().html).toContain('background:#8B5CF6');
  });

  const luminance = (hex: string): number => {
    const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
      const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string): number => {
    const [high = 0, low = 0] = [luminance(a), luminance(b)].sort(
      (x, y) => y - x,
    );
    return (high + 0.05) / (low + 0.05);
  };
  const { white, heading, body, muted } = MAIL_COLORS;
  const notice = OTP_NOTICE_COLORS;
  // 3:1 chỉ cho "CLINIX" 20px đậm (chữ lớn theo WCAG), còn lại 4,5:1
  it.each([
    ['dải xanh', white, OTP_THEMES.register.band, 3],
    ['dải tím', white, OTP_THEMES['forgot-password'].band, 3],
    ['nhãn xanh', OTP_THEMES.register.label, OTP_THEMES.register.panel, 4.5],
    ['mã xanh', OTP_THEMES.register.code, OTP_THEMES.register.panel, 4.5],
    [
      'nhãn tím',
      OTP_THEMES['forgot-password'].label,
      OTP_THEMES['forgot-password'].panel,
      4.5,
    ],
    [
      'mã tím',
      OTP_THEMES['forgot-password'].code,
      OTP_THEMES['forgot-password'].panel,
      4.5,
    ],
    ['huy hiệu', notice.badgeText, notice.badgeBackground, 4.5],
    ['cảnh báo', notice.warningText, notice.warningBackground, 4.5],
    ['tiêu đề', heading, white, 4.5],
    ['thân thư', body, white, 4.5],
    ['chữ phụ', muted, white, 4.5],
    ['chân thư', muted, MAIL_COLORS.footerBackground, 4.5],
    ['ô hỗ trợ', MAIL_COLORS.supportText, MAIL_COLORS.supportBackground, 4.5],
  ])('%s đạt ngưỡng', (_name, text, background, minimum) => {
    expect(contrast(text, background)).toBeGreaterThanOrEqual(minimum);
  });

  it('"CLINIX" trên dải đầu là chữ 20px đậm: điều kiện để dùng ngưỡng 3:1', () => {
    expect(register().html).toMatch(/font-size:20px;font-weight:800">CLINIX</);
  });
});
