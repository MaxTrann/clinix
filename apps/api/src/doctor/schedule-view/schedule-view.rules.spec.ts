import type { BlockingLeave } from '../../scheduling/leave/leave.reader.js';
import {
  checkScheduleRange,
  leaveStateForShift,
  shiftHours,
} from './schedule-view.rules.js';

// Doctor B7 — luật thuần của xem lịch Bác sĩ: XL-07 (khoảng ngày), XL-04 (ưu tiên ngày nghỉ), XL-15 (giờ ca).
describe('checkScheduleRange', () => {
  it('XL-07 hợp lệ: một ngày, và đúng 42 ngày (biên trên)', () => {
    expect(checkScheduleRange('2026-12-07', '2026-12-07')).toEqual({
      ok: true,
      tuNgay: '2026-12-07',
      denNgay: '2026-12-07',
    });
    expect(checkScheduleRange('2026-12-01', '2027-01-11').ok).toBe(true); // 42 ngày gồm hai đầu
  });

  it('XL-07 43 ngày bị từ chối', () => {
    expect(checkScheduleRange('2026-12-01', '2027-01-12').ok).toBe(false);
  });

  it('XL-07 denNgay < tuNgay, thiếu tham số, sai định dạng, ngày không có thật', () => {
    for (const [from, to] of [
      ['2026-12-08', '2026-12-07'],
      [undefined, '2026-12-07'],
      ['2026-12-07', undefined],
      ['07/12/2026', '2026-12-07'],
      ['2026-02-30', '2026-03-01'],
      ['2026-12-07', ''],
    ] as const)
      expect(checkScheduleRange(from, to).ok, `${from} → ${to}`).toBe(false);
  });
});

const leave = (over: Partial<BlockingLeave>): BlockingLeave => ({
  yeuCauNghiPhepId: '1',
  bacSiId: '5',
  trangThai: 'ChoDuyet',
  hinhThucNghi: 'CaNgay',
  ngayBatDau: '2026-12-07',
  ngayKetThuc: '2026-12-07',
  ca: null,
  ...over,
});
const SHIFT = { ngay: '2026-12-07', ca: 'CaSang' } as const;

describe('leaveStateForShift', () => {
  it('XL-04 DaDuyet thắng ChoDuyet thắng TuChoi', () => {
    const all = [
      leave({ yeuCauNghiPhepId: '1', trangThai: 'TuChoi' }),
      leave({ yeuCauNghiPhepId: '2', trangThai: 'ChoDuyet' }),
      leave({ yeuCauNghiPhepId: '3', trangThai: 'DaDuyet' }),
    ];
    expect(leaveStateForShift(all, SHIFT)).toBe('DaDuyet');
    expect(leaveStateForShift(all.slice(0, 2), SHIFT)).toBe('ChoDuyet');
    expect(leaveStateForShift(all.slice(0, 1), SHIFT)).toBe('TuChoi');
  });

  it('XL-04 không yêu cầu nào phủ ca ⇒ null (khác ngày, hoặc TheoCa khác ca)', () => {
    expect(leaveStateForShift([], SHIFT)).toBeNull();
    expect(
      leaveStateForShift(
        [leave({ ngayBatDau: '2026-12-08', ngayKetThuc: '2026-12-08' })],
        SHIFT,
      ),
    ).toBeNull();
    expect(
      leaveStateForShift(
        [leave({ hinhThucNghi: 'TheoCa', ca: 'CaChieu' })],
        SHIFT,
      ),
    ).toBeNull();
    expect(
      leaveStateForShift(
        [leave({ hinhThucNghi: 'TheoCa', ca: 'CaSang' })],
        SHIFT,
      ),
    ).toBe('ChoDuyet');
  });
});

describe('shiftHours', () => {
  const day = {
    hoatDong: true,
    sang: { tuGiay: 8 * 3600, denGiay: 12 * 3600 },
    chieu: { tuGiay: 13 * 3600, denGiay: 17 * 3600 },
  };

  it('XL-15 giờ ca là khoảng hiện hành, dạng HH:MM', () => {
    expect(shiftHours('CaSang', day)).toEqual({
      batDau: '08:00',
      ketThuc: '12:00',
      gioCaKhongCon: false,
    });
    expect(shiftHours('CaChieu', day)).toEqual({
      batDau: '13:00',
      ketThuc: '17:00',
      gioCaKhongCon: false,
    });
  });

  it('XL-15 ca "mồ côi" (khoảng không còn, ngày nghỉ, chưa khai báo) ⇒ null kèm cờ', () => {
    const orphan = { batDau: null, ketThuc: null, gioCaKhongCon: true };
    expect(shiftHours('CaChieu', { ...day, chieu: null })).toEqual(orphan);
    expect(
      shiftHours('CaSang', { hoatDong: false, sang: null, chieu: null }),
    ).toEqual(orphan);
    expect(shiftHours('CaSang', null)).toEqual(orphan);
  });
});
