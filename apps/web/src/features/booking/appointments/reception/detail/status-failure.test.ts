import { describe, expect, it } from 'vitest';
import {
  ApiError,
  NetworkError,
  RequestAbortedError,
  TimeoutError,
  UnexpectedResponseError,
} from '../../../../../shared/api/errors';
import { GENERIC_ERROR_MESSAGE } from '../../../../../shared/api/error-message';
import { ACTION_TEXT } from './detail-messages';
import { describeStatusFailure } from './status-failure';

// booking F9: câu lỗi của route ghi của Lễ tân, chọn theo `maLoi` (PLAN 5.14, TRACKING 3.30 F9-J). Mã LTE là [đề xuất] (PLAN booking mục 7.36); LTN-04 (`CON_PHAN_CHUA_THANH_TOAN`,
// `NGOAI_KHUNG_GIO_TIEP_DON`) = LTE-01, LTE-02 (cùng LTA-08 trong ngăn). Hàm thuần: không đồng hồ, không DOM.
const api = (status: number, maLoi: string, extra: object = {}) =>
  new ApiError(status, { maLoi, thongBao: 'Lỗi giả của test', ...extra });

describe('CON_PHAN_CHUA_THANH_TOAN (LTN-04)', () => {
  it('LTE-01 hiện số còn phải thu từ CHUỖI của máy chủ, định dạng nghìn; lớn hơn 2^53 giữ đủ chữ số', () => {
    const small = describeStatusFailure(
      api(409, 'CON_PHAN_CHUA_THANH_TOAN', {
        chiTiet: { conPhaiThu: '200000.00' },
      }),
      'DaTiepDon',
    );
    expect(small.message).toBe(
      'Lịch hẹn còn 200.000đ chưa thanh toán nên chưa thể tiếp đón.',
    );
    expect(small).toMatchObject({ kind: 'final', refresh: 'detail' });

    const big = describeStatusFailure(
      api(409, 'CON_PHAN_CHUA_THANH_TOAN', {
        chiTiet: { conPhaiThu: '9007199254740993.00' },
      }),
      'DaTiepDon',
    );
    expect(big.message).toBe(
      'Lịch hẹn còn 9.007.199.254.740.993đ chưa thanh toán nên chưa thể tiếp đón.',
    );
  });

  it('LTE-01 không hứa "thu tiền ở đây": nút `Thu tiền & tiếp đón` còn vô hiệu tới B17, nên câu không có vế "thu tiền tại quầy"', () => {
    const failure = describeStatusFailure(
      api(409, 'CON_PHAN_CHUA_THANH_TOAN', {
        chiTiet: { conPhaiThu: '1000.00' },
      }),
      'DaTiepDon',
    );
    expect(failure.message).not.toMatch(/thu tiền|quầy|Vui lòng/i);
  });

  it('LTE-01 `chiTiet` vắng, sai kiểu hay số tiền sai dạng ⇒ câu không số, không ném lỗi', () => {
    for (const chiTiet of [
      undefined,
      null,
      'x',
      [],
      {},
      { conPhaiThu: 200000 },
      { conPhaiThu: '-5' },
      { conPhaiThu: '1e6' },
      { conPhaiThu: '' },
    ]) {
      expect(
        describeStatusFailure(
          api(409, 'CON_PHAN_CHUA_THANH_TOAN', { chiTiet }),
          'DaTiepDon',
        ).message,
        JSON.stringify(chiTiet),
      ).toBe(ACTION_TEXT.unpaidUnknown);
    }
  });
});

describe('NGOAI_KHUNG_GIO_TIEP_DON (LTN-04)', () => {
  const outside = (tu: unknown, den: unknown) =>
    describeStatusFailure(
      api(409, 'NGOAI_KHUNG_GIO_TIEP_DON', { chiTiet: { tu, den } }),
      'DaTiepDon',
    );

  it('LTE-02 `tu` và `den` là ISO 8601 UTC ⇒ hiện GIỜ VIỆT NAM (07:30 chứ không phải 00:30), cùng ngày ghi ngày một lần', () => {
    const failure = outside(
      '2026-10-18T00:30:00.000Z',
      '2026-10-18T01:30:00.000Z',
    );
    expect(failure.message).toBe(
      'Chỉ tiếp đón từ 07:30 đến 08:30 ngày 18/10/2026.',
    );
    expect(failure.message).not.toContain('00:30');
    expect(failure).toMatchObject({ kind: 'final', refresh: 'detail' });
  });

  it('LTE-02 biên nửa đêm giờ Việt Nam: 16:59:59Z còn ngày 18/10, 17:00:00Z đã sang 19/10; khác ngày ghi ngày ở từng mốc', () => {
    expect(
      outside('2026-10-18T16:50:00.000Z', '2026-10-18T17:20:00.000Z').message,
    ).toBe('Chỉ tiếp đón từ 23:50 ngày 18/10/2026 đến 00:20 ngày 19/10/2026.');
    // Hai mốc cùng nằm TRƯỚC nửa đêm Việt Nam (16:59:59Z) ⇒ cùng ngày 18/10
    expect(
      outside('2026-10-18T16:00:00.000Z', '2026-10-18T16:59:59.000Z').message,
    ).toBe('Chỉ tiếp đón từ 23:00 đến 23:59 ngày 18/10/2026.');
    // Hai mốc cùng nằm SAU nửa đêm (17:00:00Z) ⇒ cùng ngày 19/10
    expect(
      outside('2026-10-18T17:00:00.000Z', '2026-10-18T17:30:00.000Z').message,
    ).toBe('Chỉ tiếp đón từ 00:00 đến 00:30 ngày 19/10/2026.');
  });

  it('LTE-02 hai biên là đóng: `tu` bằng `den` vẫn hiện đủ hai mốc, không ném lỗi', () => {
    expect(
      outside('2026-10-18T01:00:00.000Z', '2026-10-18T01:00:00.000Z').message,
    ).toBe('Chỉ tiếp đón từ 08:00 đến 08:00 ngày 18/10/2026.');
  });

  it('LTE-02 thiếu `tu` hay `den`, sai kiểu hay không phải ngày ⇒ câu không giờ', () => {
    for (const [tu, den] of [
      [undefined, '2026-10-18T01:30:00.000Z'],
      ['2026-10-18T00:30:00.000Z', undefined],
      ['hôm nay', '2026-10-18T01:30:00.000Z'],
      [123, 456],
      [null, null],
      ['', ''],
    ] as const) {
      expect(outside(tu, den).message, String([tu, den])).toBe(
        ACTION_TEXT.windowUnknown,
      );
    }
    expect(
      describeStatusFailure(api(409, 'NGOAI_KHUNG_GIO_TIEP_DON'), 'DaTiepDon')
        .message,
    ).toBe(ACTION_TEXT.windowUnknown);
  });
});

describe('các mã 409 khác', () => {
  it('LTE-03 `CHUA_QUA_GIO_HEN` (chữ PLAN 5.14), `HE_THONG_CHUA_CAU_HINH`, `CHI_BAC_SI_HOAN_THANH`: dừng hẳn, tải lại chi tiết', () => {
    expect(
      describeStatusFailure(api(409, 'CHUA_QUA_GIO_HEN'), 'VangMat'),
    ).toEqual({
      message: 'Chưa hết thời gian tiếp đón nên chưa thể đánh dấu vắng mặt.',
      kind: 'final',
      refresh: 'detail',
    });
    expect(
      describeStatusFailure(api(409, 'HE_THONG_CHUA_CAU_HINH'), 'DaTiepDon'),
    ).toEqual({
      message:
        'Hệ thống chưa được cấu hình nên chưa thể thực hiện thao tác này.',
      kind: 'final',
      refresh: 'detail',
    });
    expect(
      describeStatusFailure(api(409, 'CHI_BAC_SI_HOAN_THANH'), 'DaHuy'),
    ).toEqual({
      message:
        'Trạng thái Hoàn thành chỉ do Bác sĩ chuyển sau khi hoàn tất ca khám.',
      kind: 'final',
      refresh: 'detail',
    });
  });

  it('LTE-04 `LICH_HEN_KHONG_CHO_HUY` kèm trạng thái ⇒ câu có nhãn tiếng Việt; `DaHuy` ⇒ "đã được hủy"; vắng hay lạ ⇒ câu chung; tải lại cả danh sách', () => {
    const cancelFailure = (chiTiet?: unknown) =>
      describeStatusFailure(
        api(409, 'LICH_HEN_KHONG_CHO_HUY', { chiTiet }),
        'DaHuy',
      );
    expect(cancelFailure({ trangThai: 'DaTiepDon' })).toEqual({
      message: 'Lịch hẹn đang ở trạng thái Đã tiếp đón nên không thể hủy.',
      kind: 'final',
      refresh: 'detailAndList',
    });
    expect(cancelFailure({ trangThai: 'DaHuy' }).message).toBe(
      'Lịch hẹn này đã được hủy.',
    );
    for (const chiTiet of [
      undefined,
      {},
      { trangThai: 'LaMa' },
      'DaHuy',
      null,
    ]) {
      expect(cancelFailure(chiTiet).message).toBe(
        'Lịch hẹn này hiện không thể hủy.',
      );
    }
  });

  it('LTE-04 `CHUYEN_TRANG_THAI_KHONG_HOP_LE` kèm từ và đến ⇒ "Không thể chuyển … từ X sang Y"; từ = đến ⇒ câu riêng; trạng thái lạ (kể cả `DaDoiLich`) ⇒ câu chung', () => {
    const transition = (chiTiet?: unknown) =>
      describeStatusFailure(
        api(409, 'CHUYEN_TRANG_THAI_KHONG_HOP_LE', { chiTiet }),
        'VangMat',
      );
    expect(
      transition({ tuTrangThai: 'DaXacNhan', denTrangThai: 'VangMat' }),
    ).toEqual({
      message: 'Không thể chuyển lịch hẹn từ Đã xác nhận sang Vắng mặt.',
      kind: 'final',
      refresh: 'detailAndList',
    });
    expect(
      transition({ tuTrangThai: 'VangMat', denTrangThai: 'VangMat' }).message,
    ).toBe('Lịch hẹn đã ở trạng thái Vắng mặt.');
    for (const chiTiet of [
      undefined,
      {},
      { tuTrangThai: 'DaDoiLich', denTrangThai: 'VangMat' },
      { tuTrangThai: 'DaXacNhan', denTrangThai: 'LaMa' },
      { tuTrangThai: 5, denTrangThai: 6 },
    ]) {
      expect(transition(chiTiet).message, JSON.stringify(chiTiet)).toBe(
        ACTION_TEXT.transitionUnknown,
      );
    }
  });
});

describe('lỗi chung', () => {
  it('LTE-05 404 `KHONG_TIM_THAY` là MỘT câu, dừng hẳn, tải lại cả chi tiết lẫn danh sách; 401 và 403 có câu riêng, không tải lại, không `retry`', () => {
    expect(describeStatusFailure(api(404, 'KHONG_TIM_THAY'), 'DaHuy')).toEqual({
      message: 'Không tìm thấy lịch hẹn này.',
      kind: 'final',
      refresh: 'detailAndList',
    });
    expect(describeStatusFailure(api(401, 'CHUA_DANG_NHAP'), 'DaHuy')).toEqual({
      message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      kind: 'final',
      refresh: 'none',
    });
    expect(describeStatusFailure(api(403, 'KHONG_DU_QUYEN'), 'DaHuy')).toEqual({
      message: 'Bạn không có quyền thực hiện thao tác này.',
      kind: 'final',
      refresh: 'none',
    });
  });

  it('LTE-06 503 `HE_THONG_DANG_BAN` ⇒ câu bận của PLAN 5.14, bấm lại được (giao dịch hoàn tác trọn), không tải lại', () => {
    expect(
      describeStatusFailure(api(503, 'HE_THONG_DANG_BAN'), 'DaTiepDon'),
    ).toEqual({
      message:
        'Hệ thống đang xử lý nhiều yêu cầu cùng lúc. Vui lòng thử lại sau ít giây.',
      kind: 'retry',
      refresh: 'none',
    });
  });

  it('LTE-07 chọn câu theo `maLoi`, KHÔNG theo mã HTTP: cùng `maLoi` khác HTTP ⇒ cùng câu; `maLoi` lạ cùng 404, 409, 500, 403, 400 ⇒ câu chung `retry`', () => {
    for (const status of [400, 404, 409, 500, 502]) {
      expect(
        describeStatusFailure(api(status, 'CHUA_QUA_GIO_HEN'), 'VangMat')
          .message,
        `HTTP ${status}`,
      ).toBe(ACTION_TEXT.windowNotOver);
    }
    for (const status of [400, 401, 403, 404, 409, 500, 503]) {
      expect(
        describeStatusFailure(api(status, 'MA_LA_CHUA_BIET'), 'DaHuy'),
        `HTTP ${status}`,
      ).toEqual({
        message: GENERIC_ERROR_MESSAGE,
        kind: 'retry',
        refresh: 'none',
      });
    }
    // `maLoi` trùng tên khoá của nguyên mẫu không được trúng nhầm
    for (const maLoi of [
      'constructor',
      '__proto__',
      'toString',
      'hasOwnProperty',
    ]) {
      expect(
        describeStatusFailure(api(409, maLoi), 'DaHuy').message,
        maLoi,
      ).toBe(GENERIC_ERROR_MESSAGE);
    }
  });

  it('LTE-07 mạng đứt, quá giờ, 200 hay 502 sai hình dạng ⇒ "chưa rõ" theo từng thao tác, KHÔNG tự gửi lại; lỗi khác ⇒ câu chung `retry`', () => {
    for (const error of [
      new NetworkError(),
      new TimeoutError(),
      new UnexpectedResponseError(200),
      new UnexpectedResponseError(502),
    ]) {
      for (const target of ['DaHuy', 'VangMat', 'DaTiepDon'] as const) {
        expect(describeStatusFailure(error, target)).toEqual({
          message: ACTION_TEXT.unsure[target],
          kind: 'uncertain',
          refresh: 'none',
        });
      }
    }
    expect(ACTION_TEXT.unsure.DaHuy).toContain('hủy');
    expect(ACTION_TEXT.unsure.VangMat).toContain('vắng mặt');
    expect(ACTION_TEXT.unsure.DaTiepDon).toContain('tiếp đón');
    expect(describeStatusFailure(new RequestAbortedError(), 'DaHuy')).toEqual({
      message: GENERIC_ERROR_MESSAGE,
      kind: 'retry',
      refresh: 'none',
    });
    expect(describeStatusFailure('hỏng', 'DaHuy').kind).toBe('retry');
  });

  it('LTE-08 400 `DU_LIEU_KHONG_HOP_LE` kèm `LY_DO_BAT_BUOC` (máy chủ từ chối dù client cho qua) ⇒ câu lý do dưới ô, bấm lại được; 400 khác ⇒ câu chung', () => {
    expect(
      describeStatusFailure(
        api(400, 'DU_LIEU_KHONG_HOP_LE', {
          loi: [{ truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' }],
        }),
        'DaHuy',
      ),
    ).toEqual({
      message: 'Vui lòng nhập lý do (tối đa 255 ký tự).',
      kind: 'retry',
      refresh: 'none',
      field: 'reason',
    });
    for (const extra of [
      {},
      { loi: [] },
      { loi: [{ truong: 'trangThai', ma: 'IS_IN' }] },
    ]) {
      const failure = describeStatusFailure(
        api(400, 'DU_LIEU_KHONG_HOP_LE', extra),
        'DaHuy',
      );
      expect(failure.message).toBe(GENERIC_ERROR_MESSAGE);
      expect(failure.field).toBeUndefined();
    }
  });
});
