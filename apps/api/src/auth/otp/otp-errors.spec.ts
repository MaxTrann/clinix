import { MailSendError } from '../../mail/mail-send.error.js';
import {
  OTP_ERROR_CODES,
  OtpDeliveryError,
  toOtpException,
} from './otp-errors.js';
import type { OtpFailure } from './otp.types.js';

// Task A2. Mã test case: mã lỗi ổn định PLAN 5.4/5.5 (OTP_SAI, OTP_HET_HAN, OTP_HET_LUOT, OTP_BI_THAY_THE, CAN_DANG_KY_LAI, GUI_LAI_QUA_SOM);
// DK-13/DK-15 (chiTiet cho FE đếm ngược 60 giây, DK-46). Trạng thái HTTP là [đề xuất].
describe('toOtpException (OTP-10)', () => {
  it.each<[OtpFailure, number, string]>([
    [{ code: 'OTP_SAI', reason: 'WRONG_CODE' }, 400, 'OTP_SAI'],
    [{ code: 'OTP_HET_HAN', reason: 'EXPIRED' }, 400, 'OTP_HET_HAN'],
    [
      { code: 'OTP_HET_LUOT', reason: 'ATTEMPTS_EXHAUSTED' },
      400,
      'OTP_HET_LUOT',
    ],
    [{ code: 'OTP_BI_THAY_THE', reason: 'REPLACED' }, 409, 'OTP_BI_THAY_THE'],
    [
      { code: 'CAN_DANG_KY_LAI', reason: 'REGISTRATION_VOID' },
      409,
      'CAN_DANG_KY_LAI',
    ],
    [
      { code: 'GUI_LAI_QUA_SOM', reason: 'TOO_SOON', retryAfterSeconds: 42 },
      429,
      'GUI_LAI_QUA_SOM',
    ],
  ])('%j → HTTP %s, maLoi %s', (failure, status, maLoi) => {
    const exception = toOtpException(failure);
    expect(exception.getStatus()).toBe(status);
    expect(exception.maLoi).toBe(maLoi);
    expect(exception.message).toBe(maLoi);
    const body = exception.getResponse() as Record<string, unknown>;
    expect(body.maLoi).toBe(maLoi);
    expect(typeof body.thongBao).toBe('string');
  });

  it('thông báo mặc định theo PLAN 5.5', () => {
    const body = (failure: OtpFailure) =>
      toOtpException(failure).getResponse() as { thongBao: string };
    expect(body({ code: 'OTP_SAI', reason: 'WRONG_CODE' }).thongBao).toBe(
      'Mã OTP không đúng. Vui lòng kiểm tra lại.',
    );
    expect(
      body({
        code: 'GUI_LAI_QUA_SOM',
        reason: 'HOURLY_LIMIT',
        retryAfterSeconds: 5,
      }).thongBao,
    ).toBe('Vui lòng thử lại sau.');
  });

  it('chỉ GUI_LAI_QUA_SOM có chiTiet { soGiayCho }', () => {
    const limited = toOtpException({
      code: 'GUI_LAI_QUA_SOM',
      reason: 'HOURLY_LIMIT',
      retryAfterSeconds: 1234,
    }).getResponse();
    expect(limited).toMatchObject({ chiTiet: { soGiayCho: 1234 } });
    for (const code of [
      'OTP_SAI',
      'OTP_HET_HAN',
      'OTP_HET_LUOT',
      'OTP_BI_THAY_THE',
      'CAN_DANG_KY_LAI',
    ] as const) {
      expect(
        toOtpException({ code, reason: 'WRONG_CODE' }).getResponse(),
      ).not.toHaveProperty('chiTiet');
    }
  });

  it('lý do chi tiết và số lần sai KHÔNG đưa ra HTTP (không lộ trạng thái của hàng)', () => {
    const body = JSON.stringify(
      toOtpException({
        code: 'OTP_SAI',
        reason: 'NOT_SENT',
        wrongAttempts: 3,
      }).getResponse(),
    );
    expect(body).not.toContain('NOT_SENT');
    expect(body).not.toContain('wrongAttempts');
    expect(body).not.toContain('3');
  });

  it('bảng OTP_ERROR_CODES khớp đúng các mã của PLAN 5.5', () => {
    expect(Object.values(OTP_ERROR_CODES).sort()).toEqual(
      [
        'CAN_DANG_KY_LAI',
        'GUI_LAI_QUA_SOM',
        'OTP_BI_THAY_THE',
        'OTP_HET_HAN',
        'OTP_HET_LUOT',
        'OTP_SAI',
      ].sort(),
    );
  });
});

describe('OtpDeliveryError (OTP-11)', () => {
  it('là MailSendError (nơi gọi bắt chung được), giữ kind và mã SMTP, mang maXacThucId của hàng vừa bị thu hồi', () => {
    const error = new OtpDeliveryError(
      new MailSendError('AUTH', { smtpCode: 535 }),
      '99',
    );
    expect(error).toBeInstanceOf(MailSendError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('OtpDeliveryError');
    expect(error.kind).toBe('AUTH');
    expect(error.smtpCode).toBe(535);
    expect(error.maXacThucId).toBe('99');
  });

  it('thông điệp cố định theo kind, không có chữ của máy chủ SMTP, không có lỗi gốc làm cause', () => {
    const error = new OtpDeliveryError(new MailSendError('TIMEOUT'), '5');
    expect(error.message).toBe('Hết thời gian chờ máy chủ SMTP');
    expect(error).not.toHaveProperty('cause');
    expect(error.smtpCode).toBeUndefined();
  });
});
