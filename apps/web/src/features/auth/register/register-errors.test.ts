import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
} from '../../../shared/api/errors';
import {
  PASSWORD_RULE_MESSAGE,
  describeRegisterError,
  validateRegisterForm,
} from './register-errors';

// Task F2. Mã ca RG-nn là [đề xuất].
const api = (status: number, maLoi: string, extra: object = {}) =>
  new ApiError(status, { maLoi, thongBao: 'CÂU CỦA API', ...extra });

const GOOD = {
  hoTen: 'Nguyễn Văn A',
  email: 'a@b.vn',
  soDienThoai: '0901234567',
  matKhau: 'Matkhau@1',
  xacNhan: 'Matkhau@1',
};

describe('describeRegisterError', () => {
  it('RG-01 lỗi theo ô: đủ các mã, gán đúng ô, chọn câu theo `ma`', () => {
    const failure = describeRegisterError(
      api(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [
          { truong: 'hoTen', ma: 'HO_TEN_KHONG_HOP_LE' },
          { truong: 'email', ma: 'EMAIL_KHONG_HOP_LE' },
          { truong: 'soDienThoai', ma: 'SDT_KHONG_HOP_LE' },
          { truong: 'matKhau', ma: 'MAT_KHAU_KY_TU_KHONG_HOP_LE' },
          { truong: 'matKhau', ma: 'MAT_KHAU_KHONG_HOP_LE' },
          { truong: 'xacNhan', ma: 'XAC_NHAN_KHONG_KHOP' },
        ],
      }),
    );
    expect(failure).toEqual({
      kind: 'fields',
      fields: {
        hoTen:
          'Họ tên phải có ít nhất một chữ cái, tối đa 100 ký tự và không chứa ký tự điều khiển.',
        email: 'Email không hợp lệ.',
        soDienThoai: 'Số điện thoại phải 10 số, bắt đầu bằng 0.',
        matKhau:
          'Mật khẩu chỉ được dùng chữ không dấu, chữ số, dấu câu/ký hiệu và dấu cách.',
        xacNhan: 'Mật khẩu xác nhận không khớp.',
      },
    });
  });

  it('RG-02 `ma` lạ ở ô có thật: câu chung; `truong` lạ hoặc không có `loi`: hộp lỗi', () => {
    expect(
      describeRegisterError(
        api(400, 'DU_LIEU_KHONG_HOP_LE', {
          loi: [{ truong: 'email', ma: 'MA_LA' }],
        }),
      ),
    ).toEqual({
      kind: 'fields',
      fields: { email: 'Dữ liệu không hợp lệ.' },
    });
    const invalid = { kind: 'message', message: 'Dữ liệu không hợp lệ.' };
    expect(
      describeRegisterError(
        api(400, 'DU_LIEU_KHONG_HOP_LE', {
          loi: [{ truong: 'la', ma: 'TRUONG_KHONG_DUOC_PHEP' }],
        }),
      ),
    ).toEqual(invalid);
    expect(describeRegisterError(api(400, 'DU_LIEU_KHONG_HOP_LE'))).toEqual(
      invalid,
    );
  });

  it('RG-03 DK-11 EMAIL_DA_DUNG', () => {
    expect(describeRegisterError(api(409, 'EMAIL_DA_DUNG'))).toEqual({
      kind: 'emailTaken',
      message: 'Email này đã được sử dụng. Vui lòng đăng nhập.',
    });
  });

  it.each([
    [{ soGiayCho: 42 }, { kind: 'tooSoon', seconds: 42 }],
    [{ soGiayCho: 0 }, { kind: 'message', message: 'Vui lòng thử lại sau.' }],
    [
      { soGiayCho: '42' },
      { kind: 'message', message: 'Vui lòng thử lại sau.' },
    ],
    [undefined, { kind: 'message', message: 'Vui lòng thử lại sau.' }],
  ])('RG-04 GUI_LAI_QUA_SOM với chiTiet %j', (chiTiet, expected) => {
    expect(
      describeRegisterError(api(429, 'GUI_LAI_QUA_SOM', { chiTiet })),
    ).toEqual(expected);
  });

  it('RG-05 503 GUI_MAIL_LOI theo mã, không coi là mất mạng', () => {
    const chiTiet = {
      maXacThucId: '77',
      coTheGuiLaiLuc: '2026-11-02T10:01:00.000Z',
    };
    expect(
      describeRegisterError(api(503, 'GUI_MAIL_LOI', { chiTiet })),
    ).toEqual({ kind: 'mailFailed', ...chiTiet });
  });

  it.each([
    [undefined],
    [{ maXacThucId: '', coTheGuiLaiLuc: 'x' }],
    [{ maXacThucId: 77, coTheGuiLaiLuc: 'x' }],
    [{ maXacThucId: '77' }],
  ])('RG-06 GUI_MAIL_LOI thiếu chiTiet hợp lệ %j: chỉ hiện câu', (chiTiet) => {
    expect(
      describeRegisterError(api(503, 'GUI_MAIL_LOI', { chiTiet })),
    ).toEqual({
      kind: 'message',
      message: 'Không gửi được email. Vui lòng thử lại sau ít phút.',
    });
  });

  it.each([
    [
      api(500, 'LOI_HE_THONG'),
      'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
    ],
    [
      api(403, 'ORIGIN_KHONG_HOP_LE'),
      'Yêu cầu không đến từ trang web được phép.',
    ],
    [
      new NetworkError(),
      'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.',
    ],
    [new TimeoutError(), 'Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.'],
    [api(418, 'MA_LA'), 'Đã có lỗi xảy ra. Vui lòng thử lại sau.'],
  ])('RG-07 câu cố định, không dùng thongBao: %s', (error, message) => {
    expect(describeRegisterError(error)).toEqual({ kind: 'message', message });
  });

  it('RG-08 yêu cầu bị huỷ: bỏ qua', () => {
    expect(describeRegisterError(new RequestAbortedError())).toEqual({
      kind: 'ignored',
    });
  });
});

describe('validateRegisterForm', () => {
  it('RG-10 đủ và đúng: không lỗi', () => {
    expect(validateRegisterForm(GOOD)).toEqual({});
  });

  it('RG-11 DK-08 bỏ trống: đúng câu từng ô theo `641:2`', () => {
    expect(
      validateRegisterForm({
        hoTen: ' ',
        email: '',
        soDienThoai: '',
        matKhau: '',
        xacNhan: '',
      }),
    ).toEqual({
      hoTen: 'Vui lòng nhập họ và tên.',
      email: 'Vui lòng nhập email.',
      soDienThoai: 'Số điện thoại phải 10 số, bắt đầu bằng 0.',
      matKhau: PASSWORD_RULE_MESSAGE,
    });
  });

  it('RG-12 DK-07 xác nhận không khớp, kể cả chỉ khác dấu cách cuối', () => {
    expect(validateRegisterForm({ ...GOOD, xacNhan: 'Matkhau@1 ' })).toEqual({
      xacNhan: 'Mật khẩu xác nhận không khớp.',
    });
  });

  it('RG-13 sai định dạng từng ô', () => {
    expect(
      validateRegisterForm({
        ...GOOD,
        hoTen: '123',
        email: 'nguyễn@b.vn',
        matKhau: 'Mậtkhẩu1!',
        xacNhan: 'Mậtkhẩu1!',
      }),
    ).toEqual({
      hoTen:
        'Họ tên phải có ít nhất một chữ cái, tối đa 100 ký tự và không chứa ký tự điều khiển.',
      email: 'Email không hợp lệ.',
      matKhau:
        'Mật khẩu chỉ được dùng chữ không dấu, chữ số, dấu câu/ký hiệu và dấu cách.',
    });
  });
});
