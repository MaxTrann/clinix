import { AUTH_ERROR_CODES } from '../../auth/auth.constants.js';
import { VALIDATION_CODES } from '../../auth/validation/validation-codes.js';
import { AppException } from './app.exception.js';
import {
  COMMON_ERROR_CODES,
  FIELD_ERROR_CODES,
  defaultsForStatus,
  isErrorCode,
} from './error-codes.js';

// Task P5 (không có mã test case riêng trong plan; issue #17 ghi "kiểm theo mô tả"): quy tắc mã lỗi ổn định và AppException.

describe('isErrorCode', () => {
  it.each([
    'LOI_HE_THONG',
    'A',
    'YEU_CAU_DANG_CHO',
    'MA_2',
    'TOKEN_KHONG_HOP_LE',
  ])('%s là mã', (value) => {
    expect(isErrorCode(value)).toBe(true);
  });

  it.each([
    '',
    'Bad Request',
    'Cannot GET /x',
    'lower_case',
    'CÓ_DẤU',
    '_BAT_DAU_BANG_GACH',
    '1_BAT_DAU_BANG_SO',
    'CO KHOANG TRANG',
    'CO-GACH-NGANG',
    42,
    null,
    undefined,
    ['MA'],
  ])('%j không phải mã', (value) => {
    expect(isErrorCode(value)).toBe(false);
  });
});

describe('mã lỗi chung', () => {
  it('mọi mã chung đều hợp lệ và không trùng nhau', () => {
    const codes = [
      ...Object.values(COMMON_ERROR_CODES),
      ...Object.values(FIELD_ERROR_CODES),
    ];
    expect(codes.every(isErrorCode)).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('khớp với mã A4 của auth (common không import auth nên khoá lệch bằng test này)', () => {
    expect(COMMON_ERROR_CODES.UNAUTHENTICATED).toBe(
      AUTH_ERROR_CODES.NOT_LOGGED_IN,
    );
    expect(COMMON_ERROR_CODES.FORBIDDEN).toBe(AUTH_ERROR_CODES.FORBIDDEN);
    expect(defaultsForStatus(401).maLoi).toBe(AUTH_ERROR_CODES.NOT_LOGGED_IN);
    expect(defaultsForStatus(403).maLoi).toBe(AUTH_ERROR_CODES.FORBIDDEN);
  });

  it('không trùng mã đầu vào của A1 (mã trường và mã lỗi chung phải phân biệt được)', () => {
    const common = new Set<string>(Object.values(COMMON_ERROR_CODES));
    for (const code of Object.values(VALIDATION_CODES)) {
      expect(common.has(code)).toBe(false);
    }
  });

  it.each([
    [400, 'YEU_CAU_KHONG_HOP_LE'],
    [401, 'CHUA_DANG_NHAP'],
    [403, 'KHONG_DU_QUYEN'],
    [404, 'KHONG_TIM_THAY'],
    [405, 'PHUONG_THUC_KHONG_DUOC_PHEP'],
    [413, 'DU_LIEU_QUA_LON'],
    [418, 'YEU_CAU_KHONG_HOP_LE'],
    [422, 'YEU_CAU_KHONG_HOP_LE'],
    [429, 'YEU_CAU_KHONG_HOP_LE'],
    [500, 'LOI_HE_THONG'],
    [503, 'LOI_HE_THONG'],
  ])(
    'trạng thái %i ⇒ mã mặc định %s, có thongBao tiếng Việt không rỗng',
    (status, code) => {
      const defaults = defaultsForStatus(status);
      expect(defaults.maLoi).toBe(code);
      expect(defaults.thongBao.length).toBeGreaterThan(0);
    },
  );
});

describe('AppException', () => {
  it('mang trạng thái, mã, thongBao mặc định theo trạng thái; message của ngoại lệ = mã', () => {
    const exception = new AppException(409, 'YEU_CAU_DANG_CHO');

    expect(exception.getStatus()).toBe(409);
    expect(exception.maLoi).toBe('YEU_CAU_DANG_CHO');
    expect(exception.message).toBe('YEU_CAU_DANG_CHO');
    expect(exception.getResponse()).toEqual({
      maLoi: 'YEU_CAU_DANG_CHO',
      thongBao: defaultsForStatus(409).thongBao,
    });
  });

  it('nhận thongBao, loi, chiTiet; trường không truyền thì không có trong thân', () => {
    const exception = new AppException(400, 'LICH_HOAT_DONG_KHONG_HOP_LE', {
      thongBao: 'Thứ 2: giờ không hợp lệ.',
      loi: [{ truong: 'lich.0', ma: 'GIO_SAI' }],
      chiTiet: [{ thu: 2, maLoi: 'GIO_BAT_DAU_SAU_KET_THUC' }],
    });

    expect(exception.getResponse()).toEqual({
      maLoi: 'LICH_HOAT_DONG_KHONG_HOP_LE',
      thongBao: 'Thứ 2: giờ không hợp lệ.',
      loi: [{ truong: 'lich.0', ma: 'GIO_SAI' }],
      chiTiet: [{ thu: 2, maLoi: 'GIO_BAT_DAU_SAU_KET_THUC' }],
    });
    const plain = new AppException(404, 'KHONG_TIM_THAY').getResponse();
    expect(Object.keys(plain)).toEqual(['maLoi', 'thongBao']);
  });

  it('giữ nguyên nhân (cause) để log, không đưa vào thân phản hồi', () => {
    const cause = new Error('gốc');
    const exception = new AppException(409, 'XUNG_DOT', { cause });

    expect(exception.cause).toBe(cause);
    expect(JSON.stringify(exception.getResponse())).not.toContain('gốc');
  });

  it.each([200, 302, 399, 500, 503, 40.5, Number.NaN])(
    'từ chối trạng thái %j (chỉ dành cho 4xx)',
    (status) => {
      expect(() => new AppException(status, 'MA_HOP_LE')).toThrow(/4xx/);
    },
  );

  it.each([
    'Có lỗi xảy ra',
    'lower_case',
    '',
    'CO KHOANG TRANG',
    'Bad Request',
  ])('từ chối mã không đúng dạng ổn định: %j', (code) => {
    expect(() => new AppException(400, code)).toThrow(/Mã lỗi/);
  });
});
