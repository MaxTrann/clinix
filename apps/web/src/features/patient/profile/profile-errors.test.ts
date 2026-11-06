import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import { GENERIC_ERROR_MESSAGE } from '../../../shared/api/error-message';
// Chỉ trong test: ghim câu họ tên và SĐT y hệt auth (auth không xuất FIELD_MESSAGES qua index.ts; mã auth không đổi)
import { FIELD_MESSAGES as AUTH_FIELD_MESSAGES } from '../../auth/register/register-errors';
import {
  BIRTH_DATE_AFTER_TODAY_MESSAGE,
  BIRTH_DATE_TOO_EARLY_MESSAGE,
  FIELD_MESSAGES,
  INVALID_DATA_MESSAGE,
  NAME_REQUIRED_MESSAGE,
  SAVE_NETWORK_MESSAGE,
  SAVE_TIMEOUT_MESSAGE,
  SAVE_UNEXPECTED_MESSAGE,
  SYSTEM_MESSAGE,
  buildProfileUpdate,
  describeSaveError,
  firstInvalidField,
  isProfileField,
  isSessionEnded,
  validateProfileForm,
} from './profile-errors';
import type { ProfileFormValues } from './profile-types';

// patient F3 (TRACKING F3-G). Mã ca PW-nn là [đề xuất]; mỗi ca ghi mã HS của PLAN mục 7.1 mà nó phủ.
const TODAY = '2026-11-05';
const VALID: ProfileFormValues = {
  hoTen: 'Nguyễn Văn A',
  soDienThoai: '0901234567',
  gioiTinh: 'Nam',
  ngaySinh: '15/05/1990',
  diaChi: '12 Đường Mẫu',
};
const check = (patch: Partial<ProfileFormValues>) =>
  validateProfileForm({ ...VALID, ...patch }, TODAY);

describe('kiểm form trước khi gửi (PLAN 5.8)', () => {
  it('PW-07 HS-18 dữ liệu hợp lệ ⇒ không lỗi; ba ô tuỳ chọn được để trống', () => {
    expect(check({})).toEqual({});
    expect(check({ gioiTinh: '', ngaySinh: '', diaChi: '' })).toEqual({});
  });

  it.each(['', '   ', ' \t\n '])(
    'PW-07 HS-18 họ tên trống %j ⇒ "Vui lòng nhập họ và tên."',
    (hoTen) => {
      expect(check({ hoTen })).toEqual({ hoTen: NAME_REQUIRED_MESSAGE });
    },
  );

  it.each([
    ['không có chữ cái', '12345 !!!'],
    ['101 ký tự', 'a'.repeat(101)],
    ['có ký tự điều khiển', 'Nguyễn\tVăn A'],
    ['chỉ U+00A0 (không bị cắt như khoảng trắng ASCII)', ' '],
  ])('PW-07 HS-18 họ tên %s ⇒ câu HO_TEN_KHONG_HOP_LE', (_label, hoTen) => {
    expect(check({ hoTen })).toEqual({
      hoTen: FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE,
    });
  });

  it('PW-07 HS-18 họ tên 100 ký tự có dấu là hợp lệ (biên)', () => {
    expect(check({ hoTen: 'ế'.repeat(100) })).toEqual({});
  });

  it.each([
    '090123456',
    '09012345678',
    '1901234567',
    '09012345a7',
    '+84901234567',
    '0901  234 567',
    '',
    '   ',
  ])('PW-07 HS-18 SĐT sai %j ⇒ câu SDT_KHONG_HOP_LE', (soDienThoai) => {
    expect(check({ soDienThoai })).toEqual({
      soDienThoai: FIELD_MESSAGES.SDT_KHONG_HOP_LE,
    });
  });

  it.each(['0901234567', '0901 234 567', '0901.234.567', ' 0901234567 '])(
    'PW-07 HS-18 SĐT hợp lệ %j',
    (soDienThoai) => {
      expect(check({ soDienThoai })).toEqual({});
    },
  );

  it.each([
    '31/02/2000',
    '29/02/2023',
    '29/02/1900',
    '15-05-1990',
    '5/1/1990',
    'abc',
  ])('PW-07 HS-18 ngày sinh %j không có thật hoặc sai dạng', (ngaySinh) => {
    expect(check({ ngaySinh })).toEqual({
      ngaySinh: FIELD_MESSAGES.NGAY_SINH_KHONG_HOP_LE,
    });
  });

  it('PW-07 HS-18 ngày sinh ngày mai (giờ Việt Nam) ⇒ lỗi; hôm nay hợp lệ (biên)', () => {
    expect(check({ ngaySinh: '06/11/2026' })).toEqual({
      ngaySinh: BIRTH_DATE_AFTER_TODAY_MESSAGE,
    });
    expect(check({ ngaySinh: '05/11/2026' })).toEqual({});
  });

  it('PW-07 HS-18 ngày sinh trước 1900 ⇒ lỗi; đúng 01/01/1900 hợp lệ (biên)', () => {
    expect(check({ ngaySinh: '31/12/1899' })).toEqual({
      ngaySinh: BIRTH_DATE_TOO_EARLY_MESSAGE,
    });
    expect(check({ ngaySinh: '01/01/1900' })).toEqual({});
  });

  it('PW-07 HS-18 ngày sinh có khoảng trắng ASCII hai đầu vẫn nhận', () => {
    expect(check({ ngaySinh: ' 15/05/1990 ' })).toEqual({});
  });

  it('PW-07 HS-18 địa chỉ 255 ký tự hợp lệ, 256 ký tự (theo điểm mã) lỗi', () => {
    expect(check({ diaChi: 'a'.repeat(255) })).toEqual({});
    expect(check({ diaChi: '😀'.repeat(255) })).toEqual({});
    expect(check({ diaChi: 'a'.repeat(256) })).toEqual({
      diaChi: FIELD_MESSAGES.DIA_CHI_KHONG_HOP_LE,
    });
  });

  it('PW-07 HS-18 địa chỉ có xuống dòng ⇒ lỗi; chỉ khoảng trắng ASCII ⇒ hợp lệ (sẽ thành null); U+00A0 không bị cắt', () => {
    expect(check({ diaChi: 'Số 1\nQuận 2' })).toEqual({
      diaChi: FIELD_MESSAGES.DIA_CHI_KHONG_HOP_LE,
    });
    expect(check({ diaChi: ' \t ' })).toEqual({});
    expect(check({ diaChi: ' ' })).toEqual({});
  });

  it('PW-07 HS-18 nhiều ô sai cùng lúc ⇒ báo đủ từng ô', () => {
    const errors = check({
      hoTen: '',
      soDienThoai: '1',
      ngaySinh: '99/99/9999',
      diaChi: 'a'.repeat(300),
    });
    expect(Object.keys(errors).sort()).toEqual(
      ['diaChi', 'hoTen', 'ngaySinh', 'soDienThoai'].sort(),
    );
  });
});

describe('thân PUT', () => {
  it('PW-08 HS-18 đúng năm khoá, không có email', () => {
    expect(Object.keys(buildProfileUpdate(VALID)).sort()).toEqual(
      ['diaChi', 'gioiTinh', 'hoTen', 'ngaySinh', 'soDienThoai'].sort(),
    );
  });

  it('PW-08 HS-18 chuẩn hoá: cắt họ tên và SĐT, ngày ⇒ YYYY-MM-DD, giới tính giữ mã', () => {
    expect(
      buildProfileUpdate({
        hoTen: '  Nguyễn Văn A \n',
        soDienThoai: ' 0901 234 567 ',
        gioiTinh: 'Nu',
        ngaySinh: ' 15/05/1990 ',
        diaChi: '  12 Đường Mẫu  ',
      }),
    ).toEqual({
      hoTen: 'Nguyễn Văn A',
      soDienThoai: '0901 234 567',
      gioiTinh: 'Nu',
      ngaySinh: '1990-05-15',
      diaChi: '12 Đường Mẫu',
    });
  });

  it('PW-08 HS-18 ba ô tuỳ chọn trống ⇒ null (địa chỉ chỉ khoảng trắng cũng thành null)', () => {
    expect(
      buildProfileUpdate({
        ...VALID,
        gioiTinh: '',
        ngaySinh: '  ',
        diaChi: ' \t\n ',
      }),
    ).toMatchObject({ gioiTinh: null, ngaySinh: null, diaChi: null });
  });

  it('PW-08 HS-18 địa chỉ không bị cắt U+00A0, và chuẩn hoá NFC', () => {
    expect(buildProfileUpdate({ ...VALID, diaChi: ' ' }).diaChi).toBe(' ');
    expect(buildProfileUpdate({ ...VALID, diaChi: 'ê' }).diaChi).toBe('ê');
  });
});

describe('thứ tự ô và tên trường', () => {
  it('PW-09 HS-18 ô lỗi đầu theo thứ tự form, không theo thứ tự nhập vào', () => {
    expect(
      firstInvalidField({ diaChi: 'x', ngaySinh: 'x', soDienThoai: 'x' }),
    ).toBe('soDienThoai');
    expect(firstInvalidField({ diaChi: 'x', hoTen: 'x' })).toBe('hoTen');
    expect(firstInvalidField({ gioiTinh: 'x', ngaySinh: 'x' })).toBe(
      'gioiTinh',
    );
    expect(firstInvalidField({})).toBeNull();
  });

  it('PW-09 HS-18 chỉ năm ô của form là ô; email và tên lạ thì không', () => {
    for (const name of [
      'hoTen',
      'soDienThoai',
      'gioiTinh',
      'ngaySinh',
      'diaChi',
    ]) {
      expect(isProfileField(name)).toBe(true);
    }
    for (const name of ['email', 'vaiTro', 'constructor', '']) {
      expect(isProfileField(name)).toBe(false);
    }
  });
});

describe('câu chữ khớp auth', () => {
  it('PW-10 HS-18 câu họ tên và SĐT y hệt FIELD_MESSAGES của auth (lệch là đỏ)', () => {
    expect(FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE).toBe(
      AUTH_FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE,
    );
    expect(FIELD_MESSAGES.SDT_KHONG_HOP_LE).toBe(
      AUTH_FIELD_MESSAGES.SDT_KHONG_HOP_LE,
    );
  });
});

const apiError = (
  status: number,
  maLoi: string,
  extra: { loi?: { truong: string; ma: string }[] } = {},
) => new ApiError(status, { maLoi, thongBao: 'CÂU CỦA API', ...extra });

describe('phân loại lỗi lưu', () => {
  it('PW-11 HS-18 400 theo ô: câu đúng ô, không hộp cảnh báo chung', () => {
    expect(
      describeSaveError(
        apiError(400, 'DU_LIEU_KHONG_HOP_LE', {
          loi: [
            { truong: 'diaChi', ma: 'DIA_CHI_KHONG_HOP_LE' },
            { truong: 'soDienThoai', ma: 'SDT_KHONG_HOP_LE' },
            { truong: 'hoTen', ma: 'HO_TEN_KHONG_HOP_LE' },
            { truong: 'ngaySinh', ma: 'NGAY_SINH_KHONG_HOP_LE' },
            { truong: 'gioiTinh', ma: 'GIOI_TINH_KHONG_HOP_LE' },
          ],
        }),
      ),
    ).toEqual({
      kind: 'fields',
      fields: {
        diaChi: FIELD_MESSAGES.DIA_CHI_KHONG_HOP_LE,
        soDienThoai: FIELD_MESSAGES.SDT_KHONG_HOP_LE,
        hoTen: FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE,
        ngaySinh: FIELD_MESSAGES.NGAY_SINH_KHONG_HOP_LE,
        gioiTinh: FIELD_MESSAGES.GIOI_TINH_KHONG_HOP_LE,
      },
      alert: null,
    });
  });

  it('PW-11 HS-18 mục có truong ngoài form (email) hoặc ma lạ ⇒ hộp cảnh báo chung, vẫn giữ các ô gắn được', () => {
    expect(
      describeSaveError(
        apiError(400, 'DU_LIEU_KHONG_HOP_LE', {
          loi: [
            { truong: 'email', ma: 'TRUONG_KHONG_DUOC_PHEP' },
            { truong: 'hoTen', ma: 'HO_TEN_KHONG_HOP_LE' },
            { truong: 'diaChi', ma: 'MA_LA' },
            { truong: 'diaChi', ma: 'constructor' },
          ],
        }),
      ),
    ).toEqual({
      kind: 'fields',
      fields: { hoTen: FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE },
      alert: INVALID_DATA_MESSAGE,
    });
  });

  it('PW-11 HS-18 loi[] rỗng hoặc thiếu ⇒ chỉ hộp cảnh báo chung; một ô lặp hai lần giữ câu đầu', () => {
    for (const loi of [[], undefined]) {
      expect(
        describeSaveError(apiError(400, 'DU_LIEU_KHONG_HOP_LE', { loi })),
      ).toEqual({ kind: 'fields', fields: {}, alert: INVALID_DATA_MESSAGE });
    }
    expect(
      describeSaveError(
        apiError(400, 'DU_LIEU_KHONG_HOP_LE', {
          loi: [
            { truong: 'hoTen', ma: 'HO_TEN_KHONG_HOP_LE' },
            { truong: 'hoTen', ma: 'NGAY_SINH_KHONG_HOP_LE' },
          ],
        }),
      ),
    ).toMatchObject({
      fields: { hoTen: FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE },
      alert: null,
    });
  });

  it('PW-11 HS-20 500 LOI_HE_THONG (chắc chắn chưa ghi) ⇒ câu sự cố; mã khác ⇒ câu chung', () => {
    expect(describeSaveError(apiError(500, 'LOI_HE_THONG'))).toEqual({
      kind: 'message',
      message: SYSTEM_MESSAGE,
    });
    expect(describeSaveError(apiError(403, 'KHONG_DU_QUYEN'))).toEqual({
      kind: 'message',
      message: GENERIC_ERROR_MESSAGE,
    });
  });

  it('PW-11 HS-20 mạng, quá giờ, phản hồi lạ: câu "chưa rõ đã ghi chưa" khác nhau, đều dặn bấm lại hoặc tải lại', () => {
    const network = describeSaveError(new NetworkError());
    const timeout = describeSaveError(new TimeoutError());
    const unexpected = describeSaveError(new UnexpectedResponseError(502));
    expect(network).toEqual({ kind: 'message', message: SAVE_NETWORK_MESSAGE });
    expect(timeout).toEqual({ kind: 'message', message: SAVE_TIMEOUT_MESSAGE });
    expect(unexpected).toEqual({
      kind: 'message',
      message: SAVE_UNEXPECTED_MESSAGE,
    });
    for (const message of [
      SAVE_NETWORK_MESSAGE,
      SAVE_TIMEOUT_MESSAGE,
      SAVE_UNEXPECTED_MESSAGE,
    ]) {
      expect(message).toContain('chưa rõ thay đổi đã được ghi hay chưa');
      expect(message).toContain('Bấm Lưu thay đổi để thử lại');
    }
    expect(
      new Set([network, timeout, unexpected].map((x) => JSON.stringify(x)))
        .size,
    ).toBe(3);
  });

  it('PW-11 HS-20 lỗi không biết ⇒ câu chung', () => {
    expect(describeSaveError(new Error('lạ'))).toEqual({
      kind: 'message',
      message: GENERIC_ERROR_MESSAGE,
    });
  });

  it.each([
    'PHIEN_HET_HIEU_LUC',
    'TOKEN_KHONG_HOP_LE',
    'CHUA_DANG_NHAP',
    'MA_LA',
  ])('PW-11 HS-20 401 %s ⇒ bỏ qua (hook của auth xử lý)', (maLoi) => {
    const error = apiError(401, maLoi);
    expect(isSessionEnded(error)).toBe(true);
    expect(describeSaveError(error)).toEqual({ kind: 'ignored' });
  });

  it('PW-11 HS-20 đăng xuất giữa chừng (RequestAbortedError) ⇒ bỏ qua; lỗi khác không phải phiên hết', () => {
    expect(describeSaveError(new RequestAbortedError())).toEqual({
      kind: 'ignored',
    });
    expect(isSessionEnded(apiError(403, 'KHONG_DU_QUYEN'))).toBe(false);
    expect(isSessionEnded(new NetworkError())).toBe(false);
  });
});
