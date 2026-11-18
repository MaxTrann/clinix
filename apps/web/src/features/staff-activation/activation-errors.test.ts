import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../shared/api/errors';
import {
  GENERIC_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
} from '../../shared/api/error-message';
import {
  describeCompleteError,
  describeValidateError,
  INVALID_LINK_MESSAGE,
} from './activation-errors';

// Admin F10. Mã ca NSF10-nn là [đề xuất] (TRACKING admin 9A.7); ca nào phủ test case của PLAN thì ghi kèm mã đó.
const RULE =
  'Mật khẩu từ 8 đến 64 ký tự, gồm ít nhất một chữ số và một ký tự đặc biệt (ví dụ ! @ # $ % .).';
const CHARS =
  'Mật khẩu chỉ được dùng chữ không dấu, chữ số, dấu câu/ký hiệu và dấu cách.';
const MISMATCH = 'Mật khẩu xác nhận không khớp.';
const SYSTEM = 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.';
const INVALID_DATA = 'Dữ liệu không hợp lệ.';

const api = (
  status: number,
  maLoi: string,
  extra: Record<string, unknown> = {},
) => new ApiError(status, { maLoi, thongBao: 'CÂU CỦA API', ...extra });

describe('describeCompleteError', () => {
  it('NSF10-10 NS-35, A5: LIEN_KET_KHONG_HOP_LE ⇒ "không hợp lệ", không phụ thuộc thongBao, chiTiet, loi, requestId, mã HTTP', () => {
    const variants = [
      api(400, 'LIEN_KET_KHONG_HOP_LE'),
      api(400, 'LIEN_KET_KHONG_HOP_LE', {
        loi: [{ truong: 'matKhauMoi', ma: 'MAT_KHAU_KHONG_HOP_LE' }],
        chiTiet: { soGiayCho: 5 },
        requestId: 'rid-1',
      }),
      api(404, 'LIEN_KET_KHONG_HOP_LE'),
      api(409, 'LIEN_KET_KHONG_HOP_LE', { thongBao: 'một câu khác hẳn' }),
    ];
    for (const error of variants) {
      expect(describeCompleteError(error)).toEqual({ kind: 'invalid' });
    }
  });

  it('NSF10-10 chữ đã duyệt của PLAN 5.9 (câu nội dung của màn "không hợp lệ")', () => {
    expect(INVALID_LINK_MESSAGE).toBe(
      'Liên kết kích hoạt không còn hiệu lực. Vui lòng liên hệ Quản trị viên để được gửi lại.',
    );
  });

  it('NSF10-11 A6, NS-38: DU_LIEU_KHONG_HOP_LE + loi ⇒ chữ từng ô theo `ma`', () => {
    expect(
      describeCompleteError(
        api(400, 'DU_LIEU_KHONG_HOP_LE', {
          loi: [{ truong: 'matKhauMoi', ma: 'MAT_KHAU_KHONG_HOP_LE' }],
        }),
      ),
    ).toEqual({ kind: 'fields', fields: { matKhauMoi: RULE } });

    expect(
      describeCompleteError(
        api(400, 'DU_LIEU_KHONG_HOP_LE', {
          loi: [{ truong: 'matKhauMoi', ma: 'MAT_KHAU_KY_TU_KHONG_HOP_LE' }],
        }),
      ),
    ).toEqual({ kind: 'fields', fields: { matKhauMoi: CHARS } });

    // Hai ô cùng lúc, và `??=` giữ lỗi đầu tiên của mỗi ô
    expect(
      describeCompleteError(
        api(400, 'DU_LIEU_KHONG_HOP_LE', {
          loi: [
            { truong: 'matKhauMoi', ma: 'MAT_KHAU_KHONG_HOP_LE' },
            { truong: 'xacNhan', ma: 'XAC_NHAN_KHONG_KHOP' },
            { truong: 'matKhauMoi', ma: 'MAT_KHAU_KY_TU_KHONG_HOP_LE' },
          ],
        }),
      ),
    ).toEqual({
      kind: 'fields',
      fields: { matKhauMoi: RULE, xacNhan: MISMATCH },
    });
  });

  it('NSF10-11 mã lạ ⇒ "Dữ liệu không hợp lệ." ở ô; loi không có ô của form hoặc thiếu loi ⇒ câu chung', () => {
    expect(
      describeCompleteError(
        api(400, 'DU_LIEU_KHONG_HOP_LE', {
          loi: [{ truong: 'xacNhan', ma: 'MA_KHONG_BIET' }],
        }),
      ),
    ).toEqual({ kind: 'fields', fields: { xacNhan: INVALID_DATA } });

    expect(
      describeCompleteError(
        api(400, 'DU_LIEU_KHONG_HOP_LE', {
          loi: [{ truong: 'id', ma: 'MAT_KHAU_KHONG_HOP_LE' }],
        }),
      ),
    ).toEqual({ kind: 'message', message: INVALID_DATA });

    expect(describeCompleteError(api(400, 'DU_LIEU_KHONG_HOP_LE'))).toEqual({
      kind: 'message',
      message: INVALID_DATA,
    });
  });

  it('NSF10-12: LOI_HE_THONG, TRUONG_KHONG_DUOC_PHEP, mạng, hết giờ, HTML 502, lỗi lạ ⇒ chữ đúng; huỷ ⇒ bỏ qua', () => {
    expect(describeCompleteError(api(500, 'LOI_HE_THONG'))).toEqual({
      kind: 'message',
      message: SYSTEM,
    });
    expect(describeCompleteError(api(400, 'TRUONG_KHONG_DUOC_PHEP'))).toEqual({
      kind: 'message',
      message: GENERIC_ERROR_MESSAGE,
    });
    expect(describeCompleteError(new NetworkError())).toEqual({
      kind: 'message',
      message: NETWORK_ERROR_MESSAGE,
    });
    expect(describeCompleteError(new TimeoutError())).toEqual({
      kind: 'message',
      message: TIMEOUT_ERROR_MESSAGE,
    });
    expect(describeCompleteError(new UnexpectedResponseError(502))).toEqual({
      kind: 'message',
      message: GENERIC_ERROR_MESSAGE,
    });
    expect(describeCompleteError(new Error('lạ'))).toEqual({
      kind: 'message',
      message: GENERIC_ERROR_MESSAGE,
    });
    expect(describeCompleteError(new RequestAbortedError())).toEqual({
      kind: 'ignored',
    });
  });

  it('NSF10-12 không dùng `thongBao` của API (chữ do giao diện chọn theo mã)', () => {
    const result = describeCompleteError(
      api(500, 'MA_LA', { thongBao: 'CÂU RIÊNG CỦA API' }),
    );
    expect(JSON.stringify(result)).not.toContain('CÂU RIÊNG CỦA API');
  });
});

describe('describeValidateError', () => {
  it('NSF10-13 NS-35: LIEN_KET_KHONG_HOP_LE ⇒ "không hợp lệ", cùng kết quả với mọi thân phụ', () => {
    for (const error of [
      api(400, 'LIEN_KET_KHONG_HOP_LE'),
      api(404, 'LIEN_KET_KHONG_HOP_LE', {
        chiTiet: { x: 1 },
        requestId: 'rid',
      }),
    ]) {
      expect(describeValidateError(error)).toEqual({ kind: 'invalid' });
    }
  });

  it('NSF10-13: mạng, hết giờ, 500, 502 HTML, 429, DU_LIEU_KHONG_HOP_LE ⇒ "không kiểm tra được" (KHÔNG bị coi là liên kết hỏng)', () => {
    const errors = [
      new NetworkError(),
      new TimeoutError(),
      new UnexpectedResponseError(502),
      api(500, 'LOI_HE_THONG'),
      api(429, 'QUA_NHIEU_YEU_CAU'),
      api(400, 'DU_LIEU_KHONG_HOP_LE'),
    ];
    for (const error of errors) {
      expect(describeValidateError(error)).toEqual({
        kind: 'unreachable',
        error,
      });
    }
  });

  it('NSF10-13: huỷ ⇒ bỏ qua', () => {
    expect(describeValidateError(new RequestAbortedError())).toEqual({
      kind: 'ignored',
    });
  });
});
