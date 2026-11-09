import type { BranchDayHours } from '../../scheduling/branch-hours/branch-hours.types.js';
import { isoWeekdayOf } from '../../scheduling/branch-hours/time-of-day.js';
import {
  formatCalendarDate,
  isCalendarDate,
  isoWeekdayOfEpochDay,
  parseCalendarDate,
} from '../../scheduling/calendar-date.js';
import {
  collectViolations,
  expandRule,
  shiftKey,
  type DoctorShiftInfo,
  type ShiftRow,
  type ShiftRuleInput,
} from './shift-assignment.rules.js';

// Doctor B2 — hàm thuần: PC-03, PC-04, PC-07, PC-08, PC-09, PC-10, PC-12, PC-14, PC-15 (phần thuần), PC-20, PC-21 (phần thuần).
const gio = (h: number, m = 0) => h * 3600 + m * 60;
const OPEN: BranchDayHours = {
  hoatDong: true,
  sang: { tuGiay: gio(8), denGiay: gio(12) },
  chieu: { tuGiay: gio(13), denGiay: gio(17) },
};
// 2026-12-01 (Thứ Ba) 10:00 giờ VN.
const NOW = new Date('2026-12-01T03:00:00Z');
const DOCTOR: DoctorShiftInfo = { chiNhanhId: '1', thoiLuongPhut: 30 };

const rule = (over: Partial<ShiftRuleInput> = {}): ShiftRuleInput => ({
  bacSiIds: ['1'],
  tuNgay: '2026-12-07',
  denNgay: '2026-12-07',
  thuTrongTuan: [1],
  cas: ['CaSang'],
  ...over,
});
const row = (over: Partial<ShiftRow> = {}): ShiftRow => ({
  bacSiId: '1',
  ngay: '2026-12-07',
  ca: 'CaSang',
  ...over,
});
const collect = (
  rows: ShiftRow[],
  hoursOf: (chiNhanhId: string, thu: number) => BranchDayHours | null = () =>
    OPEN,
  existing: string[] = [],
  now = NOW,
) =>
  collectViolations({
    rows,
    doctors: new Map([['1', DOCTOR]]),
    hoursOf,
    existingKeys: new Set(existing),
    now,
  });

describe('calendar-date', () => {
  it('thứ ISO khớp isoWeekdayOf (giờ VN) cho mọi ngày 2026', () => {
    const start = parseCalendarDate('2026-01-01') as number;
    for (let day = start; day < start + 365; day += 1)
      expect(isoWeekdayOfEpochDay(day)).toBe(
        isoWeekdayOf(formatCalendarDate(day)),
      );
  });

  it('chỉ nhận ngày có thật', () => {
    expect(isCalendarDate('2026-12-07')).toBe(true);
    expect(isCalendarDate('2028-02-29')).toBe(true);
    for (const bad of ['2026-02-30', '2026-13-01', '2026-1-1', '', 20261207])
      expect(isCalendarDate(bad), String(bad)).toBe(false);
  });
});

describe('expandRule', () => {
  it('PC-12 3 tuần, T2–T6, cả ngày, 2 bác sĩ ⇒ đúng 60 ca (2×15×2), thứ tự bác sĩ, ngày, ca', () => {
    const result = expandRule(
      rule({
        bacSiIds: ['20', '3'],
        tuNgay: '2026-12-07',
        denNgay: '2026-12-25',
        thuTrongTuan: [1, 2, 3, 4, 5],
        cas: ['CaChieu', 'CaSang'],
      }),
    );
    if (!result.ok) throw new Error('phải mở được');
    expect(result.rows).toHaveLength(60);
    expect(result.rows[0]).toEqual(row({ bacSiId: '3', ca: 'CaSang' }));
    expect(result.rows[1]).toEqual(row({ bacSiId: '3', ca: 'CaChieu' }));
    expect(result.rows[2]).toEqual(
      row({ bacSiId: '3', ngay: '2026-12-08', ca: 'CaSang' }),
    );
    expect(result.rows.at(-1)).toEqual(
      row({ bacSiId: '20', ngay: '2026-12-25', ca: 'CaChieu' }),
    );
    expect(new Set(result.rows.map(shiftKey)).size).toBe(60);
  });

  it('chỉ giữ ngày có thứ đã chọn (Chủ nhật = 7)', () => {
    const result = expandRule(
      rule({ tuNgay: '2026-12-07', denNgay: '2026-12-13', thuTrongTuan: [7] }),
    );
    expect(result).toEqual({
      ok: true,
      rows: [row({ ngay: '2026-12-13' })],
    });
  });

  it('PC-15 biên 92 ngày nhận, 93 ngày từ chối; denNgay < tuNgay và khoảng không chứa thứ nào đã chọn ⇒ KHOANG_NGAY_KHONG_HOP_LE', () => {
    const base = { thuTrongTuan: [1, 2, 3, 4, 5, 6, 7], bacSiIds: ['1'] };
    expect(
      expandRule(
        rule({ ...base, tuNgay: '2026-12-01', denNgay: '2027-03-02' }),
      ),
    ).toMatchObject({ ok: true }); // đúng 92 ngày
    expect(
      expandRule(
        rule({ ...base, tuNgay: '2026-12-01', denNgay: '2027-03-03' }),
      ),
    ).toMatchObject({ ok: false, maLoi: 'KHOANG_NGAY_KHONG_HOP_LE' });
    expect(
      expandRule(rule({ tuNgay: '2026-12-08', denNgay: '2026-12-07' })),
    ).toMatchObject({ ok: false, maLoi: 'KHOANG_NGAY_KHONG_HOP_LE' });
    // 2026-12-08 (Thứ Ba) chỉ một ngày, nhưng chọn Thứ Hai.
    expect(
      expandRule(rule({ tuNgay: '2026-12-08', denNgay: '2026-12-08' })),
    ).toMatchObject({ ok: false, maLoi: 'KHOANG_NGAY_KHONG_HOP_LE' });
  });

  it('PC-15 quá 1.000 ca ⇒ QUA_NHIEU_CA; đúng 1.000 thì nhận', () => {
    const everyDay = [1, 2, 3, 4, 5, 6, 7];
    // 20 bác sĩ × 25 ngày × 2 ca = 1.000.
    const doctors = Array.from({ length: 20 }, (_, i) => String(i + 1));
    expect(
      expandRule(
        rule({
          bacSiIds: doctors,
          tuNgay: '2026-12-01',
          denNgay: '2026-12-25',
          thuTrongTuan: everyDay,
          cas: ['CaSang', 'CaChieu'],
        }),
      ),
    ).toMatchObject({ ok: true });
    expect(
      expandRule(
        rule({
          bacSiIds: doctors,
          tuNgay: '2026-12-01',
          denNgay: '2026-12-26',
          thuTrongTuan: everyDay,
          cas: ['CaSang', 'CaChieu'],
        }),
      ),
    ).toMatchObject({ ok: false, maLoi: 'QUA_NHIEU_CA' });
  });
});

describe('collectViolations', () => {
  it('ca hợp lệ ⇒ không vi phạm, đếm khung giờ (08–12, 30 phút = 8 ô)', () => {
    expect(collect([row()])).toEqual({
      viPham: [],
      tongSoViPham: 0,
      soKhungGio: 8,
    });
  });

  it('PC-03 A1: ngày hôm qua ⇒ NGAY_PHAN_CONG_DA_QUA', () => {
    const report = collect([row({ ngay: '2026-11-30' })]);
    expect(report.viPham[0]).toMatchObject({ maLoi: 'NGAY_PHAN_CONG_DA_QUA' });
    expect(report.soKhungGio).toBe(0);
  });

  it('PC-04 hôm nay: ca chưa kết thúc nhận, ca đã kết thúc ⇒ CA_DA_KET_THUC', () => {
    expect(
      collect([row({ ngay: '2026-12-01', ca: 'CaChieu' })]).viPham,
    ).toEqual([]);
    const late = new Date('2026-12-01T10:30:00Z'); // 17:30 VN
    expect(
      collect(
        [row({ ngay: '2026-12-01', ca: 'CaChieu' })],
        () => OPEN,
        [],
        late,
      ).viPham[0],
    ).toMatchObject({ maLoi: 'CA_DA_KET_THUC' });
  });

  it('PC-07 chi nhánh nghỉ ⇒ CHI_NHANH_NGHI kèm thuTrongTuan 7', () => {
    const report = collect([row({ ngay: '2026-12-13' })], () => ({
      hoatDong: false,
      sang: null,
      chieu: null,
    }));
    expect(report.viPham[0]).toMatchObject({
      maLoi: 'CHI_NHANH_NGHI',
      chiTiet: { thuTrongTuan: 7 },
    });
  });

  it('PC-08 chưa khai báo (không có dòng) ⇒ CHI_NHANH_CHUA_KHAI_BAO', () => {
    expect(collect([row()], () => null).viPham[0]).toMatchObject({
      maLoi: 'CHI_NHANH_CHUA_KHAI_BAO',
      chiTiet: { thuTrongTuan: 1 },
    });
  });

  it('PC-09/PC-10 thứ chỉ có buổi sáng: CaChieu ⇒ CA_KHONG_TON_TAI kèm khoảng nhận khám; CaSang cùng ngày vẫn hợp lệ nhưng cả yêu cầu bị từ chối ở bên gọi', () => {
    const onlyMorning: BranchDayHours = { ...OPEN, chieu: null };
    const report = collect(
      [row({ ca: 'CaSang' }), row({ ca: 'CaChieu' })],
      () => onlyMorning,
    );
    expect(report.tongSoViPham).toBe(1);
    expect(report.viPham[0]).toMatchObject({
      ca: 'CaChieu',
      maLoi: 'CA_KHONG_TON_TAI',
      chiTiet: {
        thuTrongTuan: 1,
        khoang: { sang: { tu: '08:00', den: '12:00' }, chieu: null },
      },
    });
  });

  it('PC-20 khoảng ngắn hơn thời lượng khám ⇒ CA_KHONG_DU_MOT_KHUNG_GIO', () => {
    const short: BranchDayHours = {
      ...OPEN,
      sang: { tuGiay: gio(8), denGiay: gio(8, 20) },
    };
    expect(collect([row()], () => short).viPham[0]).toMatchObject({
      maLoi: 'CA_KHONG_DU_MOT_KHUNG_GIO',
    });
  });

  it('PC-05 ca đã có ⇒ CA_DA_PHAN_CONG; PC-06 ca khác cùng ngày vẫn hợp lệ', () => {
    const existing = [shiftKey(row())];
    expect(collect([row()], () => OPEN, existing).viPham[0]).toMatchObject({
      maLoi: 'CA_DA_PHAN_CONG',
    });
    expect(
      collect([row({ ca: 'CaChieu' })], () => OPEN, existing).viPham,
    ).toEqual([]);
  });

  it('PC-14 gom MỌI vi phạm theo thứ tự duyệt, giới hạn 50 nhưng đếm đủ; ca hợp lệ vẫn được đếm khung giờ', () => {
    // 60 ngày, mọi ngày đều trùng ca đã có (vi phạm), cộng 2 ca hợp lệ ở bác sĩ 1.
    const days = Array.from({ length: 60 }, (_, i) =>
      formatCalendarDate((parseCalendarDate('2026-12-07') as number) + i),
    );
    const bad = days.map((ngay) => row({ ngay }));
    const good = [row({ ngay: '2027-03-01' }), row({ ngay: '2027-03-02' })];
    const report = collect([...bad, ...good], () => OPEN, bad.map(shiftKey));
    expect(report.tongSoViPham).toBe(60);
    expect(report.viPham).toHaveLength(50);
    expect(report.viPham[0]?.ngay).toBe('2026-12-07');
    expect(report.soKhungGio).toBe(16);
  });

  it('PC-21 "hôm nay" tính từ `now` được truyền vào (chốt một lần): nửa đêm không đổi kết quả giữa các hàng', () => {
    // 23:59:59 VN ngày 01/12: hàng của 01/12 vẫn là "hôm nay" ở mọi hàng.
    const beforeMidnight = new Date('2026-12-01T16:59:59Z');
    const rows = [row({ ngay: '2026-12-01' }), row({ ngay: '2026-12-01' })];
    const report = collect(rows, () => OPEN, [], beforeMidnight);
    expect(report.viPham.map((v) => v.maLoi)).toEqual([
      'CA_DA_KET_THUC',
      'CA_DA_KET_THUC',
    ]);
  });
});
