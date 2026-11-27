import type { ScheduleRow } from '../../search/common/weekly-schedule.view.js';
import {
  formatDoctorName,
  formatFromPrice,
  formatMinutes,
  formatMoney,
  formatRefundTiers,
  formatTimes,
  formatWeeklyHours,
} from './entity-formatters.js';

// chatbot B2 — chữ máy chủ dựng cho chỗ giữ (DCR-01, ca cơ chế B2-nn). Hàm thuần.

const day = (
  thuTrongTuan: number,
  hoatDong: boolean,
  sang: [string, string] | null,
  chieu: [string, string] | null,
): ScheduleRow => ({
  thuTrongTuan,
  hoatDong,
  gioBatDauSang: sang?.[0] ?? null,
  gioKetThucSang: sang?.[1] ?? null,
  gioBatDauChieu: chieu?.[0] ?? null,
  gioKetThucChieu: chieu?.[1] ?? null,
});

describe('chatbot B2 — formatDoctorName (nhãn chức danh của web)', () => {
  it.each([
    ['BS', 'Nguyễn Minh Anh', 'BS. Nguyễn Minh Anh'],
    ['ThS_BS', 'Nguyễn Minh Anh', 'ThS.BS. Nguyễn Minh Anh'],
    ['TS_BS', 'Lê Hoa', 'TS.BS. Lê Hoa'],
    ['PGS_TS_BS', 'Phạm Gia', 'PGS.TS.BS. Phạm Gia'],
    ['GS_TS_BS', 'Võ An', 'GS.TS.BS. Võ An'],
    ['BS_CKI', 'Đỗ Lan', 'BS.CKI Đỗ Lan'],
    ['BS_CKII', 'Trần Quốc Huy', 'BS.CKII Trần Quốc Huy'],
    ['CHUC_DANH_MOI', 'Lý Mai', 'CHUC_DANH_MOI. Lý Mai'],
    ['constructor', 'Lý Mai', 'constructor. Lý Mai'],
  ])('B2-33: %s', (title, name, expected) => {
    expect(formatDoctorName(title, name)).toBe(expected);
  });
});

describe('chatbot B2 — formatMoney', () => {
  it.each([
    ['350000.00', '350.000 đồng'],
    ['0', '0 đồng'],
    ['0.00', '0 đồng'],
    ['999', '999 đồng'],
    ['1000', '1.000 đồng'],
    ['1234567.00', '1.234.567 đồng'],
    ['350000.5', '350.000,50 đồng'],
    ['350000.05', '350.000,05 đồng'],
    ['999999999999.99', '999.999.999.999,99 đồng'],
  ])('B2-34: "%s" thành "%s"', (amount, expected) => {
    expect(formatMoney(amount)).toBe(expected);
  });

  it('B2-34: chuỗi không phải số tiền thì ném lỗi (không đoán)', () => {
    expect(() => formatMoney('abc')).toThrow();
    expect(() => formatMoney('-5')).toThrow();
  });

  it('B2-35: giá "từ", phút và lần', () => {
    expect(formatFromPrice('200000.00')).toBe('từ 200.000 đồng');
    expect(formatMinutes(30)).toBe('30 phút');
    expect(formatTimes(2)).toBe('2 lần');
  });
});

describe('chatbot B2 — formatWeeklyHours', () => {
  it('B2-36: gộp các thứ liền nhau cùng giờ; thứ chưa khai báo là nghỉ', () => {
    const rows = [
      ...[1, 2, 3, 4, 5].map((d) =>
        day(d, true, ['07:30:00', '11:30:00'], ['13:30:00', '17:00:00']),
      ),
      day(6, true, ['07:30:00', '11:30:00'], null),
    ];
    expect(formatWeeklyHours(rows)).toBe(
      'Thứ Hai đến Thứ Sáu: 07:30 đến 11:30 và 13:30 đến 17:00; Thứ Bảy: 07:30 đến 11:30; Chủ Nhật: nghỉ',
    );
  });

  it('B2-37: không có dòng nào thì cả tuần nghỉ (một nhóm)', () => {
    expect(formatWeeklyHours([])).toBe('Thứ Hai đến Chủ Nhật: nghỉ');
  });

  it('B2-38: thứ không hoạt động hay không có khoảng giờ là nghỉ; thứ đơn lẻ không có "đến"', () => {
    const rows = [
      day(1, true, ['08:00:00', '12:00:00'], null),
      day(2, false, ['08:00:00', '12:00:00'], null),
      day(3, true, null, null),
      day(4, true, ['08:00:00', '12:00:00'], null),
    ];
    expect(formatWeeklyHours(rows)).toBe(
      'Thứ Hai: 08:00 đến 12:00; Thứ Ba đến Thứ Tư: nghỉ; Thứ Năm: 08:00 đến 12:00; Thứ Sáu đến Chủ Nhật: nghỉ',
    );
  });

  it('B2-39: cùng giờ nhưng cách nhau bởi một thứ khác giờ thì KHÔNG gộp', () => {
    const rows = [
      day(1, true, ['08:00:00', '12:00:00'], null),
      day(2, true, ['09:00:00', '12:00:00'], null),
      day(3, true, ['08:00:00', '12:00:00'], null),
    ];
    expect(formatWeeklyHours(rows)).toBe(
      'Thứ Hai: 08:00 đến 12:00; Thứ Ba: 09:00 đến 12:00; Thứ Tư: 08:00 đến 12:00; Thứ Năm đến Chủ Nhật: nghỉ',
    );
  });
});

describe('chatbot B2 — formatRefundTiers', () => {
  it('B2-40: cọc 0 (null) và có cọc chưa có mốc ([]) là hai câu khác nhau', () => {
    expect(formatRefundTiers(null)).toBe(
      'không áp dụng vì dịch vụ không đặt cọc',
    );
    expect(formatRefundTiers([])).toBe('không hoàn cọc');
  });

  it('B2-41: ba mốc 24, 2, 0 giờ', () => {
    expect(
      formatRefundTiers([
        { soGioTruocToiThieu: 2, tyLeHoan: 50 },
        { soGioTruocToiThieu: 24, tyLeHoan: 100 },
        { soGioTruocToiThieu: 0, tyLeHoan: 0 },
      ]),
    ).toBe(
      'hủy trước giờ hẹn ít nhất 24 giờ hoàn 100%; hủy từ 2 đến dưới 24 giờ trước giờ hẹn hoàn 50%; hủy trong vòng dưới 2 giờ trước giờ hẹn hoàn 0%; đã quá giờ hẹn thì không hoàn',
    );
  });

  it('B2-42: mốc thấp nhất lớn hơn 0 thì nêu thêm khoảng dưới mốc là không hoàn', () => {
    expect(formatRefundTiers([{ soGioTruocToiThieu: 24, tyLeHoan: 80 }])).toBe(
      'hủy trước giờ hẹn ít nhất 24 giờ hoàn 80%; hủy trong vòng dưới 24 giờ trước giờ hẹn không hoàn; đã quá giờ hẹn thì không hoàn',
    );
  });

  it('B2-43: một mốc duy nhất 0 giờ', () => {
    expect(formatRefundTiers([{ soGioTruocToiThieu: 0, tyLeHoan: 100 }])).toBe(
      'hủy trước giờ hẹn hoàn 100%; đã quá giờ hẹn thì không hoàn',
    );
  });

  it('B2-44: không đổi mảng đầu vào', () => {
    const tiers = [
      { soGioTruocToiThieu: 2, tyLeHoan: 50 },
      { soGioTruocToiThieu: 24, tyLeHoan: 100 },
    ];
    formatRefundTiers(tiers);
    expect(tiers.map((tier) => tier.soGioTruocToiThieu)).toEqual([2, 24]);
  });
});
