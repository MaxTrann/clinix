import { GENERIC_ERROR_MESSAGE } from '../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import { FORBIDDEN_MESSAGE } from '../account-common/account-errors';
import {
  describeCreateFailure,
  EMAIL_IN_USE_MESSAGE,
  GENERAL_INVALID_MESSAGE,
  INVALID_FIELD_MESSAGE,
  SERVER_CREATE_MESSAGE,
  UNKNOWN_CREATE_MESSAGE,
} from './staff-create-errors';
import { EXPERIENCE_MESSAGE, TITLE_DEGREE_MESSAGE } from './staff-create-model';

// admin F8 PR2, lỗi của POST /admin/staff-accounts sang chữ (mã NSF8-75 đến 78 là [đề xuất], TRACKING admin 9A.21 mục 3). Phủ NS-06, 07, 09, 13 (phía giao diện).
// Chọn câu theo MÃ (`maLoi`, `loi[].ma`), không theo `thongBao` hay mã HTTP.

const api = (
  status: number,
  maLoi: string,
  loi?: { truong: string; ma: string }[],
  thongBao = 'câu của API',
) => new ApiError(status, { maLoi, thongBao, loi });

const invalid = (...loi: { truong: string; ma: string }[]) =>
  api(400, 'DU_LIEU_KHONG_HOP_LE', loi);

describe('NSF8-75 lỗi 400 theo từng trường: mỗi `loi[{truong, ma}]` vào đúng ô (NS-11, NS-13)', () => {
  it.each<[string, string, string, string]>([
    [
      'hoTen',
      'HO_TEN_KHONG_HOP_LE',
      'hoTen',
      'Họ tên phải có ít nhất một chữ cái, tối đa 100 ký tự và không chứa ký tự điều khiển.',
    ],
    ['email', 'EMAIL_KHONG_HOP_LE', 'email', 'Email không hợp lệ.'],
    [
      'soDienThoai',
      'SDT_KHONG_HOP_LE',
      'soDienThoai',
      'Số điện thoại phải 10 số, bắt đầu bằng 0.',
    ],
    [
      'chiNhanhId',
      'CHI_NHANH_KHONG_HOP_LE',
      'chiNhanhId',
      'Chi nhánh không hợp lệ.',
    ],
    [
      'chuyenKhoaId',
      'CHUYEN_KHOA_KHONG_HOP_LE',
      'chuyenKhoaId',
      'Chuyên khoa không hợp lệ hoặc đã ngừng hoạt động.',
    ],
    [
      'dichVuKhamId',
      'DICH_VU_KHAM_ID_KHONG_HOP_LE',
      'dichVuKhamId',
      'Dịch vụ khám chính không hợp lệ.',
    ],
    [
      'chucDanh',
      'CHUC_DANH_KHONG_HOP_LE',
      'chucDanh',
      'Chức danh không hợp lệ.',
    ],
    ['hocVi', 'HOC_VI_KHONG_HOP_LE', 'hocVi', 'Học vị không hợp lệ.'],
    [
      'soNamKinhNghiem',
      'SO_NAM_KINH_NGHIEM_KHONG_HOP_LE',
      'soNamKinhNghiem',
      EXPERIENCE_MESSAGE,
    ],
    ['phamVi', 'PHAM_VI_KHONG_HOP_LE', 'phamVi', 'Phạm vi không hợp lệ.'],
  ])('NSF8-75 %s với mã %s', (truong, ma, field, text) => {
    expect(describeCreateFailure(invalid({ truong, ma }))).toEqual({
      kind: 'fields',
      fields: { [field]: text },
    });
  });

  it('NSF8-75 nhiều lỗi một lúc: vào từng ô; ô trùng thì giữ lỗi ĐẦU TIÊN', () => {
    expect(
      describeCreateFailure(
        invalid(
          { truong: 'email', ma: 'EMAIL_KHONG_HOP_LE' },
          { truong: 'soDienThoai', ma: 'SDT_KHONG_HOP_LE' },
          { truong: 'email', ma: 'HO_TEN_KHONG_HOP_LE' },
        ),
      ),
    ).toEqual({
      kind: 'fields',
      fields: {
        email: 'Email không hợp lệ.',
        soDienThoai: 'Số điện thoại phải 10 số, bắt đầu bằng 0.',
      },
    });
  });

  it('NSF8-75 chi nhánh ngoài phạm vi và chi nhánh không tồn tại CÙNG một câu (Q40, NS-06): không lộ chi nhánh khác', () => {
    const outside = describeCreateFailure(
      invalid({ truong: 'chiNhanhId', ma: 'CHI_NHANH_KHONG_HOP_LE' }),
    );
    expect(outside).toEqual({
      kind: 'fields',
      fields: { chiNhanhId: 'Chi nhánh không hợp lệ.' },
    });
    expect(JSON.stringify(outside)).not.toMatch(/phạm vi|ngoài/i);
  });

  it('NSF8-75 trường lạ hay vai trò sai: lỗi CHUNG, không in tên trường thô', () => {
    for (const item of [
      { truong: 'matKhau', ma: 'TRUONG_KHONG_DUOC_PHEP' },
      { truong: 'vaiTro', ma: 'VAI_TRO_KHONG_HOP_LE' },
      { truong: 'truongLaHoanToan', ma: 'MA_LA' },
    ]) {
      const result = describeCreateFailure(invalid(item));
      expect(result).toEqual({
        kind: 'message',
        message: GENERAL_INVALID_MESSAGE,
      });
      expect(JSON.stringify(result)).not.toContain('matKhau');
      expect(JSON.stringify(result)).not.toContain('truongLaHoanToan');
    }
  });

  it('NSF8-75 trường đã biết nhưng mã lạ: câu chung của ô; trộn với trường lạ thì vẫn giữ lỗi ô và thêm câu chung', () => {
    expect(
      describeCreateFailure(invalid({ truong: 'email', ma: 'MA_LA' })),
    ).toEqual({ kind: 'fields', fields: { email: INVALID_FIELD_MESSAGE } });
    expect(
      describeCreateFailure(
        invalid(
          { truong: 'email', ma: 'EMAIL_KHONG_HOP_LE' },
          { truong: 'matKhau', ma: 'TRUONG_KHONG_DUOC_PHEP' },
        ),
      ),
    ).toEqual({
      kind: 'fields',
      fields: { email: 'Email không hợp lệ.' },
      message: GENERAL_INVALID_MESSAGE,
    });
  });

  it.each([[undefined], [[]]])(
    'NSF8-75 400 DU_LIEU_KHONG_HOP_LE không có loi (%j): lỗi chung',
    (loi) => {
      expect(
        describeCreateFailure(
          api(
            400,
            'DU_LIEU_KHONG_HOP_LE',
            loi as { truong: string; ma: string }[] | undefined,
          ),
        ),
      ).toEqual({ kind: 'message', message: GENERAL_INVALID_MESSAGE });
    },
  );

  it('NSF8-75 `loi` có phần tử sai hình dạng bị bỏ qua, không ném', () => {
    const error = new ApiError(400, {
      maLoi: 'DU_LIEU_KHONG_HOP_LE',
      thongBao: 'x',
      loi: [null, 5, { truong: 7, ma: 'EMAIL_KHONG_HOP_LE' }] as never,
    });
    expect(describeCreateFailure(error)).toEqual({
      kind: 'message',
      message: GENERAL_INVALID_MESSAGE,
    });
  });
});

describe('NSF8-76 lỗi nghiệp vụ theo MÃ, chữ PLAN 5.9 (NS-07, 09, 13)', () => {
  it('NSF8-76 409 EMAIL_DA_DUNG: ở ô email, câu PLAN nguyên văn', () => {
    expect(EMAIL_IN_USE_MESSAGE).toBe('Email này đã được sử dụng.');
    expect(describeCreateFailure(api(409, 'EMAIL_DA_DUNG'))).toEqual({
      kind: 'fields',
      fields: { email: EMAIL_IN_USE_MESSAGE },
    });
  });

  it('NSF8-76 400 CHUC_DANH_HOC_VI_KHONG_TUONG_THICH: ở ô học vị', () => {
    expect(
      describeCreateFailure(api(400, 'CHUC_DANH_HOC_VI_KHONG_TUONG_THICH')),
    ).toEqual({ kind: 'fields', fields: { hocVi: TITLE_DEGREE_MESSAGE } });
  });

  it('NSF8-76 400 DICH_VU_KHONG_O_CHI_NHANH: ở ô dịch vụ, câu PLAN nguyên văn', () => {
    expect(
      describeCreateFailure(api(400, 'DICH_VU_KHONG_O_CHI_NHANH')),
    ).toEqual({
      kind: 'fields',
      fields: {
        dichVuKhamId:
          'Dịch vụ khám chính không được cung cấp tại chi nhánh đã chọn.',
      },
    });
  });

  it('NSF8-76 403 KHONG_DU_QUYEN (Admin Chi nhánh chọn Quản trị viên): lỗi chung của biểu mẫu', () => {
    expect(describeCreateFailure(api(403, 'KHONG_DU_QUYEN'))).toEqual({
      kind: 'message',
      message: FORBIDDEN_MESSAGE,
    });
  });

  it('NSF8-76 500 LOI_HE_THONG: câu nói chưa có tài khoản nào được tạo (giao dịch hoàn tác), không lộ thông điệp máy chủ', () => {
    expect(SERVER_CREATE_MESSAGE).toBe(
      'Không thực hiện được. Chưa có tài khoản nào được tạo, vui lòng thử lại.',
    );
    const result = describeCreateFailure(
      new ApiError(500, {
        maLoi: 'LOI_HE_THONG',
        thongBao: 'stack nội bộ ở đây',
        requestId: 'r1',
      }),
    );
    expect(result).toEqual({ kind: 'message', message: SERVER_CREATE_MESSAGE });
    expect(JSON.stringify(result)).not.toContain('stack nội bộ');
  });

  it('NSF8-76 chọn theo MÃ, không theo thongBao hay mã HTTP', () => {
    expect(
      describeCreateFailure(
        api(409, 'EMAIL_DA_DUNG', undefined, 'Email hợp lệ.'),
      ),
    ).toMatchObject({ kind: 'fields' });
    // đúng mã nhưng HTTP khác: vẫn theo mã
    expect(describeCreateFailure(api(400, 'EMAIL_DA_DUNG'))).toMatchObject({
      kind: 'fields',
      fields: { email: EMAIL_IN_USE_MESSAGE },
    });
    // mã lạ ở 409: câu chung
    expect(describeCreateFailure(api(409, 'MA_LA'))).toEqual({
      kind: 'message',
      message: GENERIC_ERROR_MESSAGE,
    });
  });

  it.each(['constructor', '__proto__', 'hasOwnProperty'])(
    'NSF8-76 mã lạ "%s" không lọt qua nguyên mẫu',
    (code) => {
      expect(describeCreateFailure(api(409, code))).toEqual({
        kind: 'message',
        message: GENERIC_ERROR_MESSAGE,
      });
      expect(
        describeCreateFailure(invalid({ truong: 'email', ma: code })),
      ).toEqual({ kind: 'fields', fields: { email: INVALID_FIELD_MESSAGE } });
    },
  );
});

describe('NSF8-77 mất mạng, hết hạn chờ, lỗi khác (NS-45; 401 xem NSF8-108)', () => {
  it.each([[new NetworkError()], [new TimeoutError()]])(
    'NSF8-77 %o: CHƯA RÕ tài khoản đã tạo hay chưa (không tự thử lại)',
    (error) => {
      expect(UNKNOWN_CREATE_MESSAGE).toBe(
        'Chưa rõ tài khoản đã được tạo hay chưa. Hãy kiểm tra danh sách nhân sự trước khi tạo lại.',
      );
      expect(describeCreateFailure(error)).toEqual({ kind: 'unknown' });
    },
  );

  it('NSF8-77 yêu cầu bị huỷ (đóng hộp giữa chừng): bỏ qua, không báo lỗi', () => {
    expect(describeCreateFailure(new RequestAbortedError())).toEqual({
      kind: 'ignored',
    });
  });

  // Phát hiện khi đo trình duyệt (23/11/2026): proxy cắt kết nối lúc tạo cho 5xx không phải JSON; máy chủ có thể ĐÃ tạo tài khoản, nên là "chưa rõ" chứ không phải lỗi chung
  it.each([500, 502, 503, 504, 200, 201])(
    'NSF8-77 phản hồi HTTP %d không đọc được (proxy cắt kết nối hay thân không phải JSON): CHƯA RÕ tài khoản đã tạo hay chưa',
    (status) => {
      expect(
        describeCreateFailure(new UnexpectedResponseError(status)),
      ).toEqual({ kind: 'unknown' });
    },
  );

  it.each([400, 404, 413])(
    'NSF8-77 phản hồi HTTP %d không đọc được (proxy từ chối trước khi tới API): câu chung',
    (status) => {
      expect(
        describeCreateFailure(new UnexpectedResponseError(status)),
      ).toEqual({ kind: 'message', message: GENERIC_ERROR_MESSAGE });
    },
  );

  it('NSF8-77 lỗi lạ hay giá trị lạ: câu chung, không ném', () => {
    expect(describeCreateFailure(new Error('x'))).toEqual({
      kind: 'message',
      message: GENERIC_ERROR_MESSAGE,
    });
    expect(describeCreateFailure(undefined)).toEqual({
      kind: 'message',
      message: GENERIC_ERROR_MESSAGE,
    });
  });
});
