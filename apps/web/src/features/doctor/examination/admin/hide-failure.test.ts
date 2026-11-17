import { describe, expect, it } from 'vitest';
import { GENERIC_ERROR_MESSAGE } from '../../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../../shared/api/errors';
import { describeHideFailure, reasonMessage } from './hide-failure';
import { HIDE_TEXT } from './reviews-text';

// doctor-exam F8, WKD-22 [đề xuất]: ánh xạ lỗi của `POST …/hide` theo `maLoi` và `loi[].ma` (PLAN 5.14), KHÔNG theo `thongBao` hay mã HTTP. Hàm thuần. Dữ liệu giả.
const MACHINE_TEXT = 'THÔNG BÁO KỸ THUẬT KHÔNG ĐƯỢC HIỆN';
const apiError = (
  status: number,
  maLoi: string,
  extra: { loi?: { truong: string; ma: string }[]; chiTiet?: unknown } = {},
) => new ApiError(status, { maLoi, thongBao: MACHINE_TEXT, ...extra });
const invalid = (loi: { truong: string; ma: string }[] | undefined) =>
  apiError(400, 'DU_LIEU_KHONG_HOP_LE', { loi });

describe('doctor-exam F8 — 400 theo trường `lyDo` (WKD-22, WKD-05)', () => {
  it.each([
    ['LY_DO_BAT_BUOC', 'Vui lòng nhập lý do ẩn.'],
    ['LY_DO_QUA_NGAN', 'Lý do ẩn cần ít nhất 10 ký tự.'],
    ['LY_DO_QUA_DAI', 'Tối đa 255 ký tự.'],
    [
      'NOI_DUNG_KHONG_HOP_LE',
      'Nội dung có đoạn giống mật khẩu hoặc mã bí mật; hãy viết lại.',
    ],
  ])(
    'WKD-22 `loi[]` trường lyDo mã %s ⇒ lỗi THEO Ô, không dải chung',
    (ma, text) => {
      const failure = describeHideFailure(invalid([{ truong: 'lyDo', ma }]));
      expect(failure).toEqual({ message: null, kind: 'field', code: ma });
      expect(reasonMessage(ma as never)).toBe(text);
    },
  );

  it('WKD-22 giữ lỗi ĐẦU của `lyDo`; bỏ phần tử sai dạng, trường khác, mã lạ', () => {
    const failure = describeHideFailure(
      invalid([
        { truong: 'khac', ma: 'LY_DO_QUA_DAI' },
        { truong: 'lyDo', ma: 'IS_STRING' },
        null as never,
        'x' as never,
        { truong: 'lyDo' } as never,
        { truong: 'lyDo', ma: 'LY_DO_QUA_NGAN' },
        { truong: 'lyDo', ma: 'LY_DO_QUA_DAI' },
      ]),
    );
    expect(failure).toEqual({
      message: null,
      kind: 'field',
      code: 'LY_DO_QUA_NGAN',
    });
  });

  it('WKD-22 `loi[]` vắng, rỗng, không phải mảng, chỉ mã lạ hoặc trường khác (`IS_STRING`, `TRUONG_KHONG_DUOC_PHEP`) ⇒ `retry` với câu chung (lỗi lập trình)', () => {
    for (const loi of [
      undefined,
      [],
      'lyDo' as never,
      [{ truong: 'lyDo', ma: 'IS_STRING' }],
      [{ truong: 'lyDo', ma: 'TRUONG_KHONG_DUOC_PHEP' }],
      [{ truong: 'bacSiId', ma: 'LY_DO_BAT_BUOC' }],
    ]) {
      expect(describeHideFailure(invalid(loi))).toEqual({
        message: GENERIC_ERROR_MESSAGE,
        kind: 'retry',
        code: null,
      });
    }
  });
});

describe('doctor-exam F8 — mã lỗi khác của máy chủ (WKD-22, WKD-07)', () => {
  it('WKD-22 409 `DANH_GIA_DA_AN` ⇒ `already` (không phải lỗi đỏ: nơi gọi đóng hộp, tải lại, báo "đã được ẩn")', () => {
    expect(describeHideFailure(apiError(409, 'DANH_GIA_DA_AN'))).toEqual({
      message: 'Đánh giá này đã được ẩn.',
      kind: 'already',
      code: null,
    });
  });

  it('WKD-22 404 `KHONG_TIM_THAY` ⇒ `gone` (đóng hộp, tải lại, báo không tìm thấy)', () => {
    expect(describeHideFailure(apiError(404, 'KHONG_TIM_THAY'))).toEqual({
      message: 'Không tìm thấy đánh giá này.',
      kind: 'gone',
      code: null,
    });
  });

  it('WKD-22 503 `HE_THONG_DANG_BAN` ⇒ `retry` (giữ hộp và lý do)', () => {
    expect(describeHideFailure(apiError(503, 'HE_THONG_DANG_BAN'))).toEqual({
      message: 'Hệ thống đang bận, thử lại sau ít phút.',
      kind: 'retry',
      code: null,
    });
  });

  it('WKD-22 403 `KHONG_DU_QUYEN` và 401 `CHUA_DANG_NHAP` ⇒ `final` (khoá `Xác nhận ẩn`)', () => {
    expect(describeHideFailure(apiError(403, 'KHONG_DU_QUYEN'))).toEqual({
      message: 'Bạn không có quyền thực hiện thao tác này.',
      kind: 'final',
      code: null,
    });
    expect(describeHideFailure(apiError(401, 'CHUA_DANG_NHAP'))).toEqual({
      message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      kind: 'final',
      code: null,
    });
  });

  it('WKD-22 `maLoi` lạ (kể cả tên trùng nguyên mẫu như `constructor`, `toString`, `__proto__`) ⇒ `retry` câu chung, KHÔNG trúng khoá của nguyên mẫu', () => {
    for (const maLoi of [
      'LOI_LA',
      'constructor',
      'toString',
      '__proto__',
      'hasOwnProperty',
      '',
    ]) {
      expect(describeHideFailure(apiError(500, maLoi))).toEqual({
        message: GENERIC_ERROR_MESSAGE,
        kind: 'retry',
        code: null,
      });
    }
  });

  it('WKD-22 `chiTiet` của máy chủ không ảnh hưởng: 409 `DANH_GIA_DA_AN` kèm `chiTiet` vẫn là `already` (máy chủ không gửi lý do cũ, nhưng nếu có cũng không in)', () => {
    const failure = describeHideFailure(
      apiError(409, 'DANH_GIA_DA_AN', { chiTiet: { lyDoAn: 'ly do cu' } }),
    );
    expect(failure.kind).toBe('already');
    expect(JSON.stringify(failure)).not.toContain('ly do cu');
  });
});

describe('doctor-exam F8 — không phản hồi hay phản hồi lạ ⇒ "chưa rõ" (WKD-22, WKD-07)', () => {
  it('WKD-22 mạng đứt, hết giờ, 200 sai hình dạng ⇒ `uncertain` (máy chủ có thể đã ẩn xong; KHÔNG tự gửi lại)', () => {
    for (const error of [
      new NetworkError(),
      new TimeoutError(),
      new UnexpectedResponseError(200),
      new UnexpectedResponseError(502),
    ]) {
      expect(describeHideFailure(error)).toEqual({
        message:
          'Chưa rõ đánh giá đã được ẩn chưa (mất kết nối hoặc quá thời gian chờ). Lý do của bạn vẫn còn ở đây.',
        kind: 'uncertain',
        code: null,
      });
    }
  });

  it('WKD-22 lỗi không phải của lớp API (lỗi lập trình) ⇒ `retry` câu chung', () => {
    for (const error of [new Error('hỏng'), 'chuỗi', null, undefined, 42]) {
      expect(describeHideFailure(error)).toEqual({
        message: GENERIC_ERROR_MESSAGE,
        kind: 'retry',
        code: null,
      });
    }
  });

  it('WKD-22 KHÔNG BAO GIỜ in `thongBao` của máy chủ, ở mọi mã', () => {
    for (const maLoi of [
      'DU_LIEU_KHONG_HOP_LE',
      'DANH_GIA_DA_AN',
      'KHONG_TIM_THAY',
      'HE_THONG_DANG_BAN',
      'KHONG_DU_QUYEN',
      'CHUA_DANG_NHAP',
      'LOI_LA',
    ]) {
      const failure = describeHideFailure(apiError(400, maLoi));
      expect(failure.message ?? '', maLoi).not.toContain(MACHINE_TEXT);
    }
  });
});

describe('doctor-exam F8 — chữ (WKD-22)', () => {
  it('WKD-22 số trong chữ lấy từ hằng (MỘT nơi) và câu của Figma/PLAN giữ nguyên văn', () => {
    expect(HIDE_TEXT.title).toBe('Ẩn đánh giá');
    expect(HIDE_TEXT.confirm).toBe('Xác nhận ẩn');
    expect(HIDE_TEXT.placeholder).toBe(
      'Nhập lý do ẩn đánh giá (tối thiểu 10 ký tự)...',
    );
    expect(HIDE_TEXT.warning).toBe(
      'Đánh giá sẽ không còn hiển thị công khai nhưng vẫn được lưu trong hệ thống để truy vết. Hành động này sẽ được ghi vào Nhật ký hành động.',
    );
    expect(HIDE_TEXT.tooShort).toBe('Lý do ẩn cần ít nhất 10 ký tự.');
    expect(HIDE_TEXT.tooLong).toBe('Tối đa 255 ký tự.');
  });
});
