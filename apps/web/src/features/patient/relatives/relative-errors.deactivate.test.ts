import { GENERIC_ERROR_MESSAGE } from '../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import { SYSTEM_MESSAGE } from '../profile/profile-errors';
import {
  BLOCKED_MESSAGE,
  DEACTIVATE_DONE_MESSAGE,
  DEACTIVATE_NETWORK_MESSAGE,
  DEACTIVATE_TIMEOUT_MESSAGE,
  DEACTIVATE_UNEXPECTED_MESSAGE,
  MISSING_MESSAGE,
  describeDeactivateError,
} from './relative-errors';

// patient F7 (TRACKING F7-E, F7-G): phân loại lỗi ngừng sử dụng. Mã ca DW-nn là [đề xuất]; mỗi ca ghi mã NT của PLAN 7.2.
const api = (status: number, maLoi: string) =>
  new ApiError(status, { maLoi, thongBao: 'câu của API' });

describe('câu chữ (PLAN 5.9, [đề xuất])', () => {
  it('DW-21 NT-23 câu lý do là câu 5.9 (đã gồm gợi ý hủy lịch hẹn trước), thông báo thành công cố định', () => {
    expect(BLOCKED_MESSAGE).toBe(
      'Không thể ngừng sử dụng hồ sơ này vì đang có lịch hẹn chưa hoàn tất. Vui lòng hủy các lịch hẹn dưới đây trước.',
    );
    expect(DEACTIVATE_DONE_MESSAGE).toBe('Đã ngừng sử dụng hồ sơ người thân.');
  });

  it.each([
    ['mạng', DEACTIVATE_NETWORK_MESSAGE, /Mất kết nối/],
    ['quá giờ', DEACTIVATE_TIMEOUT_MESSAGE, /quá lâu/],
    ['phản hồi lạ', DEACTIVATE_UNEXPECTED_MESSAGE, /phản hồi hợp lệ/],
  ])(
    'DW-22 NT-23 câu %s nói rõ "chưa rõ" và "bấm lại là an toàn", không nói "chưa ngừng"',
    (_label, message, start) => {
      expect(message).toMatch(start);
      expect(message).toContain('chưa rõ hồ sơ đã được ngừng hay chưa');
      expect(message).toContain('Bấm "Ngừng sử dụng" để thử lại');
      expect(message).toContain('không gây hại');
      expect(message).not.toMatch(/chưa được ngừng|không ngừng được/);
    },
  );
});

describe('describeDeactivateError', () => {
  it('DW-23 NT-23 huỷ (đăng xuất giữa chừng) và 401 ⇒ ignored, không báo gì', () => {
    expect(describeDeactivateError(new RequestAbortedError())).toEqual({
      kind: 'ignored',
    });
    expect(describeDeactivateError(api(401, 'PHIEN_HET_HIEU_LUC'))).toEqual({
      kind: 'ignored',
    });
    expect(describeDeactivateError(api(401, 'CHUA_DANG_NHAP'))).toEqual({
      kind: 'ignored',
    });
  });

  it('DW-24 NT-23 404 KHONG_TIM_THAY ⇒ missing kèm câu "không còn tồn tại"', () => {
    expect(describeDeactivateError(api(404, 'KHONG_TIM_THAY'))).toEqual({
      kind: 'missing',
      notice: MISSING_MESSAGE,
    });
    expect(MISSING_MESSAGE).toBe('Hồ sơ người thân này không còn tồn tại.');
  });

  it('DW-25 NT-23 500 LOI_HE_THONG ⇒ câu hệ thống; mã khác (403…) ⇒ câu chung; không dùng thongBao của API', () => {
    expect(describeDeactivateError(api(500, 'LOI_HE_THONG'))).toEqual({
      kind: 'message',
      message: SYSTEM_MESSAGE,
    });
    expect(describeDeactivateError(api(403, 'KHONG_DU_QUYEN'))).toEqual({
      kind: 'message',
      message: GENERIC_ERROR_MESSAGE,
    });
    expect(
      JSON.stringify(describeDeactivateError(api(500, 'LOI_HE_THONG'))),
    ).not.toContain('câu của API');
  });

  it('DW-26 NT-23 mạng, quá giờ, phản hồi lạ ⇒ message "chưa rõ, bấm lại an toàn" (không phải missing hay ignored)', () => {
    expect(describeDeactivateError(new NetworkError())).toEqual({
      kind: 'message',
      message: DEACTIVATE_NETWORK_MESSAGE,
    });
    expect(describeDeactivateError(new TimeoutError())).toEqual({
      kind: 'message',
      message: DEACTIVATE_TIMEOUT_MESSAGE,
    });
    expect(describeDeactivateError(new UnexpectedResponseError(502))).toEqual({
      kind: 'message',
      message: DEACTIVATE_UNEXPECTED_MESSAGE,
    });
  });

  it('DW-27 NT-23 lỗi không biết (Error thường, chuỗi, null) ⇒ câu chung, không vỡ', () => {
    for (const unknown of [new Error('x'), 'x', null, undefined]) {
      expect(describeDeactivateError(unknown)).toEqual({
        kind: 'message',
        message: GENERIC_ERROR_MESSAGE,
      });
    }
  });
});
