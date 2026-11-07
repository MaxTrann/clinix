import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import { GENERIC_ERROR_MESSAGE } from '../../../shared/api/error-message';
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
} from '../profile/profile-errors';
import {
  ADD_NETWORK_MESSAGE,
  ADD_TIMEOUT_MESSAGE,
  ADD_UNEXPECTED_MESSAGE,
  BIRTH_DATE_REQUIRED_MESSAGE,
  DEACTIVATED_MESSAGE,
  MISSING_MESSAGE,
  RELATIONSHIP_REQUIRED_MESSAGE,
  buildRelativePayload,
  describeRelativeSaveError,
  firstInvalidRelativeField,
  validateRelativeForm,
} from './relative-errors';
import type { RelativeFormValues } from './relatives-types';

// patient F6 (TRACKING F6-E, F6-F, F6-H): kiểm form, thân POST và PUT, phân loại lỗi lưu. Mã ca RW-nn là [đề xuất].
const TODAY = '2026-11-07';
const VALID: RelativeFormValues = {
  hoTen: 'Trần Thị Cúc',
  moiQuanHe: 'Vo',
  gioiTinh: 'Nu',
  ngaySinh: '12/04/1992',
  soDienThoai: '',
};
const check = (patch: Partial<RelativeFormValues>) =>
  validateRelativeForm({ ...VALID, ...patch }, TODAY);

describe('validateRelativeForm (PLAN 5.8)', () => {
  it('RW-13 NT-21 năm ô hợp lệ, SĐT để trống ⇒ không lỗi', () => {
    expect(check({})).toEqual({});
  });

  it.each([
    ['', NAME_REQUIRED_MESSAGE],
    ['   ', NAME_REQUIRED_MESSAGE],
    ['12345', FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE],
    ['A'.repeat(101), FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE],
    ['An\u0007', FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE],
  ])('RW-14 NT-21 họ tên %j ⇒ câu đúng ô họ tên', (hoTen, message) => {
    expect(check({ hoTen })).toEqual({ hoTen: message });
  });

  it('RW-15 NT-21 họ tên 100 ký tự và tên một chữ cái đều hợp lệ (biên)', () => {
    expect(check({ hoTen: 'A'.repeat(100) })).toEqual({});
    expect(check({ hoTen: 'Ng' })).toEqual({});
  });

  it.each(['', 'Mẹ', 'me', 'constructor'])(
    'RW-16 NT-21 mối quan hệ %j ⇒ "Vui lòng chọn mối quan hệ."',
    (moiQuanHe) => {
      expect(check({ moiQuanHe })).toEqual({
        moiQuanHe: RELATIONSHIP_REQUIRED_MESSAGE,
      });
    },
  );

  it.each(['', 'Male', 'nữ'])(
    'RW-17 NT-21 giới tính %j ⇒ "Vui lòng chọn giới tính."',
    (gioiTinh) => {
      expect(check({ gioiTinh })).toEqual({
        gioiTinh: FIELD_MESSAGES.GIOI_TINH_KHONG_HOP_LE,
      });
    },
  );

  it.each(['', '   '])(
    'RW-18 NT-21 ngày sinh %j (BẮT BUỘC) ⇒ "Vui lòng nhập ngày sinh."',
    (ngaySinh) => {
      expect(check({ ngaySinh })).toEqual({
        ngaySinh: BIRTH_DATE_REQUIRED_MESSAGE,
      });
    },
  );

  it.each([
    '31/02/2000',
    '29/02/2023',
    '29/02/1900',
    '31/11/1990',
    '1/1/2000',
    '2000-01-31',
    '12/04/92',
    '12-04-1992',
    '00/04/1992',
    '12/13/1992',
  ])(
    'RW-19 NT-21 ngày không hợp lệ hoặc không có thật %s ⇒ "Ngày sinh không hợp lệ."',
    (ngaySinh) => {
      expect(check({ ngaySinh })).toEqual({
        ngaySinh: FIELD_MESSAGES.NGAY_SINH_KHONG_HOP_LE,
      });
    },
  );

  it('RW-20 NT-21 ngày biên: hôm nay hợp lệ, ngày mai (giờ Việt Nam) lỗi; 01/01/1900 hợp lệ, 31/12/1899 lỗi; 29/02/2024 có thật', () => {
    expect(check({ ngaySinh: '07/11/2026' })).toEqual({});
    expect(check({ ngaySinh: '08/11/2026' })).toEqual({
      ngaySinh: BIRTH_DATE_AFTER_TODAY_MESSAGE,
    });
    expect(check({ ngaySinh: '01/01/1900' })).toEqual({});
    expect(check({ ngaySinh: '31/12/1899' })).toEqual({
      ngaySinh: BIRTH_DATE_TOO_EARLY_MESSAGE,
    });
    expect(check({ ngaySinh: '29/02/2024' })).toEqual({});
    expect(check({ ngaySinh: ' 12/04/1992 ' })).toEqual({});
  });

  it.each(['', '   ', '0912345678', '0912 345 678', ' 0912.345.678 '])(
    'RW-21 NT-21 SĐT %j hợp lệ (trống là tuỳ chọn)',
    (soDienThoai) => {
      expect(check({ soDienThoai })).toEqual({});
    },
  );

  it.each(['123', '1912345678', '091234567', '09123456789', '0912a45678'])(
    'RW-22 NT-21 SĐT %s sai ⇒ câu SĐT của auth',
    (soDienThoai) => {
      expect(check({ soDienThoai })).toEqual({
        soDienThoai: FIELD_MESSAGES.SDT_KHONG_HOP_LE,
      });
    },
  );

  it('RW-23 NT-21 cả năm ô sai cùng lúc ⇒ đủ năm lỗi, ô lỗi đầu theo thứ tự form', () => {
    const errors = validateRelativeForm(
      {
        hoTen: '',
        moiQuanHe: '',
        gioiTinh: '',
        ngaySinh: '',
        soDienThoai: '1',
      },
      TODAY,
    );
    expect(Object.keys(errors).sort()).toEqual(
      ['gioiTinh', 'hoTen', 'moiQuanHe', 'ngaySinh', 'soDienThoai'].sort(),
    );
    expect(firstInvalidRelativeField(errors)).toBe('hoTen');
  });

  it.each([
    [{ soDienThoai: 'x', ngaySinh: 'x', gioiTinh: 'x' }, 'gioiTinh'],
    [{ soDienThoai: 'x', ngaySinh: 'x' }, 'ngaySinh'],
    [{ soDienThoai: 'x', moiQuanHe: '' }, 'moiQuanHe'],
    [{ soDienThoai: 'x' }, 'soDienThoai'],
  ])(
    'RW-24 NT-21 ô lỗi đầu theo thứ tự form, không theo thứ tự khai báo lỗi %j ⇒ %s',
    (patch, first) => {
      expect(firstInvalidRelativeField(check(patch))).toBe(first);
    },
  );

  it('RW-25 NT-21 không có lỗi ⇒ không có ô lỗi đầu', () => {
    expect(firstInvalidRelativeField({})).toBeNull();
  });
});

describe('buildRelativePayload: thân POST và PUT', () => {
  it('RW-26 NT-21 đúng NĂM khoá (không diaChi, không trạng thái), ngày dd/mm/yyyy ⇒ YYYY-MM-DD, mã quan hệ và giới tính nguyên mã', () => {
    const payload = buildRelativePayload({
      ...VALID,
      hoTen: '  Trần Thị Cúc  ',
      moiQuanHe: 'AnhChiEm',
      soDienThoai: ' 0912 345 678 ',
    });
    expect(Object.keys(payload).sort()).toEqual(
      ['gioiTinh', 'hoTen', 'moiQuanHe', 'ngaySinh', 'soDienThoai'].sort(),
    );
    expect(payload).toEqual({
      hoTen: 'Trần Thị Cúc',
      moiQuanHe: 'AnhChiEm',
      gioiTinh: 'Nu',
      ngaySinh: '1992-04-12',
      soDienThoai: '0912 345 678',
    });
  });

  it.each(['', '   '])(
    'RW-27 NT-21 NT-22 SĐT %j ⇒ null (PUT: xoá SĐT)',
    (soDienThoai) => {
      expect(
        buildRelativePayload({ ...VALID, soDienThoai }).soDienThoai,
      ).toBeNull();
    },
  );

  it('RW-28 NT-21 ngày đổi bằng chuỗi: 05/03/2000 là ngày 5 tháng 3 (không đảo), 29/02/2024 giữ nguyên; chưa qua kiểm thì null', () => {
    expect(
      buildRelativePayload({ ...VALID, ngaySinh: '05/03/2000' }).ngaySinh,
    ).toBe('2000-03-05');
    expect(
      buildRelativePayload({ ...VALID, ngaySinh: '29/02/2024' }).ngaySinh,
    ).toBe('2024-02-29');
    expect(
      buildRelativePayload({ ...VALID, ngaySinh: 'abc' }).ngaySinh,
    ).toBeNull();
  });
});

const apiError = (
  status: number,
  maLoi: string,
  loi?: { truong: string; ma: string }[],
) => new ApiError(status, { maLoi, thongBao: 'CÂU CỦA API', loi });

describe('describeRelativeSaveError', () => {
  it('RW-29 NT-21 400: lỗi theo ô khi loi[] đảo thứ tự; mối quan hệ có câu riêng; không hộp chung', () => {
    expect(
      describeRelativeSaveError(
        apiError(400, 'DU_LIEU_KHONG_HOP_LE', [
          { truong: 'soDienThoai', ma: 'SDT_KHONG_HOP_LE' },
          { truong: 'moiQuanHe', ma: 'MOI_QUAN_HE_KHONG_HOP_LE' },
          { truong: 'hoTen', ma: 'HO_TEN_KHONG_HOP_LE' },
          { truong: 'ngaySinh', ma: 'NGAY_SINH_KHONG_HOP_LE' },
          { truong: 'gioiTinh', ma: 'GIOI_TINH_KHONG_HOP_LE' },
        ]),
        'create',
      ),
    ).toEqual({
      kind: 'fields',
      fields: {
        hoTen: FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE,
        moiQuanHe: RELATIONSHIP_REQUIRED_MESSAGE,
        gioiTinh: FIELD_MESSAGES.GIOI_TINH_KHONG_HOP_LE,
        ngaySinh: FIELD_MESSAGES.NGAY_SINH_KHONG_HOP_LE,
        soDienThoai: FIELD_MESSAGES.SDT_KHONG_HOP_LE,
      },
      alert: null,
    });
  });

  it.each([
    [
      'trường ngoài form (email)',
      [{ truong: 'email', ma: 'TRUONG_KHONG_DUOC_PHEP' }],
    ],
    ['trường lạ (diaChi)', [{ truong: 'diaChi', ma: 'DIA_CHI_KHONG_HOP_LE' }]],
    ['mã lạ', [{ truong: 'hoTen', ma: 'MA_LA' }]],
    [
      'mã trùng tên thuộc tính của Object',
      [{ truong: 'hoTen', ma: 'constructor' }],
    ],
    [
      'TRUONG_KHONG_DUOC_PHEP ở trường của form',
      [{ truong: 'hoTen', ma: 'TRUONG_KHONG_DUOC_PHEP' }],
    ],
    ['không có loi[]', undefined],
    ['loi[] rỗng', []],
  ])(
    'RW-30 NT-21 400 với %s ⇒ hộp cảnh báo chung "Dữ liệu không hợp lệ."',
    (_label, loi) => {
      expect(
        describeRelativeSaveError(
          apiError(400, 'DU_LIEU_KHONG_HOP_LE', loi),
          'create',
        ),
      ).toEqual({ kind: 'fields', fields: {}, alert: INVALID_DATA_MESSAGE });
    },
  );

  it('RW-31 NT-21 400 vừa có ô vừa có mục không gắn được ⇒ giữ câu dưới ô và thêm hộp chung; hai lỗi cùng ô ⇒ lấy câu đầu', () => {
    expect(
      describeRelativeSaveError(
        apiError(400, 'DU_LIEU_KHONG_HOP_LE', [
          { truong: 'hoTen', ma: 'HO_TEN_KHONG_HOP_LE' },
          { truong: 'hoTen', ma: 'SDT_KHONG_HOP_LE' },
          { truong: 'email', ma: 'TRUONG_KHONG_DUOC_PHEP' },
        ]),
        'update',
      ),
    ).toEqual({
      kind: 'fields',
      fields: { hoTen: FIELD_MESSAGES.HO_TEN_KHONG_HOP_LE },
      alert: INVALID_DATA_MESSAGE,
    });
  });

  it.each(['create', 'update'] as const)(
    'RW-32 NT-21 NT-22 (%s) 401 mọi mã và RequestAbortedError ⇒ bỏ qua',
    (mode) => {
      for (const maLoi of [
        'PHIEN_HET_HIEU_LUC',
        'CHUA_DANG_NHAP',
        'TOKEN_KHONG_HOP_LE',
      ]) {
        expect(describeRelativeSaveError(apiError(401, maLoi), mode)).toEqual({
          kind: 'ignored',
        });
      }
      expect(
        describeRelativeSaveError(new RequestAbortedError(), mode),
      ).toEqual({
        kind: 'ignored',
      });
    },
  );

  it('RW-33 NT-22 PUT: 404 KHONG_TIM_THAY và 409 HO_SO_NGUOI_THAN_DA_NGUNG ⇒ tải lại danh sách kèm câu thông báo; POST không có hai nhánh này', () => {
    expect(
      describeRelativeSaveError(apiError(404, 'KHONG_TIM_THAY'), 'update'),
    ).toEqual({
      kind: 'stale',
      notice: MISSING_MESSAGE,
    });
    expect(
      describeRelativeSaveError(
        apiError(409, 'HO_SO_NGUOI_THAN_DA_NGUNG'),
        'update',
      ),
    ).toEqual({ kind: 'stale', notice: DEACTIVATED_MESSAGE });
    expect(DEACTIVATED_MESSAGE).toBe(
      'Hồ sơ người thân này đã ngừng sử dụng nên không thể chỉnh sửa.',
    );
    for (const maLoi of ['KHONG_TIM_THAY', 'HO_SO_NGUOI_THAN_DA_NGUNG']) {
      expect(describeRelativeSaveError(apiError(409, maLoi), 'create')).toEqual(
        {
          kind: 'message',
          message: GENERIC_ERROR_MESSAGE,
        },
      );
    }
  });

  it.each(['create', 'update'] as const)(
    'RW-34 NT-21 NT-22 (%s) 500 LOI_HE_THONG ⇒ câu hệ thống; mã khác (403) và lỗi không phải Error ⇒ câu chung',
    (mode) => {
      expect(
        describeRelativeSaveError(apiError(500, 'LOI_HE_THONG'), mode),
      ).toEqual({
        kind: 'message',
        message: SYSTEM_MESSAGE,
      });
      expect(
        describeRelativeSaveError(apiError(403, 'KHONG_DU_QUYEN'), mode),
      ).toEqual({
        kind: 'message',
        message: GENERIC_ERROR_MESSAGE,
      });
      for (const other of [new Error('x'), 'chuỗi', null, undefined]) {
        expect(describeRelativeSaveError(other, mode)).toEqual({
          kind: 'message',
          message: GENERIC_ERROR_MESSAGE,
        });
      }
    },
  );

  it('RW-35 NT-21 POST không rõ kết quả (mạng, quá giờ, phản hồi lạ) ⇒ "uncertain", câu nói rõ chưa rõ đã thêm và bảo tải lại danh sách', () => {
    const cases: [unknown, string][] = [
      [new NetworkError(), ADD_NETWORK_MESSAGE],
      [new TimeoutError(), ADD_TIMEOUT_MESSAGE],
      [new UnexpectedResponseError(502), ADD_UNEXPECTED_MESSAGE],
    ];
    for (const [error, message] of cases) {
      expect(describeRelativeSaveError(error, 'create')).toEqual({
        kind: 'uncertain',
        message,
      });
      expect(message).toContain('chưa rõ hồ sơ đã được thêm hay chưa');
      expect(message).toContain('tải lại danh sách');
    }
  });

  it('RW-36 NT-22 PUT không rõ kết quả ⇒ câu của F3 (PUT idempotent, bấm Lưu lại an toàn), không có nút tải lại', () => {
    const cases: [unknown, string][] = [
      [new NetworkError(), SAVE_NETWORK_MESSAGE],
      [new TimeoutError(), SAVE_TIMEOUT_MESSAGE],
      [new UnexpectedResponseError(504), SAVE_UNEXPECTED_MESSAGE],
    ];
    for (const [error, message] of cases) {
      expect(describeRelativeSaveError(error, 'update')).toEqual({
        kind: 'message',
        message,
      });
    }
  });
});
