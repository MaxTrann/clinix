import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
  type ApiErrorBody,
} from '../../../shared/api/errors';
import {
  NOT_REGISTERED_MESSAGE,
  PENDING_ACTIVATION_MESSAGE,
  TOKEN_EXPIRED_MESSAGE,
  describeCodeError,
  describeCodeRequestError,
  describeResetError,
} from './forgot-errors';

// Task F4. Mã ca QE-nn là [đề xuất].
const apiError = (status: number, body: Partial<ApiErrorBody>) =>
  new ApiError(status, { thongBao: 'CÂU CỦA API', maLoi: 'X', ...body });

describe('lỗi chung', () => {
  it.each([
    [
      'timeout',
      new TimeoutError(),
      'Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.',
    ],
    [
      'mạng',
      new NetworkError(),
      'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.',
    ],
    [
      'phản hồi lạ',
      new UnexpectedResponseError(502),
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    ],
    [
      'mã lạ',
      apiError(409, { maLoi: 'MA_LA' }),
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    ],
  ])(
    'QE-01 %s: câu chung, không bao giờ dùng thongBao',
    (_name, error, message) => {
      for (const describe of [
        describeCodeRequestError,
        describeCodeError,
        describeResetError,
      ]) {
        expect(describe(error)).toStrictEqual({ kind: 'message', message });
      }
    },
  );

  it('QE-02 huỷ: bỏ qua', () => {
    for (const describe of [
      describeCodeRequestError,
      describeCodeError,
      describeResetError,
    ]) {
      expect(describe(new RequestAbortedError())).toStrictEqual({
        kind: 'ignored',
      });
    }
  });
});

describe('describeCodeRequestError (bước 1 và Gửi lại mã)', () => {
  it.each([
    [
      { coTheGuiLaiLuc: '2026-11-03T10:01:00.000Z' },
      '2026-11-03T10:01:00.000Z',
    ],
    [{ coTheGuiLaiLuc: '' }, null],
    [{ coTheGuiLaiLuc: 60 }, null],
    [undefined, null],
    // Dạng của đăng ký (có thêm id) vẫn đọc được mốc, id bị bỏ qua
    [
      { maXacThucId: '7', coTheGuiLaiLuc: '2026-11-03T10:01:00.000Z' },
      '2026-11-03T10:01:00.000Z',
    ],
  ])('QE-10 503 GUI_MAIL_LOI chiTiet %j: mốc %s', (chiTiet, at) => {
    expect(
      describeCodeRequestError(
        apiError(503, { maLoi: 'GUI_MAIL_LOI', chiTiet }),
      ),
    ).toStrictEqual({ kind: 'mailFailed', coTheGuiLaiLuc: at });
  });

  it('QE-11 404 EMAIL_CHUA_DANG_KY và 403 TAI_KHOAN_CHUA_KICH_HOAT: về bước 1 kèm câu', () => {
    expect(
      describeCodeRequestError(apiError(404, { maLoi: 'EMAIL_CHUA_DANG_KY' })),
    ).toStrictEqual({ kind: 'backToEmail', message: NOT_REGISTERED_MESSAGE });
    expect(
      describeCodeRequestError(
        apiError(403, { maLoi: 'TAI_KHOAN_CHUA_KICH_HOAT' }),
      ),
    ).toStrictEqual({
      kind: 'backToEmail',
      message: PENDING_ACTIVATION_MESSAGE,
    });
  });

  it('QE-12 DU_LIEU_KHONG_HOP_LE: trường email có mã lạ ra câu chung', () => {
    expect(
      describeCodeRequestError(
        apiError(400, {
          maLoi: 'DU_LIEU_KHONG_HOP_LE',
          loi: [{ truong: 'email', ma: 'IS_STRING' }],
        }),
      ),
    ).toStrictEqual({ kind: 'emailField', message: 'Dữ liệu không hợp lệ.' });
  });
});

describe('describeCodeError (verify-otp)', () => {
  it.each([
    ['GUI_LAI_QUA_SOM', 'Đã có lỗi xảy ra. Vui lòng thử lại sau.'],
    ['GUI_MAIL_LOI', 'Đã có lỗi xảy ra. Vui lòng thử lại sau.'],
    [
      'TAI_KHOAN_NGUNG',
      'Tài khoản đã bị ngưng hoạt động. Vui lòng liên hệ quản trị viên.',
    ],
    [
      'CAN_DANG_KY_LAI',
      'Yêu cầu xác minh không còn hiệu lực. Vui lòng đăng ký lại bằng email này.',
    ],
  ])(
    'QE-20 %s (API của bước này không trả): không đổi trạng thái ô, chỉ hiện câu',
    (maLoi, message) => {
      expect(describeCodeError(apiError(400, { maLoi }))).toStrictEqual({
        kind: 'message',
        message,
      });
    },
  );
});

describe('describeResetError (reset-password)', () => {
  it('QE-30 RESET_TOKEN_HET_HIEU_LUC: về bước 1 với câu 5.5', () => {
    expect(
      describeResetError(apiError(403, { maLoi: 'RESET_TOKEN_HET_HIEU_LUC' })),
    ).toStrictEqual({ kind: 'backToEmail', message: TOKEN_EXPIRED_MESSAGE });
  });

  it('QE-31 400 theo trường: lỗi đầu tiên của mỗi trường thắng', () => {
    expect(
      describeResetError(
        apiError(400, {
          maLoi: 'DU_LIEU_KHONG_HOP_LE',
          loi: [
            { truong: 'matKhauMoi', ma: 'MAT_KHAU_KY_TU_KHONG_HOP_LE' },
            { truong: 'matKhauMoi', ma: 'MAT_KHAU_KHONG_HOP_LE' },
            { truong: 'xacNhan', ma: 'LA' },
          ],
        }),
      ),
    ).toStrictEqual({
      kind: 'fields',
      fields: {
        matKhauMoi:
          'Mật khẩu chỉ được dùng chữ không dấu, chữ số, dấu câu/ký hiệu và dấu cách.',
        xacNhan: 'Dữ liệu không hợp lệ.',
      },
    });
  });
});
