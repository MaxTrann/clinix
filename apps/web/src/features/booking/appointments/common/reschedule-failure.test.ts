import { describe, expect, it } from 'vitest';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '../../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../../shared/api/errors';
import { BOOKING_ERROR_CODES } from '../../api/booking-errors';
import { DETAIL_TEXT } from '../patient/detail/detail-messages';
import { LIST_TEXT } from '../patient/list-messages';
import {
  candidateReasonMessage,
  describeRescheduleFailure,
  isSlotGoneCode,
  PATIENT_FAILURE_CONTEXT,
  withUncertainHint,
  type FailureContext,
  type RescheduleFailureKind,
} from './reschedule-failure';
import {
  CODE_SYSTEM_ERROR,
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

// reschedule F3, mã ca WDO-11 [đề xuất]: NGỮ CẢNH của `describeRescheduleFailure` (Lễ tân đổi hộ dùng cùng bảng mã với Bệnh nhân nhưng khác tên trường lý do, không có hạn mức tự đổi, khác câu "chưa rõ" và khác
// mã nghĩa là "lần trước đã thành công"). Ngữ cảnh mặc định là Bệnh nhân nên mọi ca WDH-32 ở trên chạy nguyên văn. Ở đây dùng một ngữ cảnh DỰNG TAY để thử riêng hàm dùng chung; ngữ cảnh THẬT của Lễ tân
// được thử ở `reception-reschedule-submit-errors.test.tsx` (WDO-05).
const STAFF: FailureContext = {
  reasonField: 'lyDo',
  reasonInvalidMessage: 'CAU_LY_DO_NHAN_SU',
  askReasonOnOverLimit: false,
  uncertainMessage: 'CAU_CHUA_RO_NHAN_SU',
  afterUncertainHint: 'GOI_Y_NHAN_SU',
  succeededAfterUncertain: [OWN.NOT_RESCHEDULABLE],
  systemErrorMessage: 'CAU_LOI_HE_THONG_NHAN_SU',
};
const staffKind = (error: unknown, phase: 'load' | 'submit') =>
  describeRescheduleFailure(error, phase, STAFF);

describe('describeRescheduleFailure: ngữ cảnh Lễ tân (WDO-11)', () => {
  it('WDO-11 ngữ cảnh mặc định LÀ Bệnh nhân: truyền tường minh hay bỏ trống cho cùng kết quả', () => {
    for (const error of [
      api(OWN.OVER_SELF_LIMIT),
      api(OWN.NOT_RESCHEDULABLE),
      api(BOOKING.SLOT_TAKEN),
      api('DU_LIEU_KHONG_HOP_LE', {
        status: 400,
        loi: [{ truong: 'lyDoYeuCau', ma: 'LY_DO_YEU_CAU_KHONG_HOP_LE' }],
      }),
      api('KHONG_TIM_THAY', { status: 404 }),
      new NetworkError(),
    ]) {
      for (const phase of ['load', 'submit'] as const) {
        expect(
          describeRescheduleFailure(error, phase, PATIENT_FAILURE_CONTEXT),
        ).toEqual(describeRescheduleFailure(error, phase));
      }
    }
    expect(PATIENT_FAILURE_CONTEXT.reasonField).toBe('lyDoYeuCau');
    expect(PATIENT_FAILURE_CONTEXT.askReasonOnOverLimit).toBe(true);
  });

  it('WDO-11 400 ở trường `lyDo` ⇒ `reasonInvalid` kèm câu của ngữ cảnh, chỉ ở pha gửi; cùng thân ở ngữ cảnh Bệnh nhân KHÔNG phải lỗi ô lý do (khác tên trường)', () => {
    const error = api('DU_LIEU_KHONG_HOP_LE', {
      status: 400,
      loi: [{ truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' }],
    });
    expect(staffKind(error, 'submit')).toMatchObject({
      kind: 'reasonInvalid',
      message: 'CAU_LY_DO_NHAN_SU',
    });
    expect(staffKind(error, 'load').kind).toBe('retry');
    expect(kindOf(error, 'submit')).toBe('retry');
    // khoá lạ ở thân ⇒ không phải lỗi ô lý do
    const stray = api('DU_LIEU_KHONG_HOP_LE', {
      status: 400,
      loi: [{ truong: 'lyDoYeuCau', ma: 'TRUONG_KHONG_DUOC_PHEP' }],
    });
    expect(staffKind(stray, 'submit').kind).toBe('retry');
  });

  it('WDO-11 `VUOT_SO_LAN_TU_DOI` KHÔNG mở ô lý do kiểu Bệnh nhân khi ngữ cảnh không có hạn mức: vẫn là một câu kèm đường về chi tiết', () => {
    const error = api(OWN.OVER_SELF_LIMIT);
    expect(staffKind(error, 'submit').kind).toBe('backToDetail');
    expect(kindOf(error, 'submit')).toBe('needsReason');
  });

  it('WDO-11 `LOI_HE_THONG` (500, AuditError): câu riêng của ngữ cảnh, loại `retry` ở cả hai pha; thiếu câu thì dùng câu chung', () => {
    const error = api(CODE_SYSTEM_ERROR, { status: 500 });
    for (const phase of ['load', 'submit'] as const) {
      expect(staffKind(error, phase)).toMatchObject({
        kind: 'retry',
        message: 'CAU_LOI_HE_THONG_NHAN_SU',
        maLoi: CODE_SYSTEM_ERROR,
      });
    }
    expect(describeRescheduleFailure(error, 'submit')).toMatchObject({
      kind: 'retry',
      message: GENERIC_ERROR_MESSAGE,
    });
  });

  it('WDO-11 mạng, quá giờ, phản hồi lạ lúc GỬI ⇒ `uncertain` kèm câu của ngữ cảnh; lúc TẢI ⇒ `retry`', () => {
    for (const error of [
      new NetworkError(),
      new TimeoutError(),
      new UnexpectedResponseError(200),
    ]) {
      expect(staffKind(error, 'submit')).toMatchObject({
        kind: 'uncertain',
        message: 'CAU_CHUA_RO_NHAN_SU',
      });
      expect(staffKind(error, 'load').kind).toBe('retry');
    }
  });

  it('WDO-11 404 ngoài chi nhánh, 404 không có và 403 là MỘT thẻ: cùng loại, cùng câu, không lộ mã', () => {
    const messages = [
      api('KHONG_TIM_THAY', { status: 404, thongBao: 'NGOAI_CHI_NHANH' }),
      api('KHONG_TIM_THAY', { status: 404, thongBao: 'KHONG_CO' }),
      api('KHONG_DU_QUYEN', { status: 403 }),
    ].map((error) => staffKind(error, 'submit'));
    expect(messages.map((item) => item.kind)).toEqual([
      'notFound',
      'notFound',
      'notFound',
    ]);
    expect(new Set(messages.map((item) => item.message)).size).toBe(1);
    expect(messages[0].message).not.toMatch(/NGOAI_CHI_NHANH|KHONG_CO/);
  });

  it('WDO-11 gợi ý sau "chưa rõ": ở ngữ cảnh Lễ tân là 409 `LICH_HEN_KHONG_CHO_DOI` (lịch cũ đã thành `DaDoiLich`), KHÔNG phải `DA_CO_YEU_CAU_DOI_LICH_CHO_DUYET`; 404 luôn có gợi ý', () => {
    const notReschedulable = staffKind(api(OWN.NOT_RESCHEDULABLE), 'submit');
    expect(withUncertainHint(notReschedulable, STAFF).message).toBe(
      `${notReschedulable.message} GOI_Y_NHAN_SU`,
    );
    // không phải mã "đã thành công" của ngữ cảnh ⇒ không thêm
    const pending = staffKind(api(OWN.REQUEST_PENDING), 'submit');
    expect(withUncertainHint(pending, STAFF)).toEqual(pending);
    const other = staffKind(api(BOOKING.SLOT_TAKEN), 'submit');
    expect(withUncertainHint(other, STAFF)).toEqual(other);
    // 404 ⇒ có gợi ý
    const gone = staffKind(api('KHONG_TIM_THAY', { status: 404 }), 'submit');
    expect(withUncertainHint(gone, STAFF).message).toBe(
      `${gone.message} GOI_Y_NHAN_SU`,
    );
    // ngữ cảnh Bệnh nhân giữ nguyên: 409 `LICH_HEN_KHONG_CHO_DOI` KHÔNG có gợi ý
    const patient = describeRescheduleFailure(
      api(OWN.NOT_RESCHEDULABLE),
      'submit',
    );
    expect(withUncertainHint(patient)).toEqual(patient);
  });
});
