import { BIRTH_DATE_MIN, isValidBirthDate } from './birth-date-policy.js';

// patient P1 (TRACKING patient P1-C, P1-F). Test case: HS-09 ở mức luật (quyết định Q7). Ca nửa đêm giờ VN nằm ở test decorator.
const TODAY = '2026-11-04';
// Hôm nay rất xa để chỉ thử luật ngày có thật (năm nhuận), không vướng cận "không sau hôm nay"
const FAR_TODAY = '2500-12-31';

describe('isValidBirthDate — hợp lệ', () => {
  it.each([
    ['cận dưới', '1900-01-01'],
    ['đúng hôm nay', TODAY],
    ['ngày thường', '1990-05-15'],
    ['ngày cuối tháng 31 ngày', '1990-01-31'],
    ['ngày cuối tháng 30 ngày', '1990-04-30'],
    ['ngày cuối tháng 12', '2025-12-31'],
    ['28/02 năm thường', '2026-02-28'],
    ['29/02 năm nhuận chia hết cho 400', '2000-02-29'],
    ['29/02 năm nhuận chia hết cho 4', '2024-02-29'],
  ])('(HS-09) %s: %s', (_label, value) => {
    expect(isValidBirthDate(value, TODAY)).toBe(true);
  });

  it('(HS-09) cận dưới là 1900-01-01', () => {
    expect(BIRTH_DATE_MIN).toBe('1900-01-01');
    expect(isValidBirthDate('1899-12-31', TODAY)).toBe(false);
  });
});

describe('isValidBirthDate — ngày có thật', () => {
  it.each([
    ['2000-02-29', true],
    ['2400-02-29', true],
    ['2028-02-29', true],
    ['1900-02-29', false],
    ['2100-02-29', false],
    ['2026-02-29', false],
    ['2026-02-30', false],
    ['2026-04-31', false],
    ['2026-06-31', false],
    ['2026-09-31', false],
    ['2026-11-31', false],
    ['2026-12-32', false],
    ['2026-13-01', false],
    ['2026-00-10', false],
    ['2026-01-00', false],
  ])('(HS-09) %s ⇒ %s', (value, expected) => {
    expect(isValidBirthDate(value, FAR_TODAY)).toBe(expected);
  });
});

describe('isValidBirthDate — không hợp lệ', () => {
  it.each([
    ['trước cận dưới', '1899-12-31'],
    ['ngày mai', '2026-11-05'],
    ['năm sau', '2027-01-01'],
    ['dd/mm/yyyy', '15/05/1990'],
    ['tháng và ngày một chữ số', '2026-1-5'],
    ['không có gạch nối', '19900515'],
    ['có giờ', '1990-05-15T00:00:00'],
    ['khoảng trắng đầu', ' 1990-05-15'],
    ['khoảng trắng cuối', '1990-05-15 '],
    ['xuống dòng cuối', '1990-05-15\n'],
    ['năm năm chữ số', '01990-05-15'],
    // So chuỗi với cận 1900 và today không chặn được chuỗi này ('1' < '2'): chỉ neo `^` của regex chặn
    ['năm năm chữ số, không có số 0 đầu', '19999-01-01'],
    ['có dấu cộng', '+1990-05-15'],
    ['chữ số toàn chiều rộng', '１９９０-０５-１５'],
    ['chữ số Ả Rập', '١٩٩٠-٠٥-١٥'],
    ['chuỗi rỗng', ''],
  ])('(HS-09) %s: %j', (_label, value) => {
    expect(isValidBirthDate(value, TODAY)).toBe(false);
  });

  it('(HS-09) cận trên đi theo tham số today', () => {
    expect(isValidBirthDate('2026-11-05', '2026-11-04')).toBe(false);
    expect(isValidBirthDate('2026-11-05', '2026-11-05')).toBe(true);
  });
});
