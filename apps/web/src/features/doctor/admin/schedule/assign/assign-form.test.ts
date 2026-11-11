import {
  ApiError,
  NetworkError,
  TimeoutError,
} from '../../../../../shared/api/errors';
import {
  ASSIGN_UNCERTAIN_MESSAGE,
  describeAssignError,
  describeRemoveError,
  describeViolation,
  describeViolationCode,
} from './assign-errors';
import {
  casOf,
  dateErrors,
  EMPTY_ASSIGN_FORM,
  isRuleComplete,
  prefillFromCell,
  toShiftRule,
  type AssignFormValues,
} from './assign-form';

// doctor F7: kiểm form và ánh xạ lỗi ở mức thuần (WA-02, WA-03, WA-05, WA-06). Hôm nay = 2026-10-14.
const TODAY = '2026-10-14';
const complete = (
  overrides: Partial<AssignFormValues> = {},
): AssignFormValues => ({
  ...EMPTY_ASSIGN_FORM,
  tuNgay: '2026-10-20',
  denNgay: '2026-10-26',
  thuTrongTuan: [3, 1],
  ca: 'CaSang',
  bacSiIds: ['11'],
  ...overrides,
});

describe('isRuleComplete (WA-02)', () => {
  it('form trống: chưa đủ; đủ mọi điều kiện: đủ', () => {
    expect(isRuleComplete(EMPTY_ASSIGN_FORM, TODAY)).toBe(false);
    expect(isRuleComplete(complete(), TODAY)).toBe(true);
  });

  it.each([
    ['thiếu từ ngày', { tuNgay: '' }],
    ['thiếu đến ngày', { denNgay: '' }],
    ['chưa chọn thứ', { thuTrongTuan: [] }],
    ['chưa chọn bác sĩ', { bacSiIds: [] }],
    ['ngày bắt đầu đã qua', { tuNgay: '2026-10-13' }],
    ['đảo ngày', { denNgay: '2026-10-19' }],
  ] as [string, Partial<AssignFormValues>][])(
    '%s ⇒ chưa đủ',
    (_name, patch) => {
      expect(isRuleComplete(complete(patch), TODAY)).toBe(false);
    },
  );

  it('biên: hôm nay hợp lệ; 21 bác sĩ vượt trần 20; khoảng 92 ngày được, 93 ngày không', () => {
    expect(
      isRuleComplete(complete({ tuNgay: TODAY, denNgay: TODAY }), TODAY),
    ).toBe(true);
    expect(
      isRuleComplete(
        complete({
          bacSiIds: Array.from({ length: 20 }, (_, i) => String(i + 1)),
        }),
        TODAY,
      ),
    ).toBe(true);
    expect(
      isRuleComplete(
        complete({
          bacSiIds: Array.from({ length: 21 }, (_, i) => String(i + 1)),
        }),
        TODAY,
      ),
    ).toBe(false);
    // 2026-10-20 + 91 ngày = 2027-01-19 (92 ngày tính cả hai đầu)
    expect(isRuleComplete(complete({ denNgay: '2027-01-19' }), TODAY)).toBe(
      true,
    );
    expect(isRuleComplete(complete({ denNgay: '2027-01-20' }), TODAY)).toBe(
      false,
    );
  });
});

describe('dateErrors', () => {
  it('ô còn trống chưa báo lỗi; quá khứ, đảo ngày, quá dài có câu riêng', () => {
    expect(dateErrors({ tuNgay: '', denNgay: '' }, TODAY)).toEqual({});
    expect(
      dateErrors({ tuNgay: '2026-10-13', denNgay: '' }, TODAY).tuNgay,
    ).toBe('Không thể phân công vào ngày đã qua.');
    expect(
      dateErrors({ tuNgay: '2026-10-20', denNgay: '2026-10-19' }, TODAY)
        .denNgay,
    ).toBe('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.');
    expect(
      dateErrors({ tuNgay: '2026-10-20', denNgay: '2027-01-20' }, TODAY)
        .denNgay,
    ).toBe('Khoảng ngày tối đa 92 ngày.');
  });
});

describe('toShiftRule, casOf, prefillFromCell', () => {
  it('WA-02 "Cả ngày" = Sáng + Chiều; thứ được sắp tăng dần; không có ghi chú (Q10)', () => {
    expect(casOf('CaNgay')).toEqual(['CaSang', 'CaChieu']);
    expect(casOf('CaChieu')).toEqual(['CaChieu']);
    const rule = toShiftRule(complete({ ca: 'CaNgay' }));
    expect(rule).toEqual({
      bacSiIds: ['11'],
      tuNgay: '2026-10-20',
      denNgay: '2026-10-26',
      thuTrongTuan: [1, 3],
      cas: ['CaSang', 'CaChieu'],
    });
    expect(Object.keys(rule)).not.toContain('ghiChu');
  });

  it('WA-05 điền sẵn từ ô: một ngày, đúng thứ ISO của ngày (CN = 7), đúng ca, một bác sĩ', () => {
    expect(
      prefillFromCell({ bacSiId: '12', ngay: '2026-10-18', ca: 'CaChieu' }),
    ).toEqual({
      tuNgay: '2026-10-18',
      denNgay: '2026-10-18',
      thuTrongTuan: [7],
      ca: 'CaChieu',
      bacSiIds: ['12'],
    });
    expect(
      prefillFromCell({ bacSiId: '1', ngay: '2026-10-12', ca: 'CaSang' })
        .thuTrongTuan,
    ).toEqual([1]);
  });
});

describe('describeViolationCode / describeViolation (WA-03)', () => {
  it('mỗi mã có câu theo PLAN 5.14, thứ và giờ nhận khám lấy từ chiTiet', () => {
    expect(describeViolationCode('NGAY_PHAN_CONG_DA_QUA')).toBe(
      'Không thể phân công vào ngày đã qua.',
    );
    expect(describeViolationCode('CA_DA_KET_THUC')).toBe(
      'Ca này đã kết thúc trong hôm nay.',
    );
    expect(describeViolationCode('CA_DA_PHAN_CONG')).toBe(
      'Bác sĩ đã có ca này trong ngày đó.',
    );
    expect(describeViolationCode('CHI_NHANH_NGHI', { thuTrongTuan: 7 })).toBe(
      'Chi nhánh nghỉ vào Chủ nhật.',
    );
    expect(describeViolationCode('CHI_NHANH_NGHI', { thuTrongTuan: 3 })).toBe(
      'Chi nhánh nghỉ vào Thứ 4.',
    );
    expect(describeViolationCode('CHI_NHANH_CHUA_KHAI_BAO')).toBe(
      'Chi nhánh chưa khai báo lịch hoạt động ngày này.',
    );
    expect(
      describeViolationCode('CA_KHONG_TON_TAI', {
        thuTrongTuan: 6,
        khoang: { sang: { tu: '08:00', den: '12:00' }, chieu: null },
      }),
    ).toBe(
      'Chi nhánh không nhận khám ca này vào Thứ 7 (giờ nhận khám: sáng 08:00–12:00).',
    );
    expect(describeViolationCode('CA_KHONG_DU_MOT_KHUNG_GIO')).toBe(
      'Ca này ngắn hơn một lượt khám nên không tạo được khung giờ.',
    );
    expect(describeViolationCode('MA_LA')).toBe('Không phân công được ca này.');
  });

  it('một dòng vi phạm: tên bác sĩ · thứ, ngày · ca: câu; không có tên thì "Bác sĩ #id"', () => {
    const violation = {
      bacSiId: '11',
      ngay: '2026-10-12',
      ca: 'CaSang' as const,
      maLoi: 'CA_DA_PHAN_CONG',
      chiTiet: { thuTrongTuan: 1 },
    };
    expect(describeViolation(violation, () => 'ThS.BS. Minh Anh')).toBe(
      'ThS.BS. Minh Anh · Thứ 2, 12/10/2026 · Ca sáng: Bác sĩ đã có ca này trong ngày đó.',
    );
    expect(describeViolation(violation, () => undefined)).toContain(
      'Bác sĩ #11',
    );
  });
});

describe('describeAssignError', () => {
  const api = (status: number, maLoi: string, chiTiet?: unknown) =>
    new ApiError(status, { maLoi, thongBao: 'thân thô của server', chiTiet });

  it('WA-03 409 kèm viPham[]: câu "chưa ca nào được ghi" + danh sách + tổng số thật', () => {
    const failure = describeAssignError(
      api(409, 'CA_DA_PHAN_CONG', {
        tongSoViPham: 120,
        viPham: [
          {
            bacSiId: '11',
            ngay: '2026-10-12',
            ca: 'CaSang',
            maLoi: 'CA_DA_PHAN_CONG',
          },
        ],
      }),
    );
    expect(failure.message).toContain('chưa ca nào được ghi');
    expect(failure.violations).toHaveLength(1);
    expect(failure.total).toBe(120);
    expect(JSON.stringify(failure)).not.toContain('thân thô');
  });

  it('mã khác: câu theo mã; mã lạ: câu chung; mạng/quá giờ: câu "chưa rõ đã ghi chưa"', () => {
    expect(describeAssignError(api(400, 'QUA_NHIEU_CA')).message).toContain(
      'Quá nhiều ca',
    );
    expect(
      describeAssignError(api(409, 'BAC_SI_KHONG_PHAN_CONG_DUOC')).message,
    ).toBe('Tài khoản bác sĩ đang ngừng hoạt động.');
    expect(describeAssignError(api(404, 'KHONG_TIM_THAY')).message).toContain(
      'ngoài phạm vi',
    );
    expect(describeAssignError(api(500, 'LOI_HE_THONG')).message).toBe(
      'Đã có lỗi xảy ra. Vui lòng thử lại sau.',
    );
    expect(describeAssignError(new NetworkError()).message).toBe(
      ASSIGN_UNCERTAIN_MESSAGE,
    );
    expect(describeAssignError(new TimeoutError()).message).toBe(
      ASSIGN_UNCERTAIN_MESSAGE,
    );
  });
});

describe('describeRemoveError (WA-06)', () => {
  const api = (status: number, maLoi: string) =>
    new ApiError(status, { maLoi, thongBao: 'x' });
  it('CA_DANG_CO_LICH_HEN, CA_DA_QUA có câu riêng; 404 báo "đã không còn" và gone', () => {
    expect(describeRemoveError(api(409, 'CA_DANG_CO_LICH_HEN')).message).toBe(
      'Ca đã có khung giờ được đặt hoặc từng có lịch hẹn nên không gỡ được.',
    );
    expect(describeRemoveError(api(409, 'CA_DA_QUA')).message).toBe(
      'Không thể gỡ ca đã qua.',
    );
    expect(describeRemoveError(api(404, 'KHONG_TIM_THAY'))).toEqual({
      message: 'Không tìm thấy ca (có thể đã được gỡ).',
      gone: true,
    });
    expect(describeRemoveError(new NetworkError()).gone).toBe(false);
  });
});
