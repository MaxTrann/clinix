import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
  type ApiErrorBody,
} from '../../../shared/api/errors';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '../../../shared/api/error-message';
import {
  describeLoginError,
  lockAnnouncement,
  validateLoginForm,
  verifyEmailHandoff,
  type LoginFailure,
} from './login-errors';

// Task F3. Mã ca LP-nn là [đề xuất]; ca nào phủ test case của PLAN thì ghi kèm mã đó.
function apiError(status: number, body: Partial<ApiErrorBody>): ApiError {
  // `thongBao` cố ý khác mọi câu của PLAN 5.5: lọt ra màn hình là test đỏ
  return new ApiError(status, { maLoi: 'X', thongBao: 'CÂU CỦA API', ...body });
}

const WRONG_LOGIN = 'Email hoặc mật khẩu không đúng.';
const SUSPENDED =
  'Tài khoản đã bị ngưng hoạt động. Vui lòng liên hệ quản trị viên.';
const PENDING =
  'Tài khoản nhân sự này chưa được kích hoạt. Hãy dùng link kích hoạt trong email để thiết lập mật khẩu.';
const UNVERIFIED =
  'Email của bạn chưa được xác minh. Nhập mã OTP đã nhận hoặc bấm "Gửi lại mã".';
const REREGISTER =
  'Yêu cầu xác minh email không còn hiệu lực. Vui lòng đăng ký lại bằng email này.';
const SYSTEM = 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.';
const ORIGIN = 'Yêu cầu không đến từ trang web được phép.';
const INVALID_DATA = 'Dữ liệu không hợp lệ.';
const INVALID_PASSWORD =
  'Mật khẩu từ 8 đến 64 ký tự, gồm ít nhất một chữ số và một ký tự đặc biệt (ví dụ ! @ # $ % .).';

describe('describeLoginError: câu theo maLoi (PLAN 5.5)', () => {
  it.each([
    ['LP-01 (DN-24) sai thông tin', 401, 'DANG_NHAP_SAI', WRONG_LOGIN, true],
    ['LP-02 (DN-24) ngưng', 403, 'TAI_KHOAN_NGUNG', SUSPENDED, true],
    [
      'LP-03 (DN-24) chưa kích hoạt',
      403,
      'TAI_KHOAN_CHUA_KICH_HOAT',
      PENDING,
      true,
    ],
    ['LP-04 lỗi hệ thống', 500, 'LOI_HE_THONG', SYSTEM, false],
    ['LP-05 sai Origin', 403, 'ORIGIN_KHONG_HOP_LE', ORIGIN, false],
  ])('%s', (_name, status, maLoi, message, clearPassword) => {
    expect(describeLoginError(apiError(status, { maLoi }))).toEqual({
      kind: 'message',
      message,
      clearPassword,
    });
  });

  it('LP-06 chọn theo maLoi, không theo HTTP: DANG_NHAP_SAI ở status lạ vẫn đúng câu', () => {
    expect(
      describeLoginError(apiError(418, { maLoi: 'DANG_NHAP_SAI' })),
    ).toMatchObject({ message: WRONG_LOGIN });
  });

  it('LP-07 mã lạ về câu chung, không bao giờ in thongBao', () => {
    expect(
      describeLoginError(apiError(400, { maLoi: 'MA_CHUA_TUNG_THAY' })),
    ).toEqual({
      kind: 'message',
      message: GENERIC_ERROR_MESSAGE,
      clearPassword: false,
    });
  });

  it.each([
    [
      'PHIEN_HET_HIEU_LUC',
      'Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.',
    ],
    [
      'TOKEN_KHONG_HOP_LE',
      'Phiên làm việc không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
    ],
    ['CHUA_DANG_NHAP', 'Vui lòng đăng nhập để tiếp tục.'],
  ])('LP-08 401 ở bước /auth/me: %s', (maLoi, message) => {
    expect(describeLoginError(apiError(401, { maLoi }))).toEqual({
      kind: 'message',
      message,
      clearPassword: false,
    });
  });
});

describe('describeLoginError: lỗi không phải ApiError', () => {
  it.each([
    ['LP-09 mất mạng', new NetworkError(), NETWORK_ERROR_MESSAGE],
    ['LP-10 timeout', new TimeoutError(), TIMEOUT_ERROR_MESSAGE],
    [
      'LP-11 phản hồi lạ',
      new UnexpectedResponseError(502),
      GENERIC_ERROR_MESSAGE,
    ],
    ['LP-12 lỗi bất kỳ', new Error('nổ'), GENERIC_ERROR_MESSAGE],
  ])('%s: giữ mật khẩu để khỏi gõ lại (D3)', (_name, error, message) => {
    expect(describeLoginError(error)).toEqual({
      kind: 'message',
      message,
      clearPassword: false,
    });
  });

  it('LP-13 nơi gọi tự huỷ thì không báo gì', () => {
    expect(describeLoginError(new RequestAbortedError())).toEqual({
      kind: 'ignored',
    });
  });
});

describe('describeLoginError: khoá tạm', () => {
  it('LP-14 (DN-24) lấy đúng soGiayConLai, không dùng khoaDen', () => {
    const error = apiError(429, {
      maLoi: 'TAI_KHOAN_BI_KHOA_TAM',
      chiTiet: { soGiayConLai: 873, khoaDen: '2000-01-01T00:00:00.000Z' },
    });
    expect(describeLoginError(error)).toEqual({ kind: 'locked', seconds: 873 });
  });

  it.each([
    ['không có chiTiet', undefined],
    ['chuỗi', { soGiayConLai: '60' }],
    ['số 0', { soGiayConLai: 0 }],
    ['số âm', { soGiayConLai: -1 }],
    ['NaN', { soGiayConLai: Number.NaN }],
    ['vô hạn', { soGiayConLai: Number.POSITIVE_INFINITY }],
  ])('LP-15 chiTiet sai dạng (%s): câu chung, không khoá', (_name, chiTiet) => {
    expect(
      describeLoginError(
        apiError(429, { maLoi: 'TAI_KHOAN_BI_KHOA_TAM', chiTiet }),
      ),
    ).toEqual({
      kind: 'message',
      message: GENERIC_ERROR_MESSAGE,
      clearPassword: false,
    });
  });

  it.each([
    [900, 15],
    [841, 15],
    [840, 14],
    [61, 2],
    [60, 1],
    [1, 1],
  ])('LP-16 câu đọc một lần: %i giây là khoảng %i phút', (seconds, minutes) => {
    expect(lockAnnouncement(seconds)).toBe(
      `Tài khoản bị khóa tạm thời do nhập sai nhiều lần. Thử lại sau khoảng ${minutes} phút.`,
    );
  });
});

describe('describeLoginError: EMAIL_CHUA_XAC_MINH (N2)', () => {
  const unverified = (chiTiet: unknown) =>
    describeLoginError(
      apiError(403, { maLoi: 'EMAIL_CHUA_XAC_MINH', chiTiet }),
    );

  it.each(['ConHan', 'HetHan', 'DaThuHoi', 'ChuaGui'])(
    'LP-17 %s: có câu và chiTiet nguyên dạng để nhập mã',
    (trangThaiMa) => {
      const chiTiet = {
        maXacThucId: '42',
        trangThaiMa,
        hetHanLuc: '2026-11-01T10:00:00.000Z',
      };
      expect(unverified(chiTiet)).toEqual({
        kind: 'unverified',
        message: UNVERIFIED,
        chiTiet,
      });
    },
  );

  it('LP-18 CanDangKyLai với hai trường null: hướng tới đăng ký lại, không có chiTiet', () => {
    expect(
      unverified({
        maXacThucId: null,
        trangThaiMa: 'CanDangKyLai',
        hetHanLuc: null,
      }),
    ).toEqual({ kind: 'reregister', message: REREGISTER });
  });

  it.each([
    ['không có chiTiet', undefined],
    [
      'id null ở trạng thái còn mã',
      { maXacThucId: null, trangThaiMa: 'ConHan' },
    ],
    ['id là số', { maXacThucId: 42, trangThaiMa: 'ConHan' }],
    ['id rỗng', { maXacThucId: '', trangThaiMa: 'ConHan' }],
    ['trạng thái lạ', { maXacThucId: '42', trangThaiMa: 'Khac' }],
  ])(
    'LP-19 chiTiet sai dạng (%s): chỉ hiện câu, không bao giờ mở đường tới verify-otp',
    (_name, chiTiet) => {
      expect(unverified(chiTiet)).toEqual({
        kind: 'message',
        message: UNVERIFIED,
        clearPassword: false,
      });
    },
  );

  it('LP-20 state bàn giao cho F2 chỉ có email và chiTiet, không có mật khẩu', () => {
    const chiTiet = {
      maXacThucId: '42',
      trangThaiMa: 'ConHan' as const,
      hetHanLuc: null,
    };
    expect(verifyEmailHandoff('a@b.vn', chiTiet)).toStrictEqual({
      email: 'a@b.vn',
      chiTiet,
    });
  });
});

describe('describeLoginError: lỗi theo ô', () => {
  const invalid = (loi?: { truong: string; ma: string }[]) =>
    describeLoginError(apiError(400, { maLoi: 'DU_LIEU_KHONG_HOP_LE', loi }));

  it('LP-21 gán đúng ô theo truong, câu theo ma', () => {
    expect(
      invalid([
        { truong: 'email', ma: 'EMAIL_KHONG_HOP_LE' },
        { truong: 'matKhau', ma: 'MAT_KHAU_KHONG_HOP_LE' },
      ]),
    ).toEqual({
      kind: 'fields',
      fields: { email: 'Email không hợp lệ.', matKhau: INVALID_PASSWORD },
    });
  });

  it('LP-22 ma lạ trên ô đã biết: câu chung của ô đó', () => {
    expect(invalid([{ truong: 'matKhau', ma: 'IS_STRING' }])).toEqual({
      kind: 'fields',
      fields: { matKhau: INVALID_DATA },
    });
  });

  it('LP-23 ô đầu tiên của cùng một trường được giữ', () => {
    expect(
      invalid([
        { truong: 'email', ma: 'EMAIL_KHONG_HOP_LE' },
        { truong: 'email', ma: 'IS_STRING' },
      ]),
    ).toEqual({
      kind: 'fields',
      fields: { email: 'Email không hợp lệ.' },
    });
  });

  it.each([
    ['không có loi', undefined],
    ['loi rỗng', []],
    ['trường lạ', [{ truong: 'hoTen', ma: 'TRUONG_KHONG_DUOC_PHEP' }]],
  ])('LP-24 %s: về hộp đầu form', (_name, loi) => {
    expect(invalid(loi)).toEqual({
      kind: 'message',
      message: INVALID_DATA,
      clearPassword: false,
    });
  });

  it('LP-25 có cả ô đã biết lẫn trường lạ: vẫn gán vào ô', () => {
    expect(
      invalid([
        { truong: 'hoTen', ma: 'TRUONG_KHONG_DUOC_PHEP' },
        { truong: 'email', ma: 'EMAIL_KHONG_HOP_LE' },
      ]),
    ).toEqual({
      kind: 'fields',
      fields: { email: 'Email không hợp lệ.' },
    });
  });
});

describe('G1: không bao giờ có "Còn N lần"', () => {
  const details = [
    undefined,
    { soGiayConLai: 60 },
    { conLai: 4, soLanConLai: 4 },
  ];
  const codes = [
    'DANG_NHAP_SAI',
    'TAI_KHOAN_BI_KHOA_TAM',
    'TAI_KHOAN_NGUNG',
    'TAI_KHOAN_CHUA_KICH_HOAT',
    'EMAIL_CHUA_XAC_MINH',
    'DU_LIEU_KHONG_HOP_LE',
    'LOI_HE_THONG',
  ];

  function textOf(failure: LoginFailure): string {
    return JSON.stringify(failure);
  }

  it('LP-26 (DN-07) mọi mã, kể cả thongBao của API có chữ đó', () => {
    for (const maLoi of codes) {
      for (const chiTiet of details) {
        const failure = describeLoginError(
          apiError(401, {
            maLoi,
            chiTiet,
            thongBao: 'Còn 4 lần thử trước khi bị khóa tạm thời.',
          }),
        );
        expect(textOf(failure)).not.toMatch(/Còn|lần thử/);
      }
    }
  });
});

describe('validateLoginForm', () => {
  it('LP-27 hợp lệ: không có lỗi', () => {
    expect(validateLoginForm('a@b.vn', 'x')).toEqual({});
  });

  it('LP-28 trống cả hai: hai câu riêng', () => {
    expect(validateLoginForm('', '')).toEqual({
      email: 'Vui lòng nhập email.',
      matKhau: 'Vui lòng nhập mật khẩu.',
    });
  });

  it('LP-29 email chỉ có khoảng trắng coi như trống', () => {
    expect(validateLoginForm('   ', 'x')).toEqual({
      email: 'Vui lòng nhập email.',
    });
  });

  it('LP-30 không kiểm định dạng email: việc của API', () => {
    expect(validateLoginForm('khong-phai-email', 'x')).toEqual({});
  });

  it('LP-31 mật khẩu toàn dấu cách vẫn hợp lệ: không trim', () => {
    expect(validateLoginForm('a@b.vn', '   ')).toEqual({});
  });

  it('LP-32 biên độ dài mật khẩu: 64 được, 65 không', () => {
    expect(validateLoginForm('a@b.vn', 'x'.repeat(64))).toEqual({});
    expect(validateLoginForm('a@b.vn', 'x'.repeat(65))).toEqual({
      matKhau: INVALID_PASSWORD,
    });
  });
});
