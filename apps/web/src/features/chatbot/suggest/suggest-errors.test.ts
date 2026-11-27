import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import { CHATBOT_TEXT } from '../widget/chatbot-text';
import { suggestErrorOf } from './suggest-errors';

// Chatbot F2, F2-11: chữ lỗi của thẻ gợi ý chọn theo `maLoi` (PLAN 5.16), không theo `thongBao` hay mã HTTP.
const apiError = (status: number, maLoi: string) =>
  new ApiError(status, { maLoi, thongBao: 'Chữ của máy chủ không được dùng' });

describe('suggestErrorOf', () => {
  it('F2-11 400 `BO_LOC_KHONG_HOP_LE` và `DU_LIEU_KHONG_HOP_LE` là "Bộ lọc không hợp lệ.", không thử lại', () => {
    for (const maLoi of ['BO_LOC_KHONG_HOP_LE', 'DU_LIEU_KHONG_HOP_LE']) {
      expect(suggestErrorOf(apiError(400, maLoi))).toEqual({
        text: 'Bộ lọc không hợp lệ.',
        canRetry: false,
      });
    }
  });

  it('F2-11 404 `KHONG_TIM_THAY` là "Không tìm thấy chuyên khoa.", không thử lại', () => {
    expect(suggestErrorOf(apiError(404, 'KHONG_TIM_THAY'))).toEqual({
      text: 'Không tìm thấy chuyên khoa.',
      canRetry: false,
    });
  });

  it('F2-11 409 `HE_THONG_CHUA_CAU_HINH` dẫn sang tra cứu, không thử lại', () => {
    expect(suggestErrorOf(apiError(409, 'HE_THONG_CHUA_CAU_HINH'))).toEqual({
      text: 'Chưa gợi ý được lúc này. Bạn có thể tra cứu bác sĩ và lịch khám.',
      canRetry: false,
    });
  });

  it('F2-11 mất mạng, quá giờ, phản hồi sai hình dạng, 500 và mã lạ cùng chữ chung của F1 và cho thử lại', () => {
    const general = {
      text: CHATBOT_TEXT.errorUnavailable,
      canRetry: true,
    };
    for (const error of [
      new NetworkError(),
      new TimeoutError(),
      new UnexpectedResponseError(502),
      apiError(500, 'LOI_HE_THONG'),
      apiError(400, 'MA_LOI_LA'),
      new Error('lỗi lạ'),
      'chuỗi',
    ]) {
      expect(suggestErrorOf(error)).toEqual(general);
    }
  });

  it('F2-11 tự huỷ (đổi lựa chọn, đóng khung) thì không báo lỗi', () => {
    expect(suggestErrorOf(new RequestAbortedError())).toBeNull();
  });
});
