import {
  applyQuickSchedule,
  canApplyQuick,
  describeDays,
  type QuickApplyInput,
} from './quick-apply';
import type { ScheduleDraft } from './schedule-draft';

// AF6-03 (admin PR2 mục 6.4): panel "Áp dụng nhanh". Hành vi đã được Đại duyệt (16/11/2026): ghi giờ vào buổi đã chọn của CÁC NGÀY
// ĐƯỢC TICK, tự bật ngày và buổi đó; không đụng buổi còn lại và ngày không tick.

function week(): ScheduleDraft[] {
  return Array.from({ length: 7 }, (_, index) => {
    const day = index + 1;
    return {
      day,
      open: day <= 6,
      morning: { enabled: day <= 6, start: '', end: '' },
      afternoon: { enabled: day <= 5, start: '', end: '' },
    };
  });
}

const morning: QuickApplyInput = {
  period: 'morning',
  start: '08:00',
  end: '11:30',
  days: [1, 2, 3, 4, 5],
};

describe('applyQuickSchedule', () => {
  it('AF6-03 ghi giờ buổi sáng cho đúng các ngày được tick', () => {
    const result = applyQuickSchedule(week(), morning);

    for (const day of [1, 2, 3, 4, 5]) {
      expect(result[day - 1]?.morning).toEqual({
        enabled: true,
        start: '08:00',
        end: '11:30',
      });
    }
  });

  it('AF6-03 ngày KHÔNG tick giữ nguyên hoàn toàn', () => {
    const before = week();
    const result = applyQuickSchedule(before, morning);

    expect(result[5]).toEqual(before[5]);
    expect(result[6]).toEqual(before[6]);
  });

  it('AF6-03 chọn Chiều thì chỉ ghi buổi chiều, buổi sáng của ngày đó giữ nguyên', () => {
    const before = week();
    const result = applyQuickSchedule(before, {
      period: 'afternoon',
      start: '13:30',
      end: '17:00',
      days: [2],
    });

    expect(result[1]?.afternoon).toEqual({
      enabled: true,
      start: '13:30',
      end: '17:00',
    });
    expect(result[1]?.morning).toEqual(before[1]?.morning);
  });

  it('AF6-03 ngày đang Nghỉ được tick thì tự bật "Hoạt động" và bật buổi đã chọn, không bật buổi kia', () => {
    const result = applyQuickSchedule(week(), { ...morning, days: [7] });

    expect(result[6]?.open).toBe(true);
    expect(result[6]?.morning).toEqual({
      enabled: true,
      start: '08:00',
      end: '11:30',
    });
    expect(result[6]?.afternoon).toEqual({
      enabled: false,
      start: '',
      end: '',
    });
  });

  it('AF6-03 buổi đang tắt (chiều Thứ 7) được bật khi áp dụng buổi chiều', () => {
    const result = applyQuickSchedule(week(), {
      period: 'afternoon',
      start: '13:30',
      end: '17:00',
      days: [6],
    });

    expect(result[5]?.afternoon.enabled).toBe(true);
    expect(result[5]?.morning.enabled).toBe(true);
  });

  it('AF6-03 áp dụng hai lần liên tiếp: lần sau thắng, cùng đầu vào thì kết quả như nhau', () => {
    const once = applyQuickSchedule(week(), morning);
    const twice = applyQuickSchedule(once, morning);
    const other = applyQuickSchedule(once, {
      ...morning,
      start: '07:30',
      end: '12:00',
    });

    expect(twice).toEqual(once);
    expect(other[0]?.morning).toEqual({
      enabled: true,
      start: '07:30',
      end: '12:00',
    });
  });

  it('AF6-03 không có ngày nào được tick thì không đổi gì', () => {
    const before = week();

    expect(applyQuickSchedule(before, { ...morning, days: [] })).toEqual(
      before,
    );
  });

  it('AF6-03 không sửa mảng đầu vào (trả bản mới)', () => {
    const before = week();
    const snapshot = JSON.stringify(before);

    applyQuickSchedule(before, morning);

    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('AF6-03 giờ ghi đúng nguyên văn, không tự sửa thành hợp lệ (kiểm lúc Lưu)', () => {
    const result = applyQuickSchedule(week(), {
      ...morning,
      days: [1],
      start: '13:00',
      end: '12:00',
    });

    expect(result[0]?.morning).toMatchObject({ start: '13:00', end: '12:00' });
  });
});

describe('canApplyQuick', () => {
  it('AF6-03 đủ điều kiện', () => {
    expect(canApplyQuick(morning)).toBe(true);
  });

  it.each([
    ['thiếu giờ bắt đầu', { start: '' }],
    ['thiếu giờ kết thúc', { end: '' }],
    ['giờ bắt đầu dở dang', { start: '8:00' }],
    ['giờ không hợp lệ 24:00', { end: '24:00' }],
    ['giờ không hợp lệ 12:60', { end: '12:60' }],
    ['bắt đầu sau kết thúc', { start: '12:00', end: '11:30' }],
    ['bắt đầu bằng kết thúc', { start: '08:00', end: '08:00' }],
    ['không có ngày nào', { days: [] }],
  ])('AF6-03 %s ⇒ không áp dụng được', (_name, patch) => {
    expect(canApplyQuick({ ...morning, ...patch })).toBe(false);
  });

  it('AF6-03 biên: kết thúc hơn bắt đầu đúng 1 phút vẫn hợp lệ', () => {
    expect(canApplyQuick({ ...morning, start: '08:00', end: '08:01' })).toBe(
      true,
    );
  });
});

describe('describeDays', () => {
  it.each([
    [[1, 2, 3, 4, 5], 'Thứ 2–Thứ 6'],
    [[1, 3, 7], 'Thứ 2, Thứ 4, CN'],
    [[7], 'CN'],
    [[1, 2, 3, 4, 5, 6, 7], 'Thứ 2–CN'],
    [[6, 7], 'Thứ 7–CN'],
    [[2, 3, 5], 'Thứ 3–Thứ 4, Thứ 6'],
    [[5, 1, 2], 'Thứ 2–Thứ 3, Thứ 6'],
    [[1, 1, 2], 'Thứ 2–Thứ 3'],
    [[], ''],
  ])('AF6-03 %j ⇒ %j', (days, expected) => {
    expect(describeDays(days)).toBe(expected);
  });
});
