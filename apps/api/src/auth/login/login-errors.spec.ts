import {
  badCredentials,
  lockedException,
  refusalException,
  unverifiedException,
} from './login-errors.js';

// Task A8 — lỗi API của đăng nhập (PLAN 5.5). Trạng thái HTTP là quyết định A8-D. Mã LE-nn là [đề xuất].
// Kiểm TỪNG mã: trạng thái, maLoi, thongBao và chiTiet (FE chọn thông báo theo mã; chiTiet để đếm ngược và để gọi verify-otp / resend-otp).
const bodyOf = (error: {
  getResponse: () => unknown;
}): { maLoi: string; thongBao: string; chiTiet?: unknown } =>
  error.getResponse() as { maLoi: string; thongBao: string; chiTiet?: unknown };

describe('lỗi đăng nhập (A8-D)', () => {
  it('LE-01 DANG_NHAP_SAI: 401, câu chung, KHÔNG có chiTiet (không "còn N lần", G1)', () => {
    const error = badCredentials();
    expect(error.getStatus()).toBe(401);
    expect(error.maLoi).toBe('DANG_NHAP_SAI');
    expect(bodyOf(error)).toEqual({
      maLoi: 'DANG_NHAP_SAI',
      thongBao: 'Email hoặc mật khẩu không đúng.',
    });
  });

  it('LE-02 TAI_KHOAN_BI_KHOA_TAM: 429, chiTiet có số giây còn lại và mốc khoá ISO UTC (cùng định dạng hetHanLuc của A5, A6); câu chữ không chứa chỗ trống {mm:ss}', () => {
    const lockedUntil = new Date('2026-11-02T01:15:00.000Z');
    const error = lockedException(lockedUntil, 900);
    expect(error.getStatus()).toBe(429);
    expect(error.maLoi).toBe('TAI_KHOAN_BI_KHOA_TAM');
    expect(bodyOf(error)).toEqual({
      maLoi: 'TAI_KHOAN_BI_KHOA_TAM',
      thongBao:
        'Tài khoản bị khóa tạm thời do nhập sai nhiều lần. Vui lòng thử lại sau.',
      chiTiet: { soGiayConLai: 900, khoaDen: '2026-11-02T01:15:00.000Z' },
    });
  });

  it('LE-03 TAI_KHOAN_NGUNG: 403, câu chữ PLAN 5.5, không chiTiet', () => {
    const error = refusalException({ kind: 'SUSPENDED' });
    expect(error.getStatus()).toBe(403);
    expect(bodyOf(error)).toEqual({
      maLoi: 'TAI_KHOAN_NGUNG',
      thongBao:
        'Tài khoản đã bị ngưng hoạt động. Vui lòng liên hệ quản trị viên.',
    });
  });

  it('LE-04 TAI_KHOAN_CHUA_KICH_HOAT: 403, câu chữ PLAN 5.5, không chiTiet', () => {
    const error = refusalException({ kind: 'PENDING_ACTIVATION' });
    expect(error.getStatus()).toBe(403);
    expect(bodyOf(error)).toEqual({
      maLoi: 'TAI_KHOAN_CHUA_KICH_HOAT',
      thongBao:
        'Tài khoản nhân sự này chưa được kích hoạt. Hãy dùng link kích hoạt trong email để thiết lập mật khẩu.',
    });
  });

  it('LE-05 refusalException(LOCKED) cùng thân với lockedException', () => {
    const lockedUntil = new Date('2026-11-02T01:15:00.000Z');
    expect(
      bodyOf(
        refusalException({ kind: 'LOCKED', lockedUntil, remainingSeconds: 7 }),
      ),
    ).toEqual(bodyOf(lockedException(lockedUntil, 7)));
  });

  it('LE-06 EMAIL_CHUA_XAC_MINH còn mã: 403, chiTiet có mã lần gửi, trạng thái mã và hạn ISO để FE gọi verify-otp / resend-otp', () => {
    const error = unverifiedException({
      maXacThucId: '42',
      trangThaiMa: 'ConHan',
      hetHanLuc: new Date('2026-11-02T01:10:00.000Z'),
    });
    expect(error.getStatus()).toBe(403);
    expect(bodyOf(error)).toEqual({
      maLoi: 'EMAIL_CHUA_XAC_MINH',
      thongBao:
        'Email của bạn chưa được xác minh. Nhập mã OTP đã nhận hoặc bấm "Gửi lại mã".',
      chiTiet: {
        maXacThucId: '42',
        trangThaiMa: 'ConHan',
        hetHanLuc: '2026-11-02T01:10:00.000Z',
      },
    });
  });

  it('LE-07 EMAIL_CHUA_XAC_MINH khi phải đăng ký lại: câu mặc định hướng tới đăng ký lại; id và hạn là null', () => {
    const error = unverifiedException({
      maXacThucId: null,
      trangThaiMa: 'CanDangKyLai',
      hetHanLuc: null,
    });
    expect(error.getStatus()).toBe(403);
    expect(bodyOf(error)).toEqual({
      maLoi: 'EMAIL_CHUA_XAC_MINH',
      thongBao:
        'Yêu cầu xác minh email không còn hiệu lực. Vui lòng đăng ký lại bằng email này.',
      chiTiet: {
        maXacThucId: null,
        trangThaiMa: 'CanDangKyLai',
        hetHanLuc: null,
      },
    });
  });
});
