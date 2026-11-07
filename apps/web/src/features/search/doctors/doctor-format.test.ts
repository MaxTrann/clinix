import { doctorInitials, doctorTitleLabel } from '../format/doctor-title';
import { formatMoney, isNoDeposit } from '../format/money';
import {
  PRICE_NOT_NUMBER_MESSAGE,
  PRICE_RANGE_MESSAGE,
  validateDoctorFilters,
} from './doctor-filter-rules';

// search F5: luật thuần của bộ lọc và định dạng thẻ (hỗ trợ TBS-17, TBS-19).
describe('validateDoctorFilters', () => {
  it('TBS-17 biên: bằng nhau, rỗng, số 0 đều hợp lệ', () => {
    expect(validateDoctorFilters({ giaTu: '100', giaDen: '100' })).toEqual({});
    expect(validateDoctorFilters({ giaTu: '', giaDen: '' })).toEqual({});
    expect(validateDoctorFilters({ giaTu: '0', giaDen: '' })).toEqual({});
  });

  it('TBS-17 âm, số lẻ, chữ ⇒ lỗi từng ô', () => {
    expect(validateDoctorFilters({ giaTu: '-1', giaDen: '100.5' })).toEqual({
      giaTu: PRICE_NOT_NUMBER_MESSAGE,
      giaDen: PRICE_NOT_NUMBER_MESSAGE,
    });
    expect(validateDoctorFilters({ giaTu: 'abc', giaDen: '' }).giaTu).toBe(
      PRICE_NOT_NUMBER_MESSAGE,
    );
  });

  it('TBS-17 giá từ > giá đến ⇒ lỗi khoảng', () => {
    expect(validateDoctorFilters({ giaTu: '200', giaDen: '100' })).toEqual({
      giaTu: PRICE_RANGE_MESSAGE,
    });
  });
});

describe('định dạng thẻ bác sĩ', () => {
  it('TBS-19 chức danh, chữ viết tắt, tiền', () => {
    expect(doctorTitleLabel('BS_CKII')).toBe('BS.CKII');
    expect(doctorTitleLabel('PGS_TS_BS')).toBe('PGS.TS.BS');
    expect(doctorTitleLabel('MOI')).toBe('MOI');
    expect(doctorInitials('Nguyễn Minh Anh')).toBe('MA');
    expect(doctorInitials('An')).toBe('A');
    expect(formatMoney('350000.00')).toBe('350.000đ');
    expect(isNoDeposit('0.00')).toBe(true);
    expect(isNoDeposit('50000.00')).toBe(false);
  });
});
