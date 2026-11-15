import {
  listPeriod,
  monthPeriod,
  monthPeriods,
  resolveYear,
  yearPeriod,
} from './patient-exam-records.rules.js';

// doctor-exam B4 — hàm THUẦN của danh sách hồ sơ khám (PLAN 5.6; XHS-04, XHS-05; X1 M11). Không DB. Cận là CHUỖI giờ VN, nửa mở, không phụ thuộc múi giờ tiến trình.
describe('XHS-04 resolveYear: năm mặc định theo GIỜ VIỆT NAM, không theo UTC', () => {
  it('có `nam` thì dùng nguyên, không đọc đồng hồ', () => {
    expect(resolveYear(2027, new Date('2026-11-10T09:00:00+07:00'))).toBe(2027);
  });

  it('vắng `nam`: năm hiện tại giờ VN', () => {
    expect(resolveYear(undefined, new Date('2026-11-10T09:00:00+07:00'))).toBe(
      2026,
    );
  });

  it('biên năm: 17:30 UTC ngày 31/12 đã là 00:30 ngày 01/01 giờ VN ⇒ năm sau; 16:59:59 UTC vẫn là năm cũ', () => {
    expect(resolveYear(undefined, new Date('2026-12-31T17:30:00Z'))).toBe(2027);
    expect(resolveYear(undefined, new Date('2026-12-31T16:59:59Z'))).toBe(2026);
    expect(resolveYear(undefined, new Date('2026-12-31T17:00:00Z'))).toBe(2027);
  });

  it('M11: kết quả giống nhau khi múi giờ tiến trình là Asia/Ho_Chi_Minh và UTC', () => {
    const before = process.env.TZ;
    try {
      const at = new Date('2026-12-31T17:30:00Z');
      const results = ['Asia/Ho_Chi_Minh', 'UTC'].map((zone) => {
        process.env.TZ = zone;
        return [resolveYear(undefined, at), monthPeriod(2026, 11)];
      });
      expect(results[1]).toEqual(results[0]);
      expect(results[0]?.[0]).toBe(2027);
    } finally {
      if (before === undefined) delete process.env.TZ;
      else process.env.TZ = before;
    }
  });
});

describe('XHS-04 khoảng thời gian (chuỗi giờ VN, nửa mở)', () => {
  it('cả năm: từ 00:00:00 ngày 01/01 đến 00:00:00 ngày 01/01 năm sau', () => {
    expect(yearPeriod(2026)).toEqual({
      from: '2026-01-01 00:00:00',
      to: '2027-01-01 00:00:00',
    });
  });

  it('một tháng thường và tháng 12 (đóng bằng 01/01 năm sau)', () => {
    expect(monthPeriod(2026, 11)).toEqual({
      from: '2026-11-01 00:00:00',
      to: '2026-12-01 00:00:00',
    });
    expect(monthPeriod(2026, 12)).toEqual({
      from: '2026-12-01 00:00:00',
      to: '2027-01-01 00:00:00',
    });
    expect(monthPeriod(2026, 1).from).toBe('2026-01-01 00:00:00');
  });

  it('năm nhuận: tháng 2 năm 2028 đóng ở 01/03 (chứa 29/02); năm 2027 cũng đóng ở 01/03 (không có 29/02)', () => {
    expect(monthPeriod(2028, 2)).toEqual({
      from: '2028-02-01 00:00:00',
      to: '2028-03-01 00:00:00',
    });
    expect(monthPeriod(2027, 2).to).toBe('2027-03-01 00:00:00');
  });

  it('mười hai khoảng liền nhau: đúng 12, khoảng sau bắt đầu đúng nơi khoảng trước kết thúc, ghép lại bằng đúng cả năm', () => {
    const periods = monthPeriods(2026);
    expect(periods).toHaveLength(12);
    periods.slice(1).forEach((period, index) => {
      expect(period.from).toBe(periods[index]?.to);
    });
    expect(periods[0]?.from).toBe(yearPeriod(2026).from);
    expect(periods[11]?.to).toBe(yearPeriod(2026).to);
  });

  it('năm ít hơn bốn chữ số vẫn đủ bốn chữ số (đệm 0)', () => {
    expect(yearPeriod(999).from).toBe('0999-01-01 00:00:00');
  });

  it('listPeriod: vắng `thang` ⇒ cả năm; có `thang` ⇒ đúng tháng đó', () => {
    expect(listPeriod(2026, undefined)).toEqual(yearPeriod(2026));
    expect(listPeriod(2026, 2)).toEqual(monthPeriod(2026, 2));
  });
});
