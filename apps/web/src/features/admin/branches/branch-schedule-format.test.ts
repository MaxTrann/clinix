import { dayLabel, scheduleLines } from './branch-schedule-format';
import type { BranchPeriod, BranchSchedule } from './branch-types';

// CN b1 (PR1 mục 8): giờ nhận khám của thẻ chi nhánh thành danh sách dòng, mỗi nhóm ngày LIỀN KỀ cùng giờ một dòng,
// ngày nghỉ ghi rõ "Nghỉ". Hàm thuần, không phụ thuộc giao diện.

const MORNING: BranchPeriod = { batDau: '08:00:00', ketThuc: '11:30:00' };
const AFTERNOON: BranchPeriod = { batDau: '13:30:00', ketThuc: '17:00:00' };
const BOTH = 'Sáng 08:00–11:30 · Chiều 13:30–17:00';

function day(
  thu: number,
  hoatDong: boolean | null,
  sang: BranchPeriod | null = null,
  chieu: BranchPeriod | null = null,
): BranchSchedule {
  return { thuTrongTuan: thu, hoatDong, sang, chieu };
}

function openDay(
  thu: number,
  sang = MORNING,
  chieu: BranchPeriod | null = AFTERNOON,
) {
  return day(thu, true, sang, chieu);
}

describe('scheduleLines (CN b1, PR1 mục 8)', () => {
  it('tuần chuẩn: Thứ 2–Thứ 6 hai buổi, Thứ 7 một buổi, CN nghỉ ghi rõ', () => {
    const week = [
      ...[1, 2, 3, 4, 5].map((thu) => openDay(thu)),
      openDay(6, MORNING, null),
      day(7, false),
    ];

    expect(scheduleLines(week)).toEqual([
      `Thứ 2–Thứ 6: ${BOTH}`,
      'Thứ 7: Sáng 08:00–11:30',
      'CN: Nghỉ',
    ]);
  });

  it('cả tuần cùng giờ gộp thành một dòng', () => {
    const week = [1, 2, 3, 4, 5, 6, 7].map((thu) => openDay(thu));

    expect(scheduleLines(week)).toEqual([`Thứ 2–CN: ${BOTH}`]);
  });

  it('một ngày giữa tuần nghỉ tách thành ba dòng, không gộp hai đoạn cách nhau dù cùng giờ', () => {
    const week = [
      openDay(1),
      openDay(2),
      day(3, false),
      openDay(4),
      openDay(5),
    ];

    expect(scheduleLines(week)).toEqual([
      `Thứ 2–Thứ 3: ${BOTH}`,
      'Thứ 4: Nghỉ',
      `Thứ 5–Thứ 6: ${BOTH}`,
    ]);
  });

  it('dữ liệu đảo thứ tự vẫn ra theo thứ tự các thứ trong tuần', () => {
    const week = [day(7, false), openDay(2), openDay(1)];

    expect(scheduleLines(week)).toEqual([`Thứ 2–Thứ 3: ${BOTH}`, 'CN: Nghỉ']);
  });

  it('chỉ có buổi chiều thì không in chữ Sáng', () => {
    expect(scheduleLines([day(1, true, null, AFTERNOON)])).toEqual([
      'Thứ 2: Chiều 13:30–17:00',
    ]);
  });

  it('giờ từ API có phần giây được cắt còn HH:mm', () => {
    expect(
      scheduleLines([
        day(1, true, { batDau: '07:05:59', ketThuc: '11:59:00' }),
      ]),
    ).toEqual(['Thứ 2: Sáng 07:05–11:59']);
  });

  it('không có lịch nào: một dòng "Chưa khai báo giờ nhận khám"', () => {
    expect(scheduleLines([])).toEqual(['Chưa khai báo giờ nhận khám']);
  });

  it('cả tuần nghỉ gộp một dòng "Thứ 2–CN: Nghỉ"', () => {
    const week = [1, 2, 3, 4, 5, 6, 7].map((thu) => day(thu, false));

    expect(scheduleLines(week)).toEqual(['Thứ 2–CN: Nghỉ']);
  });

  it('ngày hoạt động nhưng thiếu cả hai buổi: ghi chưa khai báo giờ cho ngày đó', () => {
    expect(scheduleLines([day(1, true)])).toEqual([
      'Thứ 2: Chưa khai báo giờ nhận khám',
    ]);
  });

  it('hoatDong null (chưa biết) không có dòng riêng và không nối hai đoạn hai bên', () => {
    const week = [openDay(1), day(2, null), openDay(3)];

    expect(scheduleLines(week)).toEqual([`Thứ 2: ${BOTH}`, `Thứ 4: ${BOTH}`]);
  });
});

describe('dayLabel', () => {
  it('Thứ 2 đến Thứ 7 và CN; số lạ giữ dạng "Thứ n"', () => {
    expect(dayLabel(1)).toBe('Thứ 2');
    expect(dayLabel(6)).toBe('Thứ 7');
    expect(dayLabel(7)).toBe('CN');
    expect(dayLabel(9)).toBe('Thứ 9');
  });
});
