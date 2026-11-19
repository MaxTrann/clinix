import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '../../../shared/api/error-message';
import {
  FORBIDDEN_MESSAGE,
  INVALID_REQUEST_MESSAGE,
  NOT_FOUND_MESSAGE,
  SERVER_ERROR_MESSAGE,
  UNKNOWN_RESULT_HINT,
  describeActionFailure,
  describeLoadFailure,
  isNotFoundError,
  isPageOutOfRange,
} from './account-errors';

// admin F9, ánh xạ mã lỗi sang chữ (mã TKF9-06 đến 08 là [đề xuất], TRACKING admin 9A.12 mục 3). Phủ TK-26 phần "hiển thị lỗi A1 đến A6".

const api = (
  status: number,
  maLoi: string,
  extra: { loi?: { truong: string; ma: string }[]; thongBao?: string } = {},
) =>
  new ApiError(status, {
    maLoi,
    thongBao: extra.thongBao ?? 'câu của API',
    loi: extra.loi,
  });

describe('TKF9-06 mọi mã lỗi ở bảng 2.6 ra đúng chữ (chữ PLAN 5.9 nguyên văn)', () => {
  it.each([
    [403, 'KHONG_DU_QUYEN', 'Bạn không có quyền thực hiện thao tác này.'],
    [404, 'KHONG_TIM_THAY', 'Không tìm thấy dữ liệu.'],
    [
      409,
      'TRANG_THAI_KHONG_PHU_HOP',
      'Trạng thái hiện tại của tài khoản không cho phép thao tác này.',
    ],
    [409, 'TU_KHOA_TAI_KHOAN', 'Không thể tự khoá tài khoản của chính mình.'],
    [
      409,
      'CON_IT_NHAT_MOT_ADMIN_TOAN_HE_THONG',
      'Phải còn ít nhất một Quản trị viên Toàn hệ thống đang hoạt động.',
    ],
    [
      409,
      'TAI_KHOAN_CHO_KICH_HOAT',
      'Tài khoản đang chờ kích hoạt. Hãy dùng "Gửi lại liên kết kích hoạt".',
    ],
  ] as const)('TKF9-06 %s %s', (status, maLoi, text) => {
    expect(describeActionFailure(api(status, maLoi))).toBe(text);
  });

  it('TKF9-06 400 theo mã mức trường: không phải Bệnh nhân, mã tài khoản sai dạng', () => {
    expect(
      describeActionFailure(
        api(400, 'DU_LIEU_KHONG_HOP_LE', {
          loi: [{ truong: 'id', ma: 'TAI_KHOAN_KHONG_PHAI_BENH_NHAN' }],
        }),
      ),
    ).toBe('Chỉ mở khoá no-show được cho tài khoản Bệnh nhân.');
    expect(
      describeActionFailure(
        api(400, 'DU_LIEU_KHONG_HOP_LE', {
          loi: [{ truong: 'id', ma: 'MA_TAI_KHOAN_KHONG_HOP_LE' }],
        }),
      ),
    ).toBe('Mã tài khoản không hợp lệ.');
  });

  it('TKF9-06 400 với mã trường lạ hoặc không có `loi`: câu chung về yêu cầu không hợp lệ', () => {
    expect(
      describeActionFailure(
        api(400, 'DU_LIEU_KHONG_HOP_LE', {
          loi: [{ truong: 'x', ma: 'MA_LA' }],
        }),
      ),
    ).toBe(INVALID_REQUEST_MESSAGE);
    expect(describeActionFailure(api(400, 'DU_LIEU_KHONG_HOP_LE'))).toBe(
      INVALID_REQUEST_MESSAGE,
    );
  });

  it('TKF9-06 500 LOI_HE_THONG: nói chắc là tài khoản chưa bị đổi', () => {
    expect(describeActionFailure(api(500, 'LOI_HE_THONG'))).toBe(
      SERVER_ERROR_MESSAGE,
    );
    expect(SERVER_ERROR_MESSAGE).toContain('chưa bị thay đổi');
  });

  it('TKF9-06 mã HTTP 403 hoặc 404 với mã lạ vẫn ra câu quyền hoặc không tìm thấy', () => {
    expect(describeActionFailure(api(403, 'MA_LA'))).toBe(FORBIDDEN_MESSAGE);
    expect(describeActionFailure(api(404, 'MA_LA'))).toBe(NOT_FOUND_MESSAGE);
  });

  it('TKF9-06 mã lạ khác: câu chung', () => {
    expect(describeActionFailure(api(418, 'MA_LA'))).toBe(
      GENERIC_ERROR_MESSAGE,
    );
    expect(describeActionFailure(api(500, 'MA_LA'))).toBe(
      GENERIC_ERROR_MESSAGE,
    );
  });
});

describe('TKF9-07 chọn câu theo MÃ, không theo `thongBao` và không bị nguyên mẫu đánh lừa', () => {
  it('TKF9-07 `thongBao` của API khác đi thì chữ vẫn là chữ của mã', () => {
    expect(
      describeActionFailure(
        api(409, 'TU_KHOA_TAI_KHOAN', { thongBao: 'Một câu hoàn toàn khác' }),
      ),
    ).toBe('Không thể tự khoá tài khoản của chính mình.');
  });

  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])(
    'TKF9-07 mã "%s" không lọt qua nguyên mẫu của đối tượng',
    (maLoi) => {
      expect(describeActionFailure(api(409, maLoi))).toBe(
        GENERIC_ERROR_MESSAGE,
      );
      expect(
        describeActionFailure(
          api(400, 'DU_LIEU_KHONG_HOP_LE', {
            loi: [{ truong: 'id', ma: maLoi }],
          }),
        ),
      ).toBe(INVALID_REQUEST_MESSAGE);
    },
  );
});

describe('TKF9-08 mạng, hết hạn chờ, phản hồi lạ', () => {
  it('TKF9-08 mất mạng và hết hạn chờ: nói rõ CHƯA RÕ thao tác đã chạy hay chưa', () => {
    expect(describeActionFailure(new NetworkError())).toBe(
      `${NETWORK_ERROR_MESSAGE} ${UNKNOWN_RESULT_HINT}`,
    );
    expect(describeActionFailure(new TimeoutError())).toBe(
      `${TIMEOUT_ERROR_MESSAGE} ${UNKNOWN_RESULT_HINT}`,
    );
  });

  it('TKF9-08 phản hồi không phải JSON, huỷ, lỗi lạ: câu chung', () => {
    expect(describeActionFailure(new UnexpectedResponseError(502))).toBe(
      GENERIC_ERROR_MESSAGE,
    );
    expect(describeActionFailure(new RequestAbortedError())).toBe(
      GENERIC_ERROR_MESSAGE,
    );
    expect(describeActionFailure(new Error('x'))).toBe(GENERIC_ERROR_MESSAGE);
    expect(describeActionFailure('chuỗi')).toBe(GENERIC_ERROR_MESSAGE);
    expect(describeActionFailure(undefined)).toBe(GENERIC_ERROR_MESSAGE);
  });

  it('TKF9-08 lỗi TẢI: 403 và 404 có câu riêng, mạng và hết hạn dùng câu chung của client', () => {
    expect(describeLoadFailure(api(403, 'KHONG_DU_QUYEN'))).toBe(
      FORBIDDEN_MESSAGE,
    );
    expect(describeLoadFailure(api(404, 'KHONG_TIM_THAY'))).toBe(
      NOT_FOUND_MESSAGE,
    );
    expect(describeLoadFailure(new NetworkError())).toBe(NETWORK_ERROR_MESSAGE);
    expect(describeLoadFailure(new TimeoutError())).toBe(TIMEOUT_ERROR_MESSAGE);
    expect(describeLoadFailure(api(500, 'LOI_HE_THONG'))).toBe(
      GENERIC_ERROR_MESSAGE,
    );
  });

  it('TKF9-08 nhận diện 404 và trang vượt', () => {
    expect(isNotFoundError(api(404, 'KHONG_TIM_THAY'))).toBe(true);
    expect(isNotFoundError(api(404, 'MA_LA'))).toBe(true);
    expect(isNotFoundError(api(409, 'KHONG_TIM_THAY'))).toBe(true);
    expect(isNotFoundError(api(409, 'TRANG_THAI_KHONG_PHU_HOP'))).toBe(false);
    expect(isNotFoundError(new NetworkError())).toBe(false);
    expect(
      isPageOutOfRange(
        api(400, 'DU_LIEU_KHONG_HOP_LE', {
          loi: [{ truong: 'page', ma: 'TRANG_KHONG_HOP_LE' }],
        }),
      ),
    ).toBe(true);
    expect(
      isPageOutOfRange(
        api(400, 'DU_LIEU_KHONG_HOP_LE', {
          loi: [{ truong: 'q', ma: 'TU_KHOA_QUA_DAI' }],
        }),
      ),
    ).toBe(false);
    expect(isPageOutOfRange(api(400, 'DU_LIEU_KHONG_HOP_LE'))).toBe(false);
    expect(isPageOutOfRange(new Error('x'))).toBe(false);
  });
});
