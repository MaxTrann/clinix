import { dayChipLabel, dayHeadingLabel, suggestWindow } from './suggest-dates';
import { slotDayMonthVn, timeLabelVn } from './suggest-format';

// Chatbot F2, F2-07 và F2-08 (WTL-12): "hôm nay" và giờ ô tính theo GIỜ VIỆT NAM, không phụ thuộc múi giờ của trình duyệt.
// Nếp của `features/search/slots/slot-dates.test.ts`: `vi.stubEnv('TZ', …)` đổi múi giờ của tiến trình (Node đọc lại ngay), và mỗi ca có một bước
// KIỂM ĐIỀU KIỆN TIÊN QUYẾT rằng đổi `TZ` có hiệu lực thật (ngày cục bộ của cùng mốc khác ngày Việt Nam) để biết ca không đúng vì tình cờ.

// 16:59:59Z ngày 27/11 là 23:59:59 ngày 27/11 ở Việt Nam; một giây sau đã là 00:00:00 ngày 28/11.
const BEFORE_MIDNIGHT = '2026-11-27T16:59:59.000Z';
const AFTER_MIDNIGHT = '2026-11-27T17:00:00.000Z';
// Qua năm: 17:30Z ngày 31/12/2026 là 00:30 ngày 01/01/2027 ở Việt Nam
const NEW_YEAR = '2026-12-31T17:30:00.000Z';

// Ngày CỤC BỘ (theo `getDate()`) của mỗi mốc ở từng múi giờ: bằng chứng `TZ` đã đổi
const ZONES: Array<{
  tz: string;
  localDay: Record<string, number>;
}> = [
  {
    tz: 'Asia/Ho_Chi_Minh',
    localDay: { [BEFORE_MIDNIGHT]: 27, [AFTER_MIDNIGHT]: 28, [NEW_YEAR]: 1 },
  },
  {
    tz: 'UTC',
    localDay: { [BEFORE_MIDNIGHT]: 27, [AFTER_MIDNIGHT]: 27, [NEW_YEAR]: 31 },
  },
  {
    tz: 'America/Los_Angeles',
    localDay: { [BEFORE_MIDNIGHT]: 27, [AFTER_MIDNIGHT]: 27, [NEW_YEAR]: 31 },
  },
  {
    tz: 'Pacific/Kiritimati',
    localDay: { [BEFORE_MIDNIGHT]: 28, [AFTER_MIDNIGHT]: 28, [NEW_YEAR]: 1 },
  },
  {
    tz: 'Pacific/Pago_Pago',
    localDay: { [BEFORE_MIDNIGHT]: 27, [AFTER_MIDNIGHT]: 27, [NEW_YEAR]: 31 },
  },
];

const WINDOW: Record<string, string[]> = {
  [BEFORE_MIDNIGHT]: [
    '2026-11-27',
    '2026-11-28',
    '2026-11-29',
    '2026-11-30',
    '2026-12-01',
    '2026-12-02',
    '2026-12-03',
  ],
  [AFTER_MIDNIGHT]: [
    '2026-11-28',
    '2026-11-29',
    '2026-11-30',
    '2026-12-01',
    '2026-12-02',
    '2026-12-03',
    '2026-12-04',
  ],
  [NEW_YEAR]: [
    '2027-01-01',
    '2027-01-02',
    '2027-01-03',
    '2027-01-04',
    '2027-01-05',
    '2027-01-06',
    '2027-01-07',
  ],
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('dải 7 ngày từ hôm nay theo giờ Việt Nam', () => {
  for (const { tz, localDay } of ZONES) {
    for (const instant of [BEFORE_MIDNIGHT, AFTER_MIDNIGHT, NEW_YEAR]) {
      it(`F2-07 TZ=${tz}, mốc ${instant}: bảy ngày liên tiếp bắt đầu từ ngày Việt Nam`, () => {
        vi.stubEnv('TZ', tz);
        // Điều kiện tiên quyết: đổi TZ có hiệu lực (ngày cục bộ đúng như bảng)
        expect(new Date(instant).getDate()).toBe(localDay[instant]);

        expect(suggestWindow(new Date(instant))).toEqual(WINDOW[instant]);
      });
    }
  }

  it('F2-07 không truyền mốc thì dùng đồng hồ hiện tại (đồng hồ giả), vẫn theo giờ Việt Nam', () => {
    vi.useFakeTimers();
    try {
      vi.stubEnv('TZ', 'America/Los_Angeles');
      vi.setSystemTime(new Date(AFTER_MIDNIGHT));
      expect(suggestWindow()).toEqual(WINDOW[AFTER_MIDNIGHT]);
      vi.setSystemTime(new Date(BEFORE_MIDNIGHT));
      expect(suggestWindow()).toEqual(WINDOW[BEFORE_MIDNIGHT]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('F2-07 cửa sổ là đúng bảy ngày: hôm nay đến hôm nay + 6 (khớp cửa sổ máy chủ chấp nhận)', () => {
    const days = suggestWindow(new Date(BEFORE_MIDNIGHT));
    expect(days).toHaveLength(7);
    expect(new Set(days).size).toBe(7);
  });
});

describe('nhãn ngày', () => {
  const today = '2026-11-27';

  it('F2-07 hôm nay, ngày mai, rồi thứ trong tuần kèm ngày/tháng', () => {
    expect(dayChipLabel('2026-11-27', today)).toBe('Hôm nay 27/11');
    expect(dayChipLabel('2026-11-28', today)).toBe('Ngày mai 28/11');
    expect(dayChipLabel('2026-11-29', today)).toBe('CN 29/11');
    expect(dayChipLabel('2026-11-30', today)).toBe('Thứ 2 30/11');
    expect(dayChipLabel('2026-12-03', today)).toBe('Thứ 5 03/12');
  });

  it('F2-07 "ngày mai" đúng cả khi qua tháng và qua năm', () => {
    expect(dayChipLabel('2026-12-01', '2026-11-30')).toBe('Ngày mai 01/12');
    expect(dayChipLabel('2027-01-01', '2026-12-31')).toBe('Ngày mai 01/01');
  });

  it('F2-07 nhãn tóm tắt "Thứ 7 28/11"', () => {
    expect(dayHeadingLabel('2026-11-28')).toBe('Thứ 7 28/11');
    expect(dayHeadingLabel('2026-11-29')).toBe('CN 29/11');
  });
});

describe('giờ và ngày của ô giờ theo giờ Việt Nam', () => {
  const SLOTS: Array<[string, string, string]> = [
    // [ISO UTC, giờ Việt Nam, ngày/tháng Việt Nam]
    ['2026-11-28T02:30:00.000Z', '09:30', '28/11'],
    [AFTER_MIDNIGHT, '00:00', '28/11'],
    ['2026-11-27T16:59:00.000Z', '23:59', '27/11'],
    ['2026-11-28T07:00:00.000Z', '14:00', '28/11'],
    [NEW_YEAR, '00:30', '01/01'],
  ];

  for (const { tz, localDay } of ZONES) {
    it(`F2-08 TZ=${tz}: giờ và ngày hiển thị luôn là của Việt Nam`, () => {
      vi.stubEnv('TZ', tz);
      // Điều kiện tiên quyết: đổi TZ có hiệu lực
      expect(new Date(AFTER_MIDNIGHT).getDate()).toBe(localDay[AFTER_MIDNIGHT]);

      for (const [iso, time, dayMonth] of SLOTS) {
        expect(timeLabelVn(iso)).toBe(time);
        expect(slotDayMonthVn(iso)).toBe(dayMonth);
      }
    });
  }
});
