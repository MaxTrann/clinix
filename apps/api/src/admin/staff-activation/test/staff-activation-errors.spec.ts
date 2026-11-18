import { toIssueException } from '../staff-activation-errors.js';

// Task B14 (admin) — ánh xạ `failure` của ActivationLinkService.issue sang AppException (PLAN 5.9). Mã NSB14-nn là [đề xuất].
describe('toIssueException', () => {
  it('NSB14-10 (Q23) GUI_LAI_QUA_SOM: 429, chữ của PLAN 5.9, chiTiet chỉ có soGiayCho và KHÔNG lộ lý do chi tiết', () => {
    const exception = toIssueException({
      code: 'GUI_LAI_QUA_SOM',
      reason: 'HOURLY_LIMIT',
      retryAfterSeconds: 123,
    });
    expect(exception.getStatus()).toBe(429);
    expect(exception.maLoi).toBe('GUI_LAI_QUA_SOM');
    expect(exception.getResponse()).toEqual({
      maLoi: 'GUI_LAI_QUA_SOM',
      thongBao: 'Vui lòng thử lại sau.',
      chiTiet: { soGiayCho: 123 },
    });
    const body = JSON.stringify(exception.getResponse());
    expect(body).not.toContain('HOURLY_LIMIT');
    expect(body).not.toContain('TOO_SOON');
  });

  it('NSB14-10 GUI_LAI_QUA_SOM vì quá nhanh cũng có cùng hình dạng', () => {
    const exception = toIssueException({
      code: 'GUI_LAI_QUA_SOM',
      reason: 'TOO_SOON',
      retryAfterSeconds: 1,
    });
    expect(exception.getStatus()).toBe(429);
    expect(exception.getResponse()).toMatchObject({
      chiTiet: { soGiayCho: 1 },
    });
  });

  it('NSB14-10 (TK-43) TAI_KHOAN_KHONG_CHO_KICH_HOAT: 409, chữ của PLAN 5.9, không có chiTiet', () => {
    const exception = toIssueException({
      code: 'TAI_KHOAN_KHONG_CHO_KICH_HOAT',
      reason: 'NOT_PENDING_STAFF',
    });
    expect(exception.getStatus()).toBe(409);
    expect(exception.maLoi).toBe('TAI_KHOAN_KHONG_CHO_KICH_HOAT');
    expect(exception.getResponse()).toEqual({
      maLoi: 'TAI_KHOAN_KHONG_CHO_KICH_HOAT',
      thongBao:
        'Tài khoản không còn chờ kích hoạt. Nếu cần đặt lại mật khẩu, dùng "Quên mật khẩu".',
    });
  });
});
