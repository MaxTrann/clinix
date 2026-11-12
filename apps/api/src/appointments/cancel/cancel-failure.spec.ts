import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { TRANG_THAI_LICH_HEN } from '../../admin/entities/enums.js';
import { ParseAppointmentCodePipe } from '../appointment-code.pipe.js';
import { BOOKING_ERRORS } from '../appointments.constants.js';
import { cancelOutcomeException } from './cancel-failure.js';

// Task B10 — CNL-02: ánh xạ kết quả huỷ KHÔNG thành công sang lỗi API, dùng chung cho B10, B12, B14 (PLAN 7.29 `[đề xuất]`; TRACKING 3.23 B10-G). Không DB.
describe('CNL-02 cancelOutcomeException', () => {
  it('NotFound ⇒ 404 KHONG_TIM_THAY, CÙNG thân với mã sai dạng do pipe ném (không phân biệt được "của người khác", "không tồn tại", "sai dạng", HL-05, QB-01)', () => {
    const fromOutcome = cancelOutcomeException({ kind: 'NotFound' });
    let fromPipe: unknown;
    try {
      new ParseAppointmentCodePipe().transform('sai dang');
    } catch (error) {
      fromPipe = error;
    }
    expect(fromOutcome).toBeInstanceOf(AppException);
    expect(fromOutcome.getStatus()).toBe(404);
    expect(fromOutcome.maLoi).toBe(COMMON_ERROR_CODES.NOT_FOUND);
    expect(fromOutcome.getResponse()).toEqual(
      (fromPipe as AppException).getResponse(),
    );
  });

  it('AlreadyCancelled ⇒ 409 LICH_HEN_KHONG_CHO_HUY kèm chiTiet.trangThai = DaHuy (lần bấm thứ hai, HL-06)', () => {
    const error = cancelOutcomeException({ kind: 'AlreadyCancelled' });
    expect(error.getStatus()).toBe(409);
    expect(error.maLoi).toBe('LICH_HEN_KHONG_CHO_HUY');
    expect(error.getResponse()).toMatchObject({
      maLoi: 'LICH_HEN_KHONG_CHO_HUY',
      thongBao: BOOKING_ERRORS.LICH_HEN_KHONG_CHO_HUY.thongBao,
      chiTiet: { trangThai: 'DaHuy' },
    });
  });

  it.each(TRANG_THAI_LICH_HEN)(
    'NotCancellable %s ⇒ 409 LICH_HEN_KHONG_CHO_HUY kèm chiTiet.trangThai đúng trạng thái đó (HL-03)',
    (trangThai) => {
      const error = cancelOutcomeException({
        kind: 'NotCancellable',
        trangThai,
      });
      expect(error.getStatus()).toBe(409);
      expect(error.maLoi).toBe('LICH_HEN_KHONG_CHO_HUY');
      expect(error.getResponse()).toMatchObject({ chiTiet: { trangThai } });
    },
  );

  it('chiTiet chỉ có trangThai (không mã lịch hẹn, không id)', () => {
    const error = cancelOutcomeException({
      kind: 'NotCancellable',
      trangThai: 'DaTiepDon',
    });
    expect((error.getResponse() as { chiTiet: unknown }).chiTiet).toStrictEqual(
      { trangThai: 'DaTiepDon' },
    );
  });
});
