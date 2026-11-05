import { GIOI_TINH, isGender } from './gender-policy.js';

// patient P1 (TRACKING patient P1-C, P1-F). Test case: HS-12 ở mức luật (quyết định Q3).
describe('isGender', () => {
  it('(HS-12) tập giá trị đúng ba mã Q3', () => {
    expect(GIOI_TINH).toEqual(['Nam', 'Nu', 'Khac']);
  });

  it.each(['Nam', 'Nu', 'Khac'])('(HS-12) hợp lệ: %s', (value) => {
    expect(isGender(value)).toBe(true);
  });

  it.each([
    'nam',
    'NAM',
    'nu',
    'Nữ',
    'khac',
    'Khác',
    ' Nam',
    'Nam ',
    'Male',
    'N',
    '',
    null,
    undefined,
    1,
    ['Nam'],
    { gioiTinh: 'Nam' },
  ])('(HS-12) không hợp lệ: %j', (value) => {
    expect(isGender(value)).toBe(false);
  });
});
