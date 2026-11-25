import { describe, expect, it } from 'vitest';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '../../../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../../../shared/api/errors';
import { BOOKING_ERROR_CODES } from '../../../api/booking-errors';
import { DETAIL_TEXT } from '../detail/detail-messages';
import { LIST_TEXT } from '../list-messages';
import {
  candidateReasonMessage,
  describeRescheduleFailure,
  isSlotGoneCode,
  withUncertainHint,
  type RescheduleFailureKind,
} from './reschedule-failure';
import {
  RESCHEDULE_ERROR_CODES,
  rescheduleMessageForCode,
} from './reschedule-errors';
import { RESCHEDULE_TEXT } from './reschedule-text';

// reschedule F2, mã ca WDH-32 [đề xuất]: bảng `maLoi` ⇒ loại hành động (PLAN reschedule 5.13; TRACKING 1.14 mục B6). Chọn theo `maLoi`, KHÔNG theo `thongBao` hay mã HTTP (CODING_CONVENTION). Dữ liệu giả.
const api = (
  maLoi: string,
  extra: {
    status?: number;
    thongBao?: string;
    loi?: { truong: string; ma: string }[];
    chiTiet?: unknown;
  } = {},
) =>
  new ApiError(extra.status ?? 409, {
    maLoi,
    thongBao: extra.thongBao ?? 'THONG_BAO_NOI_BO',
    loi: extra.loi,
    chiTiet: extra.chiTiet,
  });
const kindOf = (error: unknown, phase: 'load' | 'submit') =>
  describeRescheduleFailure(error, phase).kind;

const OWN = RESCHEDULE_ERROR_CODES;
const BOOKING = BOOKING_ERROR_CODES;

describe('describeRescheduleFailure: mã nghiệp vụ (WDH-32)', () => {
  const table: [string, RescheduleFailureKind, RescheduleFailureKind][] = [
    // mã, loại ở pha gửi, loại ở pha tải
    [OWN.OVER_SELF_LIMIT, 'needsReason', 'backToDetail'],
    [OWN.NOT_RESCHEDULABLE, 'backToDetail', 'backToDetail'],
    [OWN.TOO_LATE, 'backToDetail', 'backToDetail'],
    [OWN.CHAIN_TOO_LONG, 'backToDetail', 'backToDetail'],
    [OWN.SERVICE_CHANGED, 'backToDetail', 'backToDetail'],
    [OWN.BRANCH_CHANGED, 'backToDetail', 'backToDetail'],
    [OWN.REQUEST_PENDING, 'backToDetail', 'backToDetail'],
    [OWN.SAME_AS_CURRENT_SLOT, 'pickAnother', 'pickAnother'],
    [OWN.OTHER_DOCTOR, 'pickAnother', 'pickAnother'],
    [BOOKING.SLOT_TAKEN, 'slotGone', 'pickAnother'],
    [BOOKING.SLOT_HELD, 'slotGone', 'pickAnother'],
    [BOOKING.SLOT_PAST, 'slotGone', 'pickAnother'],
    [BOOKING.SLOT_NOT_FOUND, 'slotGone', 'pickAnother'],
    [BOOKING.SLOT_INVALID, 'pickAnother', 'pickAnother'],
    [BOOKING.BRANCH_UNDECLARED, 'pickAnother', 'pickAnother'],
    [BOOKING.BRANCH_CLOSED, 'pickAnother', 'pickAnother'],
    [BOOKING.SHIFT_MISSING, 'pickAnother', 'pickAnother'],
    [BOOKING.OUTSIDE_HOURS, 'pickAnother', 'pickAnother'],
    [BOOKING.DOCTOR_ON_LEAVE, 'pickAnother', 'pickAnother'],
    [BOOKING.DOCTOR_UNAVAILABLE, 'pickAnother', 'pickAnother'],
    [BOOKING.SLOT_OUTSIDE_NEW_SCHEDULE, 'pickAnother', 'pickAnother'],
    [BOOKING.OVERLAPPING_APPOINTMENT, 'pickAnother', 'pickAnother'],
    [BOOKING.OVER_MAX_APPOINTMENTS, 'backToDetail', 'backToDetail'],
    [BOOKING.RELATIVE_DEACTIVATED, 'backToDetail', 'backToDetail'],
    [BOOKING.NOT_CONFIGURED, 'retry', 'retry'],
    [BOOKING.SYSTEM_BUSY, 'retry', 'retry'],
    [BOOKING.NOT_FOUND, 'notFound', 'notFound'],
    [BOOKING.FORBIDDEN, 'notFound', 'notFound'],
    [BOOKING.UNAUTHENTICATED, 'session', 'session'],
  ];

  it.each(table)(
    'WDH-32 %s ⇒ pha gửi: %s; pha tải: %s',
    (maLoi, whenSubmitting, whenLoading) => {
      expect(kindOf(api(maLoi), 'submit')).toBe(whenSubmitting);
      expect(kindOf(api(maLoi), 'load')).toBe(whenLoading);
    },
  );

  it('WDH-32 câu hiển thị của mã đã biết là câu của `rescheduleMessageForCode` (5.13 hoặc booking), không bảng thứ hai', () => {
    for (const [maLoi] of table) {
      const known = rescheduleMessageForCode(maLoi);
      if (known === undefined) continue;
      expect(describeRescheduleFailure(api(maLoi), 'submit').message).toBe(
        known.message,
      );
    }
    expect(
      describeRescheduleFailure(api(OWN.OVER_SELF_LIMIT), 'submit').message,
    ).toBe(
      'Bạn đã dùng hết số lần tự đổi. Hãy nhập lý do để gửi yêu cầu cho lễ tân.',
    );
  });

  it('WDH-32 404 và 403 của lịch là MỘT thẻ chung "Không tìm thấy lịch hẹn này." ở cả hai pha; 401 là câu phiên hết hạn', () => {
    for (const code of [BOOKING.NOT_FOUND, BOOKING.FORBIDDEN]) {
      for (const phase of ['load', 'submit'] as const) {
        const failure = describeRescheduleFailure(api(code), phase);
        expect(failure.kind).toBe('notFound');
        expect(failure.message).toBe(DETAIL_TEXT.notFound);
      }
    }
    expect(
      describeRescheduleFailure(api(BOOKING.UNAUTHENTICATED), 'submit'),
    ).toMatchObject({
      kind: 'session',
      message: LIST_TEXT.sessionExpired,
    });
  });

  it('WDH-32 `slotGone` mang mã để trang về lưới kèm câu của mã đó; `isSlotGoneCode` chỉ nhận đúng bốn mã', () => {
    const failure = describeRescheduleFailure(
      api(BOOKING.SLOT_TAKEN),
      'submit',
    );
    expect(failure).toMatchObject({
      kind: 'slotGone',
      maLoi: BOOKING.SLOT_TAKEN,
    });
    for (const code of [
      BOOKING.SLOT_TAKEN,
      BOOKING.SLOT_HELD,
      BOOKING.SLOT_PAST,
      BOOKING.SLOT_NOT_FOUND,
    ]) {
      expect(isSlotGoneCode(code)).toBe(true);
    }
    for (const code of [
      BOOKING.BRANCH_CLOSED,
      OWN.SAME_AS_CURRENT_SLOT,
      'constructor',
      '',
    ]) {
      expect(isSlotGoneCode(code)).toBe(false);
    }
  });
});

describe('describeRescheduleFailure: chọn theo maLoi, không theo thongBao hay HTTP (WDH-32)', () => {
  it('WDH-32 `thongBao` lừa và mã HTTP khác không đổi kết quả', () => {
    const lying = api(BOOKING.SLOT_TAKEN, {
      status: 200,
      thongBao: 'Không tìm thấy lịch hẹn này.',
    });
    expect(kindOf(lying, 'submit')).toBe('slotGone');
    expect(kindOf(api(OWN.TOO_LATE, { status: 404 }), 'submit')).toBe(
      'backToDetail',
    );
    expect(
      kindOf(
        api(BOOKING.NOT_FOUND, { status: 409, thongBao: 'Đã hết hạn' }),
        'submit',
      ),
    ).toBe('notFound');
    expect(
      describeRescheduleFailure(
        api(OWN.TOO_LATE, { thongBao: 'XYZ' }),
        'submit',
      ).message,
    ).not.toContain('XYZ');
  });

  it.each([
    'MA_LA',
    'constructor',
    '__proto__',
    'toString',
    '',
    'LICH_HEN_DA_QUA_GIO ',
  ])(
    'WDH-32 maLoi lạ %j (kể cả HTTP 404, 409, 500) ⇒ câu chung kèm "Thử lại", không in mã',
    (maLoi) => {
      for (const status of [404, 409, 500]) {
        const failure = describeRescheduleFailure(
          api(maLoi, { status }),
          'submit',
        );
        expect(failure.kind).toBe('retry');
        expect(failure.message).toBe(GENERIC_ERROR_MESSAGE);
      }
    },
  );

  it('WDH-32 `chiTiet` không đổi câu của `VUOT_SO_LAN_TU_DOI` (5.13 không có số)', () => {
    const plain = describeRescheduleFailure(api(OWN.OVER_SELF_LIMIT), 'submit');
    const withDetail = describeRescheduleFailure(
      api(OWN.OVER_SELF_LIMIT, { chiTiet: { soLanDaDoi: 2, toiDa: 2 } }),
      'submit',
    );
    expect(withDetail.message).toBe(plain.message);
    expect(withDetail.message).not.toMatch(/\d/);
  });
});

describe('describeRescheduleFailure: 400 và lỗi không phải ApiError (WDH-32)', () => {
  const invalid = (loi?: { truong: string; ma: string }[]) =>
    api('DU_LIEU_KHONG_HOP_LE', { status: 400, loi });

  it.each([
    [{ truong: 'lyDoYeuCau', ma: 'LY_DO_YEU_CAU_KHONG_HOP_LE' }],
    [{ truong: 'lyDoYeuCau', ma: 'IS_STRING' }],
  ])(
    'WDH-32 400 có lỗi trường lyDoYeuCau %j ⇒ reasonInvalid, câu theo luật 5 đến 500',
    (field) => {
      const failure = describeRescheduleFailure(invalid([field]), 'submit');
      expect(failure.kind).toBe('reasonInvalid');
      expect(failure.message).toBe(RESCHEDULE_TEXT.reasonRange(5, 500));
    },
  );

  it.each([
    ['khungGioId', 'IS_BIGINT_ID'],
    ['benhNhanId', 'TRUONG_KHONG_DUOC_PHEP'],
  ])(
    'WDH-32 400 ở trường %s (%s) ⇒ câu chung kèm "Thử lại", KHÔNG phải lỗi của ô lý do',
    (truong, ma) => {
      expect(
        describeRescheduleFailure(invalid([{ truong, ma }]), 'submit'),
      ).toMatchObject({
        kind: 'retry',
        message: GENERIC_ERROR_MESSAGE,
      });
      expect(kindOf(invalid(), 'submit')).toBe('retry');
      expect(kindOf(invalid([]), 'submit')).toBe('retry');
    },
  );

  it('WDH-32 mạng, quá giờ, phản hồi lạ ⇒ ở pha GỬI là "chưa rõ"; ở pha TẢI là câu của lỗi kèm "Thử lại"', () => {
    for (const error of [
      new NetworkError(),
      new TimeoutError(),
      new UnexpectedResponseError(502),
      new UnexpectedResponseError(200),
    ]) {
      expect(describeRescheduleFailure(error, 'submit')).toMatchObject({
        kind: 'uncertain',
        message: RESCHEDULE_TEXT.uncertain,
      });
    }
    expect(describeRescheduleFailure(new NetworkError(), 'load')).toMatchObject(
      {
        kind: 'retry',
        message: NETWORK_ERROR_MESSAGE,
      },
    );
    expect(describeRescheduleFailure(new TimeoutError(), 'load')).toMatchObject(
      {
        kind: 'retry',
        message: TIMEOUT_ERROR_MESSAGE,
      },
    );
    expect(
      describeRescheduleFailure(new UnexpectedResponseError(502), 'load'),
    ).toMatchObject({
      kind: 'retry',
      message: GENERIC_ERROR_MESSAGE,
    });
  });

  it('WDH-32 lỗi lạ (không phải ApiError, không phải ba lỗi mạng) ⇒ câu chung kèm "Thử lại", không in nội dung lỗi', () => {
    for (const error of [
      new Error('bí mật nội bộ'),
      new RequestAbortedError(),
      'chuỗi',
      null,
      undefined,
      42,
    ]) {
      for (const phase of ['load', 'submit'] as const) {
        const failure = describeRescheduleFailure(error, phase);
        expect(failure.kind).toBe('retry');
        expect(failure.message).toBe(GENERIC_ERROR_MESSAGE);
      }
    }
  });
});

describe('withUncertainHint và candidateReasonMessage (WDH-32, WDH-46, WDH-47)', () => {
  it('WDH-46 sau một lần "chưa rõ", 404 của lịch được thêm gợi ý xem Lịch hẹn của tôi; mã khác thì giữ nguyên', () => {
    const notFound = describeRescheduleFailure(
      api(BOOKING.NOT_FOUND),
      'submit',
    );
    const hinted = withUncertainHint(notFound);
    expect(hinted.kind).toBe('notFound');
    expect(hinted.message).toBe(
      `${DETAIL_TEXT.notFound} ${RESCHEDULE_TEXT.afterUncertainHint}`,
    );

    const tooLate = describeRescheduleFailure(api(OWN.TOO_LATE), 'submit');
    expect(withUncertainHint(tooLate)).toBe(tooLate);
    const taken = describeRescheduleFailure(api(BOOKING.SLOT_TAKEN), 'submit');
    expect(withUncertainHint(taken)).toBe(taken);
  });

  it('WDH-47 sau một lần "chưa rõ", 409 `DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET` cũng được thêm gợi ý (lần trước thật ra đã gửi được)', () => {
    const pending = describeRescheduleFailure(
      api(OWN.REQUEST_PENDING),
      'submit',
    );
    const hinted = withUncertainHint(pending);
    expect(hinted.kind).toBe('backToDetail');
    expect(hinted.message).toBe(
      `${rescheduleMessageForCode(OWN.REQUEST_PENDING)?.message} ${RESCHEDULE_TEXT.afterUncertainHint}`,
    );
  });

  it('WDH-32 câu cho khung giờ không hợp lệ: theo mã; mã lạ hay vắng ⇒ câu riêng của khung giờ (không "Lịch hẹn này hiện không thể đổi")', () => {
    expect(candidateReasonMessage(BOOKING.SLOT_TAKEN)).toBe(
      rescheduleMessageForCode(BOOKING.SLOT_TAKEN)?.message,
    );
    expect(candidateReasonMessage(OWN.SAME_AS_CURRENT_SLOT)).toBe(
      rescheduleMessageForCode(OWN.SAME_AS_CURRENT_SLOT)?.message,
    );
    for (const unknown of [undefined, 'MA_LA', 'constructor', '']) {
      expect(candidateReasonMessage(unknown)).toBe(
        RESCHEDULE_TEXT.slotNotUsable,
      );
    }
  });
});
