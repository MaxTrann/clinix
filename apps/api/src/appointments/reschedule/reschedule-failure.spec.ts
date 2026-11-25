import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { PATIENT_ERROR_CODES } from '../../patient/patient.constants.js';
import {
  BOOKING_ERROR_CODES,
  BOOKING_ERRORS,
  type BookingErrorCode,
} from '../appointments.constants.js';
import { rescheduleFailureException } from './reschedule-failure.js';
import type { RescheduleFailure } from './reschedule.types.js';

// reschedule B4 — HDL-19 `[đề xuất]`: MỘT ánh xạ từ lỗi của bộ luật đổi lịch sang `AppException` (B6, B7, B9 dùng chung): đủ bốn nhánh, đúng HTTP theo `BOOKING_ERRORS`, `chiTiet` đi qua nguyên vẹn.
const bodyOf = (error: AppException) =>
  error.getResponse() as { maLoi: string; thongBao: string; chiTiet?: unknown };

// Chín mã đổi lịch của B2 (PLAN 5.13) và đại diện của các mã dùng lại của đặt lịch
const RESCHEDULE_CODES: readonly BookingErrorCode[] = [
  BOOKING_ERROR_CODES.NOT_RESCHEDULABLE,
  BOOKING_ERROR_CODES.RESCHEDULE_TOO_LATE,
  BOOKING_ERROR_CODES.SAME_AS_CURRENT_SLOT,
  BOOKING_ERROR_CODES.OTHER_DOCTOR_SLOT,
  BOOKING_ERROR_CODES.SERVICE_CHANGED,
  BOOKING_ERROR_CODES.BRANCH_CHANGED,
  BOOKING_ERROR_CODES.RESCHEDULE_CHAIN_TOO_LONG,
  BOOKING_ERROR_CODES.OVER_SELF_RESCHEDULE_LIMIT,
  BOOKING_ERROR_CODES.RESCHEDULE_REQUEST_PENDING,
  BOOKING_ERROR_CODES.SLOT_BOOKED,
  BOOKING_ERROR_CODES.SLOT_HELD,
  BOOKING_ERROR_CODES.DOCTOR_ON_LEAVE,
];

describe('HDL-19 rescheduleFailureException', () => {
  it('NotFound ⇒ 404 KHONG_TIM_THAY (cùng thân với mọi tài nguyên không có hay ngoài phạm vi)', () => {
    const error = rescheduleFailureException({ kind: 'NotFound' });

    expect(error).toBeInstanceOf(AppException);
    expect(error.getStatus()).toBe(404);
    expect(bodyOf(error).maLoi).toBe(COMMON_ERROR_CODES.NOT_FOUND);
  });

  it('ProfileInactive ⇒ 409 HO_SO_NGUOI_THAN_DA_NGUNG; SlotNotFound ⇒ 404 KHUNG_GIO_KHONG_TON_TAI', () => {
    const inactive = rescheduleFailureException({ kind: 'ProfileInactive' });
    const slot = rescheduleFailureException({ kind: 'SlotNotFound' });

    expect(inactive.getStatus()).toBe(409);
    expect(bodyOf(inactive).maLoi).toBe(
      PATIENT_ERROR_CODES.RELATIVE_DEACTIVATED,
    );
    expect(slot.getStatus()).toBe(404);
    expect(bodyOf(slot).maLoi).toBe(BOOKING_ERROR_CODES.SLOT_NOT_FOUND);
  });

  it.each(RESCHEDULE_CODES)(
    'Rule %s ⇒ đúng mã và HTTP của BOOKING_ERRORS (không bảng thứ hai)',
    (code) => {
      const error = rescheduleFailureException({ kind: 'Rule', code });

      expect(error.getStatus()).toBe(BOOKING_ERRORS[code].status);
      const body = bodyOf(error);
      expect(body.maLoi).toBe(code);
      expect(body.thongBao).toBe(BOOKING_ERRORS[code].thongBao);
      expect(body).not.toHaveProperty('chiTiet');
    },
  );

  it('Rule kèm chiTiet ⇒ chiTiet đi qua nguyên vẹn (trangThai của LICH_HEN_KHONG_CHO_DOI, soLanDaDoi và toiDa của VUOT_SO_LAN_TU_DOI)', () => {
    const notResched: RescheduleFailure = {
      kind: 'Rule',
      code: BOOKING_ERROR_CODES.NOT_RESCHEDULABLE,
      chiTiet: { trangThai: 'ChoThanhToan' },
    };
    const over: RescheduleFailure = {
      kind: 'Rule',
      code: BOOKING_ERROR_CODES.OVER_SELF_RESCHEDULE_LIMIT,
      chiTiet: { soLanDaDoi: 2, toiDa: 2 },
    };

    expect(bodyOf(rescheduleFailureException(notResched)).chiTiet).toEqual({
      trangThai: 'ChoThanhToan',
    });
    expect(bodyOf(rescheduleFailureException(over)).chiTiet).toEqual({
      soLanDaDoi: 2,
      toiDa: 2,
    });
  });
});
