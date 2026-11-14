import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatVietnamDate,
  formatVietnamShortDate,
  formatVietnamTime,
  formatVietnamWeekdayDate,
  formatVnd,
  isDecimalAmount,
  isIsoDateTime,
  isPositiveAmount,
} from './appointment-format';

// booking F1. LHL-12 (giờ Việt Nam, H1) và LHL-13 (tiền là chuỗi decimal, H4); mã LHL là [đề xuất] (PLAN booking mục 7.31 sau khi duyệt).
// Ngày mẫu lấy từ Figma `411:2`: 20/10/2026 là Thứ 3, 18/10/2026 là Chủ nhật.
describe('booking F1 — giờ Việt Nam', () => {
  // `vi.stubEnv('TZ', …)` gán `process.env.TZ`: Node đọc lại múi giờ ngay, nên `Date` cục bộ đổi theo
  afterEach(() => vi.unstubAllEnvs());

  it('LHL-12 17:30 UTC là 00:30 NGÀY HÔM SAU ở Việt Nam: đổi cả thứ, ngày và giờ', () => {
    const iso = '2026-10-19T17:30:00.000Z';
    expect(formatVietnamWeekdayDate(iso)).toBe('Thứ 3, 20/10/2026');
    expect(formatVietnamTime(iso)).toBe('00:30');
  });

  it('LHL-12 ví dụ của Figma: 14:00 ngày 18/10/2026 giờ Việt Nam là Chủ nhật', () => {
    const iso = '2026-10-18T07:00:00.000Z';
    expect(formatVietnamWeekdayDate(iso)).toBe('Chủ nhật, 18/10/2026');
    expect(formatVietnamTime(iso)).toBe('14:00');
  });

  // Ca biên nửa đêm: giây cuối của ngày 19/10 và giây đầu của ngày 20/10 (giờ Việt Nam); `h23` cho 00:00, không phải 24:00
  it('LHL-12 biên nửa đêm giờ Việt Nam: 16:59:59.999Z còn ngày 19/10, 17:00:00.000Z sang 20/10 lúc 00:00', () => {
    expect(formatVietnamWeekdayDate('2026-10-19T16:59:59.999Z')).toBe(
      'Thứ 2, 19/10/2026',
    );
    expect(formatVietnamTime('2026-10-19T16:59:59.999Z')).toBe('23:59');
    expect(formatVietnamWeekdayDate('2026-10-19T17:00:00.000Z')).toBe(
      'Thứ 3, 20/10/2026',
    );
    expect(formatVietnamTime('2026-10-19T17:00:00.000Z')).toBe('00:00');
  });

  it('LHL-12 đủ bảy thứ trong tuần, Chủ nhật ghi "Chủ nhật" (không viết tắt)', () => {
    const labels = [19, 20, 21, 22, 23, 24, 25].map(
      (day) =>
        formatVietnamWeekdayDate(`2026-10-${day}T03:00:00.000Z`).split(',')[0],
    );
    expect(labels).toEqual([
      'Thứ 2',
      'Thứ 3',
      'Thứ 4',
      'Thứ 5',
      'Thứ 6',
      'Thứ 7',
      'Chủ nhật',
    ]);
  });

  it('LHL-12 ngày và tháng một chữ số có số 0 đứng trước; năm đổi ở Giao thừa theo giờ Việt Nam', () => {
    expect(formatVietnamWeekdayDate('2026-06-04T01:30:00.000Z')).toBe(
      'Thứ 5, 04/06/2026',
    );
    // 31/12/2026 17:00 UTC là 00:00 ngày 01/01/2027 ở Việt Nam (Thứ 6)
    expect(formatVietnamWeekdayDate('2026-12-31T17:00:00.000Z')).toBe(
      'Thứ 6, 01/01/2027',
    );
  });

  // Bộ định dạng `Intl` được tạo MỘT lần lúc nạp module và lấy múi giờ máy lúc đó nếu không khai `timeZone`: đổi `TZ` rồi gọi hàm cũ không thử được
  // gì (đột biến "bỏ timeZone" sống sót, đã đo 12/11/2026). Nên mỗi múi giờ nạp LẠI module (`vi.resetModules`) rồi mới định dạng.
  it('LHL-12 không phụ thuộc múi giờ của máy: cùng kết quả khi TZ là UTC, Los Angeles hay Việt Nam', async () => {
    const iso = '2026-10-19T17:30:00.000Z';
    // Giờ cục bộ của cùng mốc ở từng múi giờ: điều kiện tiên quyết để biết đổi TZ lúc chạy có hiệu lực thật
    const localHour = {
      UTC: 17,
      'America/Los_Angeles': 10,
      'Asia/Ho_Chi_Minh': 0,
    };
    const results = new Set<string>();
    for (const [timeZone, hour] of Object.entries(localHour)) {
      vi.stubEnv('TZ', timeZone);
      expect(new Date(iso).getHours()).toBe(hour);
      vi.resetModules();
      const fresh = await import('./appointment-format');
      results.add(
        `${fresh.formatVietnamWeekdayDate(iso)} ${fresh.formatVietnamTime(iso)}`,
      );
    }
    expect([...results]).toEqual(['Thứ 3, 20/10/2026 00:30']);
  });

  it('LHL-12 isIsoDateTime nhận dạng `toISOString()` và từ chối chuỗi không dùng được', () => {
    expect(isIsoDateTime('2026-10-20T01:00:00.000Z')).toBe(true);
    expect(isIsoDateTime('2026-10-20T01:00:00Z')).toBe(true);
    for (const value of [
      '',
      'abc',
      '2026-10-20',
      '20/10/2026 08:00',
      '2026-13-45T00:00:00Z',
      '2026-10-20T',
      '2026-10-20T25:00:00Z',
    ]) {
      expect(isIsoDateTime(value)).toBe(false);
    }
  });

  it('LHL-12 chuỗi không phải ngày: hai hàm format ném RangeError (nơi gọi phải kiểm bằng isIsoDateTime trước)', () => {
    expect(() => formatVietnamTime('không phải ngày')).toThrow(RangeError);
    expect(() => formatVietnamWeekdayDate('')).toThrow(RangeError);
  });
});

describe('booking F1 — tiền là chuỗi decimal', () => {
  it('LHL-13 "300000.00" ⇒ "300.000đ" (ví dụ Figma), cả khi không có phần thập phân', () => {
    expect(formatVnd('300000.00')).toBe('300.000đ');
    expect(formatVnd('250000.00')).toBe('250.000đ');
    expect(formatVnd('300000')).toBe('300.000đ');
  });

  it('LHL-13 biên: "0.00", ba chữ số, bốn chữ số, bảy chữ số', () => {
    expect(formatVnd('0.00')).toBe('0đ');
    expect(formatVnd('999.00')).toBe('999đ');
    expect(formatVnd('1000.00')).toBe('1.000đ');
    expect(formatVnd('1234567.00')).toBe('1.234.567đ');
  });

  // H4: chỉ BỎ phần thập phân để hiển thị, không làm tròn và không đi qua số thực (`Number('0.10')` hay làm tròn lên sẽ ra giá trị khác)
  it('LHL-13 phần thập phân chỉ bị bỏ, không làm tròn: "150000.99" ⇒ "150.000đ", "0.10" ⇒ "0đ"', () => {
    expect(formatVnd('150000.99')).toBe('150.000đ');
    expect(formatVnd('0.10')).toBe('0đ');
    expect(formatVnd('149999.999')).toBe('149.999đ');
  });

  it('LHL-13 số lớn hơn 2^53 giữ nguyên từng chữ số (không qua Number)', () => {
    expect(formatVnd('9007199254740993.00')).toBe('9.007.199.254.740.993đ');
    expect(formatVnd('999999999999999999.00')).toBe('999.999.999.999.999.999đ');
  });

  it('LHL-13 số 0 đứng đầu bị bỏ, giữ lại một số 0 nếu cả phần nguyên là 0', () => {
    expect(formatVnd('0300000.00')).toBe('300.000đ');
    expect(formatVnd('000.50')).toBe('0đ');
  });

  // Ca âm: chuỗi không phải decimal của API thì ném lỗi (bộ đọc phản hồi đã chặn trước khi tới đây)
  it('LHL-13 chuỗi sai dạng ném RangeError và isDecimalAmount từ chối', () => {
    for (const value of [
      '',
      'abc',
      '-5000.00',
      '1,500.00',
      '1.500.000',
      '1e6',
      ' 100',
      '100 ',
      '.5',
      '5.',
      '١٢٣',
    ]) {
      expect(isDecimalAmount(value)).toBe(false);
      expect(() => formatVnd(value)).toThrow(RangeError);
    }
    expect(isDecimalAmount('300000.00')).toBe(true);
    expect(isDecimalAmount('0')).toBe(true);
  });
});

// booking F8 (Lễ tân): ngày ngắn "18/10" của cột "Ngày & Giờ" (Figma `479:2`) và "còn phải thu" kiểm trên chuỗi. Mã LTL, LTC là [đề xuất] (PLAN booking mục 7.34).
describe('booking F8 — ngày ngắn và số tiền dương', () => {
  it('LTL-17 formatVietnamShortDate theo NGÀY giờ Việt Nam: 17:00 UTC đã là ngày hôm sau, qua tháng và qua năm, không năm', () => {
    expect(formatVietnamShortDate('2026-10-18T01:00:00.000Z')).toBe('18/10');
    expect(formatVietnamShortDate('2026-10-19T16:59:59.999Z')).toBe('19/10');
    expect(formatVietnamShortDate('2026-10-19T17:00:00.000Z')).toBe('20/10');
    expect(formatVietnamShortDate('2026-10-31T17:00:00.000Z')).toBe('01/11');
    expect(formatVietnamShortDate('2026-12-31T17:00:00.000Z')).toBe('01/01');
  });

  it('LTC-03 isPositiveAmount chỉ nhìn chữ số của CHUỖI: "0", "0.00" là hết; "0.10", "200000.00" là còn; sai dạng không bao giờ là dương', () => {
    for (const value of ['0', '0.0', '0.00', '000.00']) {
      expect(isPositiveAmount(value)).toBe(false);
    }
    for (const value of [
      '0.01',
      '0.10',
      '1',
      '200000.00',
      '9007199254740993.00',
    ]) {
      expect(isPositiveAmount(value)).toBe(true);
    }
    // Ca âm: sai dạng thì không coi là còn nợ dù có chữ số khác 0
    for (const value of ['', 'abc', '-5000.00', '1e6', ' 5', '5 ', '1,5']) {
      expect(isPositiveAmount(value)).toBe(false);
    }
  });
});

// booking F9 (Lễ tân): ngày đầy đủ cho câu `NGOAI_KHUNG_GIO_TIEP_DON`. Mã LTA là [đề xuất] (PLAN booking mục 7.36).
describe('booking F9 — ngày đầy đủ giờ Việt Nam', () => {
  it('LTA-18 formatVietnamDate theo NGÀY giờ Việt Nam: 17:00 UTC đã là ngày hôm sau, qua tháng, qua năm, năm nhuận', () => {
    expect(formatVietnamDate('2026-10-18T01:00:00.000Z')).toBe('18/10/2026');
    expect(formatVietnamDate('2026-10-19T16:59:59.999Z')).toBe('19/10/2026');
    expect(formatVietnamDate('2026-10-19T17:00:00.000Z')).toBe('20/10/2026');
    expect(formatVietnamDate('2026-12-31T17:00:00.000Z')).toBe('01/01/2027');
    expect(formatVietnamDate('2028-02-28T17:00:00.000Z')).toBe('29/02/2028');
  });
});
