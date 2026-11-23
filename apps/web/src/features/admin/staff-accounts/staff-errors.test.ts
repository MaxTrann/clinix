import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
} from '../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';
import {
  FORBIDDEN_MESSAGE,
  NOT_FOUND_MESSAGE,
  SERVER_ERROR_MESSAGE,
  UNKNOWN_RESULT_HINT,
  describeActionFailure,
} from '../account-common/account-errors';
import {
  describeResendFailure,
  describeResendOutcome,
  NOT_PENDING_MESSAGE,
  RESEND_MAIL_FAILED_MESSAGE,
} from './staff-errors';

// admin F8, chữ của kết quả và lỗi "Gửi lại email kích hoạt" (mã NSF8-07, 08 là [đề xuất], TRACKING admin 9A.20 mục 3). Phủ TK-41 (gửi lỗi không bao giờ là "đã gửi"),
// TK-43 (không còn chờ kích hoạt), TK-47 và NS-45 (gửi quá sớm). Giao diện chọn chữ theo MÃ, không theo `thongBao`.

const api = (status: number, maLoi: string, chiTiet?: unknown) =>
  new ApiError(status, { maLoi, thongBao: 'câu của API', chiTiet });

describe('NSF8-07 lỗi của POST …/resend-activation sang chữ (TK-43, TK-47, NS-45)', () => {
  it.each<[number, string]>([
    [1, 'Vui lòng thử lại sau 1 giây.'],
    [45, 'Vui lòng thử lại sau 45 giây.'],
    [59, 'Vui lòng thử lại sau 59 giây.'],
    [60, 'Vui lòng thử lại sau 1 phút.'],
    [125, 'Vui lòng thử lại sau 3 phút.'],
    [3600, 'Vui lòng thử lại sau 60 phút.'],
  ])('NSF8-07 429 GUI_LAI_QUA_SOM với soGiayCho %d: "%s"', (seconds, text) => {
    expect(
      describeResendFailure(
        api(429, 'GUI_LAI_QUA_SOM', { soGiayCho: seconds }),
      ),
    ).toBe(text);
  });

  it.each<[string, unknown]>([
    ['không có chiTiet', undefined],
    ['chiTiet rỗng', {}],
    ['soGiayCho là chuỗi', { soGiayCho: '30' }],
    ['soGiayCho bằng 0', { soGiayCho: 0 }],
    ['soGiayCho âm', { soGiayCho: -3 }],
    ['soGiayCho là null', { soGiayCho: null }],
    ['chiTiet là chuỗi', 'soGiayCho'],
    ['chiTiet là null', null],
  ])(
    'NSF8-07 429 mà %s: về đúng câu của PLAN, không in số bịa',
    (_name, detail) => {
      expect(describeResendFailure(api(429, 'GUI_LAI_QUA_SOM', detail))).toBe(
        'Vui lòng thử lại sau.',
      );
    },
  );

  it('NSF8-07 409 không còn chờ kích hoạt: câu PLAN 5.9 nguyên văn, trỏ tới "Quên mật khẩu"', () => {
    expect(NOT_PENDING_MESSAGE).toBe(
      'Tài khoản không còn chờ kích hoạt. Nếu cần đặt lại mật khẩu, dùng "Quên mật khẩu".',
    );
    expect(
      describeResendFailure(api(409, 'TAI_KHOAN_KHONG_CHO_KICH_HOAT')),
    ).toBe(NOT_PENDING_MESSAGE);
  });

  it('NSF8-07 chọn theo MÃ, không theo thongBao hay mã HTTP', () => {
    // Cùng 429 nhưng mã khác: không phải "gửi quá sớm"
    expect(describeResendFailure(api(429, 'MA_LA'))).toBe(
      GENERIC_ERROR_MESSAGE,
    );
    // Đúng mã nhưng HTTP khác (hợp đồng lệch): vẫn theo mã
    expect(
      describeResendFailure(api(400, 'GUI_LAI_QUA_SOM', { soGiayCho: 30 })),
    ).toBe('Vui lòng thử lại sau 30 giây.');
    const tricky = new ApiError(409, {
      maLoi: 'TAI_KHOAN_KHONG_CHO_KICH_HOAT',
      thongBao: 'Đã gửi lại email kích hoạt.',
    });
    expect(describeResendFailure(tricky)).toBe(NOT_PENDING_MESSAGE);
  });

  it('NSF8-07 các lỗi còn lại dùng đúng bảng chung của khoá và mở khoá', () => {
    expect(describeResendFailure(api(403, 'KHONG_DU_QUYEN'))).toBe(
      FORBIDDEN_MESSAGE,
    );
    expect(describeResendFailure(api(404, 'KHONG_TIM_THAY'))).toBe(
      NOT_FOUND_MESSAGE,
    );
    expect(describeResendFailure(api(500, 'LOI_HE_THONG'))).toBe(
      SERVER_ERROR_MESSAGE,
    );
    for (const error of [new NetworkError(), new TimeoutError()]) {
      expect(describeResendFailure(error)).toBe(describeActionFailure(error));
      expect(describeResendFailure(error)).toContain(UNKNOWN_RESULT_HINT);
    }
    expect(NETWORK_ERROR_MESSAGE.length).toBeGreaterThan(0);
  });

  it.each(['constructor', '__proto__', 'hasOwnProperty'])(
    'NSF8-07 mã lạ "%s" không lọt qua nguyên mẫu, ra câu chung',
    (code) => {
      expect(describeResendFailure(api(409, code))).toBe(GENERIC_ERROR_MESSAGE);
    },
  );

  it('NSF8-07 lỗi không phải ApiError cũng ra câu chung, không ném', () => {
    expect(describeResendFailure(new Error('x'))).toBe(GENERIC_ERROR_MESSAGE);
    expect(describeResendFailure(undefined)).toBe(GENERIC_ERROR_MESSAGE);
  });
});

describe('NSF8-08 kết quả gửi lại (HTTP 200) sang thông báo (NS-19, NS-20, TK-41)', () => {
  it('NSF8-08 đã gửi: thành công, kèm hạn của liên kết MỚI theo giờ Việt Nam', () => {
    expect(
      describeResendOutcome({
        kind: 'sent',
        hanLienKet: '2026-11-25T03:00:00.000Z',
      }),
    ).toEqual({
      kind: 'success',
      text: 'Đã gửi lại email kích hoạt. Liên kết mới có hiệu lực đến 25/11/2026 10:00.',
    });
  });

  it.each([null, '', 'không phải ngày'])(
    'NSF8-08 đã gửi mà hạn là %j: chỉ nói đã gửi, không in mốc giờ bịa',
    (han) => {
      expect(describeResendOutcome({ kind: 'sent', hanLienKet: han })).toEqual({
        kind: 'success',
        text: 'Đã gửi lại email kích hoạt.',
      });
    },
  );

  it('NSF8-08 gửi thư lỗi: CẢNH BÁO, nói liên kết cũ còn dùng được, và KHÔNG có chữ "Đã gửi"', () => {
    const notice = describeResendOutcome({ kind: 'mailFailed' });
    expect(RESEND_MAIL_FAILED_MESSAGE).toBe(
      'Gửi email kích hoạt thất bại. Liên kết cũ (nếu còn hạn) vẫn dùng được. Hãy thử gửi lại.',
    );
    expect(notice).toEqual({
      kind: 'warning',
      text: RESEND_MAIL_FAILED_MESSAGE,
    });
    expect(notice.text).not.toMatch(/đã gửi/i);
  });

  it('NSF8-08 phản hồi sai hình dạng: lỗi "chưa rõ", KHÔNG BAO GIỜ là đã gửi', () => {
    const notice = describeResendOutcome({ kind: 'unknown' });
    expect(notice.kind).toBe('error');
    expect(notice.text).toBe(UNKNOWN_RESULT_HINT);
    expect(notice.text).not.toMatch(/đã gửi lại/i);
  });
});
