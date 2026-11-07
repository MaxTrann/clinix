import {
  UNKNOWN_STATUS_LABEL,
  appointmentStatusLabel,
  formatVietnamDateTime,
  isIsoDateTime,
} from './appointment-labels';

// patient F7 (TRACKING F7-G, F7-H): nhãn trạng thái lịch hẹn và giờ Việt Nam của danh sách lịch hẹn đang chặn.
// Mã ca DW-nn là [đề xuất]; mỗi ca ghi mã NT của PLAN mục 7.2 mà nó phủ.

describe('nhãn trạng thái lịch hẹn', () => {
  it.each([
    ['ChoThanhToan', 'Chờ thanh toán'],
    ['DaXacNhan', 'Đã xác nhận'],
    ['DaTiepDon', 'Đã tiếp đón'],
  ])('DW-01 NT-23 %s ⇒ "%s"', (code, label) => {
    expect(appointmentStatusLabel(code)).toBe(label);
  });

  it.each([
    'HoanThanh',
    '',
    'dax acnhan',
    'constructor',
    'toString',
    '__proto__',
  ])(
    'DW-02 NT-23 mã lạ (%j) ⇒ "Chưa hoàn tất", không vỡ và không lấy từ nguyên mẫu của đối tượng',
    (code) => {
      expect(appointmentStatusLabel(code)).toBe(UNKNOWN_STATUS_LABEL);
      expect(UNKNOWN_STATUS_LABEL).toBe('Chưa hoàn tất');
    },
  );
});

describe('giờ Việt Nam (bẫy múi giờ)', () => {
  // Bốn mép: có giờ trong ngày, qua nửa đêm giờ Việt Nam, sát nửa đêm, qua năm. Mỗi mép chạy dưới nhiều TZ của máy
  // (kể cả +14: máy ở trước Việt Nam cả ngày) để bắt bản dùng `getHours`, `getDate` hay `toLocaleString` mặc định.
  const EDGES: [string, string][] = [
    ['2026-11-02T01:00:00.000Z', '02/11/2026 08:00'],
    ['2026-11-02T17:30:00.000Z', '03/11/2026 00:30'],
    ['2026-11-01T16:59:59.000Z', '01/11/2026 23:59'],
    ['2026-12-31T17:00:00.000Z', '01/01/2027 00:00'],
  ];
  const ZONES = [
    'Asia/Ho_Chi_Minh',
    'UTC',
    'America/New_York',
    'Pacific/Kiritimati',
  ];

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(
    ZONES.flatMap((zone) => EDGES.map(([iso, shown]) => [zone, iso, shown])),
  )('DW-03 NT-23 TZ=%s: %s ⇒ %s', async (zone, iso, shown) => {
    vi.stubEnv('TZ', zone);
    // Bộ định dạng được tạo ở MỨC MODULE, lúc nạp. Nạp lại module SAU khi đặt TZ để bản thiếu `timeZone` (dùng múi giờ máy) cũng bị
    // bắt kể cả khi máy chạy test đang ở Việt Nam (đột biến M10 của F7 từng sống sót vì import tĩnh nạp module dưới TZ của máy).
    vi.resetModules();
    const { formatVietnamDateTime: format } =
      await import('./appointment-labels');
    expect(format(iso)).toBe(shown);
  });

  it('DW-04 NT-23 nửa đêm hiện 00:xx, không phải 24:xx; giờ một chữ số có số 0 đứng đầu', () => {
    expect(formatVietnamDateTime('2026-11-02T17:00:00.000Z')).toBe(
      '03/11/2026 00:00',
    );
    expect(formatVietnamDateTime('2026-11-02T22:05:00.000Z')).toBe(
      '03/11/2026 05:05',
    );
  });

  it('DW-05 NT-23 chuỗi không phải ngày hợp lệ ⇒ Intl ném lỗi (nơi gọi đã chặn bằng isIsoDateTime)', () => {
    expect(() => formatVietnamDateTime('không phải ngày')).toThrow(RangeError);
  });
});

describe('isIsoDateTime', () => {
  it.each([
    '2026-11-02T01:00:00.000Z',
    '2026-11-02T01:00:00Z',
    '2026-11-02T08:00:00+07:00',
  ])('DW-06 NT-23 %s là thời điểm hợp lệ', (value) => {
    expect(isIsoDateTime(value)).toBe(true);
  });

  it.each([
    '',
    'không phải ngày',
    '2026-11-02',
    '02/11/2026 08:00',
    '2026-13-02T01:00:00Z',
    '2026-11-02T25:00:00Z',
  ])('DW-07 NT-23 %j không hợp lệ', (value) => {
    expect(isIsoDateTime(value)).toBe(false);
  });
});
