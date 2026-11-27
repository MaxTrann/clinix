import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import { chatErrorOf } from './chat-error';

// Chatbot F1, WTL-06: chữ lỗi chọn theo loại lỗi và `maLoi` (PLAN 5.16), không theo `thongBao`.
const api = (status: number, maLoi: string) =>
  new ApiError(status, { maLoi, thongBao: 'chữ máy chủ không được dùng' });
const UNAVAILABLE = 'Trợ lý AI hiện không phản hồi, vui lòng thử lại sau';

describe('chatErrorOf', () => {
  it('WTL-06 DU_LIEU_KHONG_HOP_LE (400): chữ 1 đến 500 ký tự và KHÔNG cho gửi lại', () => {
    expect(chatErrorOf(api(400, 'DU_LIEU_KHONG_HOP_LE'))).toEqual({
      text: 'Câu hỏi cần từ 1 đến 500 ký tự.',
      canRetry: false,
    });
  });

  it('WTL-06 TRO_LY_HOI_QUA_NHANH (429) và TRO_LY_DANG_BAN (503): đúng chữ, cho gửi lại', () => {
    expect(chatErrorOf(api(429, 'TRO_LY_HOI_QUA_NHANH'))).toEqual({
      text: 'Bạn hỏi hơi nhanh. Đợi một chút rồi gửi lại.',
      canRetry: true,
    });
    expect(chatErrorOf(api(503, 'TRO_LY_DANG_BAN'))).toEqual({
      text: 'Trợ lý đang bận. Thử lại sau ít giây.',
      canRetry: true,
    });
  });

  it('WTL-06 LOI_HE_THONG (500), mã lạ, mất mạng, quá giờ, phản hồi sai: cùng chữ 3b của 2.4.7, cho gửi lại', () => {
    const expected = { text: UNAVAILABLE, canRetry: true };
    expect(chatErrorOf(api(500, 'LOI_HE_THONG'))).toEqual(expected);
    expect(chatErrorOf(api(409, 'MA_LA_CHUA_BIET'))).toEqual(expected);
    expect(chatErrorOf(new NetworkError())).toEqual(expected);
    expect(chatErrorOf(new TimeoutError())).toEqual(expected);
    expect(chatErrorOf(new UnexpectedResponseError(502))).toEqual(expected);
    expect(chatErrorOf(new Error('lạ'))).toEqual(expected);
  });

  it('WTL-06 nơi gọi tự huỷ (xoá hội thoại, đăng xuất) thì KHÔNG báo lỗi', () => {
    expect(chatErrorOf(new RequestAbortedError())).toBeNull();
  });

  it('F1-07 chữ lỗi không lấy từ thân lỗi của máy chủ', () => {
    const result = chatErrorOf(api(429, 'TRO_LY_HOI_QUA_NHANH'));
    expect(result?.text).not.toContain('chữ máy chủ');
  });
});
