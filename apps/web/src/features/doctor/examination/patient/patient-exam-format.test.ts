import { describe, expect, it } from 'vitest';
import {
  currentYearVN,
  dayOfMonth,
  formatRatingDate,
  formatReturnDate,
  formatUpdatedLine,
  formatVisitDate,
  formatVisitTime,
  latestMonthWithCases,
  monthTitle,
  totalCases,
  weekdayShort,
  yearTabs,
} from './patient-exam-format';

// doctor-exam F5, WXH-12 [đề xuất]: hàm thuần giờ Việt Nam của trang Hồ sơ khám bệnh (Figma `414:2`, `443:2`, `415:2`). KHÔNG phụ thuộc múi giờ của máy: chạy lại file này dưới `TZ=UTC` và `TZ=America/New_York`
// (đột biến M15 "thứ theo giờ máy" chỉ đỏ khi múi giờ máy khác +07). Giá trị kỳ vọng viết NGUYÊN VĂN (không tính lại bằng chính hàm đang kiểm): 10/06/2026 là thứ Tư, 18/10/2026 là Chủ nhật, 10/07/2026 là thứ Sáu.
describe('doctor-exam F5 — giờ Việt Nam (+07:00) của ca khám', () => {
  it('WXH-12 09:00 ngày 10/06/2026: "Thứ 4", ngày "10", giờ "09:00", "Thứ 4, 10/06/2026" (Figma 443:2)', () => {
    const iso = '2026-06-10T02:00:00.000Z';
    expect(weekdayShort(iso)).toBe('Thứ 4');
    expect(dayOfMonth(iso)).toBe('10');
    expect(formatVisitTime(iso)).toBe('09:00');
    expect(formatVisitDate(iso)).toBe('Thứ 4, 10/06/2026');
  });

  it('WXH-12 Chủ nhật: "CN" ở cột ngày và "Chủ nhật, 18/10/2026" ở ngăn chi tiết (Figma 414:2, 415:2)', () => {
    const iso = '2026-10-18T02:30:00.000Z';
    expect(weekdayShort(iso)).toBe('CN');
    expect(formatVisitDate(iso)).toBe('Chủ nhật, 18/10/2026');
    expect(formatVisitTime(iso)).toBe('09:30');
  });

  it('WXH-12 biên nửa đêm: 17:00Z là 00:00 ngày kế ở Việt Nam, 16:59Z vẫn là ngày trước', () => {
    expect(weekdayShort('2026-10-17T17:00:00.000Z')).toBe('CN');
    expect(dayOfMonth('2026-10-17T17:00:00.000Z')).toBe('18');
    expect(formatVisitTime('2026-10-17T17:00:00.000Z')).toBe('00:00');
    expect(weekdayShort('2026-10-17T16:59:00.000Z')).toBe('Thứ 7');
    expect(dayOfMonth('2026-10-17T16:59:00.000Z')).toBe('17');
    expect(formatVisitTime('2026-10-17T16:59:00.000Z')).toBe('23:59');
  });

  it('WXH-12 ngày trong tháng KHÔNG đệm số 0 ("5", "1"), ngày ở "dd/MM/yyyy" thì đệm', () => {
    expect(dayOfMonth('2026-06-05T02:00:00.000Z')).toBe('5');
    expect(dayOfMonth('2026-06-01T02:00:00.000Z')).toBe('1');
    expect(formatVisitDate('2026-06-05T02:00:00.000Z')).toBe(
      'Thứ 6, 05/06/2026',
    );
  });

  it('WXH-12 qua năm: 17:00Z ngày 31/12/2026 là 01/01/2027 (thứ Sáu)', () => {
    expect(formatVisitDate('2026-12-31T17:00:00.000Z')).toBe(
      'Thứ 6, 01/01/2027',
    );
  });

  it('WXH-12 năm nhuận: 29/02/2028 (thứ Ba) có thật', () => {
    expect(formatVisitDate('2028-02-28T17:00:00.000Z')).toBe(
      'Thứ 3, 29/02/2028',
    );
  });

  it.each([
    '',
    'abc',
    '10/06/2026 17:30',
    '2026-06-10',
    '2026-13-45T10:00:00Z',
  ])(
    'WXH-12 chuỗi không phải ISO 8601 hợp lệ (%j) ⇒ null ở mọi hàm giờ, không in "NaN"',
    (bad) => {
      expect(weekdayShort(bad)).toBeNull();
      expect(dayOfMonth(bad)).toBeNull();
      expect(formatVisitTime(bad)).toBeNull();
      expect(formatVisitDate(bad)).toBeNull();
      expect(formatUpdatedLine(bad)).toBeNull();
    },
  );
});

describe('doctor-exam F5 — dòng "Cập nhật lần cuối" và ngày tái khám', () => {
  it('WXH-12 "17:30 10/6/26": giờ phút đệm 0, ngày và tháng KHÔNG đệm, năm hai chữ số (Figma 443:2)', () => {
    expect(formatUpdatedLine('2026-06-10T10:30:00.000Z')).toBe('17:30 10/6/26');
  });

  it('WXH-12 00:05 ngày 5/1/26 (17:05Z hôm trước) và qua năm 00:30 ngày 1/1/27', () => {
    expect(formatUpdatedLine('2026-01-04T17:05:00.000Z')).toBe('00:05 5/1/26');
    expect(formatUpdatedLine('2026-12-31T17:30:00.000Z')).toBe('00:30 1/1/27');
  });

  it('WXH-12 ngày tái khám "2026-07-10" ⇒ "Thứ 6, 10/07/2026" (Figma 443:2), tính theo ngày, không múi giờ', () => {
    expect(formatReturnDate('2026-07-10')).toBe('Thứ 6, 10/07/2026');
    expect(formatReturnDate('2028-02-29')).toBe('Thứ 3, 29/02/2028');
  });

  it.each([
    '',
    '2026-02-30',
    '2027-02-29',
    '2026-13-01',
    '2026-7-10',
    '10/07/2026',
    '2026-07-10T00:00:00Z',
  ])(
    'WXH-12 ngày tái khám sai dạng hay không có thật (%j) ⇒ null (khối bị bỏ)',
    (bad) => {
      expect(formatReturnDate(bad)).toBeNull();
    },
  );
});

describe('doctor-exam F5 — năm, tab năm, tháng mặc định', () => {
  it('WXH-12 năm hiện tại THEO GIỜ VIỆT NAM: 16:59:59Z ngày 31/12 vẫn là năm đó, 17:00Z đã sang năm sau', () => {
    expect(currentYearVN(new Date('2026-12-31T16:59:59.000Z'))).toBe(2026);
    expect(currentYearVN(new Date('2026-12-31T17:00:00.000Z'))).toBe(2027);
    expect(currentYearVN(new Date('2026-01-01T00:00:00.000Z'))).toBe(2026);
  });

  it('WXH-12 năm tab: năm hiện tại và 4 năm trước, mới nhất đứng đầu (Đại duyệt 16/11/2026)', () => {
    expect(yearTabs(2026)).toEqual([2026, 2025, 2024, 2023, 2022]);
  });

  it('WXH-12 tháng mặc định là tháng MỚI NHẤT có ca (Figma 414:2: Tháng 10; 443:2: Tháng 6)', () => {
    expect(latestMonthWithCases([0, 0, 0, 0, 1, 5, 0, 0, 0, 2, 0, 0])).toBe(10);
    expect(latestMonthWithCases([0, 0, 0, 0, 1, 5, 0, 0, 0, 0, 0, 0])).toBe(6);
  });

  it('WXH-12 biên: chỉ tháng 1, chỉ tháng 12, không tháng nào có ca ⇒ null', () => {
    expect(latestMonthWithCases([3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(1);
    expect(latestMonthWithCases([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 7])).toBe(12);
    expect(
      latestMonthWithCases([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ).toBeNull();
    expect(latestMonthWithCases([])).toBeNull();
  });

  it('WXH-12 tổng số ca của năm và tiêu đề thẻ tháng', () => {
    expect(totalCases([0, 0, 0, 0, 1, 5, 0, 0, 0, 2, 0, 0])).toBe(8);
    expect(totalCases([])).toBe(0);
    expect(monthTitle(2026, 10)).toBe('Tháng 10 2026');
  });
});

// doctor-exam F6, WDG-16 [đề xuất]: ngày gửi đánh giá "dd/MM/yyyy" theo giờ Việt Nam (Figma `424:2`: "10/06/2026"). +07:00 CỐ ĐỊNH, KHÔNG theo múi giờ của máy: chạy lại file này dưới `TZ=UTC` và `TZ=America/New_York`
// (đột biến M18 "ngày theo giờ máy" chỉ đỏ khi múi giờ máy khác +07).
describe('doctor-exam F6 — ngày gửi đánh giá theo giờ Việt Nam', () => {
  it('WDG-16 "10/06/2026" (Figma 424:2): ngày và tháng đều ĐỆM số 0 (khác dòng "Cập nhật lần cuối")', () => {
    expect(formatRatingDate('2026-06-10T03:00:00.000Z')).toBe('10/06/2026');
    expect(formatRatingDate('2026-06-01T03:00:00.000Z')).toBe('01/06/2026');
    expect(formatRatingDate('2026-01-05T03:00:00.000Z')).toBe('05/01/2026');
  });

  it('WDG-16 biên nửa đêm: 17:00Z là 00:00 ngày kế ở Việt Nam, 16:59Z vẫn là ngày trước', () => {
    expect(formatRatingDate('2026-06-10T16:59:59.000Z')).toBe('10/06/2026');
    expect(formatRatingDate('2026-06-10T17:00:00.000Z')).toBe('11/06/2026');
  });

  it('WDG-16 qua năm và năm nhuận: 17:00Z ngày 31/12/2026 là 01/01/2027; 17:00Z ngày 28/02/2028 là 29/02/2028', () => {
    expect(formatRatingDate('2026-12-31T17:00:00.000Z')).toBe('01/01/2027');
    expect(formatRatingDate('2028-02-28T17:00:00.000Z')).toBe('29/02/2028');
    expect(formatRatingDate('2027-02-28T17:00:00.000Z')).toBe('01/03/2027');
  });

  it('WDG-16 chuỗi không phải ISO 8601 ⇒ null (nơi gọi bỏ ngày, không in "NaN")', () => {
    for (const value of ['', 'hôm qua', '2026-06-10', '10/06/2026', 'NaN']) {
      expect(formatRatingDate(value)).toBeNull();
    }
  });
});
