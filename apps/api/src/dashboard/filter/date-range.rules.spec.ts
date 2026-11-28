import { todayVN } from '../../common/time/time.js';
import {
  dayCount,
  defaultRange,
  rangeError,
  toDateTimeBounds,
} from './date-range.rules.js';

// dashboard B1 — phần đơn vị của DBL-01, DBL-04 (PLAN dashboard 7.2): bộ lọc thời gian là hàm thuần nên chạy được ở mọi ngày và mọi múi giờ máy.

/** Chạy `work` với múi giờ tiến trình là `zone` rồi trả lại như cũ (Node đọc `TZ` mỗi lần tính giờ địa phương). */
function inZone<T>(zone: string, work: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return work();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

describe('dashboard B1 — bộ lọc thời gian (hàm thuần)', () => {
  it.each(['UTC', 'Asia/Ho_Chi_Minh'])(
    'DBL-01 (U, TZ=%s): không gửi ngày ⇒ 30 ngày kết thúc đúng "hôm nay" giờ Việt Nam, ở 00:00:00 và 23:59:59',
    (zone) => {
      inZone(zone, () => {
        // 00:00:00 ngày 04/12 giờ VN là 17:00:00Z ngày 03/12: máy chạy UTC vẫn phải ra ngày 04/12
        const midnight = new Date('2026-12-04T00:00:00+07:00');
        expect(defaultRange(todayVN(midnight))).toStrictEqual({
          tuNgay: '2026-11-05',
          denNgay: '2026-12-04',
        });
        const lastSecond = new Date('2026-12-04T23:59:59+07:00');
        expect(defaultRange(todayVN(lastSecond))).toStrictEqual({
          tuNgay: '2026-11-05',
          denNgay: '2026-12-04',
        });
        // Đối chứng: một giây trước nửa đêm là ngày hôm trước
        expect(
          defaultRange(todayVN(new Date('2026-12-03T23:59:59+07:00'))).denNgay,
        ).toBe('2026-12-03');
      });
    },
  );

  it('DBL-01 (U): khoảng mặc định đúng 30 ngày, gồm cả hôm nay; qua đầu năm vẫn đúng', () => {
    expect(dayCount(defaultRange('2026-12-04'))).toBe(30);
    expect(defaultRange('2027-01-10')).toStrictEqual({
      tuNgay: '2026-12-12',
      denNgay: '2027-01-10',
    });
  });

  it('DBL-04 (U): 366 ngày nhận; 367 ngày ⇒ KHOANG_NGAY_QUA_DAI; khoảng chứa 29/02/2028 đếm đúng', () => {
    // 01/03/2027 đến 29/02/2028 là đúng 366 ngày (năm 2028 nhuận)
    expect(dayCount({ tuNgay: '2027-03-01', denNgay: '2028-02-29' })).toBe(366);
    expect(rangeError('2027-03-01', '2028-02-29')).toBeNull();
    expect(rangeError('2027-02-28', '2028-02-29')).toBe('KHOANG_NGAY_QUA_DAI');
    // Năm không nhuận: 01/01 đến 31/12 là 365 ngày, cộng một ngày là 366 vẫn nhận
    expect(rangeError('2026-01-01', '2027-01-01')).toBeNull();
    expect(rangeError('2026-01-01', '2027-01-02')).toBe('KHOANG_NGAY_QUA_DAI');
  });

  it('DBL-03 (phần U): đến ngày trước từ ngày ⇒ KHOANG_NGAY_KHONG_HOP_LE; cùng một ngày là khoảng 1 ngày hợp lệ', () => {
    expect(rangeError('2026-12-07', '2026-12-06')).toBe(
      'KHOANG_NGAY_KHONG_HOP_LE',
    );
    expect(rangeError('2026-12-07', '2026-12-07')).toBeNull();
    expect(dayCount({ tuNgay: '2026-12-07', denNgay: '2026-12-07' })).toBe(1);
  });

  it('DHN-02 (phần U): mốc nửa mở của khoảng: 00:00:00 của ngày đầu tới 00:00:00 ngày KẾ của ngày cuối, qua cuối tháng và cuối năm', () => {
    expect(
      toDateTimeBounds({ tuNgay: '2026-12-01', denNgay: '2026-12-07' }),
    ).toStrictEqual({
      tu: '2026-12-01 00:00:00',
      denKe: '2026-12-08 00:00:00',
    });
    expect(
      toDateTimeBounds({ tuNgay: '2026-12-31', denNgay: '2026-12-31' }).denKe,
    ).toBe('2027-01-01 00:00:00');
    expect(
      toDateTimeBounds({ tuNgay: '2028-02-29', denNgay: '2028-02-29' }).denKe,
    ).toBe('2028-03-01 00:00:00');
  });

  it('ngày sai tới được hàm là lỗi lập trình (DTO đã chặn trước), không lặng lẽ ra số', () => {
    expect(() =>
      dayCount({ tuNgay: '2026-02-30', denNgay: '2026-03-01' }),
    ).toThrow('Ngày không hợp lệ');
  });
});
