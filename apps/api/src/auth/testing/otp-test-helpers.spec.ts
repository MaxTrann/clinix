import { renderOtpMail } from '../../mail/templates/otp-mail.js';
import { readOtpFromMail } from './otp-test-helpers.js';

// Task A2: công cụ test dùng chung cho A5, A6, A11. Mã nội bộ OTP-12 là [đề xuất].
describe('readOtpFromMail (OTP-12)', () => {
  it('lấy đúng mã từ cả hai mẫu thư', () => {
    const register = renderOtpMail({
      kind: 'register',
      otp: '048213',
      expiresInMinutes: 10,
      fullName: 'Nguyễn Văn A',
    });
    const forgot = renderOtpMail({
      kind: 'forgot-password',
      otp: '999001',
      expiresInMinutes: 10,
      accountEmail: 'a@example.com',
    });
    expect(readOtpFromMail(register)).toBe('048213');
    expect(readOtpFromMail(forgot)).toBe('999001');
  });

  it('ném lỗi khi không có hoặc có nhiều mã, và thông báo lỗi không chứa nội dung thư', () => {
    expect(() => readOtpFromMail({ text: 'không có mã nào' })).toThrow(
      'thấy 0',
    );
    const two = '    111111\n    222222\n';
    expect(() => readOtpFromMail({ text: two })).toThrow('thấy 2');
    try {
      readOtpFromMail({ text: two });
    } catch (error) {
      expect((error as Error).message).not.toContain('111111');
    }
  });
});
