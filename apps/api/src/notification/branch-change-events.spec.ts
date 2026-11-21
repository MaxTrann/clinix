import {
  BRANCH_CHANGE_EVENTS,
  BRANCH_CHANGE_MAIL_TYPES,
  CHANGE_NOTICE_TYPES,
  eventCodeOf,
  hasEmail,
} from './branch-change-events.js';

// Admin C4: mã sự kiện của yêu cầu thay đổi chi nhánh (PLAN admin 4.2a ý 5).
const E = BRANCH_CHANGE_EVENTS;

describe('NTB-01 (phần đơn vị) mã sự kiện có phiên bản', () => {
  it('loại không phiên bản giữ nguyên chữ; loại có phiên bản thêm `:v{n}`', () => {
    expect(eventCodeOf({ type: E.RESULT })).toBe('KetQuaYeuCauThayDoiChiNhanh');
    expect(eventCodeOf({ type: E.CANCELLED })).toBe('HuyThayDoiChiNhanh');
    expect(eventCodeOf({ type: E.WITHDRAWN })).toBe('RutThayDoiChiNhanh');
    expect(eventCodeOf({ type: E.AFFECTED, version: 1 })).toBe(
      'ThayDoiChiNhanhAnhHuongLichHen:v1',
    );
    expect(eventCodeOf({ type: E.RESCHEDULED, version: 12 })).toBe(
      'DoiHieuLucThayDoiChiNhanh:v12',
    );
    expect(eventCodeOf({ type: E.OVERDUE, version: 2 })).toBe(
      'YeuCauThayDoiChiNhanhQuaHan:v2',
    );
  });

  it.each([0, -1, 1.5, Number.NaN])(
    'biên: phiên bản %s bị từ chối (lỗi lập trình của người gọi)',
    (version) => {
      expect(() => eventCodeOf({ type: E.AFFECTED, version })).toThrow(
        /số nguyên từ 1/,
      );
    },
  );

  it('mọi mã vừa cột varchar(100) kể cả phiên bản lớn', () => {
    for (const type of [E.AFFECTED, E.RESCHEDULED, E.OVERDUE])
      expect(
        eventCodeOf({ type, version: Number.MAX_SAFE_INTEGER }).length,
      ).toBeLessThanOrEqual(100);
  });
});

describe('NTB-03 (phần đơn vị) loại nào có thư', () => {
  it('bốn loại có thư; quá hạn và rút chỉ trong ứng dụng', () => {
    expect([...BRANCH_CHANGE_MAIL_TYPES].sort()).toEqual(
      [E.RESULT, E.AFFECTED, E.CANCELLED, E.RESCHEDULED].sort(),
    );
    expect(hasEmail(E.OVERDUE)).toBe(false);
    expect(hasEmail(E.WITHDRAWN)).toBe(false);
    expect(hasEmail(E.RESULT)).toBe(true);
  });

  it('chỉ thư báo thay đổi của bệnh nhân bị dừng khi hủy hay dời; thư hủy và thư kết quả thì không', () => {
    expect([...CHANGE_NOTICE_TYPES].sort()).toEqual(
      [E.AFFECTED, E.RESCHEDULED].sort(),
    );
  });

  it('mã chỉ gồm chữ cái nên dùng an toàn trong mẫu LIKE (không có `%` hay `_`)', () => {
    for (const code of Object.values(E)) expect(code).toMatch(/^[A-Za-z]+$/);
  });
});
