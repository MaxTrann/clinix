import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
  type ApiErrorBody,
} from '../../../shared/api/errors';
import { ChangePasswordNotSentError } from '../auth-session';
import {
  CURRENT_REQUIRED_MESSAGE,
  NOT_SENT_MESSAGE,
  UNKNOWN_RESULT_MESSAGE,
  WRONG_CURRENT_MESSAGE,
  describeChangePasswordError,
  validateChangePassword,
} from './change-password-errors';

// Task F5 (TRACKING auth F5-C). Mã ca CE-nn là [đề xuất].
const RULE =
  'Mật khẩu từ 8 đến 64 ký tự, gồm ít nhất một chữ số và một ký tự đặc biệt (ví dụ ! @ # $ % .).';
const CHARS =
  'Mật khẩu chỉ được dùng chữ không dấu, chữ số, dấu câu/ký hiệu và dấu cách.';
const MISMATCH = 'Mật khẩu xác nhận không khớp.';

const apiError = (status: number, body: Partial<ApiErrorBody>) =>
  new ApiError(status, { thongBao: 'CÂU CỦA API', maLoi: 'X', ...body });
const invalid = (loi: { truong: string; ma: string }[]) =>
  apiError(400, { maLoi: 'DU_LIEU_KHONG_HOP_LE', loi });

describe('kiểm trước khi gửi', () => {
  const good = { matKhauCu: 'x', matKhauMoi: 'Moi@1234', xacNhan: 'Moi@1234' };

  it('CE-01 hợp lệ: không lỗi; mật khẩu hiện tại yếu vẫn nhận (chính sách mới không áp cho mật khẩu cũ)', () => {
    expect(validateChangePassword(good)).toEqual({});
  });

  it('CE-12 N9 mật khẩu hiện tại toàn dấu cách không bị coi là trống (không trim)', () => {
    expect(validateChangePassword({ ...good, matKhauCu: '        ' })).toEqual(
      {},
    );
    expect(validateChangePassword({ ...good, matKhauCu: ' ' })).toEqual({});
  });

  it('CE-02 ô hiện tại trống / đúng 64 / 65 ký tự', () => {
    expect(validateChangePassword({ ...good, matKhauCu: '' })).toEqual({
      matKhauCu: CURRENT_REQUIRED_MESSAGE,
    });
    expect(
      validateChangePassword({ ...good, matKhauCu: 'a'.repeat(64) }),
    ).toEqual({});
    expect(
      validateChangePassword({ ...good, matKhauCu: 'a'.repeat(65) }),
    ).toEqual({ matKhauCu: WRONG_CURRENT_MESSAGE });
  });

  it('CE-03 DM-04 mật khẩu mới yếu, có dấu, không khớp; không trim', () => {
    expect(
      validateChangePassword({
        ...good,
        matKhauMoi: 'Moi12345',
        xacNhan: 'Moi12345',
      }),
    ).toEqual({ matKhauMoi: RULE });
    expect(
      validateChangePassword({
        ...good,
        matKhauMoi: 'Mới@1234',
        xacNhan: 'Mới@1234',
      }),
    ).toEqual({ matKhauMoi: CHARS });
    expect(validateChangePassword({ ...good, xacNhan: 'Moi@1234 ' })).toEqual({
      xacNhan: MISMATCH,
    });
  });
});

describe('lỗi của API theo maLoi', () => {
  it('CE-04 DM-03 MAT_KHAU_CU_SAI: ô hiện tại', () => {
    expect(
      describeChangePasswordError(apiError(400, { maLoi: 'MAT_KHAU_CU_SAI' })),
    ).toEqual({ kind: 'fields', fields: { matKhauCu: WRONG_CURRENT_MESSAGE } });
  });

  it('CE-05 DU_LIEU_KHONG_HOP_LE: theo trường, giữ lỗi đầu của mỗi trường, bỏ trường lạ', () => {
    expect(
      describeChangePasswordError(
        invalid([
          { truong: 'matKhauCu', ma: 'MAT_KHAU_KHONG_HOP_LE' },
          { truong: 'matKhauMoi', ma: 'MAT_KHAU_KY_TU_KHONG_HOP_LE' },
          { truong: 'matKhauMoi', ma: 'MAT_KHAU_KHONG_HOP_LE' },
          { truong: 'xacNhan', ma: 'XAC_NHAN_KHONG_KHOP' },
          { truong: 'taiKhoanId', ma: 'TRUONG_KHONG_DUOC_PHEP' },
        ]),
      ),
    ).toEqual({
      kind: 'fields',
      fields: {
        matKhauCu: WRONG_CURRENT_MESSAGE,
        matKhauMoi: CHARS,
        xacNhan: MISMATCH,
      },
    });
  });

  it('CE-06 DU_LIEU_KHONG_HOP_LE mã lạ hoặc không trường nào khớp', () => {
    expect(
      describeChangePasswordError(
        invalid([{ truong: 'matKhauMoi', ma: 'MA_LA' }]),
      ),
    ).toEqual({
      kind: 'fields',
      fields: { matKhauMoi: 'Dữ liệu không hợp lệ.' },
    });
    expect(
      describeChangePasswordError(
        invalid([{ truong: 'taiKhoanId', ma: 'TRUONG_KHONG_DUOC_PHEP' }]),
      ),
    ).toEqual({ kind: 'message', message: 'Dữ liệu không hợp lệ.' });
    expect(describeChangePasswordError(invalid([]))).toEqual({
      kind: 'message',
      message: 'Dữ liệu không hợp lệ.',
    });
  });

  it('CE-07 LOI_HE_THONG: câu hệ thống, giữ dữ liệu (kind message)', () => {
    expect(
      describeChangePasswordError(apiError(500, { maLoi: 'LOI_HE_THONG' })),
    ).toEqual({
      kind: 'message',
      message: 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
    });
  });

  it('CE-08 401 còn lại và mã lạ: câu chung, không dùng thongBao', () => {
    for (const error of [
      apiError(401, { maLoi: 'TOKEN_KHONG_HOP_LE' }),
      apiError(403, { maLoi: 'MA_LA' }),
    ]) {
      expect(describeChangePasswordError(error)).toEqual({
        kind: 'message',
        message: 'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
      });
    }
  });
});

describe('lỗi không có câu trả lời của API', () => {
  it.each([
    ['mất mạng', new NetworkError()],
    ['hết hạn chờ', new TimeoutError()],
    ['502 của nginx', new UnexpectedResponseError(502)],
    ['504 của nginx', new UnexpectedResponseError(504)],
  ])('CE-09 %s sau khi đã gửi: không rõ kết quả', (_name, error) => {
    expect(describeChangePasswordError(error)).toEqual({
      kind: 'unknown',
      message: UNKNOWN_RESULT_MESSAGE,
    });
  });

  it('CE-10 chưa gửi được (chờ khoá quá hạn): câu riêng, giữ dữ liệu', () => {
    expect(
      describeChangePasswordError(new ChangePasswordNotSentError()),
    ).toEqual({ kind: 'message', message: NOT_SENT_MESSAGE });
  });

  it('CE-11 bị huỷ (đăng xuất): bỏ qua; lỗi lạ: câu chung', () => {
    expect(describeChangePasswordError(new RequestAbortedError())).toEqual({
      kind: 'ignored',
    });
    expect(describeChangePasswordError(new Error('x'))).toEqual({
      kind: 'message',
      message: 'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    });
  });
});
