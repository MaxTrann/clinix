import { vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import { MailSendError } from '../../mail/mail-send.error.js';
import { IssuedOtp } from '../otp/issued-otp.js';
import { OtpDeliveryError } from '../otp/otp-errors.js';
import type { OtpService } from '../otp/otp.service.js';
import type { Recipient } from '../otp/otp.types.js';
import { deliverRegistrationOtp } from './register-delivery.js';

// Task A6 — hàm gửi thư DÙNG CHUNG cho POST /auth/register (A5) và /resend-otp (A6), tách từ RegisterService.deliver.
// Test case: DK-25 (503 GUI_MAIL_LOI khi đăng ký), DK-48 (503 kèm id hàng lỗi để gửi lại). Hành vi phải GIỮ NGUYÊN so với A5.
const HET_HAN = new Date('2026-11-02T01:10:00.000Z');
const CO_THE_GUI_LAI = '2026-11-02T01:01:00.000Z'; // hết hạn − 10 phút + 60 giây
const RECIPIENT = { email: 'nguoi.dung@example.com', fullName: 'Nguyễn Văn A' };

const issued = () =>
  new IssuedOtp(
    {
      maXacThucId: '77',
      taiKhoanId: '5',
      loai: 'DangKy',
      hetHanLuc: HET_HAN,
    },
    '123456',
  );
const otpWith = (deliver: () => Promise<void>) =>
  ({ deliver }) as unknown as OtpService;

describe('deliverRegistrationOtp', () => {
  it('DK-01 gửi được → { maXacThucId, hetHanLuc, coTheGuiLaiLuc }, thư đi tới đúng người nhận', async () => {
    const deliver = vi.fn((_issued: IssuedOtp, _recipient: Recipient) =>
      Promise.resolve(),
    );
    const warn = vi.fn();

    const result = await deliverRegistrationOtp(
      { deliver } as unknown as OtpService,
      { warn },
      issued(),
      RECIPIENT,
    );

    expect(result).toEqual({
      maXacThucId: '77',
      hetHanLuc: HET_HAN,
      coTheGuiLaiLuc: new Date(CO_THE_GUI_LAI),
    });
    expect(deliver).toHaveBeenCalledOnce();
    expect(deliver.mock.calls[0]?.[1]).toBe(RECIPIENT);
    expect(warn).not.toHaveBeenCalled();
  });

  it('DK-25, DK-48 lỗi gửi thư → 503 GUI_MAIL_LOI kèm chiTiet { maXacThucId của hàng lỗi, coTheGuiLaiLuc }; giữ nguyên nguyên nhân; chỉ ghi cảnh báo', async () => {
    const delivery = new OtpDeliveryError(new MailSendError('AUTH'), '77');
    const warn = vi.fn();

    const thrown = await deliverRegistrationOtp(
      otpWith(() => Promise.reject(delivery)),
      { warn },
      issued(),
      RECIPIENT,
    ).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(AppException);
    const error = thrown as AppException;
    expect(error.getStatus()).toBe(503);
    expect(error.maLoi).toBe('GUI_MAIL_LOI');
    expect(error.getResponse()).toEqual({
      maLoi: 'GUI_MAIL_LOI',
      thongBao: 'Không gửi được email. Vui lòng thử lại sau ít phút.',
      chiTiet: { maXacThucId: '77', coTheGuiLaiLuc: CO_THE_GUI_LAI },
    });
    expect(error.cause).toBe(delivery);
    expect(warn).toHaveBeenCalledOnce();
    // Log và phản hồi cố ý KHÔNG nêu loại lỗi SMTP ra phía người dùng; log nội bộ có loại để vận hành
    expect(JSON.stringify(error.getResponse())).not.toMatch(/AUTH|smtp/i);
    expect(String(warn.mock.calls[0]?.[0])).toBe(
      'Gửi OTP đăng ký lỗi (AUTH): tài khoản vẫn giữ, mã xác thực 77 đã bị thu hồi',
    );
  });

  it('lỗi KHÔNG phải lỗi gửi thư (lỗi lập trình) → ném lại nguyên vẹn, không bọc thành 503', async () => {
    const bug = new Error('lỗi lạ');
    const warn = vi.fn();

    await expect(
      deliverRegistrationOtp(
        otpWith(() => Promise.reject(bug)),
        { warn },
        issued(),
        RECIPIENT,
      ),
    ).rejects.toBe(bug);
    expect(warn).not.toHaveBeenCalled();
  });
});
