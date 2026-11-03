import {
  validateWeeklySchedule,
  weeklyScheduleIssueMessage,
} from './branch-schedule-validation';
import type { BranchScheduleInput } from './branch-types';

function activeDay(
  day: number,
  morning?: { batDau: string; ketThuc: string },
  afternoon?: { batDau: string; ketThuc: string },
): BranchScheduleInput {
  return {
    thuTrongTuan: day,
    hoatDong: true,
    ...(morning ? { sang: morning } : {}),
    ...(afternoon ? { chieu: afternoon } : {}),
  };
}

function validWeek(): BranchScheduleInput[] {
  return Array.from({ length: 7 }, (_, index) => ({
    thuTrongTuan: index + 1,
    hoatDong: index < 6,
    ...(index < 6 ? { sang: { batDau: '08:00', ketThuc: '11:30' } } : {}),
  }));
}

describe('validateWeeklySchedule (CN-03–CN-10)', () => {
  it('CN-03 reports a missing, duplicate, and out-of-range day', () => {
    const schedule = validWeek().filter((row) => row.thuTrongTuan !== 3);
    schedule.push(activeDay(2, { batDau: '08:00', ketThuc: '11:30' }));
    schedule.push(activeDay(8, { batDau: '08:00', ketThuc: '11:30' }));

    expect(validateWeeklySchedule(schedule)).toEqual(
      expect.arrayContaining([
        { thu: 2, maLoi: 'THU_BI_TRUNG' },
        { thu: 3, maLoi: 'THU_BI_THIEU' },
        { thu: 8, maLoi: 'THU_KHONG_HOP_LE' },
      ]),
    );
  });

  it('CN-04 reports an active day without a period or with an incomplete period', () => {
    const schedule = validWeek();
    schedule[0] = activeDay(1);
    schedule[1] = activeDay(2, { batDau: '08:00', ketThuc: '' });

    expect(validateWeeklySchedule(schedule)).toEqual(
      expect.arrayContaining([
        { thu: 1, maLoi: 'NGAY_HOAT_DONG_THIEU_KHOANG' },
        { thu: 2, maLoi: 'GIO_KHONG_HOP_LE' },
      ]),
    );
  });

  it('CN-05 rejects equal, reverse, and malformed times on the affected day', () => {
    const schedule = validWeek();
    schedule[0] = activeDay(1, { batDau: '08:00', ketThuc: '08:00' });
    schedule[1] = activeDay(2, { batDau: '09:00', ketThuc: '08:00' });
    schedule[2] = activeDay(3, { batDau: '7h', ketThuc: '11:00' });

    expect(validateWeeklySchedule(schedule)).toEqual(
      expect.arrayContaining([
        { thu: 1, maLoi: 'KHOANG_GIO_KHONG_TANG' },
        { thu: 2, maLoi: 'KHOANG_GIO_KHONG_TANG' },
        { thu: 3, maLoi: 'GIO_KHONG_HOP_LE' },
      ]),
    );
  });

  it('CN-06 rejects hours on a day marked as closed', () => {
    const schedule = validWeek();
    schedule[6] = {
      thuTrongTuan: 7,
      hoatDong: false,
      sang: { batDau: '08:00', ketThuc: '11:30' },
    };

    expect(validateWeeklySchedule(schedule)).toContainEqual({
      thu: 7,
      maLoi: 'NGAY_NGHI_CO_GIO',
    });
  });

  it('CN-07 rejects overlapping shifts but accepts touching periods', () => {
    const schedule = validWeek();
    schedule[0] = activeDay(
      1,
      { batDau: '08:00', ketThuc: '13:00' },
      { batDau: '12:59', ketThuc: '17:00' },
    );
    schedule[1] = activeDay(
      2,
      { batDau: '08:00', ketThuc: '13:00' },
      { batDau: '13:00', ketThuc: '17:00' },
    );

    expect(validateWeeklySchedule(schedule)).toContainEqual({
      thu: 1,
      maLoi: 'KHOANG_GIO_CHONG_NHAU',
    });
    expect(validateWeeklySchedule(schedule)).not.toContainEqual({
      thu: 2,
      maLoi: 'KHOANG_GIO_CHONG_NHAU',
    });
  });

  it('CN-08 uses 24-hour HH:mm and rejects overnight times', () => {
    const schedule = validWeek();
    schedule[0] = activeDay(1, { batDau: '22:00', ketThuc: '02:00' });
    schedule[1] = activeDay(2, { batDau: '24:00', ketThuc: '25:00' });

    expect(validateWeeklySchedule(schedule)).toEqual(
      expect.arrayContaining([
        { thu: 1, maLoi: 'KHOANG_GIO_KHONG_TANG' },
        { thu: 2, maLoi: 'GIO_KHONG_HOP_LE' },
      ]),
    );
  });

  it('CN-09 retains errors from several weekdays and presents the day in Vietnamese', () => {
    const schedule = validWeek();
    schedule[0] = activeDay(1);
    schedule[3] = activeDay(4, { batDau: '09:30', ketThuc: '09:00' });

    const issues = validateWeeklySchedule(schedule);
    expect(issues).toEqual(
      expect.arrayContaining([
        { thu: 1, maLoi: 'NGAY_HOAT_DONG_THIEU_KHOANG' },
        { thu: 4, maLoi: 'KHOANG_GIO_KHONG_TANG' },
      ]),
    );
    expect(weeklyScheduleIssueMessage(issues[0]!.maLoi)).toContain('Chọn');
  });

  it('CN-10 accepts morning-only, afternoon-only, and both periods', () => {
    const schedule = validWeek();
    schedule[0] = activeDay(1, { batDau: '08:00', ketThuc: '11:30' });
    schedule[1] = activeDay(2, undefined, {
      batDau: '13:30',
      ketThuc: '17:00',
    });
    schedule[2] = activeDay(
      3,
      { batDau: '08:00', ketThuc: '11:30' },
      { batDau: '13:30', ketThuc: '17:00' },
    );

    expect(validateWeeklySchedule(schedule)).toEqual([]);
  });
});
