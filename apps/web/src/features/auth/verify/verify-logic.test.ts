import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
} from '../../../shared/api/errors';
import { describeResendError, describeVerifyError } from './verify-errors';
import { parseVerifyState } from './verify-state';

// Task F2. Mã ca OT-nn là [đề xuất].
const api = (status: number, maLoi: string, extra: object = {}) =>
  new ApiError(status, { maLoi, thongBao: 'CÂU CỦA API', ...extra });
const NO_PASSWORD_KEYS = /matkhau|password|xacnhan/i;

describe('describeVerifyError (PLAN 5.5)', () => {
  it.each([
    ['OTP_SAI', 400, 'wrongCode', 'Mã OTP không đúng. Vui lòng kiểm tra lại.'],
    [
      'OTP_HET_HAN',
      400,
      'deadCode',
      'Mã OTP đã hết hạn. Vui lòng bấm "Gửi lại mã".',
    ],
    [
      'OTP_HET_LUOT',
      400,
      'deadCode',
      'Bạn đã nhập sai quá 5 lần. Mã đã bị vô hiệu, vui lòng bấm "Gửi lại mã".',
    ],
    [
      'OTP_BI_THAY_THE',
      409,
      'reregister',
      'Yêu cầu xác minh này đã được thay bằng lần đăng ký mới hơn. Vui lòng đăng ký lại.',
    ],
    [
      'CAN_DANG_KY_LAI',
      409,
      'reregister',
      'Yêu cầu xác minh không còn hiệu lực. Vui lòng đăng ký lại bằng email này.',
    ],
    [
      'TAI_KHOAN_NGUNG',
      403,
      'suspended',
      'Tài khoản đã bị ngưng hoạt động. Vui lòng liên hệ quản trị viên.',
    ],
    [
      'LOI_HE_THONG',
      500,
      'message',
      'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.',
    ],
    ['MA_LA', 418, 'message', 'Đã có lỗi xảy ra. Vui lòng thử lại sau.'],
  ])('OT-30 %s', (maLoi, status, kind, message) => {
    expect(describeVerifyError(api(status, maLoi))).toEqual({ kind, message });
  });

  it('OT-31 DU_LIEU_KHONG_HOP_LE: câu riêng cho otp, câu chung cho còn lại', () => {
    expect(
      describeVerifyError(
        api(400, 'DU_LIEU_KHONG_HOP_LE', {
          loi: [{ truong: 'otp', ma: 'OTP_KHONG_HOP_LE' }],
        }),
      ),
    ).toEqual({ kind: 'message', message: 'Mã OTP gồm đúng 6 chữ số.' });
    expect(describeVerifyError(api(400, 'DU_LIEU_KHONG_HOP_LE'))).toEqual({
      kind: 'message',
      message: 'Dữ liệu không hợp lệ.',
    });
  });

  it('OT-32 mạng, timeout, yêu cầu huỷ', () => {
    expect(describeVerifyError(new NetworkError())).toEqual({
      kind: 'message',
      message: 'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.',
    });
    expect(describeVerifyError(new TimeoutError())).toEqual({
      kind: 'message',
      message: 'Yêu cầu mất quá nhiều thời gian. Vui lòng thử lại.',
    });
    expect(describeVerifyError(new RequestAbortedError())).toEqual({
      kind: 'ignored',
    });
  });
});

describe('describeResendError', () => {
  it('OT-33 OTP_SAI ở gửi lại nghĩa là id hoặc email hỏng: đăng ký lại', () => {
    expect(describeResendError(api(400, 'OTP_SAI'))).toEqual({
      kind: 'reregister',
      message:
        'Yêu cầu xác minh không còn hiệu lực. Vui lòng đăng ký lại bằng email này.',
    });
  });

  it('OT-34 429 theo soGiayCho, thiếu số thì chỉ hiện câu', () => {
    expect(
      describeResendError(
        api(429, 'GUI_LAI_QUA_SOM', { chiTiet: { soGiayCho: 33 } }),
      ),
    ).toEqual({ kind: 'tooSoon', seconds: 33 });
    expect(describeResendError(api(429, 'GUI_LAI_QUA_SOM'))).toEqual({
      kind: 'message',
      message: 'Vui lòng thử lại sau.',
    });
  });

  it('OT-35 503 GUI_MAIL_LOI lấy id hàng lỗi; thiếu chiTiet chỉ hiện câu', () => {
    const chiTiet = {
      maXacThucId: '9',
      coTheGuiLaiLuc: '2026-11-02T10:01:00.000Z',
    };
    expect(describeResendError(api(503, 'GUI_MAIL_LOI', { chiTiet }))).toEqual({
      kind: 'mailFailed',
      ...chiTiet,
    });
    expect(describeResendError(api(503, 'GUI_MAIL_LOI'))).toEqual({
      kind: 'message',
      message: 'Không gửi được email. Vui lòng thử lại sau ít phút.',
    });
  });

  it('OT-36 mã dùng chung và lỗi không phải ApiError', () => {
    expect(describeResendError(api(403, 'TAI_KHOAN_NGUNG')).kind).toBe(
      'suspended',
    );
    expect(describeResendError(api(409, 'CAN_DANG_KY_LAI')).kind).toBe(
      'reregister',
    );
    expect(describeResendError(api(418, 'MA_LA'))).toEqual({
      kind: 'message',
      message: 'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    });
    expect(describeResendError(new NetworkError()).kind).toBe('message');
  });
});

describe('parseVerifyState', () => {
  const handoff = (trangThaiMa: string, maXacThucId: string | null = '42') => ({
    email: 'a@b.vn',
    chiTiet: { maXacThucId, trangThaiMa, hetHanLuc: '2026-11-02T10:10:00Z' },
  });

  it.each([
    [null],
    ['chuỗi'],
    [{}],
    [{ email: 1 }],
    [{ email: '' }],
    [{ email: 'a@b.vn' }],
    [{ email: 'a@b.vn', verified: 'true' }],
    [handoff('CanDangKyLai')],
    [handoff('ConHan', null)],
    [handoff('TrangThaiLa')],
    [{ email: 'a@b.vn', chiTiet: null }],
  ])('OT-40 state không đủ: null (%j)', (state) => {
    expect(parseVerifyState(state)).toBeNull();
  });

  it('OT-41 đã xác minh: chỉ giữ email', () => {
    expect(
      parseVerifyState({ verified: true, email: 'a@b.vn', resendId: '1' }),
    ).toEqual({ verified: true, email: 'a@b.vn' });
  });

  it('OT-42 ConHan: nhập được bằng chính id', () => {
    expect(parseVerifyState(handoff('ConHan'))).toMatchObject({
      verifyId: '42',
      resendId: '42',
      hetHanLuc: '2026-11-02T10:10:00Z',
      fresh: false,
      notice:
        'Email của bạn chưa được xác minh. Nhập mã OTP đã nhận hoặc bấm "Gửi lại mã".',
    });
  });

  it.each([
    ['HetHan', 'Mã OTP đã hết hạn. Vui lòng bấm "Gửi lại mã".'],
    ['DaThuHoi', 'Mã OTP đã bị thu hồi. Vui lòng bấm "Gửi lại mã".'],
    ['ChuaGui', 'Mã OTP chưa được gửi. Vui lòng bấm "Gửi lại mã".'],
  ])('OT-43 %s: chưa có mã để nhập, chỉ Gửi lại mã', (status, notice) => {
    expect(parseVerifyState(handoff(status))).toMatchObject({
      verifyId: null,
      resendId: '42',
      hetHanLuc: null,
      notice,
    });
  });

  it('OT-44 state của chính trang: giữ đủ, bỏ draft sai dạng, không nhận thêm khoá nào', () => {
    const parsed = parseVerifyState({
      email: 'a@b.vn',
      verifyId: '1',
      resendId: '2',
      hetHanLuc: 'h',
      coTheGuiLaiLuc: 'c',
      fresh: true,
      notice: 'n',
      draft: { email: 'a@b.vn', hoTen: 'A' },
      matKhau: 'Lọt@1234',
    });
    expect(parsed).toEqual({
      email: 'a@b.vn',
      verifyId: '1',
      resendId: '2',
      hetHanLuc: 'h',
      coTheGuiLaiLuc: 'c',
      fresh: true,
      notice: 'n',
      draft: null,
    });
    expect(Object.keys(parsed as object).join()).not.toMatch(NO_PASSWORD_KEYS);
  });

  it('OT-45 draft đúng dạng được giữ', () => {
    const draft = { email: 'a@b.vn', hoTen: 'A', soDienThoai: '0901234567' };
    expect(
      parseVerifyState({ email: 'a@b.vn', resendId: '2', draft }),
    ).toMatchObject({ draft, verifyId: null, fresh: false });
  });
});
