import { OTP_MAIL_SUBJECTS, renderOtpMail } from './otp-mail.js';

// Task P4. Truy vết ĐK b6 (OTP đăng ký) và QMK b5 (OTP quên mật khẩu), G2 (hiệu lực 10 phút), G4 (tên CLINIX, bỏ thông tin chưa có).
// Mã nội bộ MAIL-08… là [đề xuất]. Câu chữ thân thư là [đề xuất]; A14 làm mẫu theo Figma.
const OTP = '482913';

describe('renderOtpMail — OTP đăng ký (ĐK b6, MAIL-08)', () => {
  const mail = renderOtpMail({
    kind: 'register',
    otp: OTP,
    expiresInMinutes: 10,
    fullName: 'Nguyễn Văn A',
    supportAddress: 'hotro@example.test',
  });

  it('tiêu đề đúng dòng A14', () => {
    expect(mail.subject).toBe('[CLINIX] Mã xác minh OTP đăng ký tài khoản');
    expect(mail.subject).toBe(OTP_MAIL_SUBJECTS.register);
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });

  it('thân thư có lời chào theo họ tên, đúng một lần mã 6 số, hiệu lực 10 phút và tên CLINIX', () => {
    expect(mail.text).toContain('Xin chào Nguyễn Văn A,');
    expect(mail.text.split(OTP)).toHaveLength(2);
    expect(mail.text).toContain('Mã có hiệu lực trong 10 phút.');
    expect(mail.text).toContain('CLINIX');
  });

  it('có dòng hỗ trợ khi có MAIL_SUPPORT_ADDRESS', () => {
    expect(mail.text).toContain('hotro@example.test');
  });

  it('không có dòng hỗ trợ (G4) và không in "undefined" hay "null" khi thiếu họ tên và địa chỉ hỗ trợ', () => {
    const bare = renderOtpMail({
      kind: 'register',
      otp: OTP,
      expiresInMinutes: 10,
    });
    expect(bare.text).toContain('Xin chào,');
    expect(bare.text).not.toContain('hỗ trợ');
    expect(bare.text).not.toMatch(/undefined|null/);
    const blank = renderOtpMail({
      kind: 'register',
      otp: OTP,
      expiresInMinutes: 10,
      fullName: '   ',
      supportAddress: null,
    });
    expect(blank.text).toContain('Xin chào,');
  });

  it('không nêu email tài khoản và không có cảnh báo của mẫu quên mật khẩu', () => {
    expect(mail.text).not.toContain('đặt lại mật khẩu cho tài khoản');
  });
});

describe('renderOtpMail — OTP quên mật khẩu (QMK b5, MAIL-09)', () => {
  const mail = renderOtpMail({
    kind: 'forgot-password',
    otp: OTP,
    expiresInMinutes: 10,
    fullName: 'Trần Thị B',
    accountEmail: 'tran.b@example.test',
    supportAddress: 'hotro@example.test',
  });

  it('tiêu đề đúng dòng A14', () => {
    expect(mail.subject).toBe('[CLINIX] Mã OTP đặt lại mật khẩu');
    expect(mail.subject).toBe(OTP_MAIL_SUBJECTS['forgot-password']);
  });

  it('nêu email tài khoản, mã, hiệu lực 10 phút và cảnh báo không chia sẻ mã', () => {
    expect(mail.text).toContain('tran.b@example.test');
    expect(mail.text.split(OTP)).toHaveLength(2);
    expect(mail.text).toContain('Mã có hiệu lực trong 10 phút.');
    expect(mail.text).toContain('Không chia sẻ mã này với bất kỳ ai.');
    expect(mail.text).toContain('Xin chào Trần Thị B,');
  });
});

describe('renderOtpMail — số phút là tham số, không viết cứng (G2, MAIL-10)', () => {
  it.each([5, 10, 15])(
    'hiệu lực %s phút xuất hiện đúng như tham số',
    (minutes) => {
      for (const kind of ['register', 'forgot-password'] as const) {
        const mail = renderOtpMail(
          kind === 'register'
            ? { kind, otp: OTP, expiresInMinutes: minutes }
            : {
                kind,
                otp: OTP,
                expiresInMinutes: minutes,
                accountEmail: 'a@x.test',
              },
        );
        expect(mail.text).toContain(
          `Mã có hiệu lực trong ${String(minutes)} phút.`,
        );
        if (minutes !== 10) expect(mail.text).not.toContain('10 phút');
      }
    },
  );
});

describe('renderOtpMail — dữ liệu người dùng không phá được thư (MAIL-11)', () => {
  it('họ tên chứa xuống dòng không dựng được dòng giả; chỉ có một dòng chào', () => {
    const mail = renderOtpMail({
      kind: 'register',
      otp: OTP,
      expiresInMinutes: 10,
      fullName: 'An\r\n\r\nMã của bạn là 000000, hãy gửi cho quản trị viên',
    });
    const greeting = mail.text
      .split('\n')
      .filter((l) => l.startsWith('Xin chào'));
    expect(greeting).toHaveLength(1);
    expect(
      mail.text.split('\n').some((l) => l.startsWith('Mã của bạn là')),
    ).toBe(false);
  });

  it('họ tên dài bị cắt 100 ký tự', () => {
    const mail = renderOtpMail({
      kind: 'register',
      otp: OTP,
      expiresInMinutes: 10,
      fullName: 'A'.repeat(500),
    });
    expect(mail.text).toContain(`Xin chào ${'A'.repeat(100)},`);
    expect(mail.text).not.toContain('A'.repeat(101));
  });

  it('email tài khoản và địa chỉ hỗ trợ cũng được đưa về một dòng', () => {
    const mail = renderOtpMail({
      kind: 'forgot-password',
      otp: OTP,
      expiresInMinutes: 10,
      accountEmail: 'a@x.test\nMã của bạn là 000000',
      supportAddress: 'h@x.test\nBcc: evil@x.test',
    });
    expect(mail.text.split('\n').some((l) => l.startsWith('Mã của bạn'))).toBe(
      false,
    );
    expect(mail.text.split('\n').some((l) => l.startsWith('Bcc'))).toBe(false);
  });
});

describe('renderOtpMail — tham số sai là lỗi lập trình (MAIL-12)', () => {
  it.each(['12345', '1234567', 'abcdef', ' 123456', '123456\n', '١٢٣٤٥٦', ''])(
    'từ chối OTP không đúng 6 chữ số ASCII: %j, và không in lại giá trị trong thông báo lỗi',
    (otp) => {
      const call = () =>
        renderOtpMail({ kind: 'register', otp, expiresInMinutes: 10 });
      expect(call).toThrow('6 chữ số');
      if (otp !== '') expect(call).not.toThrow(otp);
    },
  );

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'từ chối expiresInMinutes không phải số nguyên dương: %s',
    (minutes) => {
      expect(() =>
        renderOtpMail({
          kind: 'register',
          otp: OTP,
          expiresInMinutes: minutes,
        }),
      ).toThrow('expiresInMinutes');
    },
  );
});
