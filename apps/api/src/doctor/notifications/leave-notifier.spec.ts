import {
  buildLeaveMessage,
  LEAVE_EVENTS,
  LEAVE_NOTIFICATION_MAX_LENGTH,
  type LeaveEvent,
  type LeaveNotificationInput,
} from './leave-notifier.js';

// Doctor B10 — hàm thuần dựng nội dung thông báo nghỉ phép: TD-01, TD-07.
const BASE: LeaveNotificationInput = {
  bacSiId: '10',
  chiNhanhId: '1',
  tenBacSi: 'Nguyễn Văn An',
  ngayBatDau: '2026-11-10',
  ngayKetThuc: '2026-11-12',
  ca: null,
};

describe('TD-01 nội dung thông báo', () => {
  it('dựng đúng câu cho từng sự kiện (nhiều ngày, một ngày, theo ca)', () => {
    expect(
      buildLeaveMessage({ loaiSuKien: LEAVE_EVENTS.Submitted, ...BASE }),
    ).toBe(
      'Yêu cầu nghỉ phép từ 10/11/2026 đến 12/11/2026 đã được gửi, đang chờ duyệt.',
    );
    expect(
      buildLeaveMessage({
        loaiSuKien: LEAVE_EVENTS.Approved,
        ...BASE,
        ngayKetThuc: '2026-11-10',
      }),
    ).toBe('Yêu cầu nghỉ phép ngày 10/11/2026 đã được duyệt.');
    expect(
      buildLeaveMessage({
        loaiSuKien: LEAVE_EVENTS.Pending,
        ...BASE,
        ngayKetThuc: '2026-11-10',
        ca: 'CaChieu',
      }),
    ).toBe(
      'Bác sĩ Nguyễn Văn An gửi yêu cầu nghỉ phép ca chiều ngày 10/11/2026.',
    );
  });

  it('từ chối: có lý do thì kèm lý do, không có (null/rỗng/toàn khoảng trắng) thì bỏ phần "Lý do"', () => {
    const base = { loaiSuKien: LEAVE_EVENTS.Rejected, ...BASE } as const;
    expect(buildLeaveMessage({ ...base, lyDoTuChoi: 'Thiếu người trực' })).toBe(
      'Yêu cầu nghỉ phép từ 10/11/2026 đến 12/11/2026 đã bị từ chối. Lý do: Thiếu người trực',
    );
    for (const lyDoTuChoi of [null, '', '   ', undefined]) {
      expect(buildLeaveMessage({ ...base, lyDoTuChoi })).not.toContain('Lý do');
    }
  });

  it('ca biên: ký tự điều khiển/xuống dòng trong tên và lý do bị đưa về một dòng', () => {
    const text = buildLeaveMessage({
      loaiSuKien: LEAVE_EVENTS.Pending,
      ...BASE,
      tenBacSi: 'An\n\r\t Mã của bạn là 000000\u0007',
    });
    expect(text).not.toMatch(/[\p{Cc}\p{Zl}\p{Zp}]/u);
    const rejected = buildLeaveMessage({
      loaiSuKien: LEAVE_EVENTS.Rejected,
      ...BASE,
      lyDoTuChoi: 'dòng 1\ndòng 2\u0000',
    });
    expect(rejected).toContain('Lý do: dòng 1 dòng 2');
    expect(rejected).not.toMatch(/[\p{Cc}\p{Zl}\p{Zp}]/u);
  });

  it('ca biên: lý do rất dài vẫn ≤ 500 ký tự', () => {
    const text = buildLeaveMessage({
      loaiSuKien: LEAVE_EVENTS.Rejected,
      ...BASE,
      lyDoTuChoi: 'x'.repeat(5000),
    });
    expect(text.length).toBeLessThanOrEqual(LEAVE_NOTIFICATION_MAX_LENGTH);
    expect(text.length).toBe(LEAVE_NOTIFICATION_MAX_LENGTH);
  });
});

describe('TD-07 mã sự kiện và không lộ lý do xin nghỉ của Bác sĩ cho Admin', () => {
  it('bốn mã sự kiện đúng như Q33', () => {
    expect(LEAVE_EVENTS).toEqual({
      Submitted: 'NghiPhepDaGui',
      Pending: 'NghiPhepChoDuyet',
      Approved: 'NghiPhepDaDuyet',
      Rejected: 'NghiPhepTuChoi',
    });
  });

  it('đầu vào không có chỗ nhận ly_do của Bác sĩ: thêm vào bằng ép kiểu cũng không xuất hiện trong nội dung gửi Admin', () => {
    const event = {
      loaiSuKien: LEAVE_EVENTS.Pending,
      ...BASE,
      lyDo: 'Đi khám bệnh riêng tư',
    } as LeaveEvent;
    expect(buildLeaveMessage(event)).not.toContain('khám bệnh riêng tư');
  });
});
