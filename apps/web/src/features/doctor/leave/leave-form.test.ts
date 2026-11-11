import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../shared/api/errors';
import {
  describeLeaveSubmitError,
  SEND_UNCERTAIN_MESSAGE,
} from './leave-errors';
import {
  EMPTY_LEAVE_FORM,
  reasonLength,
  toCreateInput,
  validateLeaveForm,
  type LeaveFormValues,
} from './leave-form';
import { formatVnDateTime } from './leave-format';

// doctor F4: kiểm form và ánh xạ lỗi ở mức thuần (WN-01…WN-03, WN-06, WN-10; YN-23 phía người dùng). Hôm nay = 2026-10-14.
const TODAY = '2026-10-14';
const valid = (overrides: Partial<LeaveFormValues> = {}): LeaveFormValues => ({
  ...EMPTY_LEAVE_FORM,
  tuNgay: '2026-10-20',
  denNgay: '2026-10-21',
  lyDo: 'Việc gia đình',
  ...overrides,
});

describe('validateLeaveForm', () => {
  it('WN-01 form hợp lệ: không có lỗi; hôm nay được phép (không phải ngày quá khứ)', () => {
    expect(validateLeaveForm(valid(), TODAY)).toEqual({});
    expect(
      validateLeaveForm(valid({ tuNgay: TODAY, denNgay: TODAY }), TODAY),
    ).toEqual({});
  });

  it('WN-03 ngày quá khứ, thiếu ngày, đảo ngày', () => {
    expect(
      validateLeaveForm(valid({ tuNgay: '2026-10-13' }), TODAY).tuNgay,
    ).toBe('Không thể xin nghỉ cho ngày đã qua.');
    expect(validateLeaveForm(valid({ tuNgay: '' }), TODAY).tuNgay).toBe(
      'Vui lòng chọn ngày.',
    );
    expect(validateLeaveForm(valid({ denNgay: '' }), TODAY).denNgay).toBe(
      'Vui lòng chọn ngày.',
    );
    expect(
      validateLeaveForm(valid({ denNgay: '2026-10-19' }), TODAY).denNgay,
    ).toBe('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.');
  });

  it('WN-02 "Theo ca" cần ca và không kiểm "Đến ngày"; "Cả ngày" không đòi ca', () => {
    expect(
      validateLeaveForm(valid({ hinhThuc: 'TheoCa', denNgay: '' }), TODAY),
    ).toEqual({ ca: 'Vui lòng chọn ca.' });
    expect(
      validateLeaveForm(
        valid({ hinhThuc: 'TheoCa', denNgay: '', ca: 'CaChieu' }),
        TODAY,
      ),
    ).toEqual({});
    expect(validateLeaveForm(valid(), TODAY).ca).toBeUndefined();
  });

  it('WN-03 lý do: 2–500 ký tự sau khi cắt hai đầu; biên 1, 2, 500, 501', () => {
    const reason = (text: string) =>
      validateLeaveForm(valid({ lyDo: text }), TODAY).lyDo;
    expect(reason('')).toBeDefined();
    expect(reason('   ')).toBeDefined();
    expect(reason(' a ')).toBeDefined();
    expect(reason('ab')).toBeUndefined();
    expect(reason('a'.repeat(500))).toBeUndefined();
    expect(reason('a'.repeat(501))).toBeDefined();
  });

  it('YN-23 đếm điểm mã sau NFC (khớp server): chữ dựng sẵn và chữ tổ hợp cùng độ dài; emoji tính một', () => {
    const composed = 'Việc';
    const decomposed = composed.normalize('NFD');
    expect(reasonLength(decomposed)).toBe(reasonLength(composed));
    expect(reasonLength('😀😀')).toBe(2);
  });
});

describe('toCreateInput', () => {
  it('WN-01 "Cả ngày": không có khoá ca; lý do cắt hai đầu', () => {
    expect(toCreateInput(valid({ lyDo: '  Đi khám  ' }))).toEqual({
      hinhThuc: 'CaNgay',
      tuNgay: '2026-10-20',
      denNgay: '2026-10-21',
      lyDo: 'Đi khám',
    });
  });

  it('WN-02 "Theo ca": denNgay = tuNgay và có ca', () => {
    expect(
      toCreateInput(valid({ hinhThuc: 'TheoCa', denNgay: '', ca: 'CaSang' })),
    ).toEqual({
      hinhThuc: 'TheoCa',
      tuNgay: '2026-10-20',
      denNgay: '2026-10-20',
      ca: 'CaSang',
      lyDo: 'Việc gia đình',
    });
  });
});

describe('describeLeaveSubmitError', () => {
  const api = (status: number, maLoi: string, extra: object = {}) =>
    new ApiError(status, { maLoi, thongBao: 'thân thô của server', ...extra });

  it('WN-03 `loi[]` ánh xạ đúng ô, không dùng thongBao của server', () => {
    const result = describeLeaveSubmitError(
      api(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [
          { truong: 'ca', ma: 'CA_BAT_BUOC' },
          { truong: 'denNgay', ma: 'NGHI_THEO_CA_CHI_MOT_NGAY' },
        ],
      }),
    );
    expect(result.fields).toEqual({
      ca: 'Vui lòng chọn ca.',
      denNgay: 'Nghỉ theo ca chỉ chọn một ngày.',
    });
    expect(result.message).toBeNull();
    expect(JSON.stringify(result)).not.toContain('thân thô');
  });

  it('WN-03 `loi[]` có trường/mã lạ: vẫn hiện ô biết được và thêm câu chung', () => {
    const result = describeLeaveSubmitError(
      api(400, 'DU_LIEU_KHONG_HOP_LE', {
        loi: [
          { truong: 'lyDo', ma: 'LY_DO_BAT_BUOC' },
          { truong: 'bacSiId', ma: 'TRUONG_KHONG_DUOC_PHEP' },
        ],
      }),
    );
    expect(result.fields.lyDo).toBeDefined();
    expect(result.message).toBe('Đã có lỗi xảy ra. Vui lòng thử lại sau.');
  });

  it('WN-06 mã nghiệp vụ 409 ⇒ câu theo mã; mã lạ ⇒ câu chung', () => {
    expect(
      describeLeaveSubmitError(api(409, 'YEU_CAU_NGHI_TRUNG')).message,
    ).toBe('Bạn đã có yêu cầu nghỉ trùng thời gian này.');
    expect(describeLeaveSubmitError(api(409, 'MA_MOI_CHUA_BIET')).message).toBe(
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    );
  });

  it('WN-10 mất mạng/quá giờ: câu "chưa rõ đã gửi chưa", không có lỗi theo ô', () => {
    expect(describeLeaveSubmitError(new NetworkError())).toEqual({
      fields: {},
      message: SEND_UNCERTAIN_MESSAGE,
    });
    expect(describeLeaveSubmitError(new TimeoutError())).toEqual({
      fields: {},
      message: SEND_UNCERTAIN_MESSAGE,
    });
  });
});

describe('formatVnDateTime', () => {
  it('WN-08 đổi UTC sang giờ VN, qua nửa đêm đổi cả ngày', () => {
    expect(formatVnDateTime('2026-10-17T17:06:06Z')).toBe(
      '00:06:06 18/10/2026',
    );
    expect(formatVnDateTime('2026-12-31T20:00:00Z')).toBe(
      '03:00:00 01/01/2027',
    );
  });
});
