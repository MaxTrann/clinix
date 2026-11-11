import { AppException } from '../../common/errors/app.exception.js';
import { COMMON_ERROR_CODES } from '../../common/errors/error-codes.js';
import { PATIENT_ERROR_CODES } from '../../patient/patient.constants.js';
import {
  BOOKING_ERROR_CODES,
  BOOKING_ERRORS,
  type BookingErrorCode,
} from '../appointments.constants.js';
import { evaluateBookability } from '../slots/bookability.rules.js';
import { bookabilityFacts } from '../testing/bookability-facts.js';
import {
  bookingFailureException,
  failureOfVerdict,
  type BookingFailure,
} from './booking-failure.js';

// Task B7 — MỘT ánh xạ duy nhất từ mọi kết quả kiểm sang `AppException` (BCK-01; TRACKING booking 3.18 B7-G, 3.18.2 mục 4). `checks` (B7) và tạo lịch (B8) dùng lại đúng hàm này.
// Mã BCK-nn là [đề xuất].
const bodyOf = (error: AppException) =>
  error.getResponse() as {
    maLoi: string;
    thongBao: string;
    chiTiet?: unknown;
  };

// 14 mã KHÁC NHAU mà `evaluateBookability` có thể trả (PLAN 5.4 bước 3; BKA-01 của B6a ghim thứ tự; `KHUNG_GIO_DA_QUA` được trả ở hai điểm nhưng là một mã)
const RULE_CODES: readonly BookingErrorCode[] = [
  BOOKING_ERROR_CODES.BOOKING_LOCKED_NO_SHOW,
  BOOKING_ERROR_CODES.SLOT_BOOKED,
  BOOKING_ERROR_CODES.SLOT_HELD,
  BOOKING_ERROR_CODES.SLOT_PAST,
  BOOKING_ERROR_CODES.DOCTOR_UNAVAILABLE,
  BOOKING_ERROR_CODES.SLOT_INVALID,
  BOOKING_ERROR_CODES.BRANCH_NOT_DECLARED,
  BOOKING_ERROR_CODES.BRANCH_CLOSED,
  BOOKING_ERROR_CODES.SHIFT_NOT_ACCEPTED,
  BOOKING_ERROR_CODES.OUTSIDE_OPENING_HOURS,
  BOOKING_ERROR_CODES.DOCTOR_ON_LEAVE,
  BOOKING_ERROR_CODES.SLOT_OUTSIDE_NEW_SCHEDULE,
  BOOKING_ERROR_CODES.OVER_MAX_APPOINTMENTS,
  BOOKING_ERROR_CODES.OVERLAPPING_APPOINTMENT,
];

describe('bookingFailureException: các nhánh có trước luật (3.18.2 mục 4, dòng 2 đến 5)', () => {
  it('BCK-01 không có hàng benh_nhan ⇒ 403 KHONG_DU_QUYEN, thân GIỐNG HỆT lỗi 403 chung', () => {
    const error = bookingFailureException({ kind: 'NoPatientRow' });

    expect(error).toBeInstanceOf(AppException);
    expect(error.getStatus()).toBe(403);
    expect(bodyOf(error).maLoi).toBe('KHONG_DU_QUYEN');
    expect(error.getResponse()).toStrictEqual(
      new AppException(403, COMMON_ERROR_CODES.FORBIDDEN).getResponse(),
    );
  });

  it('BCK-01 hồ sơ người thân của người khác hoặc không tồn tại ⇒ 404 KHONG_TIM_THAY, thân GIỐNG HỆT 404 chung (so từng chữ, QB-01)', () => {
    const error = bookingFailureException({ kind: 'ProfileMissing' });

    expect(error.getStatus()).toBe(404);
    expect(bodyOf(error).maLoi).toBe('KHONG_TIM_THAY');
    expect(error.getResponse()).toStrictEqual(
      new AppException(404, COMMON_ERROR_CODES.NOT_FOUND).getResponse(),
    );
  });

  it('BCK-01 hồ sơ của mình đã ngừng ⇒ 409 HO_SO_NGUOI_THAN_DA_NGUNG (mã của patient, không khai lại)', () => {
    const error = bookingFailureException({ kind: 'ProfileInactive' });

    expect(error.getStatus()).toBe(409);
    expect(bodyOf(error).maLoi).toBe(PATIENT_ERROR_CODES.RELATIVE_DEACTIVATED);
    expect(bodyOf(error).maLoi).toBe('HO_SO_NGUOI_THAN_DA_NGUNG');
    expect(bodyOf(error).thongBao.length).toBeGreaterThan(0);
  });

  it('BCK-01 hồ sơ của mình đã ngừng khác 404: đó là hồ sơ của chính họ nên không lộ gì', () => {
    const inactive = bookingFailureException({ kind: 'ProfileInactive' });
    const missing = bookingFailureException({ kind: 'ProfileMissing' });

    expect(inactive.getStatus()).not.toBe(missing.getStatus());
    expect(bodyOf(inactive).maLoi).not.toBe(bodyOf(missing).maLoi);
  });

  it('BCK-01 không có khung giờ ⇒ 404 KHUNG_GIO_KHONG_TON_TAI (không phải KHONG_TIM_THAY: mã riêng của booking)', () => {
    const error = bookingFailureException({ kind: 'SlotNotFound' });

    expect(error.getStatus()).toBe(404);
    expect(bodyOf(error).maLoi).toBe('KHUNG_GIO_KHONG_TON_TAI');
  });
});

describe('bookingFailureException: nhánh luật', () => {
  it('BCK-01 đủ 14 mã KHÁC NHAU của luật: mỗi mã ra đúng HTTP, maLoi và thongBao của BOOKING_ERRORS', () => {
    expect(new Set(RULE_CODES).size).toBe(14);
    for (const code of RULE_CODES) {
      const error = bookingFailureException({ kind: 'Rule', code });

      expect(error.getStatus()).toBe(BOOKING_ERRORS[code].status);
      expect(bodyOf(error).maLoi).toBe(code);
      expect(bodyOf(error).thongBao).toBe(BOOKING_ERRORS[code].thongBao);
    }
  });

  it('BCK-01 chiTiet qua nguyên vẹn và đúng khoá; vắng thì thân KHÔNG có khoá chiTiet', () => {
    const toiDa = bookingFailureException({
      kind: 'Rule',
      code: BOOKING_ERROR_CODES.OVER_MAX_APPOINTMENTS,
      chiTiet: { toiDa: 3 },
    });
    const trung = bookingFailureException({
      kind: 'Rule',
      code: BOOKING_ERROR_CODES.OVERLAPPING_APPOINTMENT,
      chiTiet: { maLichHen: 'CLX-20261110-7K3QD', thoiGian: '2026-11-10' },
    });
    const gio = bookingFailureException({
      kind: 'Rule',
      code: BOOKING_ERROR_CODES.OUTSIDE_OPENING_HOURS,
      chiTiet: { thuTrongTuan: 2, gioMo: 28800, gioDong: 43200 },
    });
    const khongChiTiet = bookingFailureException({
      kind: 'Rule',
      code: BOOKING_ERROR_CODES.SLOT_BOOKED,
    });

    expect(bodyOf(toiDa).chiTiet).toStrictEqual({ toiDa: 3 });
    expect(bodyOf(trung).chiTiet).toStrictEqual({
      maLichHen: 'CLX-20261110-7K3QD',
      thoiGian: '2026-11-10',
    });
    expect(bodyOf(gio).chiTiet).toStrictEqual({
      thuTrongTuan: 2,
      gioMo: 28800,
      gioDong: 43200,
    });
    expect('chiTiet' in bodyOf(khongChiTiet)).toBe(false);
  });

  it('BCK-01 mọi mã luật đều nằm trong BOOKING_ERRORS: B7 không thêm mã nào (BCS-01)', () => {
    for (const code of RULE_CODES) expect(code in BOOKING_ERRORS).toBe(true);
    // 22 mã có HTTP (cộng 3 mã trường là 25 của BCS-01): B7 không thêm mã nào
    expect(Object.keys(BOOKING_ERRORS)).toHaveLength(22);
  });

  it('BCK-01 phán quyết của luật thật đi qua failureOfVerdict rồi bookingFailureException ra đúng mã và chiTiet', () => {
    const verdict = evaluateBookability(
      bookabilityFacts({
        soLichHenToiDa: 1,
        activeAppointments: [{ maLichHen: 'A' }],
      }),
    );
    if (verdict.ok) throw new Error('luật lẽ ra phải từ chối');

    const failure = failureOfVerdict(verdict);
    const error = bookingFailureException(failure);

    expect(failure).toStrictEqual({
      kind: 'Rule',
      code: 'VUOT_SO_LICH_HEN_TOI_DA',
      chiTiet: { toiDa: 1 },
    });
    expect(error.getStatus()).toBe(409);
    expect(bodyOf(error).chiTiet).toStrictEqual({ toiDa: 1 });
  });

  it('BCK-01 failureOfVerdict không thêm khoá chiTiet khi luật không trả chiTiet', () => {
    const verdict = evaluateBookability(
      bookabilityFacts({ noShowLocked: true }),
    );
    if (verdict.ok) throw new Error('luật lẽ ra phải từ chối');

    expect(failureOfVerdict(verdict)).toStrictEqual({
      kind: 'Rule',
      code: 'DAT_LICH_BI_KHOA_NO_SHOW',
    });
  });

  it('BCK-01 mọi nhánh của BookingFailure đều có một ánh xạ (kiểm kiểu lúc biên dịch bằng vét cạn)', () => {
    const all: BookingFailure[] = [
      { kind: 'NoPatientRow' },
      { kind: 'ProfileMissing' },
      { kind: 'ProfileInactive' },
      { kind: 'SlotNotFound' },
      { kind: 'Rule', code: BOOKING_ERROR_CODES.SLOT_PAST },
    ];

    for (const failure of all)
      expect(bookingFailureException(failure)).toBeInstanceOf(AppException);
  });
});
