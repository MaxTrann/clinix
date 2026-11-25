import { AppException } from '../../common/errors/app.exception.js';
import {
  BOOKING_ERROR_CODES,
  BOOKING_ERRORS,
} from '../appointments.constants.js';
import {
  requestNotFoundException,
  requestRejectionException,
} from './reschedule-request-failure.js';
import { rescheduleFailureException } from './reschedule-failure.js';
import type { RescheduleRejection } from './reschedule.types.js';

// reschedule B9 — HDL-35: ánh xạ VÉT CẠN mọi `RescheduleRejection` (B4) và hai kiểu riêng của yêu cầu sang `AppException`. `Record<RescheduleRejection['kind'], …>` buộc thêm dòng khi B4 thêm kiểu (lỗi biên
// dịch), nên không kiểu nào bị bỏ sót. Mã và HTTP chỉ có MỘT bảng (`BOOKING_ERRORS`).
type Body = { maLoi: string; thongBao: string; chiTiet?: unknown };
const bodyOf = (error: AppException): Body => error.getResponse() as Body;

// Mọi kiểu KHÔNG phải `Rule` (`Rule` có một dòng cho từng mã ở ca dưới)
const EXPECTED: Record<
  Exclude<RescheduleRejection['kind'], 'Rule'>,
  { status: number; maLoi: string }
> = {
  RequestNotFound: { status: 404, maLoi: 'YEU_CAU_DOI_LICH_KHONG_TON_TAI' },
  NotFound: { status: 404, maLoi: 'YEU_CAU_DOI_LICH_KHONG_TON_TAI' },
  RequestHandled: { status: 409, maLoi: 'YEU_CAU_DA_XU_LY' },
  ProfileInactive: { status: 409, maLoi: 'HO_SO_NGUOI_THAN_DA_NGUNG' },
  SlotNotFound: { status: 404, maLoi: 'KHUNG_GIO_KHONG_TON_TAI' },
};

describe('HDL-35 requestRejectionException: vét cạn mọi kiểu từ chối', () => {
  it.each(Object.entries(EXPECTED))(
    'kiểu %s ⇒ HTTP và maLoi đúng bảng PLAN 5.13',
    (kind, expected) => {
      const error = requestRejectionException({
        kind,
      } as RescheduleRejection);
      expect(error).toBeInstanceOf(AppException);
      expect(error.getStatus()).toBe(expected.status);
      expect(bodyOf(error).maLoi).toBe(expected.maLoi);
      expect(bodyOf(error).thongBao.length).toBeGreaterThan(0);
    },
  );

  it.each(Object.values(BOOKING_ERROR_CODES))(
    'Rule %s ⇒ HTTP của BOOKING_ERRORS, maLoi là chính mã, chiTiet đi nguyên',
    (code) => {
      const error = requestRejectionException({
        kind: 'Rule',
        code,
        chiTiet: { trangThai: 'DaDoiLich' },
      });
      expect(error.getStatus()).toBe(BOOKING_ERRORS[code].status);
      expect(bodyOf(error).maLoi).toBe(code);
      expect(bodyOf(error).chiTiet).toStrictEqual({ trangThai: 'DaDoiLich' });
    },
  );

  it('ba kiểu dùng chung với B4 (ProfileInactive, SlotNotFound, Rule) ra ĐÚNG cùng ngoại lệ của rescheduleFailureException: không có bảng thứ hai', () => {
    for (const rejection of [
      { kind: 'ProfileInactive' },
      { kind: 'SlotNotFound' },
      { kind: 'Rule', code: BOOKING_ERROR_CODES.NOT_RESCHEDULABLE },
    ] as const) {
      const mine = requestRejectionException(rejection);
      const theirs = rescheduleFailureException(rejection);
      expect(mine.getStatus()).toBe(theirs.getStatus());
      expect(mine.getResponse()).toStrictEqual(theirs.getResponse());
    }
  });
});

describe('XDL-13 / QDL-13 404 của POST: một thân cho mọi nguyên nhân "không có"', () => {
  it('RequestNotFound, NotFound và requestNotFoundException() giống nhau TỪNG KÝ TỰ (sai dạng, không có, ngoài phạm vi không phân biệt được)', () => {
    const a = JSON.stringify(
      requestRejectionException({ kind: 'RequestNotFound' }).getResponse(),
    );
    const b = JSON.stringify(
      requestRejectionException({ kind: 'NotFound' }).getResponse(),
    );
    const c = JSON.stringify(requestNotFoundException().getResponse());
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(JSON.parse(c)).toStrictEqual({
      maLoi: 'YEU_CAU_DOI_LICH_KHONG_TON_TAI',
      thongBao: 'Không tìm thấy yêu cầu đổi lịch.',
    });
  });

  it('KHÁC GET của B8: POST dùng YEU_CAU_DOI_LICH_KHONG_TON_TAI, không phải KHONG_TIM_THAY (mỗi nhóm nhất quán trong chính nó)', () => {
    expect(requestNotFoundException().maLoi).toBe(
      'YEU_CAU_DOI_LICH_KHONG_TON_TAI',
    );
    expect(requestNotFoundException().maLoi).not.toBe('KHONG_TIM_THAY');
  });

  it('409 YEU_CAU_DA_XU_LY có thân ổn định, không mang dữ liệu của yêu cầu', () => {
    expect(
      requestRejectionException({ kind: 'RequestHandled' }).getResponse(),
    ).toStrictEqual({
      maLoi: 'YEU_CAU_DA_XU_LY',
      thongBao: 'Yêu cầu này đã được xử lý.',
    });
  });
});
