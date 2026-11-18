import { AppException } from '../../../common/errors/app.exception.js';
import { isErrorCode } from '../../../common/errors/error-codes.js';
import { invalidActivationLink } from '../staff-activation-errors.js';
import { STAFF_ACTIVATION_ERROR_CODES } from '../staff-activation.constants.js';

// Task B16 (admin) — lỗi chung `LIEN_KET_KHONG_HOP_LE` (PLAN admin 5.9; NS-33, NS-35). Mã NSB16-13 là [đề xuất].
describe('invalidActivationLink', () => {
  it('NSB16-13 (NS-35) 400, mã ổn định, chữ ĐÚNG PLAN 5.9, không loi, không chiTiet (không lộ lý do)', () => {
    const error = invalidActivationLink();
    expect(error).toBeInstanceOf(AppException);
    expect(error.getStatus()).toBe(400);
    expect(error.maLoi).toBe('LIEN_KET_KHONG_HOP_LE');
    expect(STAFF_ACTIVATION_ERROR_CODES.LINK_INVALID).toBe(
      'LIEN_KET_KHONG_HOP_LE',
    );
    expect(isErrorCode(error.maLoi)).toBe(true);
    expect(error.getResponse()).toEqual({
      maLoi: 'LIEN_KET_KHONG_HOP_LE',
      thongBao:
        'Liên kết kích hoạt không còn hiệu lực. Vui lòng liên hệ Quản trị viên để được gửi lại.',
    });
  });

  it('NSB16-13 mỗi lần gọi cho thân GIỐNG HỆT nhau (không phụ thuộc trạng thái nào)', () => {
    expect(invalidActivationLink().getResponse()).toEqual(
      invalidActivationLink().getResponse(),
    );
  });
});
