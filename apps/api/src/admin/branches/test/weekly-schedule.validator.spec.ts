import { validateWeeklySchedule } from '../weekly-schedule.validator.js';

const openDay = (thuTrongTuan: number) => ({
  thuTrongTuan,
  hoatDong: true,
  sang: { batDau: '08:00', ketThuc: '12:00' },
  chieu: { batDau: '13:00', ketThuc: '17:00' },
});
const validWeek = (): unknown[] =>
  Array.from({ length: 7 }, (_, i) => openDay(i + 1));

describe('validateWeeklySchedule — CN-03…10', () => {
  it('chấp nhận đủ thứ ISO, chỉ sáng/chiều/cả hai và giờ chạm nhau', () => {
    const week = validWeek();
    week[1] = { thuTrongTuan: 2, hoatDong: true, sang: openDay(1).sang };
    week[2] = { thuTrongTuan: 3, hoatDong: true, chieu: openDay(1).chieu };
    week[3] = {
      thuTrongTuan: 4,
      hoatDong: true,
      sang: { batDau: '08:00', ketThuc: '13:00' },
      chieu: { batDau: '13:00', ketThuc: '17:00' },
    };
    expect(validateWeeklySchedule(week)).toEqual([]);
  });

  it('CN-03: báo thứ thiếu, trùng và ngoài miền', () => {
    const week = validWeek();
    week[1] = openDay(1);
    week[6] = { ...openDay(8), thuTrongTuan: 8 };
    expect(validateWeeklySchedule(week)).toEqual(
      expect.arrayContaining([
        { thu: 1, maLoi: 'THU_BI_TRUNG' },
        { thu: 8, maLoi: 'THU_KHONG_HOP_LE' },
        { thu: 2, maLoi: 'THU_BI_THIEU' },
      ]),
    );
  });

  it('CN-04/06: từ chối ngày nghỉ có giờ và ngày hoạt động không có khoảng', () => {
    const week = validWeek();
    week[0] = { thuTrongTuan: 1, hoatDong: false, sang: openDay(1).sang };
    week[1] = { thuTrongTuan: 2, hoatDong: true };
    expect(validateWeeklySchedule(week)).toEqual(
      expect.arrayContaining([
        { thu: 1, maLoi: 'NGAY_NGHI_CO_GIO' },
        { thu: 2, maLoi: 'NGAY_HOAT_DONG_THIEU_KHOANG' },
      ]),
    );
  });

  it('CN-04/05: từ chối khoảng thiếu và thời điểm bắt đầu >= kết thúc', () => {
    const week = validWeek();
    week[0] = {
      thuTrongTuan: 1,
      hoatDong: true,
      sang: { batDau: '08:00' },
    };
    week[1] = {
      thuTrongTuan: 2,
      hoatDong: true,
      sang: { batDau: '12:00', ketThuc: '12:00' },
    };
    week[2] = {
      thuTrongTuan: 3,
      hoatDong: true,
      chieu: { batDau: '17:00', ketThuc: '13:00' },
    };
    expect(validateWeeklySchedule(week)).toEqual(
      expect.arrayContaining([
        { thu: 1, maLoi: 'KHOANG_GIO_CHUA_DAY_DU' },
        { thu: 2, maLoi: 'KHOANG_GIO_KHONG_TANG' },
        { thu: 3, maLoi: 'KHOANG_GIO_KHONG_TANG' },
      ]),
    );
  });

  it.each(['25:00', '7h', '24:00:00', '08:60'])(
    'CN-08: từ chối giờ %s',
    (time) => {
      const week = validWeek();
      week[0] = {
        thuTrongTuan: 1,
        hoatDong: true,
        sang: { batDau: time, ketThuc: '12:00' },
      };
      expect(validateWeeklySchedule(week)).toContainEqual({
        thu: 1,
        maLoi: 'GIO_KHONG_HOP_LE',
      });
    },
  );

  it('CN-07: chỉ từ chối khi hai khoảng chồng, không từ chối khi chạm', () => {
    const week = validWeek();
    week[0] = {
      thuTrongTuan: 1,
      hoatDong: true,
      sang: { batDau: '08:00', ketThuc: '13:01' },
      chieu: { batDau: '13:00', ketThuc: '17:00' },
    };
    expect(validateWeeklySchedule(week)).toContainEqual({
      thu: 1,
      maLoi: 'KHOANG_GIO_CHONG_NHAU',
    });
    week[0] = {
      thuTrongTuan: 1,
      hoatDong: true,
      sang: { batDau: '08:00', ketThuc: '13:00' },
      chieu: { batDau: '13:00', ketThuc: '17:00' },
    };
    expect(validateWeeklySchedule(week)).toEqual([]);
  });

  it('CN-09: giữ đủ lỗi cùng lúc ở nhiều thứ', () => {
    const week = validWeek();
    week[0] = {
      thuTrongTuan: 1,
      hoatDong: true,
      sang: { batDau: '25:00', ketThuc: '12:00' },
    };
    week[1] = { thuTrongTuan: 2, hoatDong: false, chieu: openDay(1).chieu };
    expect(validateWeeklySchedule(week)).toEqual(
      expect.arrayContaining([
        { thu: 1, maLoi: 'GIO_KHONG_HOP_LE' },
        { thu: 2, maLoi: 'NGAY_NGHI_CO_GIO' },
      ]),
    );
  });

  it('trả lỗi ổn định cho payload lịch không phải mảng và ngày không phải số', () => {
    expect(validateWeeklySchedule(null)).toEqual([
      { thu: null, maLoi: 'DANH_SACH_KHONG_HOP_LE' },
    ]);
    const week = validWeek();
    week[0] = { ...openDay(1), thuTrongTuan: '1' as unknown as number };
    expect(validateWeeklySchedule(week)).toContainEqual({
      thu: null,
      maLoi: 'THU_KHONG_HOP_LE',
    });
  });
});
