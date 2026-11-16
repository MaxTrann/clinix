import { describe, expect, it } from 'vitest';
import { GENERIC_ERROR_MESSAGE } from '../../../shared/api/error-message';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../shared/api/errors';
import {
  COMPLETE_TEXT,
  describeCompleteFailure,
  describeSaveFailure,
  fieldMessage,
  formatCount,
  SAVE_TEXT,
} from './exam-messages';

// doctor-exam F1: hàm thuần chọn câu lỗi của `Hoàn thành ca khám` (WHT-05, WHT-06 mức hàm; PLAN 5.14). Chọn theo `maLoi` và `chiTiet.tuTrangThai`, KHÔNG theo mã HTTP hay `thongBao`.
const api = (status: number, maLoi: string, chiTiet?: unknown) =>
  new ApiError(status, {
    maLoi,
    thongBao: 'THÔNG BÁO KỸ THUẬT KHÔNG ĐƯỢC HIỆN',
    chiTiet,
  });
const transition = (tuTrangThai: unknown) =>
  api(409, 'CHUYEN_TRANG_THAI_KHONG_HOP_LE', {
    tuTrangThai,
    denTrangThai: 'HoanThanh',
  });

describe('doctor-exam F1 — câu lỗi của Hoàn thành ca khám (hàm thuần)', () => {
  it.each([
    [
      'WHT-06 404 KHONG_TIM_THAY',
      api(404, 'KHONG_TIM_THAY'),
      { message: COMPLETE_TEXT.notFound, kind: 'final', refresh: true },
    ],
    [
      'WHT-06 403 KHONG_DU_QUYEN',
      api(403, 'KHONG_DU_QUYEN'),
      { message: COMPLETE_TEXT.forbidden, kind: 'final', refresh: false },
    ],
    [
      'WHT-06 401 CHUA_DANG_NHAP',
      api(401, 'CHUA_DANG_NHAP'),
      { message: COMPLETE_TEXT.sessionExpired, kind: 'final', refresh: false },
    ],
    [
      'WHT-06 503 HE_THONG_DANG_BAN: bấm lại được',
      api(503, 'HE_THONG_DANG_BAN'),
      { message: COMPLETE_TEXT.busy, kind: 'retry', refresh: false },
    ],
    [
      'WHT-05 409 đã HoanThanh: không phải lỗi, có tải lại',
      transition('HoanThanh'),
      { message: COMPLETE_TEXT.already, kind: 'already', refresh: true },
    ],
    [
      'WHT-05 409 trạng thái khác',
      transition('DaXacNhan'),
      { message: COMPLETE_TEXT.notReceived, kind: 'final', refresh: true },
    ],
    [
      'WHT-06 maLoi lạ (500): câu chung, bấm lại được',
      api(500, 'LOI_HE_THONG'),
      { message: GENERIC_ERROR_MESSAGE, kind: 'retry', refresh: false },
    ],
  ])('%s', (_name, error, expected) => {
    expect(describeCompleteFailure(error)).toEqual(expected);
  });

  it.each([
    ['không có chiTiet', undefined],
    ['chiTiet là null', null],
    ['chiTiet là chuỗi', 'HoanThanh'],
    ['chiTiet rỗng', {}],
    ['tuTrangThai là số', { tuTrangThai: 5 }],
    ['tuTrangThai viết thường', { tuTrangThai: 'hoanthanh' }],
  ])('WHT-05 409 mà %s: KHÔNG đoán là đã hoàn thành', (_name, chiTiet) => {
    const result = describeCompleteFailure(
      api(409, 'CHUYEN_TRANG_THAI_KHONG_HOP_LE', chiTiet),
    );
    expect(result.kind).toBe('final');
    expect(result.message).toBe(COMPLETE_TEXT.notReceived);
  });

  it.each([
    ['mạng đứt', new NetworkError()],
    ['hết giờ', new TimeoutError()],
    [
      'phản hồi lạ (nginx 502 hay 200 sai hình)',
      new UnexpectedResponseError(502),
    ],
  ])('WHT-06 %s ⇒ "chưa rõ đã lưu", KHÔNG tải lại tự động', (_name, error) => {
    expect(describeCompleteFailure(error)).toEqual({
      message: COMPLETE_TEXT.unsure,
      kind: 'uncertain',
      refresh: false,
    });
  });

  it('WHT-06 maLoi trùng khoá nguyên mẫu ("constructor", "toString") không trúng bảng', () => {
    for (const maLoi of ['constructor', 'toString', '__proto__']) {
      expect(describeCompleteFailure(api(400, maLoi))).toEqual({
        message: GENERIC_ERROR_MESSAGE,
        kind: 'retry',
        refresh: false,
      });
    }
  });

  it('WHT-06 lỗi không phải của mạng hay API (lỗi lập trình): câu chung, bấm lại được; không in thông báo kỹ thuật', () => {
    const result = describeCompleteFailure(new Error('chi tiết nội bộ'));
    expect(result).toEqual({
      message: GENERIC_ERROR_MESSAGE,
      kind: 'retry',
      refresh: false,
    });
    expect(
      describeCompleteFailure(api(404, 'KHONG_TIM_THAY')).message,
    ).not.toContain('KỸ THUẬT');
    // Lỗi huỷ không do hàm này xử lý (nơi gọi bỏ qua trước), nhưng nếu lọt vào thì cũng không làm vỡ
    expect(describeCompleteFailure(new RequestAbortedError()).kind).toBe(
      'retry',
    );
  });
});

// doctor-exam F3: câu lỗi của hộp ghi hồ sơ (WHS-15 [đề xuất], WHS-05, WHS-09 mức hàm; PLAN 5.14, chữ Đại duyệt 16/11/2026). Chọn theo `maLoi` và `loi[].ma`, KHÔNG theo mã HTTP hay `thongBao`.
const validation = (loi: unknown) =>
  new ApiError(400, {
    maLoi: 'DU_LIEU_KHONG_HOP_LE',
    thongBao: 'THÔNG BÁO KỸ THUẬT KHÔNG ĐƯỢC HIỆN',
    loi: loi as { truong: string; ma: string }[],
  });

describe('doctor-exam F3 — chữ theo ô (fieldMessage) và bộ đếm', () => {
  it('WHS-15 BAT_BUOC nêu đúng tên ô; QUA_DAI lấy số từ hằng; các mã ngày và nội dung có câu riêng', () => {
    expect(fieldMessage('trieuChung', 'BAT_BUOC')).toBe(
      'Vui lòng nhập triệu chứng.',
    );
    expect(fieldMessage('chanDoanSoBo', 'BAT_BUOC')).toBe(
      'Vui lòng nhập chẩn đoán sơ bộ.',
    );
    expect(fieldMessage('huongXuLy', 'BAT_BUOC')).toBe(
      'Vui lòng nhập hướng xử lý / lời khuyên.',
    );
    expect(fieldMessage('huongXuLy', 'QUA_DAI')).toBe('Tối đa 2.000 ký tự.');
    expect(fieldMessage('ngayTaiKhamDuKien', 'NGAY_KHONG_HOP_LE')).toBe(
      'Ngày tái khám không hợp lệ.',
    );
    expect(fieldMessage('ngayTaiKhamDuKien', 'NGAY_NGOAI_KHOANG')).toBe(
      'Ngày tái khám phải từ ngày khám đến 365 ngày sau.',
    );
    expect(fieldMessage('trieuChung', 'NOI_DUNG_KHONG_HOP_LE')).toBe(
      'Nội dung có đoạn giống mật khẩu hoặc mã bí mật; hãy viết lại.',
    );
  });

  it('WHS-07 formatCount: dấu chấm ngăn nghìn như "2.000"', () => {
    expect(
      [0, 7, 999, 1000, 1500, 2000, 12345].map((n) => formatCount(n)),
    ).toEqual(['0', '7', '999', '1.000', '1.500', '2.000', '12.345']);
  });
});

describe('doctor-exam F3 — câu lỗi của hộp ghi hồ sơ (hàm thuần)', () => {
  it.each([
    ['trieuChung', 'BAT_BUOC'],
    ['chanDoanSoBo', 'QUA_DAI'],
    ['huongXuLy', 'NOI_DUNG_KHONG_HOP_LE'],
    ['ngayTaiKhamDuKien', 'NGAY_KHONG_HOP_LE'],
  ])(
    'WHS-15 400 loi[{ %s, %s }] ⇒ lỗi hiện DƯỚI đúng ô, không dải chung, không tải lại',
    (truong, ma) => {
      expect(describeSaveFailure(validation([{ truong, ma }]))).toEqual({
        message: null,
        kind: 'field',
        fields: { [truong]: ma },
        refresh: false,
      });
    },
  );

  it('WHS-15 400 nhiều lỗi một lúc ⇒ đủ từng ô; cùng một ô hai lỗi thì giữ lỗi đầu', () => {
    expect(
      describeSaveFailure(
        validation([
          { truong: 'trieuChung', ma: 'QUA_DAI' },
          { truong: 'huongXuLy', ma: 'BAT_BUOC' },
          { truong: 'trieuChung', ma: 'NOI_DUNG_KHONG_HOP_LE' },
        ]),
      ),
    ).toMatchObject({
      kind: 'field',
      fields: { trieuChung: 'QUA_DAI', huongXuLy: 'BAT_BUOC' },
    });
  });

  it.each([
    ['khoá lạ', [{ truong: 'bacSiId', ma: 'TRUONG_KHONG_DUOC_PHEP' }]],
    ['token không phải chuỗi', [{ truong: 'capNhatLanCuoi', ma: 'IS_STRING' }]],
    ['mã lạ ở ô có thật', [{ truong: 'trieuChung', ma: 'MA_LA' }]],
    ['loi rỗng', []],
    ['thiếu loi', undefined],
    ['loi không phải mảng', 'trieuChung'],
    ['phần tử không phải đối tượng', [null, 5, 'x']],
  ])(
    'WHS-15 400 mà %s (lỗi lập trình): dải chung, bấm Lưu lại được, không đoán ô',
    (_name, loi) => {
      expect(describeSaveFailure(validation(loi))).toEqual({
        message: GENERIC_ERROR_MESSAGE,
        kind: 'retry',
        fields: {},
        refresh: false,
      });
    },
  );

  it('WHS-15 400 lẫn lỗi ô hiểu được và lỗi lạ ⇒ chỉ hiện lỗi ô hiểu được', () => {
    expect(
      describeSaveFailure(
        validation([
          { truong: 'bacSiId', ma: 'TRUONG_KHONG_DUOC_PHEP' },
          { truong: 'chanDoanSoBo', ma: 'BAT_BUOC' },
        ]),
      ),
    ).toMatchObject({ kind: 'field', fields: { chanDoanSoBo: 'BAT_BUOC' } });
  });

  it.each([
    [
      'WHS-05 409 HO_SO_KHAM_DA_THAY_DOI: sửa chồng, hiện dải và nút tải lại',
      api(409, 'HO_SO_KHAM_DA_THAY_DOI'),
      { message: SAVE_TEXT.conflict, kind: 'conflict', refresh: false },
    ],
    [
      'WHS-15 409 KHONG_THE_GHI_HO_SO_KHAM: lịch đã đổi trạng thái, tải lại chi tiết',
      api(409, 'KHONG_THE_GHI_HO_SO_KHAM', { trangThai: 'DaHuy' }),
      { message: SAVE_TEXT.notWritable, kind: 'final', refresh: true },
    ],
    [
      'WHS-15 404 KHONG_TIM_THAY',
      api(404, 'KHONG_TIM_THAY'),
      { message: SAVE_TEXT.notFound, kind: 'final', refresh: true },
    ],
    [
      'WHS-15 403 KHONG_DU_QUYEN',
      api(403, 'KHONG_DU_QUYEN'),
      { message: SAVE_TEXT.forbidden, kind: 'final', refresh: false },
    ],
    [
      'WHS-15 401 CHUA_DANG_NHAP',
      api(401, 'CHUA_DANG_NHAP'),
      { message: SAVE_TEXT.sessionExpired, kind: 'final', refresh: false },
    ],
    [
      'WHS-15 503 HE_THONG_DANG_BAN: bấm Lưu lại được',
      api(503, 'HE_THONG_DANG_BAN'),
      { message: SAVE_TEXT.busy, kind: 'retry', refresh: false },
    ],
    [
      'WHS-15 maLoi lạ (500): câu chung, bấm Lưu lại được',
      api(500, 'LOI_HE_THONG'),
      { message: GENERIC_ERROR_MESSAGE, kind: 'retry', refresh: false },
    ],
  ])('%s', (_name, error, expected) => {
    expect(describeSaveFailure(error)).toEqual({ ...expected, fields: {} });
  });

  it.each([
    ['mạng đứt', new NetworkError()],
    ['hết giờ', new TimeoutError()],
    [
      'phản hồi lạ (nginx 502 hay 200 sai hình)',
      new UnexpectedResponseError(502),
    ],
  ])(
    'WHS-09 %s ⇒ "chưa rõ đã lưu", KHÔNG tải lại tự động, nội dung giữ',
    (_name, error) => {
      expect(describeSaveFailure(error)).toEqual({
        message: SAVE_TEXT.unsure,
        kind: 'uncertain',
        fields: {},
        refresh: false,
      });
    },
  );

  it('WHS-15 maLoi trùng khoá nguyên mẫu ("constructor", "toString") không trúng bảng', () => {
    for (const maLoi of ['constructor', 'toString', '__proto__']) {
      expect(describeSaveFailure(api(409, maLoi))).toEqual({
        message: GENERIC_ERROR_MESSAGE,
        kind: 'retry',
        fields: {},
        refresh: false,
      });
    }
  });

  it('WHS-15 lỗi lập trình hay lỗi huỷ lọt vào: câu chung; không bao giờ in thông báo kỹ thuật', () => {
    expect(describeSaveFailure(new Error('chi tiết nội bộ'))).toEqual({
      message: GENERIC_ERROR_MESSAGE,
      kind: 'retry',
      fields: {},
      refresh: false,
    });
    expect(describeSaveFailure(new RequestAbortedError()).kind).toBe('retry');
    for (const error of [
      api(409, 'HO_SO_KHAM_DA_THAY_DOI'),
      api(404, 'KHONG_TIM_THAY'),
      validation([{ truong: 'trieuChung', ma: 'BAT_BUOC' }]),
    ])
      expect(describeSaveFailure(error).message ?? '').not.toContain(
        'KỸ THUẬT',
      );
  });

  it('WHS-15 chữ của hộp đúng danh sách Đại duyệt 16/11/2026', () => {
    expect(SAVE_TEXT).toMatchObject({
      titleNew: 'Ghi chú khám',
      titleEdit: 'Chỉnh sửa ghi chú khám',
      cancel: 'Hủy',
      save: 'Lưu ghi chú',
      saving: 'Đang lưu...',
      reload: 'Tải lại bản mới',
      saved: 'Đã lưu hồ sơ khám.',
      latest: 'Bản mới nhất',
      keepMine: 'Giữ bản của tôi',
      useLatest: 'Dùng bản mới nhất',
      conflict:
        'Hồ sơ khám vừa được cập nhật ở nơi khác. Hãy tải lại để xem bản mới nhất.',
      notWritable:
        'Chỉ ghi được hồ sơ khám khi bệnh nhân đã được tiếp đón hoặc ca khám đã hoàn thành.',
      notFound: 'Không tìm thấy ca khám này.',
      busy: 'Hệ thống đang bận, thử lại sau ít phút.',
      unsure:
        'Chưa rõ hồ sơ đã được lưu chưa (mất kết nối hoặc quá thời gian chờ). Nội dung của bạn vẫn còn ở đây.',
      unsaved: 'Hồ sơ chưa được lưu. Bấm Lưu ghi chú để thử lại.',
    });
  });
});
