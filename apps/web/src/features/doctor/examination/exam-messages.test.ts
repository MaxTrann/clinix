import { describe, expect, it } from 'vitest';
import { GENERIC_ERROR_MESSAGE } from '../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import { COMPLETE_TEXT, describeCompleteFailure } from './exam-messages';

// doctor-exam F1: hàm thuần chọn câu lỗi của `Hoàn thành ca khám` (WHT-05, WHT-06 mức hàm; PLAN 5.14). Chọn theo `maLoi` và `chiTiet.tuTrangThai`, KHÔNG theo mã HTTP hay `thongBao`.
const api = (status: number, maLoi: string, chiTiet?: unknown) =>
  new ApiError(status, {
    maLoi,
    thongBao: 'THÔNG BÁO KỸ THUẬT KHÔNG ĐƯỢC HIỆN',
    chiTiet,
  });
const transition = (tuTrangThai: unknown) =>
  api(409, 'CHUYEN_TRANG_THAI_KHONG_HOP_LE', {
    tuTrangThai,
    denTrangThai: 'HoanThanh',
  });

describe('doctor-exam F1 — câu lỗi của Hoàn thành ca khám (hàm thuần)', () => {
  it.each([
    [
      'WHT-06 404 KHONG_TIM_THAY',
      api(404, 'KHONG_TIM_THAY'),
      { message: COMPLETE_TEXT.notFound, kind: 'final', refresh: true },
    ],
    [
      'WHT-06 403 KHONG_DU_QUYEN',
      api(403, 'KHONG_DU_QUYEN'),
      { message: COMPLETE_TEXT.forbidden, kind: 'final', refresh: false },
    ],
    [
      'WHT-06 401 CHUA_DANG_NHAP',
      api(401, 'CHUA_DANG_NHAP'),
      { message: COMPLETE_TEXT.sessionExpired, kind: 'final', refresh: false },
    ],
    [
      'WHT-06 503 HE_THONG_DANG_BAN: bấm lại được',
      api(503, 'HE_THONG_DANG_BAN'),
      { message: COMPLETE_TEXT.busy, kind: 'retry', refresh: false },
    ],
    [
      'WHT-05 409 đã HoanThanh: không phải lỗi, có tải lại',
      transition('HoanThanh'),
      { message: COMPLETE_TEXT.already, kind: 'already', refresh: true },
    ],
    [
      'WHT-05 409 trạng thái khác',
      transition('DaXacNhan'),
      { message: COMPLETE_TEXT.notReceived, kind: 'final', refresh: true },
    ],
    [
      'WHT-06 maLoi lạ (500): câu chung, bấm lại được',
      api(500, 'LOI_HE_THONG'),
      { message: GENERIC_ERROR_MESSAGE, kind: 'retry', refresh: false },
    ],
  ])('%s', (_name, error, expected) => {
    expect(describeCompleteFailure(error)).toEqual(expected);
  });

  it.each([
    ['không có chiTiet', undefined],
    ['chiTiet là null', null],
    ['chiTiet là chuỗi', 'HoanThanh'],
    ['chiTiet rỗng', {}],
    ['tuTrangThai là số', { tuTrangThai: 5 }],
    ['tuTrangThai viết thường', { tuTrangThai: 'hoanthanh' }],
  ])('WHT-05 409 mà %s: KHÔNG đoán là đã hoàn thành', (_name, chiTiet) => {
    const result = describeCompleteFailure(
      api(409, 'CHUYEN_TRANG_THAI_KHONG_HOP_LE', chiTiet),
    );
    expect(result.kind).toBe('final');
    expect(result.message).toBe(COMPLETE_TEXT.notReceived);
  });

  it.each([
    ['mạng đứt', new NetworkError()],
    ['hết giờ', new TimeoutError()],
    [
      'phản hồi lạ (nginx 502 hay 200 sai hình)',
      new UnexpectedResponseError(502),
    ],
  ])('WHT-06 %s ⇒ "chưa rõ đã lưu", KHÔNG tải lại tự động', (_name, error) => {
    expect(describeCompleteFailure(error)).toEqual({
      message: COMPLETE_TEXT.unsure,
      kind: 'uncertain',
      refresh: false,
    });
  });

  it('WHT-06 maLoi trùng khoá nguyên mẫu ("constructor", "toString") không trúng bảng', () => {
    for (const maLoi of ['constructor', 'toString', '__proto__']) {
      expect(describeCompleteFailure(api(400, maLoi))).toEqual({
        message: GENERIC_ERROR_MESSAGE,
        kind: 'retry',
        refresh: false,
      });
    }
  });

  it('WHT-06 lỗi không phải của mạng hay API (lỗi lập trình): câu chung, bấm lại được; không in thông báo kỹ thuật', () => {
    const result = describeCompleteFailure(new Error('chi tiết nội bộ'));
    expect(result).toEqual({
      message: GENERIC_ERROR_MESSAGE,
      kind: 'retry',
      refresh: false,
    });
    expect(
      describeCompleteFailure(api(404, 'KHONG_TIM_THAY')).message,
    ).not.toContain('KỸ THUẬT');
    // Lỗi huỷ không do hàm này xử lý (nơi gọi bỏ qua trước), nhưng nếu lọt vào thì cũng không làm vỡ
    expect(describeCompleteFailure(new RequestAbortedError()).kind).toBe(
      'retry',
    );
  });
});
