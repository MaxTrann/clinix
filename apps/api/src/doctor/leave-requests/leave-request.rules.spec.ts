import {
  checkLeaveDates,
  countDays,
  isShiftEnded,
  leaveWindowsOverlap,
  normalizeReason,
  validateLeaveShape,
  type LeaveRequestInput,
} from './leave-request.rules.js';
import type { LeaveWindow } from '../../scheduling/leave/leave-overlap.rules.js';

// Doctor B11 — luật thuần của tạo yêu cầu nghỉ: YN-03…YN-06, YN-09, YN-10, YN-11, YN-21, YN-23.
const base: LeaveRequestInput = {
  hinhThuc: 'CaNgay',
  tuNgay: '2026-12-01',
  denNgay: '2026-12-03',
  lyDo: 'Việc gia đình',
};
const shape = (patch: Partial<LeaveRequestInput>) =>
  validateLeaveShape({ ...base, ...patch }).map((e) => `${e.truong}:${e.ma}`);

describe('validateLeaveShape', () => {
  it('nhận CaNgay nhiều ngày và TheoCa một ngày', () => {
    expect(shape({})).toEqual([]);
    expect(
      shape({ hinhThuc: 'TheoCa', ca: 'CaSang', denNgay: base.tuNgay }),
    ).toEqual([]);
  });

  it('YN-04 TheoCa nhiều ngày ⇒ denNgay: NGHI_THEO_CA_CHI_MOT_NGAY', () => {
    expect(shape({ hinhThuc: 'TheoCa', ca: 'CaSang' })).toEqual([
      'denNgay:NGHI_THEO_CA_CHI_MOT_NGAY',
    ]);
  });

  it('YN-05 TheoCa thiếu ca / CaToi / ca lạ; CaNgay có ca', () => {
    const one = { hinhThuc: 'TheoCa', denNgay: base.tuNgay } as const;
    expect(shape({ ...one })).toEqual(['ca:CA_BAT_BUOC']);
    expect(shape({ ...one, ca: null })).toEqual(['ca:CA_BAT_BUOC']);
    expect(shape({ ...one, ca: 'CaToi' })).toEqual(['ca:CA_KHONG_HOP_LE']);
    expect(shape({ ...one, ca: 'ca-sang' })).toEqual(['ca:CA_KHONG_HOP_LE']);
    expect(shape({ ca: 'CaSang' })).toEqual(['ca:CA_KHONG_DUOC_CHON']);
  });

  it('CaNgay có tuNgay sau denNgay ⇒ denNgay: KHOANG_NGAY_KHONG_HOP_LE; một ngày thì hợp lệ (biên)', () => {
    expect(shape({ tuNgay: '2026-12-05', denNgay: '2026-12-01' })).toEqual([
      'denNgay:KHOANG_NGAY_KHONG_HOP_LE',
    ]);
    expect(shape({ denNgay: base.tuNgay })).toEqual([]);
  });

  it('YN-06 lý do: thiếu / chỉ khoảng trắng ⇒ LY_DO_BAT_BUOC; 1 ký tự / > 500 ⇒ LY_DO_KHONG_HOP_LE', () => {
    expect(shape({ lyDo: undefined as unknown as string })).toEqual([
      'lyDo:LY_DO_BAT_BUOC',
    ]);
    expect(shape({ lyDo: '   \t\n ' })).toEqual(['lyDo:LY_DO_BAT_BUOC']);
    expect(shape({ lyDo: 'a' })).toEqual(['lyDo:LY_DO_KHONG_HOP_LE']);
    expect(shape({ lyDo: 'a'.repeat(501) })).toEqual([
      'lyDo:LY_DO_KHONG_HOP_LE',
    ]);
  });

  it('gom nhiều lỗi của nhiều trường trong một lần', () => {
    expect(
      shape({ hinhThuc: 'TheoCa', lyDo: '', denNgay: '2026-12-09' }),
    ).toEqual([
      'ca:CA_BAT_BUOC',
      'denNgay:NGHI_THEO_CA_CHI_MOT_NGAY',
      'lyDo:LY_DO_BAT_BUOC',
    ]);
  });
});

describe('normalizeReason (YN-21, YN-23)', () => {
  it('biên 2 và 500 điểm mã được nhận', () => {
    expect(normalizeReason('ab')).toEqual({ ok: true, value: 'ab' });
    expect(normalizeReason('a'.repeat(500)).ok).toBe(true);
  });

  it('cắt khoảng trắng ASCII hai đầu nhưng giữ khoảng trắng ở giữa', () => {
    expect(normalizeReason('  Đi khám \n')).toEqual({
      ok: true,
      value: 'Đi khám',
    });
  });

  it('chuẩn hoá NFC: "e" + dấu rời thành một ký tự', () => {
    expect(normalizeReason('é ')).toEqual({
      ok: false,
      ma: 'LY_DO_KHONG_HOP_LE', // sau NFC chỉ còn 1 điểm mã nên dưới mức tối thiểu 2
    });
    expect(normalizeReason('ée')).toEqual({ ok: true, value: 'ée' });
  });

  it('đếm theo điểm mã: 500 emoji là hợp lệ, 501 thì không', () => {
    expect(normalizeReason('😀'.repeat(500)).ok).toBe(true);
    expect(normalizeReason('😀'.repeat(501))).toEqual({
      ok: false,
      ma: 'LY_DO_KHONG_HOP_LE',
    });
  });

  it('ký tự điều khiển ở giữa bị từ chối; khoảng trắng Unicode ở đầu không bị cắt', () => {
    for (const bad of ['ab\ncd', 'ab\u0000cd', 'ab\tcd', 'ab\u0085cd'])
      expect(normalizeReason(bad), JSON.stringify(bad)).toEqual({
        ok: false,
        ma: 'LY_DO_KHONG_HOP_LE',
      });
    expect(normalizeReason(' ab')).toEqual({
      ok: true,
      value: ' ab',
    });
  });

  it('không phải chuỗi ⇒ LY_DO_BAT_BUOC', () => {
    for (const bad of [undefined, null, 5, {}])
      expect(normalizeReason(bad)).toEqual({
        ok: false,
        ma: 'LY_DO_BAT_BUOC',
      });
  });
});

describe('checkLeaveDates (YN-03, YN-10, YN-21)', () => {
  const today = '2026-12-01';
  const check = (tuNgay: string, denNgay: string) =>
    checkLeaveDates({ tuNgay, denNgay, today });

  it('hôm nay được nhận, hôm qua thì NGAY_NGHI_DA_QUA', () => {
    expect(check('2026-12-01', '2026-12-01')).toBeNull();
    expect(check('2026-11-30', '2026-12-02')).toBe('NGAY_NGHI_DA_QUA');
  });

  it('biên 31 ngày được nhận, 32 ngày thì KHOANG_NGHI_QUA_DAI', () => {
    expect(countDays('2026-12-01', '2026-12-31')).toBe(31);
    expect(check('2026-12-01', '2026-12-31')).toBeNull();
    expect(check('2026-12-01', '2027-01-01')).toBe('KHOANG_NGHI_QUA_DAI');
  });

  it('biên ngày thứ 90 được nhận (2027-03-01), ngày 91 thì NGHI_QUA_XA', () => {
    expect(check('2027-03-01', '2027-03-01')).toBeNull();
    expect(check('2027-03-02', '2027-03-02')).toBe('NGHI_QUA_XA');
  });

  it('khoảng bắt đầu gần nhưng kết thúc quá xa ⇒ NGHI_QUA_XA', () => {
    expect(check('2027-02-20', '2027-03-02')).toBe('NGHI_QUA_XA');
  });

  it('quá khứ được báo trước lỗi dài/xa', () => {
    expect(check('2026-11-01', '2027-12-31')).toBe('NGAY_NGHI_DA_QUA');
  });
});

describe('leaveWindowsOverlap (YN-09, Q21)', () => {
  const caNgay = (a: string, b: string): LeaveWindow => ({
    hinhThucNghi: 'CaNgay',
    ngayBatDau: a,
    ngayKetThuc: b,
    ca: null,
  });
  const theoCa = (ngay: string, ca: 'CaSang' | 'CaChieu'): LeaveWindow => ({
    hinhThucNghi: 'TheoCa',
    ngayBatDau: ngay,
    ngayKetThuc: ngay,
    ca,
  });

  it('CaNgay × CaNgay: giao ngày (kể cả chạm một ngày) ⇒ trùng; không giao ⇒ không', () => {
    expect(leaveWindowsOverlap(caNgay('01', '05'), caNgay('05', '09'))).toBe(
      true,
    );
    expect(leaveWindowsOverlap(caNgay('01', '04'), caNgay('05', '09'))).toBe(
      false,
    );
  });

  it('TheoCa × CaNgay phủ ngày đó ⇒ trùng (cả hai chiều); CaNgay không phủ ⇒ không', () => {
    expect(
      leaveWindowsOverlap(theoCa('03', 'CaSang'), caNgay('01', '05')),
    ).toBe(true);
    expect(
      leaveWindowsOverlap(caNgay('01', '05'), theoCa('03', 'CaChieu')),
    ).toBe(true);
    expect(
      leaveWindowsOverlap(theoCa('07', 'CaSang'), caNgay('01', '05')),
    ).toBe(false);
  });

  it('TheoCa × TheoCa: cùng ngày cùng ca ⇒ trùng; cùng ngày khác ca ⇒ KHÔNG trùng', () => {
    expect(
      leaveWindowsOverlap(theoCa('03', 'CaSang'), theoCa('03', 'CaSang')),
    ).toBe(true);
    expect(
      leaveWindowsOverlap(theoCa('03', 'CaSang'), theoCa('03', 'CaChieu')),
    ).toBe(false);
  });
});

describe('isShiftEnded (YN-11, Q24)', () => {
  const window = {
    ok: true,
    khoang: { tuGiay: 8 * 3600, denGiay: 12 * 3600 },
  } as const;
  const at = (hhmm: string) => new Date(`2026-12-01T${hhmm}:00+07:00`);

  it('trước giờ kết thúc thì chưa kết thúc, đúng giờ kết thúc thì đã kết thúc (biên)', () => {
    expect(isShiftEnded(window, at('10:00'))).toBe(false);
    expect(isShiftEnded(window, at('11:59'))).toBe(false);
    expect(isShiftEnded(window, at('12:00'))).toBe(true);
    expect(isShiftEnded(window, at('15:00'))).toBe(true);
  });

  it('không xác định được giờ ca ⇒ coi là chưa kết thúc', () => {
    expect(isShiftEnded({ ok: false, lyDo: 'ChuaKhaiBao' }, at('23:00'))).toBe(
      false,
    );
  });
});
